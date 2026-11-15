import type {
  SSHTunnel,
  SSHTunnelOptions,
  SSHRequestOptions,
  SFTPRequestOptions,
  SSHConnectionLease,
  SSHExecCommandOptions,
  SSHExecCommandResponse,
  SSHConnectionPoolEvent,
  SSHReverseTunnelOptions,
  SSHConnectionPoolOptions,
  SSHGetPutDirectoryOptions,
  SFTPClient as SFTPWrapper,
  SSHConnectionConfig as SSHConfig,
  SFTPTransferOptions as TransferOptions,
} from '@xec-sh/ssh';

import { randomBytes } from 'node:crypto';
import { finished } from 'node:stream/promises';
import { Readable, type Writable } from 'node:stream';
import { SSHClient, SSHConnectionPool, SSHOutputLimitError, SSHOutcomeUnknownError } from '@xec-sh/ssh';

import { parseDuration } from '../../utils/helpers.js';
import { ExecutionResult } from '../../core/result.js';
import { SecurePasswordHandler } from './secure-password.js';
import { resolveExitCode } from '../../core/failure-kind.js';
import { Command, SSHAdapterOptions } from '../../types/command.js';
import { BaseAdapter, BaseAdapterConfig } from '../base-adapter.js';
import { quoteForShell, validateEnvName as validateEnvNameShared } from '../../utils/shell-escape.js';
import {
  AdapterError,
  ConnectionError,
  MaxBufferExceededError,
  ExecutionOutcomeUnknownError,
} from '../../core/error.js';

export type { SSHConnectionPoolOptions } from '@xec-sh/ssh';

export interface SSHSudoOptions {
  enabled: boolean;
  password?: string;
  prompt?: string;
  method?: 'stdin' | 'askpass' | 'echo' | 'secure-askpass'; // Method to provide password
  secureHandler?: SecurePasswordHandler; // Optional custom handler, will create one if not provided
}

export interface SSHFileTransferOptions extends SFTPRequestOptions {
  transferOptions?: TransferOptions;
}
export type SSHDirectoryTransferOptions = SSHFileTransferOptions & Omit<SSHGetPutDirectoryOptions, 'sftp'>;

export interface SSHSFTPOptions {
  enabled: boolean;
  concurrency: number;
}

/**
 * Sudo settings after merging adapter-level {@link SSHSudoOptions} with the
 * per-command `sudo` block.
 *
 * The two sources historically named the same concept differently (`method`
 * vs `passwordMethod`); both are accepted here and reconciled at the single
 * point of use rather than being smuggled through an `any`.
 */
interface SudoConfig {
  enabled?: boolean;
  password?: string;
  user?: string;
  prompt?: string;
  method?: 'stdin' | 'askpass' | 'echo' | 'secure-askpass' | 'secure';
  passwordMethod?: 'stdin' | 'askpass' | 'echo' | 'secure';
  secureHandler?: SecurePasswordHandler;
}

/** Validate names before emitting remote shell exports. */
function validateEnvName(name: string): string {
  try {
    return validateEnvNameShared(name);
  } catch (error) {
    throw new AdapterError('ssh', 'env', error instanceof Error ? error : new Error(String(error)));
  }
}

function validateSudoUser(user: string): string {
  if (user.length === 0 || user.length > 32 || !/^[a-zA-Z0-9._][a-zA-Z0-9._-]*$/.test(user)) {
    throw new AdapterError('ssh', 'sudo', new Error(`Invalid sudo user name: ${JSON.stringify(user)}`));
  }

  return user;
}

export interface SSHAdapterConfig extends BaseAdapterConfig {
  connectionPool?: Partial<SSHConnectionPoolOptions>;
  defaultConnectOptions?: SSHConfig;
  sudo?: SSHSudoOptions;
  sftp?: SSHSFTPOptions;
  /**
   * Default host key checking policy for every connection this adapter opens.
   * Individual commands may override it. Defaults to `strict`.
   */
  hostKeyChecking?: 'accept-new' | 'strict' | 'off';
  /** Default `known_hosts` file for verification. */
  knownHostsPath?: string;
}

// defaultCwd stays optional: an ambient local-path default is meaningless on
// a remote host, and the base adapter deliberately no longer invents one.
type RequiredSSHConfig = Omit<Required<SSHAdapterConfig>, 'defaultCwd' | 'connectionPool'> & {
  defaultCwd?: string;
  connectionPool: SSHConnectionPoolOptions;
};

export class SSHAdapter extends BaseAdapter {
  protected readonly adapterName = 'ssh';
  private sshConfig: RequiredSSHConfig;
  private readonly pool: SSHConnectionPool;
  private securePasswordHandler?: SecurePasswordHandler;

  constructor(config: SSHAdapterConfig = {}) {
    super(config);
    this.name = this.adapterName;
    if (Object.hasOwn(config, 'multiplexing')) {
      throw new AdapterError(
        'ssh',
        'configure',
        new Error('multiplexing is unsupported; configure the shared SSH connectionPool instead')
      );
    }
    this.pool = new SSHConnectionPool(
      config.connectionPool,
      {
        hostKeyChecking: config.hostKeyChecking ?? 'strict',
        knownHostsPath: config.knownHostsPath,
        ...config.defaultConnectOptions,
      },
      (event) => this.emitPoolEvent(event)
    );
    this.sshConfig = {
      ...this.config,
      connectionPool: this.pool.options,
      defaultConnectOptions: config.defaultConnectOptions ?? {},
      sudo: {
        enabled: config.sudo?.enabled ?? false,
        password: config.sudo?.password,
        prompt: config.sudo?.prompt ?? '[sudo] password',
        method: config.sudo?.method ?? 'stdin',
        secureHandler: config.sudo?.secureHandler,
      },
      sftp: {
        enabled: config.sftp?.enabled ?? true,
        concurrency: config.sftp?.concurrency ?? 5,
      },
      hostKeyChecking: config.hostKeyChecking ?? 'strict',
      knownHostsPath: config.knownHostsPath as string,
    };
  }

  async isAvailable(): Promise<boolean> {
    return true; // The owned SSH client is an explicit package dependency.
  }

  async execute(command: Command): Promise<ExecutionResult> {
    return this.executeOnce(command);
  }

  private async executeOnce(command: Command): Promise<ExecutionResult> {
    const mergedCommand = this.mergeCommand(command);
    const sshOptions = this.extractSSHOptions(mergedCommand);

    if (!sshOptions) {
      throw new AdapterError(this.adapterName, 'execute', new Error('SSH connection options not provided'));
    }

    const startTime = Date.now();
    let connection: SSHConnectionLease | null = null;
    const commandString = mergedCommand.args?.length
      ? [mergedCommand.command, ...mergedCommand.args].map((arg) => quoteForShell(arg, 'posix')).join(' ')
      : mergedCommand.command;

    try {
      connection = await this.getConnection(sshOptions, { signal: mergedCommand.signal });

      // Emit execute event
      this.emitAdapterEvent('ssh:execute', {
        host: sshOptions.host,
        command: commandString,
      });

      // mergeCommand combines only declared adapter/command env for SSH;
      // ambient local process.env must never be sent to the remote host.
      const envPrefix =
        mergedCommand.env && Object.keys(mergedCommand.env).length
          ? Object.entries(mergedCommand.env)
              .map(([key, value]) => `export ${validateEnvName(key)}=${quoteForShell(value, 'posix')}`)
              .join('; ') + '; '
          : '';

      // Handle sudo if enabled.
      //
      // The env prefix must stay OUTSIDE the sudo wrapper: `sudo -S export
      // FOO=bar; cmd` asks sudo to run the shell builtin `export` as a binary,
      // which fails, after which `cmd` runs without sudo at all. Wrapping only
      // the command keeps both halves working.
      const sudoCommand = await this.wrapWithSudo(commandString, mergedCommand);
      const body = envPrefix + sudoCommand;
      const finalCommand =
        mergedCommand.cwd === undefined ? body : `cd -- ${quoteForShell(mergedCommand.cwd, 'posix')} && (\n${body}\n)`;

      // Execute command
      const result = await this.executeSSHCommand(connection.client, finalCommand, mergedCommand);

      const endTime = Date.now();
      const signal = result.signal
        ? result.signal.startsWith('SIG')
          ? result.signal
          : `SIG${result.signal}`
        : undefined;

      return this.createResult(
        result.stdout,
        result.stderr,
        resolveExitCode(result.code, signal),
        signal,
        commandString,
        startTime,
        endTime,
        { host: `${sshOptions.host}:${sshOptions.port || 22}`, originalCommand: mergedCommand }
      );
    } catch (error) {
      if (error instanceof ConnectionError) {
        throw error;
      }

      if (connection) {
        // Track error
        connection.markFailed();

        // Retire an unhealthy connection only after its other users finish.
        // A command failure must never interrupt an unrelated active channel.
      }

      const mapped = this.mapSSHError(error);
      if (mapped instanceof ExecutionOutcomeUnknownError || mapped instanceof MaxBufferExceededError) throw mapped;
      throw new AdapterError(this.adapterName, 'execute', mapped);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  private extractSSHOptions(command: Command): SSHAdapterOptions | null {
    if (command.adapterOptions?.type === 'ssh') {
      return command.adapterOptions;
    }
    return null;
  }

  private connectionOptions(options: SSHAdapterOptions): SSHConfig {
    const { type: _type, sudo: _sudo, ...connection } = options;
    return connection;
  }

  private async getConnection(
    options: SSHAdapterOptions,
    request: SSHRequestOptions = {}
  ): Promise<SSHConnectionLease> {
    try {
      return await this.pool.acquire(this.connectionOptions(options), request);
    } catch (error) {
      throw new ConnectionError(options.host, this.mapSSHError(error));
    }
  }

  private mapSSHError(error: unknown): Error {
    if (error instanceof SSHOutcomeUnknownError)
      return new ExecutionOutcomeUnknownError({ adapter: 'ssh', cause: error });
    if (error instanceof SSHOutputLimitError)
      return new MaxBufferExceededError(error.limit, error.stream, error.partialStdout, error.partialStderr);
    return error instanceof Error ? error : new Error(String(error));
  }

  private emitPoolEvent(event: SSHConnectionPoolEvent): void {
    switch (event.type) {
      case 'connect':
        this.emitAdapterEvent('ssh:connect', { host: event.host, port: event.port, username: event.username });
        this.emitAdapterEvent('connection:open', {
          host: event.host,
          port: event.port,
          type: 'ssh',
          metadata: { username: event.username },
        });
        break;
      case 'disconnect':
        this.emitAdapterEvent('ssh:disconnect', { host: event.host, reason: event.reason });
        this.emitAdapterEvent('connection:close', {
          host: event.host,
          port: event.port,
          type: 'ssh',
          reason: event.reason,
        });
        break;
      case 'metrics':
        this.emitAdapterEvent('ssh:pool-metrics', { metrics: event.metrics });
        break;
      case 'cleanup':
        this.emitAdapterEvent('ssh:pool-cleanup', { cleaned: event.cleaned, remaining: event.remaining });
        break;
      case 'reconnect':
        this.emitAdapterEvent('ssh:reconnect', { host: event.host, attempts: event.attempt });
        break;
      case 'tunnel-created':
        this.emitAdapterEvent('ssh:tunnel-created', {
          localPort: event.localPort,
          remoteHost: event.remoteHost,
          remotePort: event.remotePort,
        });
        this.emitAdapterEvent('tunnel:created', {
          localPort: event.localPort,
          remoteHost: event.remoteHost,
          remotePort: event.remotePort,
          type: 'ssh',
        });
        break;
      case 'tunnel-closed':
        this.emitAdapterEvent('ssh:tunnel-closed', {
          localPort: event.localPort,
          remoteHost: event.remoteHost,
          remotePort: event.remotePort,
        });
        break;
      default: {
        const exhaustive: never = event;
        throw new Error(`Unknown SSH pool event: ${String(exhaustive)}`);
      }
    }
  }

  private async executeSSHCommand(
    ssh: SSHClient,
    command: string,
    options: Partial<Command> = {}
  ): Promise<SSHExecCommandResponse> {
    // Request remote termination and close the owned channel on cancellation
    // or output overflow. Neither request proves remote completion; the SSH
    // owner preserves unknown outcomes when completion is not acknowledged.
    let channel: { signal(name: string): void; close(): void } | null = null;
    let terminated = false;
    const outputDrains: Promise<void>[] = [];
    const terminate = (): void => {
      if (terminated || !channel) return;
      terminated = true;
      try {
        channel.signal('TERM');
      } catch {
        // The channel may already be closing; closing below still applies.
      }
      try {
        channel.close();
      } catch {
        // Already closed.
      }
    };

    const timeout = parseDuration(options.timeout ?? this.config.defaultTimeout);
    const deadline = new AbortController();
    const signal = options.signal ? AbortSignal.any([options.signal, deadline.signal]) : deadline.signal;
    const timer = timeout > 0 ? setTimeout(() => deadline.abort(), timeout) : undefined;

    // Create exec options
    const execOptions: SSHExecCommandOptions = {
      signal,
      maxBuffer: options.maxBuffer ?? this.config.maxBuffer,
      encoding: options.encoding ?? this.config.encoding,
      stdin: this.convertStdin(options.stdin),
      collectStdout: options.stdout === undefined || options.stdout === 'pipe',
      collectStderr: options.stderr === undefined || options.stderr === 'pipe',
      execOptions: {},
      onChannel: (ch: { signal(name: string): void; close(): void }) => {
        channel = ch;
        if (signal.aborted) terminate();
        // Native pipes provide backpressure. Caller/global destinations remain
        // separate from the transport's bounded payload collector.
        const pipeOutput = (source: Readable, mode: Command['stdout'], inherited: Writable): void => {
          const destination = mode === 'inherit' ? inherited : typeof mode === 'object' ? mode : undefined;
          if (!destination) return;
          const shared = destination === process.stdout || destination === process.stderr;
          const drained = shared ? new Promise<void>((resolve, reject) => {
            const failed = (error: Error) => reject(error);
            destination.on('error', failed);
            void finished(source, { writable: false, cleanup: true })
              .then(() => new Promise<void>((done, fail) => {
                destination.write('', error => { if (error) fail(error); else done(); });
              }))
              .then(resolve, reject)
              .finally(() => destination.off('error', failed));
          }) : finished(destination, { readable: false, cleanup: true });
          void drained.catch(() => terminate());
          outputDrains.push(drained);
          source.pipe(destination, { end: !shared });
        };
        pipeOutput(ch as unknown as Readable, options.stdout, process.stdout);
        pipeOutput((ch as unknown as { stderr: Readable }).stderr, options.stderr, process.stderr);

        // The exec channel is the reachable end of the remote process. No
        // pid: the remote id is not knowable from here, and reporting a
        // local one would invite signalling the wrong machine.
        const duplex = ch as unknown as {
          write?: unknown;
          stderr?: NodeJS.ReadableStream;
        };
        options.onSpawn?.({
          stdin: (typeof duplex.write === 'function' ? ch : null) as never,
          stdout: (typeof duplex.write === 'function' ? ch : null) as never,
          stderr: (duplex.stderr ?? null) as never,
          kill: () => terminate(),
        });
      },
    };

    // Execute the command
    const execPromise = ssh.exec(command, execOptions).then(async (answer) => {
      await Promise.all(outputDrains);
      return answer;
    });

    let result;
    try {
      result = await execPromise;
    } finally {
      if (timer) clearTimeout(timer);
    }

    return result;
  }

  private convertStdin(stdin: Command['stdin']): string | Buffer | Readable | undefined {
    if (!stdin) return undefined;
    if (typeof stdin === 'string') return stdin;
    if (Buffer.isBuffer(stdin)) return stdin;

    if (stdin instanceof Readable) {
      // The exec layer pipes a readable straight into the channel. This used
      // to return undefined, so `$.ssh(...)\`cmd\`` with a stream stdin
      // silently ran the command with no input at all.
      return stdin;
    }

    return undefined;
  }

  private async wrapWithSudo(command: string, options: Command): Promise<string> {
    // First check if sudo is enabled globally in adapter config
    const globalSudoEnabled = this.sshConfig.sudo.enabled;

    // Then check if it's overridden in command options
    const sshOptions = this.extractSSHOptions(options);
    const commandSudoEnabled = sshOptions?.sudo?.enabled;

    // If sudo is not enabled at all, return the command as-is
    if (!globalSudoEnabled && !commandSudoEnabled) {
      return command;
    }

    // Merge sudo config: command options override global config
    const sudoConfig = {
      ...this.sshConfig.sudo,
      ...(sshOptions?.sudo || {}),
    };

    // Initialize secure password handler if needed and not already done
    const method = sudoConfig.method || sudoConfig.passwordMethod;
    if ((method === 'secure' || method === 'secure-askpass') && !this.securePasswordHandler) {
      this.securePasswordHandler = sudoConfig.secureHandler || new SecurePasswordHandler();
    }

    return this.buildSudoCommandWithConfig(command, sudoConfig);
  }

  private buildSudoCommandWithConfig(rawCommand: string, sudoConfig: SudoConfig): string {
    if (!sudoConfig || !sudoConfig.enabled) return rawCommand;

    const sudoCmd = sudoConfig.user ? `sudo -u ${quoteForShell(validateSudoUser(sudoConfig.user), 'posix')}` : 'sudo';

    // Run the whole command inside a privileged shell rather than handing its
    // words to sudo directly. Without this, the *calling* shell expands
    // `$(…)`, applies redirections and splits pipelines before sudo starts, so
    // `echo $(whoami)` reported the unprivileged user and `cmd > /root/f`
    // failed on permissions — surprising for something the user asked to run
    // as root.
    const command = `sh -c ${quoteForShell(rawCommand, 'posix')}`;

    // Handle password authentication
    if (sudoConfig.password) {
      const method = sudoConfig.method || sudoConfig.passwordMethod || 'stdin';

      switch (method) {
        case 'stdin':
          // Use printf instead of echo for better security and compatibility
          // The password is still visible in process list, but for a shorter time
          console.warn(
            'Using stdin method for sudo password may expose it in process listings. Consider using secure-askpass method.'
          );
          return `printf '%s\n' ${quoteForShell(sudoConfig.password, 'posix')} | ${sudoCmd} -S ${command}`;

        case 'echo':
          console.warn(
            'Using echo for sudo password is insecure and may expose the password in process listings. Consider using secure-askpass method.'
          );
          // Use printf for better compatibility and slightly better security
          return `printf '%s\n' ${quoteForShell(sudoConfig.password, 'posix')} | ${sudoCmd} -S ${command}`;

        case 'askpass':
        // Falls through to the secure construction below. The old branch
        // emitted `SUDO_ASKPASS=/tmp/askpass_$$` and never created that
        // file, so the method could not deliver a password at all — and
        // the PID-predictable path invited a local user on the remote to
        // plant one. There is exactly one correct askpass construction;
        // every spelling of the option gets it.
        // falls through
        case 'secure':
        case 'secure-askpass': {
          // Build an askpass script on the remote host so the password never
          // appears in the remote process list.
          //
          // The lines below MUST be joined with newlines: a heredoc is
          // line-oriented, and joining with ` && ` previously collapsed the
          // whole script onto one line where `#!/bin/sh` started a comment
          // that swallowed the command. The result was a no-op that exited 0,
          // so sudo commands silently appeared to succeed.
          const scriptId = randomBytes(12).toString('hex');
          const remoteAskpassPath = `/tmp/.xec-askpass-${scriptId}`;
          const quotedPath = quoteForShell(remoteAskpassPath, 'posix');

          // A random terminator cannot collide with password content.
          const heredocTag = `XEC_ASKPASS_${randomBytes(8).toString('hex').toUpperCase()}`;
          const quotedPassword = quoteForShell(sudoConfig.password, 'posix');

          return [
            // umask before creation closes the world-readable window that a
            // create-then-chmod sequence leaves open.
            'umask 077',
            `cat > ${quotedPath} << '${heredocTag}'`,
            '#!/bin/sh',
            `printf '%s\\n' ${quotedPassword}`,
            heredocTag,
            `chmod 700 ${quotedPath}`,
            `SUDO_ASKPASS=${quotedPath} ${sudoCmd} -A ${command}`,
            // Preserve the command's exit status across cleanup, and clean up
            // even when the command fails.
            '__xec_sudo_status=$?',
            `rm -f ${quotedPath}`,
            'exit $__xec_sudo_status',
          ].join('\n');
        }

        default:
          return `${sudoCmd} ${command}`;
      }
    }

    // No password required
    return `${sudoCmd} ${command}`;
  }

  getConnectionPoolMetrics() {
    return this.pool.getMetrics();
  }

  async dispose(): Promise<void> {
    const handler = this.securePasswordHandler;
    this.securePasswordHandler = undefined;
    const outcomes = await Promise.allSettled([this.pool.dispose(), handler?.cleanup()]);
    const failures = outcomes
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason);
    if (failures.length) throw new AggregateError(failures, 'SSH adapter cleanup was not confirmed');
  }

  /** A file operation owns its pooled connection until subsystem cleanup completes. */
  private async withTransfer<T>(
    target: SSHAdapterOptions,
    options: SSHFileTransferOptions,
    operation: (ssh: SSHClient, sftp: SFTPWrapper) => Promise<T>
  ): Promise<T> {
    if (!this.sshConfig.sftp.enabled) throw new AdapterError(this.adapterName, 'sftp', new Error('SFTP is disabled'));
    if (options.signal?.aborted) throw new DOMException('SFTP operation cancelled', 'AbortError');
    const connection = await this.getConnection(target, options);
    try {
      return await connection.client.withSFTP((sftp) => operation(connection.client, sftp), options);
    } catch (error) {
      throw new AdapterError(this.adapterName, 'sftp', this.mapSSHError(error));
    } finally {
      connection.release();
    }
  }

  async uploadFile(
    localPath: string,
    remotePath: string,
    target: SSHAdapterOptions,
    options: SSHFileTransferOptions = {}
  ): Promise<void> {
    await this.withTransfer(target, options, (ssh, sftp) =>
      ssh.putFile(localPath, remotePath, sftp, options.transferOptions)
    );
  }

  async downloadFile(
    remotePath: string,
    localPath: string,
    target: SSHAdapterOptions,
    options: SSHFileTransferOptions = {}
  ): Promise<void> {
    await this.withTransfer(target, options, (ssh, sftp) =>
      ssh.getFile(localPath, remotePath, sftp, options.transferOptions)
    );
  }

  private async transferDirectory(
    direction: 'putDirectory' | 'getDirectory',
    localPath: string,
    remotePath: string,
    target: SSHAdapterOptions,
    options: SSHDirectoryTransferOptions
  ): Promise<void> {
    await this.withTransfer(target, options, async (ssh, sftp) => {
      const failures: Error[] = [];
      const complete = await ssh[direction](localPath, remotePath, {
        concurrency: this.sshConfig.sftp.concurrency,
        ...options,
        sftp,
        tick: (local, remote, error) => {
          if (error) failures.push(error);
          options.tick?.(local, remote, error);
        },
      });
      if (!complete) {
        if (failures.length === 1) throw failures[0];
        throw new AggregateError(failures, 'SSH directory transfer was not completed');
      }
    });
  }

  async uploadDirectory(
    localPath: string,
    remotePath: string,
    target: SSHAdapterOptions,
    options: SSHDirectoryTransferOptions = {}
  ): Promise<void> {
    await this.transferDirectory('putDirectory', localPath, remotePath, target, options);
  }

  async downloadDirectory(
    remotePath: string,
    localPath: string,
    target: SSHAdapterOptions,
    options: SSHDirectoryTransferOptions = {}
  ): Promise<void> {
    await this.transferDirectory('getDirectory', localPath, remotePath, target, options);
  }

  async tunnel(options: SSHTunnelOptions, target: SSHAdapterOptions): Promise<SSHTunnel> {
    if (!target) throw new AdapterError('ssh', 'tunnel', new Error('An explicit SSH target is required'));
    try {
      return await this.pool.tunnel(options, this.connectionOptions(target));
    } catch (error) {
      throw this.mapSSHError(error);
    }
  }

  async reverseTunnel(options: SSHReverseTunnelOptions, target: SSHAdapterOptions): Promise<SSHTunnel> {
    if (!target) throw new AdapterError('ssh', 'reverseTunnel', new Error('An explicit SSH target is required'));
    try {
      return await this.pool.reverseTunnel(options, this.connectionOptions(target));
    } catch (error) {
      throw this.mapSSHError(error);
    }
  }
}

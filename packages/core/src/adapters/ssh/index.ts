
import { KeyedMutex } from '../../utils/mutex.js';
import { StreamHandler } from '../../utils/stream.js';
import { ExecutionResult } from '../../core/result.js';
import { escapeArg } from '../../utils/shell-escape.js';
import { SSHKeyValidator } from './ssh-key-validator.js';
import { SecurePasswordHandler } from './secure-password.js';
import { Command, SSHAdapterOptions } from '../../types/command.js';
import { BaseAdapter, BaseAdapterConfig } from '../base-adapter.js';
import { NodeSSH, Config as SSH2Config, SSHExecCommandResponse } from './ssh.js';
import { AdapterError, TimeoutError, ConnectionError } from '../../core/error.js';
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

export interface SSHAdapterConfig extends BaseAdapterConfig {
  connectionPool?: SSHConnectionPoolOptions;
  defaultConnectOptions?: SSH2Config;
  multiplexing?: SSHMultiplexingOptions;
  sudo?: SSHSudoOptions;
  sftp?: SSHSFTPOptions;
}

interface PooledConnection {
  ssh: NodeSSH;
  host: string;
  lastUsed: number;
  useCount: number;
  created: number;
  errors: number;
  keepAliveTimer?: NodeJS.Timeout;
  reconnectAttempts: number;
  config: SSHAdapterOptions;
}

type RequiredSSHConfig = Required<SSHAdapterConfig>;

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
      }
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

  async execute(command: Command): Promise<ExecutionResult> {
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
            .map(([key, value]) => `export ${key}=${escapeArg(value)}`)
            .join('; ');
          envPrefix = `${envVars}; `;
        }
      }

      // Handle sudo if enabled
      const finalCommand = await this.wrapWithSudo(envPrefix + commandString, mergedCommand, connection.ssh);

      // For SSH, only pass cwd if it was explicitly set in the original command
      const sshCommand = { ...mergedCommand };
      if (!command.cwd && mergedCommand.cwd) {
        // cwd was set by mergeCommand from defaultCwd, remove it for SSH
        delete sshCommand.cwd;
      }

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
      if (connection && this.sshConfig.connectionPool.enabled) {
        connection.lastUsed = Date.now();
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
      } catch (error) {
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
      password: options.password
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
    return `${options.username}@${options.host}:${options.port ?? 22}`;
  }

  private async executeSSHCommand(
    ssh: NodeSSH,
    command: string,
    options: Partial<Command> = {},
    host?: string,
    connectionKey?: string
  ): Promise<SSHExecCommandResponse> {
    const stdoutHandler = new StreamHandler({
      encoding: this.config.encoding,
      maxBuffer: this.config.maxBuffer
    });

    const stderrHandler = new StreamHandler({
      encoding: this.config.encoding,
      maxBuffer: this.config.maxBuffer
    });

    // Create exec options
    const execOptions: any = {
      cwd: options.cwd,
      stdin: this.convertStdin(options.stdin),
      execOptions: {}
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
    const result = await this.handleTimeout(
      execPromise,
      timeout,
      command,
      () => {
        // SSH doesn't provide a direct way to kill the remote process
        // For now, we'll just let the timeout happen and clean up afterwards
        // Trying to dispose the connection here causes the test to hang
      }
    );

    // Override stdout/stderr with our collected data if we were piping
    if (options.stdout === 'pipe') {
      result.stdout = stdoutHandler.getContent();
    }
    if (options.stderr === 'pipe') {
      result.stderr = stderrHandler.getContent();
    }

    return result;
  }

  private convertStdin(stdin: Command['stdin']): string | undefined {
    if (!stdin) return undefined;
    if (typeof stdin === 'string') return stdin;
    if (Buffer.isBuffer(stdin)) return stdin.toString();

    // For streams, we'd need to collect the data first
    // This is a limitation of the ssh2 library
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

  private buildSudoCommandWithConfig(command: string, sudoConfig: any): string {
    if (!sudoConfig || !sudoConfig.enabled) return command;

    const sudoCmd = sudoConfig.user ? `sudo -u ${sudoConfig.user}` : 'sudo';

    // Handle password authentication
    if (sudoConfig.password) {
      const method = sudoConfig.method || sudoConfig.passwordMethod || 'stdin';

      switch (method) {
        case 'stdin':
          // Use printf instead of echo for better security and compatibility
          // The password is still visible in process list, but for a shorter time
          console.warn('Using stdin method for sudo password may expose it in process listings. Consider using secure-askpass method.');
          return `printf '%s\n' '${sudoConfig.password.replace(/'/g, "'\\''")}' | ${sudoCmd} -S ${command}`;

        case 'echo':
          console.warn('Using echo for sudo password is insecure and may expose the password in process listings. Consider using secure-askpass method.');
          // Use printf for better compatibility and slightly better security
          return `printf '%s\n' '${sudoConfig.password.replace(/'/g, "'\\''")}' | ${sudoCmd} -S ${command}`;

        case 'askpass':
          // For askpass, we need to set up a temporary askpass script
          // This is more complex and would require additional setup
          return `SUDO_ASKPASS=/tmp/askpass_$$ ${sudoCmd} -A ${command}`;

        case 'secure':
        case 'secure-askpass': {
          // For SSH, we need to create the askpass script on the remote machine

          const scriptId = Math.random().toString(36).substring(7);
          const remoteAskpassPath = `/tmp/askpass-${scriptId}.sh`;

          // Escape password for safe embedding in script
          const escapedPassword = sudoConfig.password.replace(/'/g, "'\\''")

          // Create askpass script on remote machine and execute command
          const remoteScript = [
            `cat > ${remoteAskpassPath} << 'EOF'`,
            `#!/bin/sh`,
            `echo '${escapedPassword}'`,
            `EOF`,
            `chmod 700 ${remoteAskpassPath}`,
            `SUDO_ASKPASS=${remoteAskpassPath} ${sudoCmd} -A ${command}`,
            `rm -f ${remoteAskpassPath}`
          ].join(' && ');

          return remoteScript;
        }

        default:
          return `${sudoCmd} ${command}`;
      }
    }

    // No password required
    return `${sudoCmd} ${command}`;
  }

  private buildSudoCommand(command: string, sshOptions: SSHAdapterOptions): string {
    const sudo = sshOptions.sudo;
    if (!sudo || !sudo.enabled) return command;

    const sudoCmd = sudo.user ? `sudo -u ${sudo.user}` : 'sudo';

    // Handle password authentication
    if (sudo.password) {
      switch (sudo.passwordMethod) {
        case 'stdin':
          // Use printf instead of echo for better security
          console.warn('Using stdin method for sudo password may expose it in process listings. Consider using secure method.');
          return `printf '%s\n' '${sudo.password.replace(/'/g, "'\\''")}' | sudo -S ${command}`;

        case 'askpass':
          // For askpass, we need to set up a temporary askpass script
          // This is more complex and would require additional setup
          return `SUDO_ASKPASS=/tmp/askpass_$$ ${sudoCmd} -A ${command}`;

        case 'secure':
          // Use secure password handler if available
          if (this.securePasswordHandler) {
            try {
              const askpassPath = this.securePasswordHandler.createAskPassScript(sudo.password);
              const secureCommand = `SUDO_ASKPASS=${askpassPath} ${sudoCmd} -A ${command}`;

              // Schedule cleanup after a short delay
              setTimeout(() => {
                try {
                  this.securePasswordHandler?.cleanup();
                } catch {
                  // Ignore cleanup errors
                }
              }, 1000);

              return secureCommand;
            } catch (error) {
              console.error('Failed to create secure askpass, falling back to stdin method:', error);
              // Still need to provide the password via stdin
              return `printf '%s\n' '${sudo.password.replace(/'/g, "'\\''")}' | sudo -S ${command}`;
            }
          }
          break;

        default:
          return `${sudoCmd} ${command}`;
      }
    }

    return `${sudoCmd} ${command}`;
  }

  private startPoolCleanup(): void {
    this.poolCleanupInterval = setInterval(async () => {
      const now = Date.now();
      const idleTimeout = this.sshConfig.connectionPool.idleTimeout;
      const maxLifetime = this.sshConfig.connectionPool.maxLifetime ?? 3600000; // Default 1 hour
      const connectionsToClose: Array<[string, PooledConnection, string]> = [];

      // Identify connections to close
      for (const [key, connection] of this.connectionPool.entries()) {
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
    this.poolCleanupInterval.unref();
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
      } catch (error) {
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
    connection.keepAliveTimer.unref();
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

}

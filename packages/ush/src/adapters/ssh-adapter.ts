
import { ExecutionResult } from '../core/result.js';
import { StreamHandler } from '../core/stream-handler.js';
import { Command, SSHAdapterOptions } from '../core/command.js';
import { BaseAdapter, BaseAdapterConfig } from './base-adapter.js';
import { AdapterError, TimeoutError, ConnectionError } from '../core/error.js';
import { NodeSSH, Config as SSH2Config, SSHExecCommandResponse } from '../utils/ssh.js';

export interface SSHConnectionPoolOptions {
  enabled: boolean;
  maxConnections: number;
  idleTimeout: number;
  keepAlive: boolean;
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
}

export class SSHAdapter extends BaseAdapter {
  protected readonly adapterName = 'ssh';
  private sshConfig: Required<SSHAdapterConfig>;
  private connectionPool: Map<string, PooledConnection> = new Map();
  private poolCleanupInterval?: NodeJS.Timeout;

  constructor(config: SSHAdapterConfig = {}) {
    super(config);
    this.sshConfig = {
      ...this.config,
      connectionPool: {
        enabled: config.connectionPool?.enabled ?? true,
        maxConnections: config.connectionPool?.maxConnections ?? 10,
        idleTimeout: config.connectionPool?.idleTimeout ?? 300000, // 5 minutes
        keepAlive: config.connectionPool?.keepAlive ?? true
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
        prompt: config.sudo?.prompt ?? '[sudo] password'
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

    const startTime = Date.now();
    let connection: PooledConnection | null = null;

    try {
      connection = await this.getConnection(sshOptions);
      const commandString = this.buildCommandString(mergedCommand);

      // Handle sudo if enabled
      const finalCommand = this.wrapWithSudo(commandString, mergedCommand);

      // Execute command
      const result = await this.executeSSHCommand(
        connection.ssh,
        finalCommand,
        mergedCommand
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
        { host: sshOptions.host }
      );
    } catch (error) {
      if (error instanceof TimeoutError || error instanceof ConnectionError) {
        throw error;
      }

      if (connection) {
        // Remove failed connection from pool
        this.removeFromPool(this.getConnectionKey(sshOptions));
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

    if (this.sshConfig.connectionPool.enabled) {
      const existing = this.connectionPool.get(key);
      if (existing && existing.ssh.isConnected()) {
        existing.useCount++;
        return existing;
      }
    }

    // Create new connection
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
    } catch (error) {
      throw new ConnectionError(
        options.host,
        error instanceof Error ? error : new Error(String(error))
      );
    }

    const connection: PooledConnection = {
      ssh,
      host: options.host,
      lastUsed: Date.now(),
      useCount: 1
    };

    if (this.sshConfig.connectionPool.enabled) {
      this.connectionPool.set(key, connection);
    }

    return connection;
  }

  private getConnectionKey(options: SSHAdapterOptions): string {
    return `${options.username}@${options.host}:${options.port ?? 22}`;
  }

  private async executeSSHCommand(
    ssh: NodeSSH,
    command: string,
    options: Command
  ): Promise<SSHExecCommandResponse> {
    const stdoutHandler = new StreamHandler({
      encoding: this.config.encoding,
      maxBuffer: this.config.maxBuffer
    });

    const stderrHandler = new StreamHandler({
      encoding: this.config.encoding,
      maxBuffer: this.config.maxBuffer
    });

    const execOptions: any = {
      cwd: options.cwd,
      stdin: this.convertStdin(options.stdin),
      execOptions: {
        env: this.createCombinedEnv(this.config.defaultEnv, options.env)
      }
    };

    // Stream handling
    if (options.stdout === 'pipe') {
      execOptions.onStdout = (chunk: Buffer) => {
        stdoutHandler.createTransform().write(chunk);
      };
    }

    if (options.stderr === 'pipe') {
      execOptions.onStderr = (chunk: Buffer) => {
        stderrHandler.createTransform().write(chunk);
      };
    }

    // Execute with timeout
    const timeout = options.timeout ?? this.config.defaultTimeout;
    const execPromise = ssh.execCommand(command, execOptions);

    const result = await this.handleTimeout(
      execPromise,
      timeout,
      command,
      () => {
        // SSH doesn't provide a direct way to kill the remote process
        // This is a limitation we need to document
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

  private wrapWithSudo(command: string, options: Command): string {
    if (!this.sshConfig.sudo.enabled) {
      return command;
    }

    // Check if command already starts with sudo
    if (command.trim().startsWith('sudo ')) {
      return command;
    }

    // Build sudo command
    const sudoCmd = 'sudo';

    if (this.sshConfig.sudo.password) {
      // Use echo to pipe password to sudo
      // Note: This is not the most secure method but works for automation
      return `echo '${this.sshConfig.sudo.password}' | sudo -S ${command}`;
    }

    return `${sudoCmd} ${command}`;
  }

  private startPoolCleanup(): void {
    this.poolCleanupInterval = setInterval(() => {
      const now = Date.now();
      const timeout = this.sshConfig.connectionPool.idleTimeout;

      for (const [key, connection] of this.connectionPool.entries()) {
        if (now - connection.lastUsed > timeout) {
          connection.ssh.dispose();
          this.connectionPool.delete(key);
        }
      }
    }, 60000); // Check every minute
  }

  private removeFromPool(key: string): void {
    const connection = this.connectionPool.get(key);
    if (connection) {
      connection.ssh.dispose();
      this.connectionPool.delete(key);
    }
  }

  async dispose(): Promise<void> {
    if (this.poolCleanupInterval) {
      clearInterval(this.poolCleanupInterval);
    }

    for (const connection of this.connectionPool.values()) {
      connection.ssh.dispose();
    }

    this.connectionPool.clear();
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
}
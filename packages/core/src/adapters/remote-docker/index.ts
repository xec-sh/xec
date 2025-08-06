import { Readable } from 'node:stream';
import { Client, ConnectConfig } from 'ssh2';

import { StreamHandler } from '../../utils/stream.js';
import { ExecutionResult } from '../../core/result.js';
import { BaseAdapter, BaseAdapterConfig } from '../base-adapter.js';
import { Command, SSHAdapterOptions, DockerAdapterOptions } from '../../types/command.js';
import { DockerError, AdapterError, TimeoutError, ConnectionError } from '../../core/error.js';

export interface RemoteDockerAdapterOptions {
  type: 'remote-docker';
  ssh: Omit<SSHAdapterOptions, 'type'>;
  docker: Omit<DockerAdapterOptions, 'type'>;
}

export interface RemoteDockerAdapterConfig extends BaseAdapterConfig {
  ssh: {
    host: string;
    username: string;
    port?: number;
    privateKey?: string | Buffer;
    passphrase?: string;
    password?: string;
    readyTimeout?: number;
    keepaliveInterval?: number;
    keepaliveCountMax?: number;
  };
  dockerPath?: string;
  autoCreate?: {
    enabled: boolean;
    image: string;
    autoRemove: boolean;
    volumes?: string[];
  };
}

export class RemoteDockerAdapter extends BaseAdapter {
  protected readonly adapterName = 'remote-docker';
  private remoteDockerConfig: RemoteDockerAdapterConfig;
  private sshClient: Client | null = null;
  private tempContainers: Set<string> = new Set();

  constructor(config: RemoteDockerAdapterConfig) {
    super(config);
    this.name = this.adapterName;
    this.remoteDockerConfig = {
      ...config,
      dockerPath: config.dockerPath || 'docker',
      autoCreate: {
        enabled: false,
        image: 'alpine:latest',
        autoRemove: true,
        ...config.autoCreate
      }
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if we can connect via SSH and Docker is available
      const client = await this.getConnection();
      const result = await this.executeSSHCommand(client, `${this.remoteDockerConfig.dockerPath} version --format json`);
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  async execute(command: Command): Promise<ExecutionResult> {
    const mergedCommand = this.mergeCommand(command);
    const remoteDockerOptions = this.extractRemoteDockerOptions(mergedCommand);

    if (!remoteDockerOptions) {
      throw new AdapterError(this.adapterName, 'execute', new Error('Remote Docker options not provided'));
    }

    const startTime = Date.now();

    try {
      const client = await this.getConnection();

      // Check if container exists or needs to be created
      let container = remoteDockerOptions.docker.container;
      if (this.remoteDockerConfig.autoCreate?.enabled) {
        const exists = await this.containerExists(client, container);
        if (!exists) {
          container = await this.createTempContainer(client);
        }
      }

      // Build docker exec command
      const dockerCmd = this.buildDockerExecCommand(container, remoteDockerOptions.docker, mergedCommand);

      // Execute through SSH
      const result = await this.executeSSHCommand(
        client,
        dockerCmd,
        mergedCommand.stdin,
        mergedCommand.timeout,
        mergedCommand.signal
      );

      const endTime = Date.now();

      return this.createResult(
        result.stdout,
        result.stderr,
        result.exitCode,
        result.signal,
        mergedCommand.command,
        startTime,
        endTime,
        {
          host: this.remoteDockerConfig.ssh.host,
          container
        }
      );
    } catch (error) {
      if (error instanceof Error) {
        throw new DockerError(
          remoteDockerOptions.docker.container,
          'remote-exec',
          error
        );
      }
      throw error;
    }
  }

  private extractRemoteDockerOptions(command: Command): RemoteDockerAdapterOptions | null {
    if (command.adapterOptions?.type === 'remote-docker') {
      return command.adapterOptions as RemoteDockerAdapterOptions;
    }

    // Support inline options
    if (command.adapterOptions?.type === 'ssh' && (command.adapterOptions as any).docker) {
      const sshOpts = command.adapterOptions as SSHAdapterOptions;
      return {
        type: 'remote-docker',
        ssh: sshOpts,
        docker: (sshOpts as any).docker
      };
    }

    // Use config defaults if available
    if (this.remoteDockerConfig.ssh && command.adapterOptions?.type === 'docker') {
      return {
        type: 'remote-docker',
        ssh: this.remoteDockerConfig.ssh,
        docker: command.adapterOptions as DockerAdapterOptions
      };
    }

    return null;
  }

  private buildDockerExecCommand(
    container: string,
    dockerOptions: Omit<DockerAdapterOptions, 'type'>,
    command: Command
  ): string {
    const args: string[] = [this.remoteDockerConfig.dockerPath!, 'exec'];

    // Interactive/TTY options
    if (command.stdin) {
      args.push('-i');
    }
    if (dockerOptions.tty ?? false) {
      args.push('-t');
    }

    // User
    if (dockerOptions.user) {
      args.push('-u', dockerOptions.user);
    }

    // Working directory
    if (dockerOptions.workdir || command.cwd) {
      args.push('-w', dockerOptions.workdir || command.cwd!);
    }

    // Environment variables
    if (command.env) {
      for (const [key, value] of Object.entries(command.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }

    // Container name
    args.push(container);

    // Command and arguments
    if (command.shell) {
      const shellCmd = typeof command.shell === 'string' ? command.shell : '/bin/sh';
      args.push(shellCmd, '-c', this.buildCommandString(command));
    } else {
      args.push(command.command);
      if (command.args) {
        args.push(...command.args);
      }
    }

    // Quote arguments properly for shell execution
    return args.map(arg => {
      if (arg.includes(' ') || arg.includes('"') || arg.includes("'") || arg.includes('$')) {
        return `"${arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`;
      }
      return arg;
    }).join(' ');
  }

  private async containerExists(client: Client, container: string): Promise<boolean> {
    try {
      const result = await this.executeSSHCommand(
        client,
        `${this.remoteDockerConfig.dockerPath} inspect -f '{{.State.Running}}' ${container}`
      );
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  private async createTempContainer(client: Client): Promise<string> {
    const containerName = `xec-temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const createArgs = [
      this.remoteDockerConfig.dockerPath!,
      'run',
      '-d',
      '--name', containerName
    ];

    if (this.remoteDockerConfig.autoCreate!.autoRemove) {
      createArgs.push('--rm');
    }

    if (this.remoteDockerConfig.autoCreate?.volumes) {
      for (const volume of this.remoteDockerConfig.autoCreate.volumes) {
        createArgs.push('-v', volume);
      }
    }

    createArgs.push(this.remoteDockerConfig.autoCreate!.image, 'tail', '-f', '/dev/null');

    const result = await this.executeSSHCommand(client, createArgs.join(' '));

    if (result.exitCode !== 0) {
      throw new DockerError(containerName, 'create', new Error(result.stderr));
    }

    this.tempContainers.add(containerName);
    return containerName;
  }

  private async getConnection(): Promise<Client> {
    // Check if we have an active connection
    if (this.sshClient) {
      // Try to use the existing connection
      try {
        // Test if connection is still alive by executing a simple command
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Connection test timeout')), 1000);
          this.sshClient!.exec('echo test', (err) => {
            clearTimeout(timeout);
            if (err) reject(err);
            else resolve();
          });
        });
        return this.sshClient;
      } catch {
        // Connection is dead, close it and create new one
        this.sshClient.end();
        this.sshClient = null;
      }
    }

    return new Promise((resolve, reject) => {
      const client = new Client();
      const connectConfig: ConnectConfig = {
        host: this.remoteDockerConfig.ssh.host,
        port: this.remoteDockerConfig.ssh.port || 22,
        username: this.remoteDockerConfig.ssh.username,
        privateKey: this.remoteDockerConfig.ssh.privateKey,
        passphrase: this.remoteDockerConfig.ssh.passphrase,
        password: this.remoteDockerConfig.ssh.password,
        readyTimeout: this.remoteDockerConfig.ssh.readyTimeout || 20000,
        keepaliveInterval: this.remoteDockerConfig.ssh.keepaliveInterval || 10000,
        keepaliveCountMax: this.remoteDockerConfig.ssh.keepaliveCountMax || 3
      };

      const timeout = setTimeout(() => {
        client.destroy();
        reject(new ConnectionError(this.remoteDockerConfig.ssh.host, new Error('Connection timeout')));
      }, connectConfig.readyTimeout!);

      client.once('ready', () => {
        clearTimeout(timeout);
        this.sshClient = client;

        resolve(client);
      });

      client.once('error', (err) => {
        clearTimeout(timeout);

        reject(new ConnectionError(this.remoteDockerConfig.ssh.host, err));
      });

      client.connect(connectConfig);
    });
  }

  private async executeSSHCommand(
    client: Client,
    command: string,
    stdin?: string | Buffer | Readable,
    timeout?: number,
    signal?: AbortSignal
  ): Promise<{ stdout: string; stderr: string; exitCode: number; signal?: string }> {
    return new Promise((resolve, reject) => {
      const stdoutHandler = new StreamHandler({
        maxBuffer: this.config.maxBuffer,
        encoding: this.config.encoding
      });
      const stderrHandler = new StreamHandler({
        maxBuffer: this.config.maxBuffer,
        encoding: this.config.encoding
      });

      let timeoutHandle: NodeJS.Timeout | undefined;
      let abortHandler: (() => void) | undefined;

      const cleanup = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (signal && abortHandler) {
          signal.removeEventListener('abort', abortHandler);
        }
      };

      client.exec(command, (err, stream) => {
        if (err) {
          cleanup();
          reject(err);
          return;
        }

        // Handle timeout
        if (timeout) {
          timeoutHandle = setTimeout(() => {
            stream.destroy();
            cleanup();
            reject(new TimeoutError(command, timeout));
          }, timeout);
        }

        // Handle abort signal
        if (signal) {
          if (signal.aborted) {
            stream.destroy();
            cleanup();
            reject(new AdapterError(this.adapterName, 'execute', new Error('Operation aborted')));
            return;
          }

          abortHandler = () => {
            stream.destroy();
            cleanup();
          };
          signal.addEventListener('abort', abortHandler, { once: true });
        }

        // Pipe stdin if provided
        if (stdin) {
          if (typeof stdin === 'string' || Buffer.isBuffer(stdin)) {
            stream.write(stdin);
            stream.end();
          } else if (stdin instanceof Readable) {
            stdin.pipe(stream);
          }
        } else {
          stream.end();
        }

        // Handle output streams
        stream.pipe(stdoutHandler.createTransform());
        stream.stderr.pipe(stderrHandler.createTransform());

        stream.on('close', (code: number, signalName?: string) => {
          cleanup();

          const stdout = stdoutHandler.getContent();
          const stderr = stderrHandler.getContent();
          resolve({ stdout, stderr, exitCode: code ?? -1, signal: signalName });
        });

        stream.on('error', (error: Error) => {
          cleanup();
          reject(error);
        });
      });
    });
  }

  async dispose(): Promise<void> {
    // Clean up temporary containers
    if (this.sshClient && this.tempContainers.size > 0) {
      for (const container of this.tempContainers) {
        try {
          await this.executeSSHCommand(
            this.sshClient,
            `${this.remoteDockerConfig.dockerPath} stop ${container}`
          );
        } catch {
          // Ignore errors during cleanup
        }
      }
      this.tempContainers.clear();
    }

    // Close SSH connection
    if (this.sshClient) {

      this.sshClient.end();
      this.sshClient = null;
    }
  }
}

// Helper function to create a remote docker adapter
export function createRemoteDockerAdapter(
  sshOptions: Omit<SSHAdapterOptions, 'type'>,
  dockerOptions?: Partial<RemoteDockerAdapterConfig>
): RemoteDockerAdapter {
  return new RemoteDockerAdapter({
    ssh: sshOptions,
    ...dockerOptions
  });
}
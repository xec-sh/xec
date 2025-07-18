import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';

import { ExecutionResult } from '../core/result.js';
import { StreamHandler } from '../core/stream-handler.js';
import { DockerError, AdapterError } from '../core/error.js';
import { BaseAdapter, BaseAdapterConfig } from './base-adapter.js';
import { Command, DockerAdapterOptions } from '../core/command.js';

export interface DockerAutoCreateOptions {
  enabled: boolean;
  image: string;
  autoRemove: boolean;
  volumes?: string[];
}

export interface DockerDefaultExecOptions {
  User?: string;
  WorkingDir?: string;
  Env?: string[];
  Privileged?: boolean;
  AttachStdin?: boolean;
  AttachStdout?: boolean;
  AttachStderr?: boolean;
  Tty?: boolean;
}

export interface DockerAdapterConfig extends BaseAdapterConfig {
  socketPath?: string;
  host?: string;
  port?: number;
  version?: string;
  defaultExecOptions?: DockerDefaultExecOptions;
  autoCreate?: DockerAutoCreateOptions;
}

export class DockerAdapter extends BaseAdapter {
  protected readonly adapterName = 'docker';
  private dockerConfig: DockerAdapterConfig;
  private tempContainers: Set<string> = new Set();

  constructor(config: DockerAdapterConfig = {}) {
    super(config);
    this.dockerConfig = {
      ...config,
      defaultExecOptions: {
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        ...config.defaultExecOptions
      },
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
      // Check if docker CLI is available
      const result = await this.executeDockerCommand(['version', '--format', 'json'], {});
      return result.exitCode === 0;
    } catch (error) {
      // If spawn fails (e.g., docker command not found), return false
      return false;
    }
  }

  async execute(command: Command): Promise<ExecutionResult> {
    const mergedCommand = this.mergeCommand(command);
    const dockerOptions = this.extractDockerOptions(mergedCommand);

    if (!dockerOptions) {
      throw new AdapterError(this.adapterName, 'execute', new Error('Docker container options not provided'));
    }

    const startTime = Date.now();

    try {
      let container = dockerOptions.container;

      // Check if we need to create a temporary container
      if (this.dockerConfig.autoCreate?.enabled && !await this.containerExists(container)) {
        container = await this.createTempContainer();
      }

      // Build docker exec command
      const dockerArgs = this.buildDockerExecArgs(container, dockerOptions, mergedCommand);
      const result = await this.executeDockerCommand(dockerArgs, mergedCommand);

      const endTime = Date.now();

      return await this.createResult(
        result.stdout,
        result.stderr,
        result.exitCode,
        result.signal ?? undefined,
        this.buildCommandString(mergedCommand),
        startTime,
        endTime,
        { container, originalCommand: mergedCommand }
      );
    } catch (error) {
      if (error instanceof DockerError) {
        throw error;
      }

      throw new DockerError(
        dockerOptions.container,
        'execute',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  private extractDockerOptions(command: Command): DockerAdapterOptions | null {
    if (command.adapterOptions?.type === 'docker') {
      return command.adapterOptions;
    }
    return null;
  }

  /**
   * Detect if the current environment supports TTY
   */
  private supportsTTY(): boolean {
    return process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY;
  }

  /**
   * Get optimal TTY settings based on environment and command
   */
  private getTTYSettings(dockerOptions: DockerAdapterOptions, command: Command): { interactive: boolean; tty: boolean } {
    const envSupportsTTY = this.supportsTTY();
    const requestedTTY = dockerOptions.tty ?? this.dockerConfig.defaultExecOptions?.Tty ?? false;
    const hasStdin = !!command.stdin;
    
    // If TTY is explicitly requested but environment doesn't support it, warn
    if (requestedTTY && !envSupportsTTY) {
      console.warn('TTY requested but not available in current environment');
    }
    
    return {
      interactive: hasStdin || (requestedTTY && envSupportsTTY),
      tty: requestedTTY && envSupportsTTY
    };
  }

  private async containerExists(container: string): Promise<boolean> {
    try {
      const result = await this.executeDockerCommand(['inspect', container], {});
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  private async createTempContainer(): Promise<string> {
    const containerName = `temp-ush-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const createArgs = [
      'create',
      '--name', containerName,
      '-it' // Interactive + TTY for better command support
    ];

    if (this.dockerConfig.autoCreate?.volumes) {
      for (const volume of this.dockerConfig.autoCreate.volumes) {
        createArgs.push('-v', volume);
      }
    }

    createArgs.push(this.dockerConfig.autoCreate!.image, 'sh');

    const createResult = await this.executeDockerCommand(createArgs, {});
    if (createResult.exitCode !== 0) {
      throw new DockerError(containerName, 'create', new Error(createResult.stderr));
    }

    // Start the container
    const startResult = await this.executeDockerCommand(['start', containerName], {});
    if (startResult.exitCode !== 0) {
      await this.executeDockerCommand(['rm', '-f', containerName], {});
      throw new DockerError(containerName, 'start', new Error(startResult.stderr));
    }

    this.tempContainers.add(containerName);
    return containerName;
  }

  private buildDockerExecArgs(
    container: string,
    dockerOptions: DockerAdapterOptions,
    command: Command
  ): string[] {
    const args = ['exec'];

    // Get optimal TTY settings
    const ttySettings = this.getTTYSettings(dockerOptions, command);
    
    // Add interactive flag
    if (ttySettings.interactive) {
      args.push('-i');
    }

    // Add TTY flag
    if (ttySettings.tty) {
      args.push('-t');
    }

    // Add user
    const user = dockerOptions.user || this.dockerConfig.defaultExecOptions?.User;
    if (user) {
      args.push('-u', user);
    }

    // Add working directory
    const workdir = dockerOptions.workdir || this.dockerConfig.defaultExecOptions?.WorkingDir;
    if (workdir) {
      args.push('-w', workdir);
    }

    // Add environment variables
    const env = this.createCombinedEnv(this.config.defaultEnv, command.env);
    for (const [key, value] of Object.entries(env)) {
      args.push('-e', `${key}=${value}`);
    }

    // Add privileged flag
    if (this.dockerConfig.defaultExecOptions?.Privileged) {
      args.push('--privileged');
    }

    // Add container and command
    args.push(container);

    // Use shell to execute the command
    if (command.shell) {
      args.push('sh', '-c', this.buildCommandString(command));
    } else {
      args.push(command.command);
      if (command.args) {
        args.push(...command.args);
      }
    }

    return args;
  }

  private async executeDockerCommand(
    args: string[],
    command: Partial<Command>
  ): Promise<{ stdout: string; stderr: string; exitCode: number; signal: string | null }> {
    const stdoutHandler = new StreamHandler({
      encoding: this.config.encoding,
      maxBuffer: this.config.maxBuffer
    });

    const stderrHandler = new StreamHandler({
      encoding: this.config.encoding,
      maxBuffer: this.config.maxBuffer
    });

    // Check if we're running with TTY
    const hasTTY = args.includes('-t');
    const hasInteractive = args.includes('-i');

    const child = spawn('docker', args, {
      env: process.env,
      windowsHide: true,
      // Inherit stdio for interactive TTY mode to support proper terminal interaction
      stdio: hasTTY && hasInteractive && process.stdin.isTTY ? ['inherit', 'inherit', 'inherit'] : ['pipe', 'pipe', 'pipe']
    });

    // Handle stdin only if not in inherit mode
    if (child.stdin && command.stdin) {
      if (typeof command.stdin === 'string' || Buffer.isBuffer(command.stdin)) {
        child.stdin.write(command.stdin);
        child.stdin.end();
      } else if (command.stdin instanceof Readable) {
        command.stdin.pipe(child.stdin);
      }
    }

    // Collect output only if not in inherit mode
    if (child.stdout) {
      child.stdout.pipe(stdoutHandler.createTransform());
    }

    if (child.stderr) {
      child.stderr.pipe(stderrHandler.createTransform());
    }

    // Wait for completion
    return new Promise((resolve, reject) => {
      child.on('error', reject);

      child.on('exit', (code, signal) => {
        resolve({
          stdout: stdoutHandler.getContent(),
          stderr: stderrHandler.getContent(),
          exitCode: code ?? 0,
          signal
        });
      });
    });
  }

  protected override async createResult(
    stdout: string,
    stderr: string,
    exitCode: number,
    signal: string | undefined,
    command: string,
    startTime: number,
    endTime: number,
    context?: { host?: string; container?: string; originalCommand?: Command }
  ): Promise<ExecutionResult> {
    const result = await super.createResult(stdout, stderr, exitCode, signal, command, startTime, endTime, context);
    
    // Override error handling to throw DockerError instead of CommandError
    if (context?.originalCommand && this.shouldThrowOnNonZeroExit(context.originalCommand, exitCode)) {
      const container = context?.container || 'unknown';
      throw new DockerError(container, 'execute', new Error(`Command failed with exit code ${exitCode}: ${command}`));
    }
    
    return result;
  }

  async dispose(): Promise<void> {
    // Clean up temporary containers
    if (this.dockerConfig.autoCreate?.autoRemove) {
      for (const container of this.tempContainers) {
        try {
          await this.executeDockerCommand(['rm', '-f', container], {});
        } catch {
          // Ignore errors during cleanup
        }
      }
    }
    this.tempContainers.clear();
  }

  // Additional Docker-specific methods
  async listContainers(all = false): Promise<string[]> {
    const args = ['ps'];
    if (all) args.push('-a');
    args.push('--format', '{{.Names}}');

    const result = await this.executeDockerCommand(args, {});
    if (result.exitCode !== 0) {
      throw new DockerError('', 'list', new Error(result.stderr));
    }
    return result.stdout.trim().split('\n').filter(Boolean);
  }

  async createContainer(options: {
    name: string;
    image: string;
    volumes?: string[];
    env?: Record<string, string>;
    ports?: string[];
  }): Promise<void> {
    const args = ['create', '--name', options.name];

    if (options.volumes) {
      for (const volume of options.volumes) {
        args.push('-v', volume);
      }
    }

    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }

    if (options.ports) {
      for (const port of options.ports) {
        args.push('-p', port);
      }
    }

    args.push(options.image);

    const result = await this.executeDockerCommand(args, {});
    if (result.exitCode !== 0) {
      throw new DockerError(options.name, 'create', new Error(result.stderr));
    }
  }

  async startContainer(container: string): Promise<void> {
    const result = await this.executeDockerCommand(['start', container], {});
    if (result.exitCode !== 0) {
      throw new DockerError(container, 'start', new Error(result.stderr));
    }
  }

  async stopContainer(container: string): Promise<void> {
    const result = await this.executeDockerCommand(['stop', container], {});
    if (result.exitCode !== 0) {
      throw new DockerError(container, 'stop', new Error(result.stderr));
    }
  }

  async removeContainer(container: string, force = false): Promise<void> {
    const args = ['rm'];
    if (force) args.push('-f');
    args.push(container);

    const result = await this.executeDockerCommand(args, {});
    if (result.exitCode !== 0) {
      throw new DockerError(container, 'remove', new Error(result.stderr));
    }
  }
}
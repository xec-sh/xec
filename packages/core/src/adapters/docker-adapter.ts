import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';

import { StreamHandler } from '../utils/stream.js';
import { ExecutionResult } from '../core/result.js';
import { BaseAdapter, BaseAdapterConfig } from './base-adapter.js';
import { Command, DockerAdapterOptions } from '../core/command.js';
import { DockerError, AdapterError, sanitizeCommandForError } from '../core/error.js';

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

export interface DockerImageBuildOptions {
  tag: string;
  dockerfile?: string;
  context?: string;
  buildArgs?: Record<string, string>;
  target?: string;
  noCache?: boolean;
  pull?: boolean;
  platform?: string;
}

export interface DockerComposeOptions {
  file?: string | string[];
  projectName?: string;
  env?: Record<string, string>;
}

export interface DockerLogsOptions {
  follow?: boolean;
  tail?: number | 'all';
  since?: string;
  until?: string;
  timestamps?: boolean;
}

export interface DockerNetworkOptions {
  driver?: string;
  subnet?: string;
  gateway?: string;
  ipRange?: string;
  attachable?: boolean;
  internal?: boolean;
}

export interface DockerVolumeOptions {
  driver?: string;
  driverOpts?: Record<string, string>;
  labels?: Record<string, string>;
}

export interface DockerHealthCheckOptions {
  test: string | string[];
  interval?: string;
  timeout?: string;
  retries?: number;
  startPeriod?: string;
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
    this.name = this.adapterName;
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

    // Validate container name for security
    this.validateContainerName(dockerOptions.container);

    const startTime = Date.now();

    try {
      let container = dockerOptions.container;

      // Check if we need to create a temporary container
      if (this.dockerConfig.autoCreate?.enabled && !await this.containerExists(container)) {
        container = await this.createTempContainer();

        // Emit docker:run event for container creation
        this.emitAdapterEvent('docker:run', {
          image: this.dockerConfig.autoCreate.image,
          container,
          command: 'sh'
        });
      }

      // Emit docker:exec event
      this.emitAdapterEvent('docker:exec', {
        container,
        command: this.buildCommandString(mergedCommand)
      });

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
   * Validate container name for security
   */
  private validateContainerName(containerName: string): void {
    // Check for empty container name
    if (!containerName || containerName.trim() === '') {
      throw new DockerError(containerName, 'validate', new Error('Container name cannot be empty'));
    }

    // Check for shell metacharacters that could lead to command injection
    const dangerousChars = /[;&|`$(){}[\]<>'"\\]/;
    if (dangerousChars.test(containerName)) {
      throw new DockerError(containerName, 'validate', new Error('Container name contains invalid characters'));
    }

    // Check for path traversal attempts
    if (containerName.includes('..') ||
      containerName.startsWith('/') ||
      containerName.match(/^[A-Za-z]:\\/)) { // Windows absolute path
      throw new DockerError(containerName, 'validate', new Error('Container name contains invalid path characters'));
    }

    // Docker container names must match [a-zA-Z0-9][a-zA-Z0-9_.-]*
    const validNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
    if (!validNamePattern.test(containerName)) {
      throw new DockerError(containerName, 'validate', new Error('Container name must start with alphanumeric and contain only alphanumeric, underscore, period, or hyphen'));
    }
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

  protected async executeDockerCommand(
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

    // For compose commands, we might need to pass environment variables
    const env = args[0] === 'compose' && command.env
      ? { ...process.env, ...command.env }
      : process.env;

    // Check if we're running with TTY
    const hasTTY = args.includes('-t');
    const hasInteractive = args.includes('-i');

    const child = spawn('docker', args, {
      env,
      cwd: command.cwd || process.cwd(), // Use command's cwd if provided
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
        const result = {
          stdout: stdoutHandler.getContent(),
          stderr: stderrHandler.getContent(),
          exitCode: code ?? 0,
          signal
        };
        
        resolve(result);
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
      throw new DockerError(container, 'execute', new Error(`Command failed with exit code ${exitCode}: ${sanitizeCommandForError(command)}`));
    }

    return result;
  }

  async dispose(): Promise<void> {
    // Clean up temporary containers
    if (this.dockerConfig.autoCreate?.autoRemove) {
      for (const container of this.tempContainers) {
        try {
          // Emit temp cleanup event
          this.emitAdapterEvent('temp:cleanup', {
            path: container,
            type: 'directory'
          });

          await this.executeDockerCommand(['rm', '-f', container], {});
        } catch (error) {
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

    try {
      const result = await this.executeDockerCommand(args, {});
      if (result.exitCode !== 0) {
        throw new DockerError(options.name, 'create', new Error(result.stderr));
      }
    } catch (error) {
      throw error;
    }
  }

  async startContainer(container: string): Promise<void> {
    try {
      const result = await this.executeDockerCommand(['start', container], {});
      if (result.exitCode !== 0) {
        throw new DockerError(container, 'start', new Error(result.stderr));
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create and start a container in one operation (docker run)
   */
  async runContainer(options: {
    name: string;
    image: string;
    volumes?: string[];
    env?: Record<string, string>;
    ports?: string[];
    network?: string;
    restart?: string;
    workdir?: string;
    user?: string;
    labels?: Record<string, string>;
    privileged?: boolean;
    healthcheck?: DockerHealthCheckOptions;
    command?: string[];
  }): Promise<void> {
    const args = ['run', '-d', '--name', options.name];
    
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
    
    if (options.network) {
      args.push('--network', options.network);
    }
    
    if (options.restart) {
      args.push('--restart', options.restart);
    }
    
    if (options.workdir) {
      args.push('-w', options.workdir);
    }
    
    if (options.user) {
      args.push('-u', options.user);
    }
    
    if (options.labels) {
      for (const [key, value] of Object.entries(options.labels)) {
        args.push('--label', `${key}=${value}`);
      }
    }
    
    if (options.privileged) {
      args.push('--privileged');
    }
    
    if (options.healthcheck) {
      const hc = options.healthcheck;
      if (Array.isArray(hc.test)) {
        args.push('--health-cmd', hc.test.join(' '));
      } else {
        args.push('--health-cmd', hc.test);
      }
      if (hc.interval) args.push('--health-interval', hc.interval);
      if (hc.timeout) args.push('--health-timeout', hc.timeout);
      if (hc.retries) args.push('--health-retries', String(hc.retries));
      if (hc.startPeriod) args.push('--health-start-period', hc.startPeriod);
    }
    
    args.push(options.image);
    
    if (options.command) {
      args.push(...options.command);
    }
    
    const result = await this.executeDockerCommand(args, {});
    if (result.exitCode !== 0) {
      throw new DockerError(options.name, 'run', new Error(result.stderr));
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

  /**
   * Build a Docker image
   */
  async buildImage(options: DockerImageBuildOptions): Promise<void> {
    const args = ['build'];

    if (options.tag) {
      args.push('-t', options.tag);
    }

    if (options.dockerfile) {
      args.push('-f', options.dockerfile);
    }

    if (options.buildArgs) {
      for (const [key, value] of Object.entries(options.buildArgs)) {
        args.push('--build-arg', `${key}=${value}`);
      }
    }

    if (options.target) {
      args.push('--target', options.target);
    }

    if (options.noCache) {
      args.push('--no-cache');
    }

    if (options.pull) {
      args.push('--pull');
    }

    if (options.platform) {
      args.push('--platform', options.platform);
    }

    // Always specify '.' as the build context in the command
    args.push('.');

    // Execute the command with cwd set to the context directory
    try {
      const result = await this.executeDockerCommand(args, {
        cwd: options.context || process.cwd()
      });

      if (result.exitCode !== 0) {
        throw new DockerError('', 'build', new Error(result.stderr));
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Push image to registry
   */
  async pushImage(image: string): Promise<void> {
    const result = await this.executeDockerCommand(['push', image], {});
    if (result.exitCode !== 0) {
      throw new DockerError(image, 'push', new Error(result.stderr));
    }
  }

  /**
   * Pull image from registry
   */
  async pullImage(image: string): Promise<void> {
    const result = await this.executeDockerCommand(['pull', image], {});
    if (result.exitCode !== 0) {
      throw new DockerError(image, 'pull', new Error(result.stderr));
    }
  }

  /**
   * Tag an image
   */
  async tagImage(source: string, target: string): Promise<void> {
    const result = await this.executeDockerCommand(['tag', source, target], {});
    if (result.exitCode !== 0) {
      throw new DockerError(source, 'tag', new Error(result.stderr));
    }
  }

  /**
   * List images
   */
  async listImages(filter?: string): Promise<string[]> {
    const args = ['images', '--format', '{{.Repository}}:{{.Tag}}'];
    if (filter) {
      // Docker filter expects format like "reference=alpine"
      // If filter doesn't contain '=', assume it's a reference filter
      if (!filter.includes('=')) {
        args.push('--filter', `reference=${filter}*`);
      } else {
        args.push('--filter', filter);
      }
    }

    const result = await this.executeDockerCommand(args, {});
    if (result.exitCode !== 0) {
      throw new DockerError('', 'images', new Error(result.stderr));
    }
    return result.stdout.trim().split('\n').filter(Boolean);
  }

  /**
   * Remove image
   */
  async removeImage(image: string, force = false): Promise<void> {
    const args = ['rmi'];
    if (force) args.push('-f');
    args.push(image);

    const result = await this.executeDockerCommand(args, {});
    if (result.exitCode !== 0) {
      throw new DockerError(image, 'rmi', new Error(result.stderr));
    }
  }

  /**
   * Get container logs
   */
  async getLogs(container: string, options: DockerLogsOptions = {}): Promise<string> {
    const args = ['logs'];

    if (options.follow) {
      args.push('-f');
    }

    if (options.tail !== undefined) {
      args.push('--tail', String(options.tail));
    }

    if (options.since) {
      args.push('--since', options.since);
    }

    if (options.until) {
      args.push('--until', options.until);
    }

    if (options.timestamps) {
      args.push('-t');
    }

    args.push(container);

    const result = await this.executeDockerCommand(args, {});
    if (result.exitCode !== 0) {
      throw new DockerError(container, 'logs', new Error(result.stderr));
    }
    return result.stdout;
  }

  /**
   * Stream container logs
   */
  async streamLogs(
    container: string,
    onData: (data: string) => void,
    options: DockerLogsOptions = {}
  ): Promise<void> {
    const args = ['logs'];

    // Only add -f flag if follow is explicitly true
    if (options.follow) {
      args.push('-f');
    }

    if (options.tail !== undefined) {
      args.push('--tail', String(options.tail));
    }

    if (options.timestamps) {
      args.push('-t');
    }

    args.push(container);

    return new Promise((resolve, reject) => {
      const child = spawn('docker', args);
      let buffer = '';

      const processData = (data: string) => {
        buffer += data;
        const lines = buffer.split('\n');
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || '';
        // Send complete lines
        lines.forEach(line => {
          if (line) {
            onData(line + '\n');
          }
        });
      };

      child.stdout.on('data', (chunk: Buffer) => {
        processData(chunk.toString());
      });

      child.stderr.on('data', (chunk: Buffer) => {
        processData(chunk.toString());
      });

      child.on('error', reject);
      child.on('exit', (code) => {
        // Flush any remaining buffer
        if (buffer) {
          onData(buffer);
        }
        if (code === 0 || code === 143) { // 143 is SIGTERM which is normal when stopping container
          resolve();
        } else {
          reject(new DockerError(container, 'logs', new Error('Log streaming failed')));
        }
      });
    });
  }

  /**
   * Copy files to container
   */
  async copyToContainer(src: string, container: string, dest: string): Promise<void> {
    const result = await this.executeDockerCommand(['cp', src, `${container}:${dest}`], {});
    if (result.exitCode !== 0) {
      throw new DockerError(container, 'cp', new Error(result.stderr));
    }
  }

  /**
   * Copy files from container
   */
  async copyFromContainer(container: string, src: string, dest: string): Promise<void> {
    const result = await this.executeDockerCommand(['cp', `${container}:${src}`, dest], {});
    if (result.exitCode !== 0) {
      throw new DockerError(container, 'cp', new Error(result.stderr));
    }
  }

  /**
   * Inspect container
   */
  async inspectContainer(container: string): Promise<any> {
    const result = await this.executeDockerCommand(['inspect', container], {});
    if (result.exitCode !== 0) {
      throw new DockerError(container, 'inspect', new Error(result.stderr));
    }
    return JSON.parse(result.stdout)[0];
  }

  /**
   * Get container stats
   */
  async getStats(container: string): Promise<any> {
    const result = await this.executeDockerCommand([
      'stats',
      '--no-stream',
      '--format',
      'json',
      container
    ], {});

    if (result.exitCode !== 0) {
      throw new DockerError(container, 'stats', new Error(result.stderr));
    }
    return JSON.parse(result.stdout);
  }

  /**
   * Create a Docker network
   */
  async createNetwork(name: string, options: DockerNetworkOptions = {}): Promise<void> {
    // Check if network already exists
    const existingNetworks = await this.listNetworks();
    if (existingNetworks.includes(name)) {
      // Network already exists, skip creation
      return;
    }

    const args = ['network', 'create'];

    if (options.driver) {
      args.push('--driver', options.driver);
    }

    if (options.subnet) {
      args.push('--subnet', options.subnet);
    }

    if (options.gateway) {
      args.push('--gateway', options.gateway);
    }

    if (options.ipRange) {
      args.push('--ip-range', options.ipRange);
    }

    if (options.attachable) {
      args.push('--attachable');
    }

    if (options.internal) {
      args.push('--internal');
    }

    args.push(name);

    const result = await this.executeDockerCommand(args, {});
    if (result.exitCode !== 0) {
      // Check if error is because network already exists
      if (result.stderr.includes('already exists')) {
        return; // Network exists, that's OK
      }
      throw new DockerError(name, 'network create', new Error(result.stderr));
    }
  }

  /**
   * Remove a Docker network
   */
  async removeNetwork(name: string): Promise<void> {
    const result = await this.executeDockerCommand(['network', 'rm', name], {});
    if (result.exitCode !== 0) {
      throw new DockerError(name, 'network rm', new Error(result.stderr));
    }
  }

  /**
   * List Docker networks
   */
  async listNetworks(): Promise<string[]> {
    const result = await this.executeDockerCommand([
      'network',
      'ls',
      '--format',
      '{{.Name}}'
    ], {});

    if (result.exitCode !== 0) {
      throw new DockerError('', 'network ls', new Error(result.stderr));
    }
    return result.stdout.trim().split('\n').filter(Boolean);
  }

  /**
   * Create a Docker volume
   */
  async createVolume(name: string, options: DockerVolumeOptions = {}): Promise<void> {
    const args = ['volume', 'create'];

    if (options.driver) {
      args.push('--driver', options.driver);
    }

    if (options.driverOpts) {
      for (const [key, value] of Object.entries(options.driverOpts)) {
        args.push('--opt', `${key}=${value}`);
      }
    }

    if (options.labels) {
      for (const [key, value] of Object.entries(options.labels)) {
        args.push('--label', `${key}=${value}`);
      }
    }

    args.push(name);

    const result = await this.executeDockerCommand(args, {});
    if (result.exitCode !== 0) {
      throw new DockerError(name, 'volume create', new Error(result.stderr));
    }
  }

  /**
   * Remove a Docker volume
   */
  async removeVolume(name: string, force = false): Promise<void> {
    const args = ['volume', 'rm'];
    if (force) args.push('-f');
    args.push(name);

    const result = await this.executeDockerCommand(args, {});
    if (result.exitCode !== 0) {
      throw new DockerError(name, 'volume rm', new Error(result.stderr));
    }
  }

  /**
   * List Docker volumes
   */
  async listVolumes(): Promise<string[]> {
    const result = await this.executeDockerCommand([
      'volume',
      'ls',
      '--format',
      '{{.Name}}'
    ], {});

    if (result.exitCode !== 0) {
      throw new DockerError('', 'volume ls', new Error(result.stderr));
    }
    return result.stdout.trim().split('\n').filter(Boolean);
  }

  /**
   * Docker Compose up
   */
  async composeUp(options: DockerComposeOptions = {}): Promise<void> {
    const args = this.buildComposeArgs(options);
    args.push('up', '-d');

    const result = await this.executeDockerCommand(args, {});
    if (result.exitCode !== 0) {
      throw new DockerError('', 'compose up', new Error(result.stderr));
    }
  }

  /**
   * Docker Compose down
   */
  async composeDown(options: DockerComposeOptions = {}): Promise<void> {
    const args = this.buildComposeArgs(options);
    args.push('down');

    const result = await this.executeDockerCommand(args, {});
    if (result.exitCode !== 0) {
      throw new DockerError('', 'compose down', new Error(result.stderr));
    }
  }

  /**
   * Docker Compose ps
   */
  async composePs(options: DockerComposeOptions = {}): Promise<string> {
    const args = this.buildComposeArgs(options);
    args.push('ps');

    const result = await this.executeDockerCommand(args, {});
    if (result.exitCode !== 0) {
      throw new DockerError('', 'compose ps', new Error(result.stderr));
    }
    return result.stdout;
  }

  /**
   * Docker Compose logs
   */
  async composeLogs(service?: string, options: DockerComposeOptions = {}): Promise<string> {
    const args = this.buildComposeArgs(options);
    args.push('logs');
    if (service) {
      args.push(service);
    }

    const result = await this.executeDockerCommand(args, {});
    if (result.exitCode !== 0) {
      throw new DockerError('', 'compose logs', new Error(result.stderr));
    }
    return result.stdout;
  }

  /**
   * Wait for container to be healthy
   */
  async waitForHealthy(container: string, timeout = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const info = await this.inspectContainer(container);
        const health = info.State?.Health?.Status;

        if (health === 'healthy') {
          return;
        } else if (health === 'unhealthy') {
          throw new DockerError(container, 'health', new Error('Container is unhealthy'));
        }
      } catch (error) {
        // Container might not exist yet
      }

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new DockerError(container, 'health', new Error('Timeout waiting for container to be healthy'));
  }

  /**
   * Execute command and return result as JSON
   */
  async execJson<T = any>(container: string, command: string[]): Promise<T> {
    if (!command || command.length === 0) {
      throw new DockerError(container, 'exec', new Error('Command array is empty'));
    }

    const [cmd, ...args] = command;
    if (!cmd) {
      throw new DockerError(container, 'exec', new Error('Command is empty'));
    }

    const result = await this.execute({
      command: cmd,
      args,
      adapterOptions: { type: 'docker', container }
    });

    if (result.exitCode !== 0) {
      throw new DockerError(container, 'exec', new Error(result.stderr));
    }

    try {
      return JSON.parse(result.stdout);
    } catch (error) {
      throw new DockerError(container, 'exec', new Error('Failed to parse JSON output'));
    }
  }

  /**
   * Build Docker Compose args
   */
  private buildComposeArgs(options: DockerComposeOptions): string[] {
    const args = ['compose'];

    if (options.file) {
      const files = Array.isArray(options.file) ? options.file : [options.file];
      for (const file of files) {
        args.push('-f', file);
      }
    }

    if (options.projectName) {
      args.push('-p', options.projectName);
    }

    return args;
  }
}
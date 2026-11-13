import { LocalAdapter } from '../local/index.js';
import { findDockerPath } from './docker-utils.js';
import { splitLines } from '../../utils/line-split.js';
import { LocalCommandSession } from '../local/command-session.js';
import { BaseAdapter, BaseAdapterConfig } from '../base-adapter.js';
import { Command, DockerAdapterOptions } from '../../types/command.js';
import { ExecutionResult, ExecutionResultImpl } from '../../core/result.js';
import { DockerError, AdapterError, TimeoutError, sanitizeCommandForError } from '../../core/error.js';

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
  /** Total stream lifetime; follow has no deadline by default. */
  timeout?: number;
  signal?: AbortSignal;
  /** Maximum buffered bytes per log line. */
  maxBuffer?: number;
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

  /**
   * Timeout applied to Docker *management* operations — inspect, ps, start,
   * stop, cp and friends — as opposed to the user's own command.
   *
   * Without it a wedged daemon makes every one of these wait forever, which
   * is indistinguishable from a hung application. Defaults to 60 seconds.
   * An explicitly requested graceful-stop interval is added to this budget.
   */
  managementTimeout?: number;

  /**
   * Timeout applied to Docker operations that legitimately take minutes:
   * `pull`, `push`, `build` and `compose up`. Defaults to 10 minutes.
   */
  transferTimeout?: number;
}

/** Fallback timeout for short-lived Docker management commands, in ms. */
const DEFAULT_MANAGEMENT_TIMEOUT = 60_000;

/** Fallback timeout for image and compose operations, in ms. */
const DEFAULT_TRANSFER_TIMEOUT = 600_000;

export class DockerAdapter extends BaseAdapter {
  protected readonly adapterName = 'docker';
  private dockerConfig: DockerAdapterConfig;
  private tempContainers: Set<string> = new Set();
  private local: LocalAdapter;
  private sessions = new Set<LocalCommandSession>();
  private disposing?: Promise<void>;

  constructor(config: DockerAdapterConfig = {}) {
    super(config);
    this.name = this.adapterName;
    this.local = new LocalAdapter({
      forceImplementation: 'node',
      encoding: config.encoding,
      // Management output is protocol data; public exec is masked by createResult.
      sensitiveDataMasking: { enabled: false },
    });
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
      const result = await this.executeDockerCommand(['version', '--format', 'json'], this.managementOptions());
      return result.exitCode === 0;
    } catch {
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
    let containerName = dockerOptions.container;

    try {
      let result: { stdout: string; stderr: string; stdall: string; exitCode: number; signal: string | null };

      // Auto-detect runMode based on presence of image
      const effectiveRunMode = this.determineRunMode(dockerOptions);

      // Check if we should use run mode (for ephemeral containers)
      if (effectiveRunMode === 'run') {
        // Use docker run for ephemeral containers
        if (!dockerOptions.image) {
          throw new AdapterError(this.adapterName, 'execute', new Error('Image must be specified for run mode'));
        }

        // Emit docker:run event
        this.emitAdapterEvent('docker:run', {
          image: dockerOptions.image,
          container: dockerOptions.container,
          command: this.buildCommandString(mergedCommand)
        });

        const runArgs = this.buildDockerRunArgs(dockerOptions, mergedCommand);
        // cwd was translated to `-w` above; it names a directory inside the
        // container, so it must not become the local docker CLI's cwd.
        result = await this.executeDockerCommand(runArgs, { ...mergedCommand, cwd: undefined });
      } else {
        // Use traditional exec mode
        // Validate container name for security
        this.validateContainerName(dockerOptions.container);

        // Check if we need to create a temporary container
        if (this.dockerConfig.autoCreate?.enabled && !await this.containerExists(containerName, mergedCommand.signal)) {
          containerName = await this.createTempContainer();

          // Emit docker:run event for container creation
          this.emitAdapterEvent('docker:run', {
            image: this.dockerConfig.autoCreate.image,
            container: containerName,
            command: 'sh'
          });
        }

        // Check for container existence before executing
        if (!await this.containerExists(containerName, mergedCommand.signal)) {
          const endTime = Date.now();
          const errorMessage = `Container '${containerName}' not found`;

          // If nothrow is set, return error result instead of throwing
          if (mergedCommand.nothrow) {
            return this.createResultNoThrow(
              '',
              errorMessage,
              125, // Docker standard error code for container not found
              undefined,
              this.buildCommandString(mergedCommand),
              startTime,
              endTime,
              { container: containerName, originalCommand: mergedCommand }
            );
          }

          throw new DockerError(containerName, 'execute', new Error(errorMessage));
        }

        // Emit docker:exec event
        this.emitAdapterEvent('docker:exec', {
          container: containerName,
          command: this.buildCommandString(mergedCommand)
        });

        // Build docker exec command
        const dockerArgs = this.buildDockerExecArgs(containerName, dockerOptions, mergedCommand);
        // Same as run mode: cwd is the container's directory, not the CLI's.
        result = await this.executeDockerCommand(dockerArgs, { ...mergedCommand, cwd: undefined });
      }

      const endTime = Date.now();

      return await this.createResult(
        result.stdout,
        result.stderr,
        result.exitCode,
        result.signal ?? undefined,
        this.buildCommandString(mergedCommand),
        startTime,
        endTime,
        { container: containerName, originalCommand: mergedCommand, stdall: result.stdall }
      );
    } catch (error) {
      // Standardize timeout handling across adapters
      if (error instanceof TimeoutError) {
        const endTime = Date.now();
        if (mergedCommand.nothrow) {
          return this.createResultNoThrow(
            '',
            error.message,
            124,
            'SIGTERM',
            this.buildCommandString(mergedCommand),
            startTime,
            endTime,
            { container: containerName, originalCommand: mergedCommand }
          );
        }
        // Re-throw TimeoutError (do not wrap) for consistent behavior
        throw error;
      }

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

  private async containerExists(container: string, signal?: AbortSignal): Promise<boolean> {
    // Reuse the inventory contract: only a successful absence observation can
    // authorize creation. Transport, permission and decoding failures propagate.
    return await this.resolveContainerReference(container, signal) !== null;
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

    // Tracked before it is asked for, not after it is running. `docker
    // create` can succeed and still leave the name unreachable — the reply
    // is lost, the process is interrupted — and a container recorded only
    // on the happy path is one nothing will ever remove. Removing a name
    // that was never created is free; the reverse is a container sitting in
    // `Created` until somebody notices.
    this.tempContainers.add(containerName);

    const createResult = await this.executeDockerCommand(createArgs, this.managementOptions());
    if (createResult.exitCode !== 0) {
      throw new DockerError(containerName, 'create', new Error(createResult.stderr));
    }

    // Start the container
    const startResult = await this.executeDockerCommand(['start', containerName], this.managementOptions());
    if (startResult.exitCode !== 0) {
      await this.executeDockerCommand(['rm', '-f', containerName], this.managementOptions());
      this.tempContainers.delete(containerName);
      throw new DockerError(containerName, 'start', new Error(startResult.stderr));
    }

    return containerName;
  }

  /**
   * Automatically determine runMode based on adapter options
   * If image is provided, use 'run' mode for ephemeral containers
   * Otherwise, use 'exec' mode for existing containers
   */
  private determineRunMode(options: DockerAdapterOptions): 'run' | 'exec' {
    // If runMode is explicitly set, respect it
    if (options.runMode) {
      return options.runMode;
    }

    // Auto-detect based on presence of image
    return options.image ? 'run' : 'exec';
  }

  private buildDockerExecArgs(
    container: string,
    dockerOptions: DockerAdapterOptions,
    command: Command
  ): string[] {
    const args = ['exec'];

    // `docker exec` runs inside a container that already exists, and mounts
    // are fixed when a container is created. Accepting `volumes` here and
    // quietly not mounting them meant the command ran against a filesystem
    // the caller believed was somewhere else.
    if (dockerOptions.volumes && dockerOptions.volumes.length > 0) {
      throw new DockerError(
        container,
        'exec',
        new Error(
          'volumes are set when a container is created, and this command runs in an ' +
          'existing one. Give an `image` (or runMode: "run") to create a container ' +
          'with these mounts, or mount them on the container itself.'
        )
      );
    }

    const creationOptions = ['ports', 'network', 'platform', 'pull', 'entrypoint', 'labels', 'autoRemove'] as const;
    for (const key of creationOptions) {
      const value = dockerOptions[key];
      if (value === undefined || (Array.isArray(value) && value.length === 0)) continue;
      if (key === 'labels' && Object.keys(value as Record<string, string>).length === 0) continue;
      throw new DockerError(container, 'exec', new Error(`${key} requires runMode: "run" and an image`));
    }

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

    // Working directory inside the container. `command.cwd` wins: it is the
    // per-command intent (`$.docker({...}).cd('/app')`), which used to be
    // silently ignored here while being applied to the local docker CLI
    // process instead — an ENOENT when the container path did not exist
    // locally, and a no-op in the container either way.
    const workdir = command.cwd || dockerOptions.workdir || this.dockerConfig.defaultExecOptions?.WorkingDir;
    if (workdir) {
      args.push('-w', workdir);
    }

    // Add environment variables - only explicitly specified ones for docker exec
    const defaultEnv = this.dockerConfig.defaultExecOptions?.Env || [];
    const envFromDefaults: Record<string, string> = {};
    for (const envVar of defaultEnv) {
      const separator = envVar.indexOf('=');
      const key = envVar.slice(0, separator);
      const value = separator < 0 ? undefined : envVar.slice(separator + 1);
      if (key && value !== undefined) {
        envFromDefaults[key] = value;
      }
    }

    // Merge with command env, prioritizing command env
    const envToSet = { ...this.config.defaultEnv, ...envFromDefaults, ...dockerOptions.env, ...command.env };
    for (const [key, value] of Object.entries(envToSet)) {
      args.push('-e', `${key}=${value}`);
    }

    // Add privileged flag
    if (dockerOptions.privileged ?? this.dockerConfig.defaultExecOptions?.Privileged) {
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

  private buildDockerRunArgs(
    dockerOptions: DockerAdapterOptions,
    command: Command
  ): string[] {
    const args = ['run'];

    // Remove container after execution
    if (dockerOptions.autoRemove !== false) {
      args.push('--rm');
    }

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
    if (dockerOptions.user) {
      args.push('-u', dockerOptions.user);
    }

    // Working directory inside the container; `command.cwd` is the
    // per-command intent and wins over the target-level option.
    const workdir = command.cwd || dockerOptions.workdir;
    if (workdir) {
      args.push('-w', workdir);
    }

    // Add volumes
    if (dockerOptions.volumes) {
      for (const volume of dockerOptions.volumes) {
        args.push('-v', volume);
      }
    }

    // Environment: the engine's defaults first, then what this command
    // asked for. Only `command.env` was applied here, so `defaultEnv` —
    // set once on the engine and relied on everywhere — silently vanished
    // for any target that happened to run in `run` mode rather than
    // `exec`, which is a difference the caller never asked about.
    const envToSet = { ...this.config.defaultEnv, ...dockerOptions.env, ...command.env };
    for (const [key, value] of Object.entries(envToSet)) {
      if (key && value !== undefined) {
        args.push('-e', `${key}=${value}`);
      }
    }

    // Privileged, for the same reason: it was honoured in `exec` and
    // dropped here, so one target configuration meant two things.
    if (dockerOptions.privileged ?? this.dockerConfig.defaultExecOptions?.Privileged) {
      args.push('--privileged');
    }

    // Add container name if specified
    if (dockerOptions.container && dockerOptions.container !== 'ephemeral') {
      args.push('--name', dockerOptions.container);
    }

    for (const port of dockerOptions.ports ?? []) args.push('-p', port);
    for (const [key, value] of Object.entries(dockerOptions.labels ?? {})) {
      args.push('--label', `${key}=${value}`);
    }
    if (dockerOptions.network) args.push('--network', dockerOptions.network);
    if (dockerOptions.platform) args.push('--platform', dockerOptions.platform);
    if (dockerOptions.pull !== undefined) args.push('--pull', dockerOptions.pull ? 'always' : 'missing');

    const entrypoint = dockerOptions.entrypoint;
    const entrypointArgs = Array.isArray(entrypoint) ? entrypoint.slice(1) : [];
    if (Array.isArray(entrypoint) && entrypoint.length === 0) {
      throw new DockerError(dockerOptions.container, 'run', new Error('entrypoint must contain an executable'));
    }
    if (entrypoint !== undefined) {
      args.push('--entrypoint', Array.isArray(entrypoint) ? entrypoint[0]! : entrypoint);
    } else if (command.shell) {
      args.push('--entrypoint', 'sh');
    }
    args.push(dockerOptions.image!, ...entrypointArgs);
    if (command.shell) {
      if (entrypoint !== undefined) args.push('sh');
      args.push('-c', this.buildCommandString(command));
    } else {
      args.push(command.command, ...command.args ?? []);
    }

    return args;
  }

  /**
   * Options for a short management command (inspect, ps, start, stop, cp …).
   *
   * @returns Command options carrying the management timeout.
   */
  private managementOptions(graceMs = 0): Partial<Command> {
    const timeout = this.dockerConfig.managementTimeout ?? DEFAULT_MANAGEMENT_TIMEOUT;
    // Zero explicitly disables the request deadline; adding grace must not
    // silently re-enable it at the exact end of the shutdown interval.
    return { timeout: timeout > 0 ? graceMs + timeout : timeout };
  }

  /**
   * Options for a long-running image or compose operation.
   *
   * @returns Command options carrying the transfer timeout.
   */
  private transferOptions(): Partial<Command> {
    return { timeout: this.dockerConfig.transferTimeout ?? DEFAULT_TRANSFER_TIMEOUT };
  }

  private dockerCommand(args: string[], command: Partial<Command>): Command {
    return {
      ...command,
      command: findDockerPath(),
      args,
      shell: false,
      // Exec/run env already travels inside the container. Compose env is local.
      env: args[0] === 'compose' ? command.env : undefined,
      stdin: args.includes('-t') && args.includes('-i') && process.stdin.isTTY
        ? process.stdin : command.stdin,
      timeout: command.timeout ?? this.config.defaultTimeout,
      maxBuffer: command.maxBuffer ?? this.config.maxBuffer,
      throwOnNonZeroExit: false,
      nothrow: undefined,
    };
  }

  private startSession(command: Command, onLine?: (line: string) => void): LocalCommandSession {
    const session = new LocalCommandSession(this.local, command, {
      encoding: this.config.encoding,
      onStdout: onLine,
      onStderr: onLine,
    });
    this.sessions.add(session);
    const release = () => { this.sessions.delete(session); };
    void session.completion.then(release, release);
    return session;
  }

  protected async executeDockerCommand(
    args: string[],
    command: Partial<Command>
  ): Promise<{ stdout: string; stderr: string; stdall: string; exitCode: number; signal: string | null }> {
    if (this.disposing) throw new DockerError('unknown', 'execute', new Error('Docker adapter has been disposed'));
    const session = this.startSession(this.dockerCommand(args, command));
    const result = await session.result;
    if (session.stopped) throw new DockerError('unknown', 'execute', new Error('Docker operation stopped before completion'));
    return { stdout: result.stdout, stderr: result.stderr, stdall: result.stdall, exitCode: result.exitCode, signal: result.signal ?? null };
  }

  protected override async createResult(
    stdout: string,
    stderr: string,
    exitCode: number,
    signal: string | undefined,
    command: string,
    startTime: number,
    endTime: number,
    context?: { host?: string; container?: string; originalCommand?: Command; stdall?: string }
  ): Promise<ExecutionResult> {
    // Don't call super.createResult as it will throw CommandError
    // Instead, create the result directly
    const maskedCommand = this.maskSensitiveData(command);
    const maskedStdout = this.maskSensitiveData(stdout);
    const maskedStderr = this.maskSensitiveData(stderr);

    const result = new ExecutionResultImpl(
      maskedStdout,
      maskedStderr,
      exitCode,
      signal,
      maskedCommand,
      endTime - startTime,
      new Date(startTime),
      new Date(endTime),
      this.adapterName,
      context?.host,
      context?.container,
      context?.stdall !== undefined ? this.maskSensitiveData(context.stdall) : undefined
    );

    // Use originalCommand if available, otherwise fall back to command string
    const commandForThrowCheck = context?.originalCommand ?? command;
    if (this.shouldThrowOnNonZeroExit(commandForThrowCheck, exitCode)) {
      const container = context?.container || 'unknown';
      throw new DockerError(container, 'execute', new Error(`Command failed with exit code ${exitCode}: ${sanitizeCommandForError(command)}`));
    }

    return result;
  }

  dispose(): Promise<void> {
    this.disposing ??= this.disposeOperations();
    return this.disposing;
  }

  private async disposeOperations(): Promise<void> {
    const results = await Promise.allSettled([...this.sessions].map(session => session.stop()));
    const errors: unknown[] = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (this.dockerConfig.autoCreate?.autoRemove) {
      for (const container of this.tempContainers) {
        try {
          this.emitAdapterEvent('temp:cleanup', { path: container, type: 'directory' });
          const result = await this.startSession(this.dockerCommand(['rm', '-f', container], this.managementOptions())).result;
          if (result.exitCode !== 0) throw new DockerError(container, 'remove', new Error(sanitizeCommandForError(result.stderr)));
          this.tempContainers.delete(container);
        } catch (error) { errors.push(error); }
      }
    } else this.tempContainers.clear();
    await this.local.dispose();
    if (errors.length) throw new AggregateError(errors, 'Docker operation cleanup failed');
  }

  // Additional Docker-specific methods
  async listContainers(all = false): Promise<string[]> {
    const args = ['ps'];
    if (all) args.push('-a');
    args.push('--format', '{{.Names}}');

    const result = await this.executeDockerCommand(args, this.managementOptions());
    if (result.exitCode !== 0) {
      throw new DockerError('', 'list', new Error(result.stderr));
    }
    return result.stdout.trim() ? splitLines(result.stdout.trim()).filter(Boolean) : [];
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

    const result = await this.executeDockerCommand(args, this.managementOptions());
    if (result.exitCode !== 0) {
      throw new DockerError(options.name, 'create', new Error(result.stderr));
    }
  }

  async startContainer(container: string): Promise<void> {
    const result = await this.executeDockerCommand(['start', container], this.managementOptions());
    if (result.exitCode !== 0) {
      throw new DockerError(container, 'start', new Error(result.stderr));
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

    const result = await this.executeDockerCommand(args, this.managementOptions());
    if (result.exitCode !== 0) {
      throw new DockerError(options.name, 'run', new Error(`Docker run failed: ${result.stderr || result.stdout}`));
    }
  }

  /** Stop once; a supervising controller still owns the container's desired state. */
  async stopContainer(container: string, timeoutSeconds?: number): Promise<void> {
    const result = await this.stopContainerCommand(container, timeoutSeconds);
    if (result.exitCode !== 0) {
      throw new DockerError(container, 'stop', new Error(result.stderr || result.stdout));
    }
  }

  private validateContainerReference(container: string, operation: string): void {
    if (typeof container !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)) {
      throw new DockerError(container, operation, new Error('Invalid container name or ID'));
    }
  }

  private validateStopTimeout(container: string, timeoutSeconds: number | undefined, operation: string): void {
    if (timeoutSeconds !== undefined && (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 0 || timeoutSeconds > 600)) {
      throw new DockerError(container, operation, new Error('Stop timeout must be an integer between 0 and 600 seconds'));
    }
  }

  private stopContainerCommand(container: string, timeoutSeconds?: number) {
    this.validateContainerReference(container, 'stop');
    this.validateStopTimeout(container, timeoutSeconds, 'stop');
    const args = ['stop'];
    // Omitting the interval preserves Docker's configured container default.
    if (timeoutSeconds !== undefined) args.push('--timeout', String(timeoutSeconds));
    args.push('--', container);
    return this.executeDockerCommand(args, this.managementOptions((timeoutSeconds ?? 0) * 1000));
  }

  /** Resolve one immutable identity. A failed observation never means absence. */
  private async resolveContainerReference(container: string, signal?: AbortSignal): Promise<string | null> {
    this.validateContainerReference(container, 'inspect');
    const result = await this.executeDockerCommand(
      ['ps', '-a', '--no-trunc', '--format', '{{json .}}'], { ...this.managementOptions(), signal });
    if (result.exitCode !== 0) throw new DockerError(container, 'inspect', new Error(result.stderr));
    const matches: string[] = [];
    for (const line of splitLines(result.stdout.trim()).filter(Boolean)) {
      const row = JSON.parse(line) as { ID?: unknown; Names?: unknown };
      if (typeof row.ID !== 'string' || !/^[a-f0-9]{64}$/.test(row.ID) || typeof row.Names !== 'string') {
        throw new DockerError(container, 'inspect', new Error('Malformed Docker container inventory'));
      }
      if (row.ID.startsWith(container) || row.Names.split(',').includes(container)) matches.push(row.ID);
    }
    if (matches.length > 1) throw new DockerError(container, 'inspect', new Error('Ambiguous container reference'));
    return matches[0] ?? null;
  }

  /** Idempotent removal, acknowledged only by a successful absence observation. */
  async removeContainer(container: string, force = false,
    options: { graceful?: boolean; stopTimeoutSeconds?: number } = {},
  ): Promise<void> {
    const stopTimeout = options.stopTimeoutSeconds ?? 30;
    this.validateStopTimeout(container, stopTimeout, 'remove');
    const id = await this.resolveContainerReference(container);
    if (id === null) return;
    if (options.graceful) {
      const stopped = await this.stopContainerCommand(id, stopTimeout);
      if (stopped.exitCode !== 0) {
        if (await this.resolveContainerReference(container) === null) return;
        throw new DockerError(container, 'stop', new Error(stopped.stderr));
      }
    }
    const args = ['rm'];
    if (force) args.push('-f');
    // A concurrent rename/replacement must not retarget this operation.
    args.push('--', id);
    const result = await this.executeDockerCommand(args, this.managementOptions());
    if (result.exitCode !== 0) {
      // Another remover may have won. Only a new successful observation can
      // establish that; daemon/permission/time-out failures remain failures.
      if (await this.resolveContainerReference(container) === null) return;
      throw new DockerError(container, 'remove', new Error(result.stderr));
    }
    if (await this.resolveContainerReference(container) !== null) {
      throw new DockerError(container, 'remove', new Error('Container is still present or was replaced during removal'));
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

    // Execute the command with cwd set to the context directory. Builds pull
    // base images and compile layers, so they use the longer timeout.
    const result = await this.executeDockerCommand(args, {
      ...this.transferOptions(),
      cwd: options.context || process.cwd()
    });

    if (result.exitCode !== 0) {
      throw new DockerError('', 'build', new Error(result.stderr));
    }
  }

  /**
   * Push image to registry
   */
  async pushImage(image: string): Promise<void> {
    const result = await this.executeDockerCommand(['push', image], this.transferOptions());
    if (result.exitCode !== 0) {
      throw new DockerError(image, 'push', new Error(result.stderr));
    }
  }

  /**
   * Pull image from registry
   */
  async pullImage(image: string): Promise<void> {
    const result = await this.executeDockerCommand(['pull', image], this.transferOptions());
    if (result.exitCode !== 0) {
      throw new DockerError(image, 'pull', new Error(result.stderr));
    }
  }

  /**
   * Tag an image
   */
  async tagImage(source: string, target: string): Promise<void> {
    const result = await this.executeDockerCommand(['tag', source, target], this.managementOptions());
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

    const result = await this.executeDockerCommand(args, this.managementOptions());
    if (result.exitCode !== 0) {
      throw new DockerError('', 'images', new Error(result.stderr));
    }
    return result.stdout.trim() ? splitLines(result.stdout.trim()).filter(Boolean) : [];
  }

  /**
   * Remove image
   */
  async removeImage(image: string, force = false): Promise<void> {
    const args = ['rmi'];
    if (force) args.push('-f');
    args.push(image);

    const result = await this.executeDockerCommand(args, this.managementOptions());
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

    const result = await this.executeDockerCommand(args, {
      ...this.managementOptions(), timeout: options.timeout ?? (options.follow ? 0 : this.managementOptions().timeout),
      signal: options.signal, maxBuffer: options.maxBuffer,
    });
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
    if (this.disposing) throw new DockerError(container, 'logs', new Error('Docker adapter has been disposed'));
    const args = ['logs'];
    if (options.follow) args.push('-f');
    if (options.tail !== undefined) args.push('--tail', String(options.tail));
    if (options.since !== undefined) args.push('--since', options.since);
    if (options.until !== undefined) args.push('--until', options.until);
    if (options.timestamps) args.push('-t');
    args.push(container);
    const command = this.dockerCommand(args, {
      ...options,
      timeout: options.timeout ?? (options.follow ? 0 : this.managementOptions().timeout),
    });
    const session = this.startSession({ ...command, throwOnNonZeroExit: true }, onData);
    try { await session.completion; }
    catch (error) {
      throw new DockerError(container, 'logs', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Copy files to container
   */
  async copyToContainer(src: string, container: string, dest: string): Promise<void> {
    const result = await this.executeDockerCommand(['cp', src, `${container}:${dest}`], this.managementOptions());
    if (result.exitCode !== 0) {
      throw new DockerError(container, 'cp', new Error(result.stderr));
    }
  }

  /**
   * Copy files from container
   */
  async copyFromContainer(container: string, src: string, dest: string): Promise<void> {
    const result = await this.executeDockerCommand(['cp', `${container}:${src}`, dest], this.managementOptions());
    if (result.exitCode !== 0) {
      throw new DockerError(container, 'cp', new Error(result.stderr));
    }
  }

  /**
   * Inspect container
   */
  async inspectContainer(container: string): Promise<any> {
    const result = await this.executeDockerCommand(['inspect', container], this.managementOptions());
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

    const result = await this.executeDockerCommand(args, this.managementOptions());
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
    const result = await this.executeDockerCommand(['network', 'rm', name], this.managementOptions());
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
    return result.stdout.trim() ? splitLines(result.stdout.trim()).filter(Boolean) : [];
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

    const result = await this.executeDockerCommand(args, this.managementOptions());
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

    const result = await this.executeDockerCommand(args, this.managementOptions());
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
    return result.stdout.trim() ? splitLines(result.stdout.trim()).filter(Boolean) : [];
  }

  /**
   * Docker Compose up
   */
  async composeUp(options: DockerComposeOptions = {}): Promise<void> {
    const args = this.buildComposeArgs(options);
    args.push('up', '-d');

    const result = await this.executeDockerCommand(args, { ...this.transferOptions(), env: options.env });
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

    const result = await this.executeDockerCommand(args, { ...this.managementOptions(), env: options.env });
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

    const result = await this.executeDockerCommand(args, { ...this.managementOptions(), env: options.env });
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

    const result = await this.executeDockerCommand(args, { ...this.managementOptions(), env: options.env });
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
      let health: string | undefined;
      try {
        const info = await this.inspectContainer(container);
        health = info.State?.Health?.Status;
      } catch {
        // Container might not exist yet — keep polling
      }

      // Evaluated outside the try so an unhealthy container fails fast
      // instead of the throw being swallowed by the inspect catch.
      if (health === 'healthy') {
        return;
      }
      if (health === 'unhealthy') {
        throw new DockerError(container, 'health', new Error('Container is unhealthy'));
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
    } catch {
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

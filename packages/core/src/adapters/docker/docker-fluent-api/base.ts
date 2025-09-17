/**
 * Base Docker Fluent API Classes
 */

import { getDockerCommand } from '../docker-utils.js';

import type { ExecutionResult } from '../../../types/result.js';
import type { ProcessPromise, ExecutionEngine } from '../../../core/execution-engine.js';
import type {
  LogOptions,
  ServiceStatus,
  ServiceManager,
  FluentAPIBuilder,
  ContainerRuntimeInfo,
  DockerContainerConfig,
  DockerEphemeralConfig,
  ServiceLifecycleHooks,
  DockerPersistentConfig
} from './types.js';

/**
 * Base Docker Fluent API
 */
export abstract class BaseDockerFluentAPI<T extends DockerContainerConfig> {
  protected config: Partial<T>;
  protected hooks: ServiceLifecycleHooks = {};

  constructor(protected engine: ExecutionEngine) {
    this.config = {};
  }

  /**
   * Reset configuration
   */
  reset(): this {
    this.config = {};
    this.hooks = {};
    return this;
  }

  /**
   * Set container/image name
   */
  name(name: string): this {
    this.config.name = name;
    return this;
  }

  /**
   * Set working directory
   */
  workdir(path: string): this {
    this.config.workdir = path;
    return this;
  }

  /**
   * Set user
   */
  user(user: string): this {
    this.config.user = user;
    return this;
  }

  /**
   * Set environment variables
   */
  env(env: Record<string, string>): this {
    this.config.env = { ...this.config.env, ...env };
    return this;
  }

  /**
   * Add single environment variable
   */
  addEnv(key: string, value: string): this {
    this.config.env = { ...this.config.env, [key]: value };
    return this;
  }

  /**
   * Set labels
   */
  labels(labels: Record<string, string>): this {
    this.config.labels = { ...this.config.labels, ...labels };
    return this;
  }

  /**
   * Add single label
   */
  addLabel(key: string, value: string): this {
    this.config.labels = { ...this.config.labels, [key]: value };
    return this;
  }

  /**
   * Set command
   */
  command(command: string | string[]): this {
    this.config.command = command;
    return this;
  }

  /**
   * Set entrypoint
   */
  entrypoint(entrypoint: string | string[]): this {
    this.config.entrypoint = entrypoint;
    return this;
  }

  /**
   * Add lifecycle hooks
   */
  lifecycle(hooks: ServiceLifecycleHooks): this {
    this.hooks = { ...this.hooks, ...hooks };
    return this;
  }

  /**
   * Execute lifecycle hook
   */
  protected async executeHook(hookName: keyof ServiceLifecycleHooks): Promise<void> {
    const hook = this.hooks[hookName];
    if (hook) {
      await Promise.resolve(hook());
    }
  }

  /**
   * Build Docker run command arguments
   */
  protected abstract buildRunArgs(): string[];

  /**
   * Validate configuration
   */
  protected abstract validate(): string[];

  /**
   * Execute command in container context
   */
  abstract exec(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;

  /**
   * Run command (alias for exec)
   */
  run(strings: TemplateStringsArray, ...values: any[]): ProcessPromise {
    return this.exec(strings, ...values);
  }

  /**
   * Get container runtime info
   */
  abstract info(): Promise<ContainerRuntimeInfo | null>;

  /**
   * Check if container is running
   */
  abstract isRunning(): Promise<boolean>;

  /**
   * Get logs
   */
  abstract logs(options?: LogOptions): Promise<string>;
}

/**
 * Docker Ephemeral Container Fluent API
 */
export class DockerEphemeralFluentAPI extends BaseDockerFluentAPI<DockerEphemeralConfig>
  implements FluentAPIBuilder<DockerEphemeralConfig>, ServiceManager {

  constructor(engine: ExecutionEngine, image: string) {
    super(engine);
    this.config.image = image;
  }

  /**
   * Set image
   */
  image(image: string): this {
    this.config.image = image;
    return this;
  }

  /**
   * Add volumes
   */
  volumes(volumes: string[]): this {
    this.config.volumes = [...(this.config.volumes || []), ...volumes];
    return this;
  }

  /**
   * Add single volume
   */
  volume(hostPath: string, containerPath: string, mode?: 'ro' | 'rw'): this {
    const volumeStr = mode ? `${hostPath}:${containerPath}:${mode}` : `${hostPath}:${containerPath}`;
    this.config.volumes = [...(this.config.volumes || []), volumeStr];
    return this;
  }

  /**
   * Set network
   */
  network(network: string): this {
    this.config.network = network;
    return this;
  }

  /**
   * Add ports
   */
  ports(ports: string[]): this {
    this.config.ports = [...(this.config.ports || []), ...ports];
    return this;
  }

  /**
   * Add single port mapping
   */
  port(hostPort: number | string, containerPort: number | string, protocol?: 'tcp' | 'udp'): this {
    const portStr = protocol ? `${hostPort}:${containerPort}/${protocol}` : `${hostPort}:${containerPort}`;
    this.config.ports = [...(this.config.ports || []), portStr];
    return this;
  }

  /**
   * Set privileged mode
   */
  privileged(privileged = true): this {
    this.config.privileged = privileged;
    return this;
  }

  /**
   * Set auto-remove
   */
  autoRemove(autoRemove = true): this {
    this.config.autoRemove = autoRemove;
    return this;
  }

  /**
   * Set platform
   */
  platform(platform: string): this {
    this.config.platform = platform;
    return this;
  }

  /**
   * Set pull policy
   */
  pull(pull = true): this {
    this.config.pull = pull;
    return this;
  }

  /**
   * Set restart policy
   */
  restartPolicy(policy: 'no' | 'always' | 'unless-stopped' | 'on-failure'): this {
    this.config.restart = policy;
    return this;
  }

  /**
   * Set memory limit
   */
  memory(limit: string): this {
    this.config.memory = limit;
    return this;
  }

  /**
   * Set CPU limit
   */
  cpus(limit: string): this {
    this.config.cpus = limit;
    return this;
  }

  /**
   * Set hostname
   */
  hostname(hostname: string): this {
    this.config.hostname = hostname;
    return this;
  }

  /**
   * Add DNS servers
   */
  dns(servers: string[]): this {
    this.config.dns = [...(this.config.dns || []), ...servers];
    return this;
  }

  /**
   * Add extra hosts
   */
  extraHosts(hosts: string[]): this {
    this.config.extraHosts = [...(this.config.extraHosts || []), ...hosts];
    return this;
  }

  /**
   * Add capabilities
   */
  capAdd(caps: string[]): this {
    this.config.cap_add = [...(this.config.cap_add || []), ...caps];
    return this;
  }

  /**
   * Drop capabilities
   */
  capDrop(caps: string[]): this {
    this.config.cap_drop = [...(this.config.cap_drop || []), ...caps];
    return this;
  }

  /**
   * Set shared memory size
   */
  shmSize(size: string): this {
    this.config.shmSize = size;
    return this;
  }

  /**
   * Set init process
   */
  init(init = true): this {
    this.config.init = init;
    return this;
  }

  /**
   * Set healthcheck
   */
  healthcheck(test: string | string[], options?: {
    interval?: string;
    timeout?: string;
    startPeriod?: string;
    retries?: number;
  }): this {
    this.config.healthcheck = { test, ...options };
    return this;
  }

  /**
   * Build Docker run arguments
   */
  protected buildRunArgs(): string[] {
    const args: string[] = ['run'];

    // Detached mode by default for service containers
    args.push('-d');

    // Name
    if (this.config.name) {
      args.push('--name', this.config.name);
    }

    // Auto-remove
    if (this.config.autoRemove) {
      args.push('--rm');
    }

    // Platform
    if (this.config.platform) {
      args.push('--platform', this.config.platform);
    }

    // Network
    if (this.config.network) {
      args.push('--network', this.config.network);
    }

    // Ports
    if (this.config.ports) {
      for (const port of this.config.ports) {
        args.push('-p', port);
      }
    }

    // Volumes
    if (this.config.volumes) {
      for (const volume of this.config.volumes) {
        args.push('-v', volume);
      }
    }

    // Environment
    if (this.config.env) {
      for (const [key, value] of Object.entries(this.config.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }

    // Labels
    if (this.config.labels) {
      for (const [key, value] of Object.entries(this.config.labels)) {
        args.push('--label', `${key}=${value}`);
      }
    }

    // Working directory
    if (this.config.workdir) {
      args.push('-w', this.config.workdir);
    }

    // User
    if (this.config.user) {
      args.push('-u', this.config.user);
    }

    // Privileged
    if (this.config.privileged) {
      args.push('--privileged');
    }

    // Restart policy
    if (this.config.restart) {
      args.push('--restart', this.config.restart);
    }

    // Memory limit
    if (this.config.memory) {
      args.push('-m', this.config.memory);
    }

    // CPU limit
    if (this.config.cpus) {
      args.push('--cpus', this.config.cpus);
    }

    // Hostname
    if (this.config.hostname) {
      args.push('--hostname', this.config.hostname);
    }

    // DNS
    if (this.config.dns) {
      for (const dns of this.config.dns) {
        args.push('--dns', dns);
      }
    }

    // Extra hosts
    if (this.config.extraHosts) {
      for (const host of this.config.extraHosts) {
        args.push('--add-host', host);
      }
    }

    // Capabilities
    if (this.config.cap_add) {
      for (const cap of this.config.cap_add) {
        args.push('--cap-add', cap);
      }
    }
    if (this.config.cap_drop) {
      for (const cap of this.config.cap_drop) {
        args.push('--cap-drop', cap);
      }
    }

    // Shared memory
    if (this.config.shmSize) {
      args.push('--shm-size', this.config.shmSize);
    }

    // Init
    if (this.config.init) {
      args.push('--init');
    }

    // Healthcheck
    if (this.config.healthcheck) {
      const hc = this.config.healthcheck;
      if (typeof hc.test === 'string') {
        // Wrap health-cmd in quotes if it contains spaces
        const healthCmd = hc.test.includes(' ') ? `"${hc.test}"` : hc.test;
        args.push('--health-cmd', healthCmd);
      } else {
        // Join array and wrap in quotes if needed
        const healthCmd = hc.test.join(' ');
        const quotedCmd = healthCmd.includes(' ') ? `"${healthCmd}"` : healthCmd;
        args.push('--health-cmd', quotedCmd);
      }
      if (hc.interval) args.push('--health-interval', hc.interval);
      if (hc.timeout) args.push('--health-timeout', hc.timeout);
      if (hc.startPeriod) args.push('--health-start-period', hc.startPeriod);
      if (hc.retries !== undefined) args.push('--health-retries', String(hc.retries));
    }

    // Entrypoint
    if (this.config.entrypoint) {
      args.push('--entrypoint');
      if (typeof this.config.entrypoint === 'string') {
        args.push(this.config.entrypoint);
      } else {
        args.push(this.config.entrypoint.join(' '));
      }
    }

    // Image (must be specified)
    args.push(this.config.image!);

    // Command
    if (this.config.command) {
      if (typeof this.config.command === 'string') {
        args.push(...this.config.command.split(' '));
      } else {
        args.push(...this.config.command);
      }
    }

    return args;
  }

  /**
   * Validate configuration
   */
  validate(): string[] {
    const errors: string[] = [];

    if (!this.config.image) {
      errors.push('Image is required for ephemeral containers');
    }

    // Validate port format
    if (this.config.ports) {
      for (const port of this.config.ports) {
        if (!port.match(/^\d+:\d+(\/\w+)?$/)) {
          errors.push(`Invalid port format: ${port}`);
        }
      }
    }

    // Validate volume format
    if (this.config.volumes) {
      for (const volume of this.config.volumes) {
        if (!volume.includes(':')) {
          errors.push(`Invalid volume format: ${volume}`);
        }
      }
    }

    return errors;
  }

  /**
   * Build configuration
   */
  build(): DockerEphemeralConfig {
    const errors = this.validate();
    if (errors.length > 0) {
      throw new Error(`Invalid configuration: ${errors.join(', ')}`);
    }
    return this.config as DockerEphemeralConfig;
  }

  /**
   * Start container
   */
  async start(): Promise<void> {
    await this.executeHook('beforeStart');

    if (await this.isRunning()) {
      console.log(`[xec-core] Container ${this.config.name || 'ephemeral'} is already running`);
      return;
    }

    // Pull image if requested
    if (this.config.pull) {
      const pullCmd = getDockerCommand('pull', this.config.image!);
    await this.engine.raw`${pullCmd}`;
    }

    // Build and execute run command
    const args = this.buildRunArgs();
    const cmdStr = getDockerCommand(...args);
    // Use raw to avoid double escaping since args are already properly formatted
    await this.engine.raw`${cmdStr}`;

    await this.executeHook('afterStart');
    await this.executeHook('onReady');
  }

  /**
   * Stop container
   */
  async stop(): Promise<void> {
    await this.executeHook('beforeStop');

    const name = this.config.name;
    if (!name) {
      throw new Error('Container name is required to stop');
    }

    const stopCmd = getDockerCommand('stop', name);
    await this.engine.raw`${stopCmd}`.nothrow();
    await this.executeHook('afterStop');
  }

  /**
   * Restart container
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Remove container
   */
  async remove(): Promise<void> {
    const name = this.config.name;
    if (!name) {
      throw new Error('Container name is required to remove');
    }

    const rmCmd = getDockerCommand('rm', '-f', name);
    await this.engine.raw`${rmCmd}`.nothrow();
  }

  /**
   * Get container status
   */
  async status(): Promise<ServiceStatus> {
    const info = await this.info();
    const running = info !== null && info.status.includes('Up');

    return {
      running,
      healthy: await this.isHealthy(),
      containers: info ? [info] : [],
      endpoints: this.getEndpoints()
    };
  }

  /**
   * Check if container is healthy
   */
  private async isHealthy(): Promise<boolean> {
    if (!this.config.name || !this.config.healthcheck) {
      return true; // No health check defined
    }

    try {
      const inspectCmd = getDockerCommand('inspect', '--format={{.State.Health.Status}}', this.config.name);
      const result = await this.engine.raw`${inspectCmd}`.nothrow();
      return result.stdout.trim() === 'healthy';
    } catch {
      return false;
    }
  }

  /**
   * Get container endpoints
   */
  private getEndpoints(): string[] {
    const endpoints: string[] = [];
    if (this.config.ports) {
      for (const port of this.config.ports) {
        const [hostPort] = port.split(':');
        endpoints.push(`localhost:${hostPort}`);
      }
    }
    return endpoints;
  }

  /**
   * Execute command in container
   */
  // Overloaded exec method to support both interfaces
  exec(command: string | string[]): Promise<ExecutionResult>;
  exec(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  exec(commandOrStrings: string | string[] | TemplateStringsArray, ...values: any[]): Promise<ExecutionResult> | ProcessPromise {
    // Handle string/array commands (ServiceManager interface)
    if (typeof commandOrStrings === 'string' || (Array.isArray(commandOrStrings) && typeof commandOrStrings[0] === 'string')) {
      const cmd = Array.isArray(commandOrStrings) ? commandOrStrings.join(' ') : commandOrStrings;
      const containerName = this.config.name;
      if (!containerName && !this.config.image) {
        throw new Error('[xec-core] Container name or image required for execution');
      }

      if (containerName) {
        // Use sh -c to ensure proper PATH environment
        const escapedCmd = cmd.replace(/"/g, '\\"');
        const fullCmd = getDockerCommand('exec', containerName, 'sh', '-c', `"${escapedCmd}"`);
        return this.engine.raw`${fullCmd}`.then(result => result);
      } else {
        // Run ephemeral container
        const args = this.buildRunArgs();
        const execArgs = args.filter(arg => arg !== '-d');
        execArgs.push('--rm');
        const fullCmd = getDockerCommand(...execArgs, cmd);
        return this.engine.raw`${fullCmd}`.then(result => result);
      }
    }

    // Handle template literals
    const strings = commandOrStrings as TemplateStringsArray;
    if (!this.config.name && !this.config.image) {
      throw new Error('[xec-core] Container name or image required for execution');
    }

    // If we have a name, use exec, otherwise use run
    if (this.config.name) {
      // Build docker exec command with container name and command parts
      const cmd = strings.raw.join('').trim();
      const dockerPath = getDockerCommand().split(' ')[0]; // Get just the docker path

      // Wrap command in sh -c to ensure proper PATH and environment setup
      // This fixes issues with commands like redis-cli not being found
      const escapedCmd = cmd.replace(/"/g, '\\"');
      const execCommand = `${dockerPath} exec ${this.config.name} sh -c "${escapedCmd}"`;

      // Create a template strings array manually to avoid escaping issues
      const templateArr = Object.assign([execCommand], { raw: [execCommand] }) as TemplateStringsArray;
      return this.engine.raw(templateArr) as ProcessPromise;
    } else {
      // Run ephemeral container
      const args = this.buildRunArgs();
      // Remove -d flag for ephemeral execution
      const execArgs = args.filter(arg => arg !== '-d');
      execArgs.push('--rm'); // Always remove after execution
      const cmdParts = strings.raw.join('').trim().split(/\s+/);
      const cmdStr = getDockerCommand(...execArgs, ...cmdParts);
      return this.engine.raw`${cmdStr}` as ProcessPromise;
    }
  }

  /**
   * Get container info
   */
  async info(): Promise<ContainerRuntimeInfo | null> {
    if (!this.config.name) {
      return null;
    }

    try {
      const inspectCmd = getDockerCommand('inspect', this.config.name);
      const result = await this.engine.raw`${inspectCmd}`.nothrow();
      if (result.exitCode !== 0) {
        return null;
      }

      const data = JSON.parse(result.stdout)[0];
      return {
        id: data.Id,
        name: data.Name.replace(/^\//, ''),
        image: data.Config.Image,
        status: data.State.Status,
        ports: Object.keys(data.NetworkSettings.Ports || {}),
        networks: Object.keys(data.NetworkSettings.Networks || {}),
        created: new Date(data.Created),
        started: data.State.StartedAt ? new Date(data.State.StartedAt) : undefined,
        ip: data.NetworkSettings.IPAddress,
        volumes: data.Mounts?.map((m: any) => `${m.Source}:${m.Destination}`),
        labels: data.Config.Labels
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if container is running
   */
  async isRunning(): Promise<boolean> {
    if (!this.config.name) {
      return false;
    }

    try {
      const psCmd = getDockerCommand('ps', '--format', '{{.Names}}');
      const result = await this.engine.raw`${psCmd} | grep -w ${this.config.name}`.nothrow();
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Get container logs
   */
  async logs(options?: LogOptions): Promise<string> {
    if (!this.config.name) {
      throw new Error('Container name is required for logs');
    }

    const args = ['logs'];

    if (options?.follow) args.push('-f');
    if (options?.timestamps) args.push('-t');
    if (options?.tail) args.push('--tail', String(options.tail));
    if (options?.since) args.push('--since', options.since);
    if (options?.until) args.push('--until', options.until);
    if (options?.details) args.push('--details');

    args.push(this.config.name);

    // Use raw to avoid double escaping
    const logsCmd = getDockerCommand(...args);
    const result = await this.engine.raw`${logsCmd}`;
    return result.stdout;
  }

  /**
   * Wait for container to be ready
   */
  async waitForReady(timeout = 30000): Promise<void> {
    const startTime = Date.now();
    const interval = 1000;

    while (Date.now() - startTime < timeout) {
      if (await this.isRunning()) {
        if (this.config.healthcheck) {
          // Wait for health check
          if (await this.isHealthy()) {
            return;
          }
        } else {
          // Just check if running
          return;
        }
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`Container ${this.config.name || 'ephemeral'} failed to become ready within ${timeout}ms`);
  }
}

/**
 * Docker Persistent Container Fluent API
 */
export class DockerPersistentFluentAPI extends BaseDockerFluentAPI<DockerPersistentConfig>
  implements FluentAPIBuilder<DockerPersistentConfig>, ServiceManager {

  constructor(engine: ExecutionEngine, container: string) {
    super(engine);
    this.config.container = container;
    this.config.name = container; // Use same as container name
  }

  /**
   * Set container name
   */
  container(name: string): this {
    this.config.container = name;
    this.config.name = name;
    return this;
  }

  /**
   * Build Docker exec arguments
   */
  protected buildRunArgs(): string[] {
    const args: string[] = ['exec'];

    // Interactive and TTY if needed
    args.push('-i');

    // Working directory
    if (this.config.workdir) {
      args.push('-w', this.config.workdir);
    }

    // User
    if (this.config.user) {
      args.push('-u', this.config.user);
    }

    // Environment
    if (this.config.env) {
      for (const [key, value] of Object.entries(this.config.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }

    // Container name
    args.push(this.config.container!);

    return args;
  }

  /**
   * Validate configuration
   */
  validate(): string[] {
    const errors: string[] = [];

    if (!this.config.container) {
      errors.push('Container name is required for persistent containers');
    }

    return errors;
  }

  /**
   * Build configuration
   */
  build(): DockerPersistentConfig {
    const errors = this.validate();
    if (errors.length > 0) {
      throw new Error(`Invalid configuration: ${errors.join(', ')}`);
    }
    return this.config as DockerPersistentConfig;
  }

  /**
   * Start container (if stopped)
   */
  async start(): Promise<void> {
    await this.executeHook('beforeStart');

    if (await this.isRunning()) {
      console.log(`[xec-core] Container ${this.config.container} is already running`);
      return;
    }

    const startCmd = getDockerCommand('start', this.config.container!);
    await this.engine.raw`${startCmd}`;

    await this.executeHook('afterStart');
    await this.executeHook('onReady');
  }

  /**
   * Stop container
   */
  async stop(): Promise<void> {
    await this.executeHook('beforeStop');
    const stopCmd = getDockerCommand('stop', this.config.container!);
    await this.engine.raw`${stopCmd}`;
    await this.executeHook('afterStop');
  }

  /**
   * Restart container
   */
  async restart(): Promise<void> {
    const restartCmd = getDockerCommand('restart', this.config.container!);
    await this.engine.raw`${restartCmd}`;
  }

  /**
   * Remove container
   */
  async remove(): Promise<void> {
    if (!this.config.container) {
      throw new Error('Container name is required for removal');
    }
    await this.stop();
    const rmCmd = getDockerCommand('rm', this.config.container);
    await this.engine.raw`${rmCmd}`;
  }

  /**
   * Get container status
   */
  async status(): Promise<ServiceStatus> {
    const info = await this.info();
    const running = info !== null && info.status === 'running';

    return {
      running,
      containers: info ? [info] : []
    };
  }

  /**
   * Execute command in container
   */
  // Overloaded exec method to support both interfaces
  exec(command: string | string[]): Promise<ExecutionResult>;
  exec(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  exec(commandOrStrings: string | string[] | TemplateStringsArray, ...values: any[]): Promise<ExecutionResult> | ProcessPromise {
    // Handle string/array commands (ServiceManager interface)
    if (typeof commandOrStrings === 'string' || (Array.isArray(commandOrStrings) && typeof commandOrStrings[0] === 'string')) {
      const cmd = Array.isArray(commandOrStrings) ? commandOrStrings.join(' ') : commandOrStrings;
      const container = this.config.container;
      if (!container) {
        throw new Error('[xec-core] Container name required for persistent API');
      }
      // Use sh -c to ensure proper PATH environment
      const escapedCmd = cmd.replace(/"/g, '\\"');
      const fullCmd = getDockerCommand('exec', container, 'sh', '-c', `"${escapedCmd}"`);
      return this.engine.raw`${fullCmd}`.then(result => result);
    }

    // Handle template literals
    const strings = commandOrStrings as TemplateStringsArray;
    const container = this.config.container;
    if (!container) {
      throw new Error('[xec-core] Container name required for persistent API');
    }

    // Build command and wrap in sh -c for proper PATH handling
    const cmd = strings.raw.join('').trim();
    const escapedCmd = cmd.replace(/"/g, '\\"');
    const dockerPath = getDockerCommand().split(' ')[0];

    // Build exec command with environment variables if needed
    const envArgs: string[] = [];
    if (this.config.env) {
      for (const [key, value] of Object.entries(this.config.env)) {
        envArgs.push('-e', `${key}=${value}`);
      }
    }
    if (this.config.workdir) {
      envArgs.push('-w', this.config.workdir);
    }
    if (this.config.user) {
      envArgs.push('-u', this.config.user);
    }

    const execCommand = `${dockerPath} exec ${envArgs.join(' ')} ${container} sh -c "${escapedCmd}"`;
    const templateArr = Object.assign([execCommand], { raw: [execCommand] }) as TemplateStringsArray;
    return this.engine.raw(templateArr) as ProcessPromise;
  }

  /**
   * Get container info
   */
  async info(): Promise<ContainerRuntimeInfo | null> {
    try {
      const inspectCmd = getDockerCommand('inspect', this.config.container!);
      const result = await this.engine.raw`${inspectCmd}`.nothrow();
      if (result.exitCode !== 0) {
        return null;
      }

      const data = JSON.parse(result.stdout)[0];
      return {
        id: data.Id,
        name: data.Name.replace(/^\//, ''),
        image: data.Config.Image,
        status: data.State.Status,
        ports: Object.keys(data.NetworkSettings.Ports || {}),
        networks: Object.keys(data.NetworkSettings.Networks || {}),
        created: new Date(data.Created),
        started: data.State.StartedAt ? new Date(data.State.StartedAt) : undefined,
        ip: data.NetworkSettings.IPAddress,
        volumes: data.Mounts?.map((m: any) => `${m.Source}:${m.Destination}`),
        labels: data.Config.Labels
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if container is running
   */
  async isRunning(): Promise<boolean> {
    try {
      const psCmd = getDockerCommand('ps', '--format', '{{.Names}}');
      const result = await this.engine.raw`${psCmd} | grep -w ${this.config.container}`.nothrow();
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Get container logs
   */
  async logs(options?: LogOptions): Promise<string> {
    const args = ['logs'];

    if (options?.follow) args.push('-f');
    if (options?.timestamps) args.push('-t');
    if (options?.tail) args.push('--tail', String(options.tail));
    if (options?.since) args.push('--since', options.since);
    if (options?.until) args.push('--until', options.until);
    if (options?.details) args.push('--details');

    args.push(this.config.container!);

    // Use raw to avoid double escaping
    const logsCmd = getDockerCommand(...args);
    const result = await this.engine.raw`${logsCmd}`;
    return result.stdout;
  }

  /**
   * Wait for container to be ready
   */
  async waitForReady(timeout = 30000): Promise<void> {
    const startTime = Date.now();
    const interval = 1000;

    while (Date.now() - startTime < timeout) {
      if (await this.isRunning()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`Container ${this.config.container} failed to become ready within ${timeout}ms`);
  }
}
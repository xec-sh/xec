/**
 * Base Docker Fluent API Classes
 */

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

import { randomUUID } from 'node:crypto';

import { findDockerPath, parseContainerReference } from '../docker-utils.js';
import { escapeUnix, interpolateForShell } from '../../../utils/shell-escape.js';

/**
 * Distinguish a tagged-template call from a plain `string[]` command.
 * A TemplateStringsArray is itself an array, so `Array.isArray` alone
 * cannot tell the two apart — only the `raw` property can.
 */
function isTemplateStringsArray(value: unknown): value is TemplateStringsArray {
  return Array.isArray(value) && 'raw' in value && Array.isArray((value as TemplateStringsArray).raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
   * Execute `docker <args>` on the host with every argument escaped as a
   * single token, so container names, env values, formats, etc. can never
   * be interpreted by the host shell.
   */
  protected dockerCommand(args: string[]): ProcessPromise {
    return this.engine.with({ nothrow: false, throwOnNonZeroExit: true, redactOutput: false }).run`${[findDockerPath(), ...args]}`;
  }

  /**
   * Execute command in container context
   */
  abstract exec(strings: TemplateStringsArray, ...values: unknown[]): ProcessPromise;

  /**
   * Run command (alias for exec)
   */
  run(strings: TemplateStringsArray, ...values: unknown[]): ProcessPromise {
    return this.exec(strings, ...values);
  }

  protected get containerReference(): string | undefined {
    return this.config.container ?? this.config.name;
  }

  protected async resolveContainer(): Promise<string | null> {
    const reference = this.containerReference;
    if (!reference) return null;
    const result = await this.dockerCommand(['ps', '-a', '--no-trunc', '--format', '{{json .}}']);
    return parseContainerReference(result.stdout, reference);
  }

  /** Return absence only after a successful inventory read. */
  async info(): Promise<ContainerRuntimeInfo | null> {
    const id = await this.resolveContainer();
    if (!id) return null;
    const result = await this.dockerCommand(['inspect', '--type', 'container', id]);
    const records = result.json<unknown>();
    if (!Array.isArray(records) || records.length !== 1) throw new Error('Invalid Docker inspect response');
    const data: unknown = records[0];
    if (!isRecord(data) || !isRecord(data['Config']) || !isRecord(data['State']) ||
      !isRecord(data['NetworkSettings']) || data['Id'] !== id || typeof data['Name'] !== 'string' ||
      typeof data['Config']['Image'] !== 'string' || typeof data['State']['Status'] !== 'string' ||
      typeof data['Created'] !== 'string') throw new Error('Invalid Docker inspect response');
    const created = new Date(data['Created']);
    if (!Number.isFinite(created.getTime())) throw new Error('Invalid Docker creation date');
    const startedAt = data['State']['StartedAt'];
    const started = typeof startedAt === 'string' ? new Date(startedAt) : undefined;
    if (started && !Number.isFinite(started.getTime())) throw new Error('Invalid Docker start date');
    const health = data['State']['Health'];
    if (health !== undefined && (!isRecord(health) ||
      !['starting', 'healthy', 'unhealthy'].includes(String(health['Status'])))) {
      throw new Error('Invalid Docker health state');
    }
    const mounts: unknown = data['Mounts'] ?? [];
    if (!Array.isArray(mounts)) throw new Error('Invalid Docker mounts');
    const volumes = mounts.map((mount: unknown) => {
      if (!isRecord(mount) || typeof mount['Source'] !== 'string' || typeof mount['Destination'] !== 'string') {
        throw new Error('Invalid Docker mount');
      }
      return `${mount['Source']}:${mount['Destination']}`;
    });
    const labels = data['Config']['Labels'];
    if (labels != null && (!isRecord(labels) || Object.values(labels).some(value => typeof value !== 'string'))) {
      throw new Error('Invalid Docker labels');
    }
    const ports = data['NetworkSettings']['Ports'] ?? {};
    const networks = data['NetworkSettings']['Networks'] ?? {};
    if (!isRecord(ports) || !isRecord(networks)) throw new Error('Invalid Docker networking state');
    const endpoints: string[] = [];
    for (const [port, bindings] of Object.entries(ports)) {
      if (bindings === null) continue;
      if (!Array.isArray(bindings)) throw new Error('Invalid Docker port bindings');
      for (const binding of bindings as unknown[]) {
        if (!isRecord(binding) || typeof binding['HostIp'] !== 'string' || typeof binding['HostPort'] !== 'string' ||
          !/^[0-9]+$/.test(binding['HostPort'])) throw new Error('Invalid Docker port binding');
        const host = binding['HostIp'].includes(':') ? `[${binding['HostIp']}]` : binding['HostIp'];
        const protocol = port.split('/')[1] ?? 'tcp';
        endpoints.push(`${host}:${binding['HostPort']}${protocol === 'tcp' ? '' : `/${protocol}`}`);
      }
    }
    return {
      id, name: data['Name'].replace(/^\//, ''), image: data['Config']['Image'],
      status: data['State']['Status'], created, started,
      health: isRecord(health) ? String(health['Status']) : undefined,
      ports: Object.keys(ports), networks: Object.keys(networks), volumes, endpoints,
      ip: typeof data['NetworkSettings']['IPAddress'] === 'string' ? data['NetworkSettings']['IPAddress'] : undefined,
      labels: labels == null ? undefined : Object.fromEntries(Object.entries(labels).map(([key, value]) => [key, String(value)])),
    };
  }

  async isRunning(): Promise<boolean> {
    return (await this.info())?.status === 'running';
  }

  async logs(options?: LogOptions): Promise<string> {
    const reference = this.containerReference;
    if (!reference) throw new Error('Container name is required for logs');
    const args = ['logs'];
    if (options?.follow) args.push('-f');
    if (options?.timestamps) args.push('-t');
    if (options?.tail !== undefined) args.push('--tail', String(options.tail));
    if (options?.since !== undefined) args.push('--since', options.since);
    if (options?.until !== undefined) args.push('--until', options.until);
    if (options?.details) args.push('--details');
    args.push('--', reference);
    return (await this.dockerCommand(args)).stdout;
  }

  protected async removeContainer(force: boolean, stopFirst = false): Promise<void> {
    const reference = this.containerReference;
    if (!reference) throw new Error('Container name is required for removal');
    const id = await this.resolveContainer();
    if (!id) return;
    if (stopFirst) {
      await this.executeHook('beforeStop');
      await this.dockerCommand(['stop', '--', id]);
      await this.executeHook('afterStop');
    }
    const result = await this.dockerCommand(['rm', ...(force ? ['-f'] : []), '--', id]).nothrow();
    const remaining = await this.resolveContainer();
    if (remaining === null) return;
    result.throwIfFailed();
    throw new Error(`Container ${reference} is still present or was replaced during removal`);
  }
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
  protected buildRunArgs(command = this.config.command): string[] {
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
      // Each arg reaches docker as one token; wrapping in quotes here would
      // embed literal quote characters into the health command.
      if (Array.isArray(hc.test) && hc.test[0] === 'NONE') {
        args.push('--no-healthcheck');
      } else {
        let healthCmd: string;
        if (typeof hc.test === 'string') {
          healthCmd = hc.test;
        } else if (hc.test[0] === 'CMD-SHELL') {
          healthCmd = hc.test.slice(1).join(' ');
        } else {
          healthCmd = escapeUnix(hc.test[0] === 'CMD' ? hc.test.slice(1) : hc.test);
        }
        args.push('--health-cmd', healthCmd);
      }
      if (hc.interval) args.push('--health-interval', hc.interval);
      if (hc.timeout) args.push('--health-timeout', hc.timeout);
      if (hc.startPeriod) args.push('--health-start-period', hc.startPeriod);
      if (hc.retries !== undefined) args.push('--health-retries', String(hc.retries));
    }

    // Entrypoint
    const entrypoint = this.config.entrypoint;
    if (Array.isArray(entrypoint) && entrypoint.length === 0) {
      throw new Error('entrypoint must contain an executable');
    }
    if (entrypoint !== undefined) {
      args.push('--entrypoint', Array.isArray(entrypoint) ? entrypoint[0]! : entrypoint);
    }

    // Entrypoint arguments follow the image and precede its command.
    args.push(this.config.image!);
    if (Array.isArray(entrypoint)) args.push(...entrypoint.slice(1));

    // Command
    if (command) {
      if (typeof command === 'string') {
        args.push('sh', '-c', command);
      } else {
        args.push(...command);
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
        if (!/^(?:(?:\[[0-9a-fA-F:]+\]|[0-9.]+):)?(?:\d*(?:-\d+)?:)?\d+(?:-\d+)?(?:\/(?:tcp|udp|sctp))?$/.test(port)) {
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
    this.build();
    this.config.name ??= `xec-${randomUUID()}`;
    await this.executeHook('beforeStart');
    const info = await this.info();
    if (info?.status === 'running') return;
    if (info) {
      await this.dockerCommand(['start', '--', info.id]);
    } else {
      if (this.config.pull) await this.dockerCommand(['pull', this.config.image!]);
      await this.dockerCommand(this.buildRunArgs());
    }
    await this.executeHook('afterStart');
    await this.executeHook('onReady');
  }

  /**
   * Stop container
   */
  async stop(): Promise<void> {
    if (!this.config.name) throw new Error('Container name is required to stop');
    await this.executeHook('beforeStop');
    const id = await this.resolveContainer();
    if (id) await this.dockerCommand(['stop', '--', id]);
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
    await this.removeContainer(true);
  }

  /**
   * Get container status
   */
  async status(): Promise<ServiceStatus> {
    const info = await this.info();
    const running = info !== null && info.status === 'running';

    return {
      running,
      healthy: running && await this.isHealthy(info),
      containers: info ? [info] : [],
      endpoints: info?.endpoints ?? []
    };
  }

  /**
   * Check if container is healthy
   */
  private async isHealthy(info: ContainerRuntimeInfo | null): Promise<boolean> {
    if (this.hooks.healthCheck) return this.hooks.healthCheck();
    return info?.status === 'running' && (info.health === undefined || info.health === 'healthy');
  }

  /**
   * Execute command in container
   */
  // Overloaded exec method to support both interfaces
  exec(command: string | string[]): Promise<ExecutionResult>;
  exec(strings: TemplateStringsArray, ...values: unknown[]): ProcessPromise;
  exec(commandOrStrings: string | string[] | TemplateStringsArray, ...values: unknown[]): Promise<ExecutionResult> | ProcessPromise {
    if (!this.config.name && !this.config.image) throw new Error('Container name or image required for execution');
    if (this.config.name) {
      const target = this.engine.docker({
        container: this.config.name, env: this.config.env, workdir: this.config.workdir, user: this.config.user,
      });
      return isTemplateStringsArray(commandOrStrings)
        ? target.run(commandOrStrings, ...values)
        : Array.isArray(commandOrStrings) ? target.run`${commandOrStrings}` : target.exec(commandOrStrings);
    }
    const script = isTemplateStringsArray(commandOrStrings)
      ? interpolateForShell('posix', commandOrStrings, ...values)
      : Array.isArray(commandOrStrings) ? escapeUnix(commandOrStrings) : commandOrStrings;
    const args = this.buildRunArgs(['sh', '-c', script]);
    args.splice(args.indexOf('-d'), 1);
    if (!args.includes('--rm')) args.splice(1, 0, '--rm');
    return this.engine.run`${[findDockerPath(), ...args]}`;
  }

  /**
   * Wait for container to be ready
   */
  async waitForReady(timeout = 30000): Promise<void> {
    const startTime = Date.now();
    const interval = 1000;

    while (Date.now() - startTime < timeout) {
      const info = await this.info();
      if (info?.status === 'running' && await this.isHealthy(info)) return;

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
    this.build();
    await this.executeHook('beforeStart');
    const info = await this.info();
    if (!info) throw new Error(`Container ${this.config.container} does not exist`);
    if (info.status === 'running') return;
    await this.dockerCommand(['start', '--', info.id]);
    await this.executeHook('afterStart');
    await this.executeHook('onReady');
  }

  /**
   * Stop container
   */
  async stop(): Promise<void> {
    this.build();
    await this.executeHook('beforeStop');
    const id = await this.resolveContainer();
    if (id) await this.dockerCommand(['stop', '--', id]);
    await this.executeHook('afterStop');
  }

  /**
   * Restart container
   */
  async restart(): Promise<void> {
    const id = await this.resolveContainer();
    if (!id) throw new Error(`Container ${this.config.container} does not exist`);
    await this.dockerCommand(['restart', '--', id]);
  }

  /**
   * Remove container
   */
  async remove(): Promise<void> {
    await this.removeContainer(false, true);
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
  exec(strings: TemplateStringsArray, ...values: unknown[]): ProcessPromise;
  exec(commandOrStrings: string | string[] | TemplateStringsArray, ...values: unknown[]): Promise<ExecutionResult> | ProcessPromise {
    if (!this.config.container) throw new Error('Container name required for execution');
    const target = this.engine.docker({
      container: this.config.container, env: this.config.env, workdir: this.config.workdir, user: this.config.user,
    });
    return isTemplateStringsArray(commandOrStrings)
      ? target.run(commandOrStrings, ...values)
      : Array.isArray(commandOrStrings) ? target.run`${commandOrStrings}` : target.exec(commandOrStrings);
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
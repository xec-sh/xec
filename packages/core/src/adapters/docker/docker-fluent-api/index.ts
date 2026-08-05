/**
 * Docker Fluent API - Main Entry Point
 */

import type { ExecutionResult } from '../../../types/result.js';
import type { ProcessPromise, ExecutionEngine } from '../../../core/execution-engine.js';

import { DockerBuildFluentAPI } from './build.js';
// Import for internal use
import { DockerEphemeralFluentAPI, DockerPersistentFluentAPI } from './base.js';

// Type exports
export * from './types.js';

export { DockerBuildFluentAPI } from './build.js';

// Re-export for external use
export { BaseDockerFluentAPI, DockerEphemeralFluentAPI, DockerPersistentFluentAPI } from './base.js';

/**
 * Main Docker Fluent API Class
 * Provides entry points to all Docker operations
 */
export class DockerFluentAPI {
  constructor(private engine: ExecutionEngine) {}

  /**
   * Create ephemeral container
   */
  ephemeral(image: string): DockerEphemeralFluentAPI {
    return new DockerEphemeralFluentAPI(this.engine, image);
  }

  /**
   * Use existing container
   */
  container(name: string): DockerPersistentFluentAPI {
    return new DockerPersistentFluentAPI(this.engine, name);
  }

  /**
   * Build Docker image
   */
  build(context: string, tag?: string): DockerBuildFluentAPI {
    return new DockerBuildFluentAPI(this.engine, context, tag);
  }

  /**
   * Run docker command directly (compatibility with old API)
   */
  run(strings: TemplateStringsArray, ...values: unknown[]): ProcessPromise {
    // Prefix `docker ` onto the first literal segment so every interpolated
    // value keeps its position and is escaped by engine.run.
    const cooked = [...strings];
    const raw = [...strings.raw];
    cooked[0] = `docker ${cooked[0] ?? ''}`;
    raw[0] = `docker ${raw[0] ?? ''}`;
    const prefixed = Object.assign(cooked, { raw }) as TemplateStringsArray;
    return this.engine.run(prefixed, ...values);
  }

  /**
   * Execute docker command (alias for run)
   */
  exec(strings: TemplateStringsArray, ...values: unknown[]): ProcessPromise {
    return this.run(strings, ...values);
  }

  /**
   * Docker compose operations
   */
  compose(file?: string): DockerComposeFluentAPI {
    return new DockerComposeFluentAPI(this.engine, file);
  }

  /**
   * Docker network operations
   */
  network(name: string): DockerNetworkFluentAPI {
    return new DockerNetworkFluentAPI(this.engine, name);
  }

  /**
   * Docker volume operations
   */
  volume(name: string): DockerVolumeFluentAPI {
    return new DockerVolumeFluentAPI(this.engine, name);
  }

  /**
   * Docker swarm operations
   */
  swarm(): DockerSwarmFluentAPI {
    return new DockerSwarmFluentAPI(this.engine);
  }

  /**
   * Utility: Pull image
   */
  async pull(image: string): Promise<void> {
    await this.engine.run`docker pull ${image}`;
  }

  /**
   * Utility: Remove container
   */
  async rm(container: string, force = false): Promise<void> {
    const args = ['rm'];
    if (force) args.push('-f');
    args.push(container);
    await this.engine.run`docker ${args}`;
  }

  /**
   * Utility: Remove image
   */
  async rmi(image: string, force = false): Promise<void> {
    const args = ['rmi'];
    if (force) args.push('-f');
    args.push(image);
    await this.engine.run`docker ${args}`;
  }

  /**
   * Utility: List containers
   */
  async ps(all = false): Promise<string> {
    const args = ['ps'];
    if (all) args.push('-a');
    const result = await this.engine.run`docker ${args}`;
    return result.stdout;
  }

  /**
   * Utility: List images
   */
  async images(): Promise<string> {
    const result = await this.engine.run`docker images`;
    return result.stdout;
  }

  /**
   * Utility: System prune
   */
  async prune(all = false, volumes = false): Promise<void> {
    const flags = ['--force'];
    if (all) flags.push('--all');
    if (volumes) flags.push('--volumes');
    await this.engine.run`docker system prune ${flags}`;
  }
}

/**
 * Docker Compose Fluent API
 */
export class DockerComposeFluentAPI {
  private file?: string;
  private projectName?: string;
  private profiles: string[] = [];
  private envVars: Record<string, string> = {};

  constructor(private engine: ExecutionEngine, file?: string) {
    this.file = file;
  }

  /**
   * Set compose file
   */
  withFile(file: string): this {
    this.file = file;
    return this;
  }

  /**
   * Set project name
   */
  withProject(name: string): this {
    this.projectName = name;
    return this;
  }

  /**
   * Add profiles
   */
  withProfiles(...profiles: string[]): this {
    this.profiles.push(...profiles);
    return this;
  }

  /**
   * Add environment variables
   */
  withEnv(env: Record<string, string>): this {
    this.envVars = { ...this.envVars, ...env };
    return this;
  }

  /**
   * Build common compose arguments
   */
  private buildArgs(): string[] {
    const args: string[] = [];

    if (this.file) {
      args.push('-f', this.file);
    }

    if (this.projectName) {
      args.push('-p', this.projectName);
    }

    for (const profile of this.profiles) {
      args.push('--profile', profile);
    }

    return args;
  }

  /**
   * Run compose command with environment
   */
  private async runCompose(command: string[]): Promise<ExecutionResult> {
    const args = [...this.buildArgs(), ...command];

    // Set environment variables
    const originalEnv: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(this.envVars)) {
      originalEnv[key] = process.env[key];
      process.env[key] = value;
    }

    try {
      return await this.engine.run`docker compose ${args}`;
    } finally {
      // Restore environment
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  }

  /**
   * Start services
   */
  async up(detached = true, build = false): Promise<void> {
    const args = ['up'];
    if (detached) args.push('-d');
    if (build) args.push('--build');
    await this.runCompose(args);
  }

  /**
   * Stop services
   */
  async down(volumes = false, removeImages = false): Promise<void> {
    const args = ['down'];
    if (volumes) args.push('--volumes');
    if (removeImages) args.push('--rmi', 'all');
    await this.runCompose(args);
  }

  /**
   * Start services
   */
  async start(...services: string[]): Promise<void> {
    await this.runCompose(['start', ...services]);
  }

  /**
   * Stop services
   */
  async stop(...services: string[]): Promise<void> {
    await this.runCompose(['stop', ...services]);
  }

  /**
   * Restart services
   */
  async restart(...services: string[]): Promise<void> {
    await this.runCompose(['restart', ...services]);
  }

  /**
   * Build services
   */
  async build(...services: string[]): Promise<void> {
    await this.runCompose(['build', ...services]);
  }

  /**
   * View logs
   */
  async logs(service?: string, follow = false, tail?: number): Promise<string> {
    const args = ['logs'];
    if (follow) args.push('-f');
    if (tail) args.push('--tail', String(tail));
    if (service) args.push(service);
    const result = await this.runCompose(args);
    return result.stdout;
  }

  /**
   * Execute command in service
   */
  async exec(service: string, command: string): Promise<ExecutionResult> {
    // The command is a shell command for the container; `sh -c` keeps it
    // one compose argument instead of a binary named after the whole string.
    return await this.runCompose(['exec', service, 'sh', '-c', command]);
  }

  /**
   * List services
   */
  async ps(): Promise<string> {
    const result = await this.runCompose(['ps']);
    return result.stdout;
  }
}

/**
 * Docker Network Fluent API
 */
export class DockerNetworkFluentAPI {
  constructor(
    private engine: ExecutionEngine,
    private name: string
  ) {}

  /**
   * Create network
   */
  async create(options?: {
    driver?: 'bridge' | 'host' | 'overlay' | 'macvlan' | 'none';
    subnet?: string;
    gateway?: string;
    ipRange?: string;
    attachable?: boolean;
    internal?: boolean;
    labels?: Record<string, string>;
  }): Promise<void> {
    const args = ['network', 'create'];

    if (options?.driver) {
      args.push('--driver', options.driver);
    }

    if (options?.subnet) {
      args.push('--subnet', options.subnet);
    }

    if (options?.gateway) {
      args.push('--gateway', options.gateway);
    }

    if (options?.ipRange) {
      args.push('--ip-range', options.ipRange);
    }

    if (options?.attachable) {
      args.push('--attachable');
    }

    if (options?.internal) {
      args.push('--internal');
    }

    if (options?.labels) {
      for (const [key, value] of Object.entries(options.labels)) {
        args.push('--label', `${key}=${value}`);
      }
    }

    args.push(this.name);

    await this.engine.run`docker ${args}`;
  }

  /**
   * Remove network
   */
  async remove(): Promise<void> {
    await this.engine.run`docker network rm ${this.name}`;
  }

  /**
   * Connect container to network
   */
  async connect(container: string, options?: {
    ip?: string;
    alias?: string[];
  }): Promise<void> {
    const args = ['network', 'connect'];

    if (options?.ip) {
      args.push('--ip', options.ip);
    }

    if (options?.alias) {
      for (const alias of options.alias) {
        args.push('--alias', alias);
      }
    }

    args.push(this.name, container);

    await this.engine.run`docker ${args}`;
  }

  /**
   * Disconnect container from network
   */
  async disconnect(container: string, force = false): Promise<void> {
    const args = ['network', 'disconnect'];
    if (force) args.push('--force');
    args.push(this.name, container);
    await this.engine.run`docker ${args}`;
  }

  /**
   * Inspect network
   */
  async inspect(): Promise<any> {
    const result = await this.engine.run`docker network inspect ${this.name}`;
    return JSON.parse(result.stdout)[0];
  }

  /**
   * Check if network exists
   */
  async exists(): Promise<boolean> {
    try {
      await this.inspect();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Docker Volume Fluent API
 */
export class DockerVolumeFluentAPI {
  constructor(
    private engine: ExecutionEngine,
    private name: string
  ) {}

  /**
   * Create volume
   */
  async create(options?: {
    driver?: string;
    labels?: Record<string, string>;
    driverOpts?: Record<string, string>;
  }): Promise<void> {
    const args = ['volume', 'create'];

    if (options?.driver) {
      args.push('--driver', options.driver);
    }

    if (options?.labels) {
      for (const [key, value] of Object.entries(options.labels)) {
        args.push('--label', `${key}=${value}`);
      }
    }

    if (options?.driverOpts) {
      for (const [key, value] of Object.entries(options.driverOpts)) {
        args.push('--opt', `${key}=${value}`);
      }
    }

    args.push(this.name);

    await this.engine.run`docker ${args}`;
  }

  /**
   * Remove volume
   */
  async remove(force = false): Promise<void> {
    const args = ['volume', 'rm'];
    if (force) args.push('--force');
    args.push(this.name);
    await this.engine.run`docker ${args}`;
  }

  /**
   * Inspect volume
   */
  async inspect(): Promise<any> {
    const result = await this.engine.run`docker volume inspect ${this.name}`;
    return JSON.parse(result.stdout)[0];
  }

  /**
   * Check if volume exists
   */
  async exists(): Promise<boolean> {
    try {
      await this.inspect();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Prune unused volumes
   */
  static async prune(engine: ExecutionEngine): Promise<void> {
    await engine.run`docker volume prune --force`;
  }
}

/**
 * Docker Swarm Fluent API
 */
export class DockerSwarmFluentAPI {
  constructor(private engine: ExecutionEngine) {}

  /**
   * Initialize swarm
   */
  async init(options?: {
    advertiseAddr?: string;
    listenAddr?: string;
    dataPathAddr?: string;
  }): Promise<string> {
    const args = ['swarm', 'init'];

    if (options?.advertiseAddr) {
      args.push('--advertise-addr', options.advertiseAddr);
    }

    if (options?.listenAddr) {
      args.push('--listen-addr', options.listenAddr);
    }

    if (options?.dataPathAddr) {
      args.push('--data-path-addr', options.dataPathAddr);
    }

    const result = await this.engine.run`docker ${args}`;

    // Extract join token
    const match = result.stdout.match(/docker swarm join --token ([^\s]+)/);
    return match?.[1] ?? '';
  }

  /**
   * Join swarm
   */
  async join(token: string, managerAddr: string): Promise<void> {
    await this.engine.run`docker swarm join --token ${token} ${managerAddr}`;
  }

  /**
   * Leave swarm
   */
  async leave(force = false): Promise<void> {
    const args = ['swarm', 'leave'];
    if (force) args.push('--force');
    await this.engine.run`docker ${args}`;
  }

  /**
   * Deploy stack
   */
  async deployStack(name: string, composeFile: string): Promise<void> {
    await this.engine.run`docker stack deploy -c ${composeFile} ${name}`;
  }

  /**
   * Remove stack
   */
  async removeStack(name: string): Promise<void> {
    await this.engine.run`docker stack rm ${name}`;
  }

  /**
   * List services
   */
  async listServices(): Promise<string> {
    const result = await this.engine.run`docker service ls`;
    return result.stdout;
  }

  /**
   * Create service
   */
  async createService(name: string, image: string, options?: {
    replicas?: number;
    ports?: string[];
    env?: Record<string, string>;
    networks?: string[];
    constraints?: string[];
    labels?: Record<string, string>;
    mounts?: string[];
  }): Promise<void> {
    const args = ['service', 'create', '--name', name];

    if (options?.replicas) {
      args.push('--replicas', String(options.replicas));
    }

    if (options?.ports) {
      for (const port of options.ports) {
        args.push('-p', port);
      }
    }

    if (options?.env) {
      for (const [key, value] of Object.entries(options.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }

    if (options?.networks) {
      for (const network of options.networks) {
        args.push('--network', network);
      }
    }

    if (options?.constraints) {
      for (const constraint of options.constraints) {
        args.push('--constraint', constraint);
      }
    }

    if (options?.labels) {
      for (const [key, value] of Object.entries(options.labels)) {
        args.push('--label', `${key}=${value}`);
      }
    }

    if (options?.mounts) {
      for (const mount of options.mounts) {
        args.push('--mount', mount);
      }
    }

    args.push(image);

    await this.engine.run`docker ${args}`;
  }

  /**
   * Update service
   */
  async updateService(name: string, options: {
    image?: string;
    replicas?: number;
    updateParallelism?: number;
    updateDelay?: string;
  }): Promise<void> {
    const args = ['service', 'update'];

    if (options.image) {
      args.push('--image', options.image);
    }

    if (options.replicas !== undefined) {
      args.push('--replicas', String(options.replicas));
    }

    if (options.updateParallelism) {
      args.push('--update-parallelism', String(options.updateParallelism));
    }

    if (options.updateDelay) {
      args.push('--update-delay', options.updateDelay);
    }

    args.push(name);

    await this.engine.run`docker ${args}`;
  }

  /**
   * Remove service
   */
  async removeService(name: string): Promise<void> {
    await this.engine.run`docker service rm ${name}`;
  }

  /**
   * Scale service
   */
  async scaleService(name: string, replicas: number): Promise<void> {
    await this.engine.run`docker service scale ${name}=${replicas}`;
  }

  /**
   * Get service logs
   */
  async serviceLogs(name: string, options?: {
    follow?: boolean;
    tail?: number;
    since?: string;
  }): Promise<string> {
    const args = ['service', 'logs'];

    if (options?.follow) {
      args.push('-f');
    }

    if (options?.tail) {
      args.push('--tail', String(options.tail));
    }

    if (options?.since) {
      args.push('--since', options.since);
    }

    args.push(name);

    const result = await this.engine.run`docker ${args}`;
    return result.stdout;
  }
}
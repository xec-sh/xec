/**
 * Docker Fluent API - Main Entry Point
 */

import { ServiceName } from './types.js';
import { SSHFluentAPI } from './services/ssh.js';
import { DockerBuildFluentAPI } from './build.js';
import { RedisFluentAPI, RedisClusterFluentAPI } from './services/redis.js';
import { KafkaFluentAPI, RabbitMQFluentAPI } from './services/messaging.js';
// Import for internal use
import { DockerEphemeralFluentAPI, DockerPersistentFluentAPI } from './base.js';
import { MySQLFluentAPI, MongoDBFluentAPI, PostgreSQLFluentAPI } from './services/databases.js';

import type { ServicePresetConfig } from './types.js';
import type { ProcessPromise, ExecutionEngine } from '../../../core/execution-engine.js';

// Type exports
export * from './types.js';
export { SSHFluentAPI } from './services/ssh.js';

export { DockerBuildFluentAPI } from './build.js';
// Service implementations
export { RedisFluentAPI, RedisClusterFluentAPI } from './services/redis.js';
export { KafkaFluentAPI, RabbitMQFluentAPI } from './services/messaging.js';
export { MySQLFluentAPI, MongoDBFluentAPI, PostgreSQLFluentAPI } from './services/databases.js';

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
   * Service presets
   */
  service(name: ServiceName | string, config?: Partial<ServicePresetConfig>): any {
    switch (name) {
      case 'redis':
      case ServiceName.Redis:
        return new RedisFluentAPI(this.engine, config);

      case 'redis-cluster':
        return new RedisClusterFluentAPI(this.engine, config);

      case 'postgresql':
      case 'postgres':
      case ServiceName.PostgreSQL:
        return new PostgreSQLFluentAPI(this.engine, config);

      case 'mysql':
      case ServiceName.MySQL:
        return new MySQLFluentAPI(this.engine, config);

      case 'mongodb':
      case 'mongo':
      case ServiceName.MongoDB:
        return new MongoDBFluentAPI(this.engine, config);

      case 'kafka':
      case ServiceName.Kafka:
        return new KafkaFluentAPI(this.engine, config);

      case 'rabbitmq':
      case ServiceName.RabbitMQ:
        return new RabbitMQFluentAPI(this.engine, config);

      case 'ssh':
      case ServiceName.SSH:
        return new SSHFluentAPI(this.engine, config);

      default:
        throw new Error(`Unknown service: ${name}`);
    }
  }

  /**
   * Redis service shortcut
   */
  redis(config?: Partial<import('./types.js').RedisServiceConfig>): import('./services/redis.js').RedisFluentAPI {
    return this.service('redis', config);
  }

  /**
   * Redis cluster shortcut
   */
  redisCluster(config?: Partial<import('./types.js').RedisServiceConfig>): import('./services/redis.js').RedisClusterFluentAPI {
    return this.service('redis-cluster', config);
  }

  /**
   * PostgreSQL service shortcut
   */
  postgresql(config?: Partial<import('./types.js').PostgresServiceConfig>): import('./services/databases.js').PostgreSQLFluentAPI {
    return this.service('postgresql', config);
  }

  /**
   * MySQL service shortcut
   */
  mysql(config?: Partial<import('./types.js').MySQLServiceConfig>): import('./services/databases.js').MySQLFluentAPI {
    return this.service('mysql', config);
  }

  /**
   * MongoDB service shortcut
   */
  mongodb(config?: Partial<import('./types.js').MongoServiceConfig>): import('./services/databases.js').MongoDBFluentAPI {
    return this.service('mongodb', config);
  }

  /**
   * Kafka service shortcut
   */
  kafka(config?: Partial<import('./types.js').KafkaServiceConfig>): import('./services/messaging.js').KafkaFluentAPI {
    return this.service('kafka', config);
  }

  /**
   * RabbitMQ service shortcut
   */
  rabbitmq(config?: Partial<import('./types.js').RabbitMQServiceConfig>): import('./services/messaging.js').RabbitMQFluentAPI {
    return this.service('rabbitmq', config);
  }

  /**
   * SSH service shortcut - create SSH-enabled containers easily
   *
   * @example
   * // Quick start with defaults
   * const ssh = docker.ssh();
   * await ssh.start();
   *
   * // Custom configuration
   * const ssh = docker.ssh({ distro: 'alpine', port: 2323 });
   * await ssh.start();
   *
   * // Get connection info
   * console.log(ssh.getConnectionString());
   */
  ssh(config?: Partial<import('./types.js').SSHServiceConfig>): import('./services/ssh.js').SSHFluentAPI {
    return new SSHFluentAPI(this.engine, config);
  }

  /**
   * Run docker command directly (compatibility with old API)
   */
  run(strings: TemplateStringsArray, ...values: any[]): ProcessPromise {
    const dockerCmd = `docker ${strings.raw.join(' ')}`;
    return this.engine.run([dockerCmd] as any, ...values);
  }

  /**
   * Execute docker command (alias for run)
   */
  exec(strings: TemplateStringsArray, ...values: any[]): ProcessPromise {
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
    const forceFlag = force ? '-f' : '';
    await this.engine.run`docker rm ${forceFlag} ${container}`;
  }

  /**
   * Utility: Remove image
   */
  async rmi(image: string, force = false): Promise<void> {
    const forceFlag = force ? '-f' : '';
    await this.engine.run`docker rmi ${forceFlag} ${image}`;
  }

  /**
   * Utility: List containers
   */
  async ps(all = false): Promise<string> {
    const allFlag = all ? '-a' : '';
    const result = await this.engine.run`docker ps ${allFlag}`;
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
    await this.engine.run`docker system prune ${flags.join(' ')}`;
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
  private async runCompose(command: string): Promise<any> {
    const args = this.buildArgs();
    const cmdStr = `docker compose ${args.join(' ')} ${command}`;

    // Set environment variables
    const originalEnv: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(this.envVars)) {
      originalEnv[key] = process.env[key];
      process.env[key] = value;
    }

    try {
      return await this.engine.run`${cmdStr}`;
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
    const flags: string[] = [];
    if (detached) flags.push('-d');
    if (build) flags.push('--build');
    await this.runCompose(`up ${flags.join(' ')}`);
  }

  /**
   * Stop services
   */
  async down(volumes = false, removeImages = false): Promise<void> {
    const flags: string[] = [];
    if (volumes) flags.push('--volumes');
    if (removeImages) flags.push('--rmi all');
    await this.runCompose(`down ${flags.join(' ')}`);
  }

  /**
   * Start services
   */
  async start(...services: string[]): Promise<void> {
    await this.runCompose(`start ${services.join(' ')}`);
  }

  /**
   * Stop services
   */
  async stop(...services: string[]): Promise<void> {
    await this.runCompose(`stop ${services.join(' ')}`);
  }

  /**
   * Restart services
   */
  async restart(...services: string[]): Promise<void> {
    await this.runCompose(`restart ${services.join(' ')}`);
  }

  /**
   * Build services
   */
  async build(...services: string[]): Promise<void> {
    await this.runCompose(`build ${services.join(' ')}`);
  }

  /**
   * View logs
   */
  async logs(service?: string, follow = false, tail?: number): Promise<string> {
    const flags: string[] = [];
    if (follow) flags.push('-f');
    if (tail) flags.push('--tail', String(tail));
    const result = await this.runCompose(`logs ${flags.join(' ')} ${service || ''}`);
    return result.stdout;
  }

  /**
   * Execute command in service
   */
  async exec(service: string, command: string): Promise<any> {
    return await this.runCompose(`exec ${service} ${command}`);
  }

  /**
   * List services
   */
  async ps(): Promise<string> {
    const result = await this.runCompose('ps');
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

    await this.engine.run`docker ${args.join(' ')}`;
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

    await this.engine.run`docker ${args.join(' ')}`;
  }

  /**
   * Disconnect container from network
   */
  async disconnect(container: string, force = false): Promise<void> {
    const forceFlag = force ? '--force' : '';
    await this.engine.run`docker network disconnect ${forceFlag} ${this.name} ${container}`;
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

    await this.engine.run`docker ${args.join(' ')}`;
  }

  /**
   * Remove volume
   */
  async remove(force = false): Promise<void> {
    const forceFlag = force ? '--force' : '';
    await this.engine.run`docker volume rm ${forceFlag} ${this.name}`;
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

    const result = await this.engine.run`docker ${args.join(' ')}`;

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
    const forceFlag = force ? '--force' : '';
    await this.engine.run`docker swarm leave ${forceFlag}`;
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

    await this.engine.run`docker ${args.join(' ')}`;
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

    await this.engine.run`docker ${args.join(' ')}`;
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

    const result = await this.engine.run`docker ${args.join(' ')}`;
    return result.stdout;
  }
}
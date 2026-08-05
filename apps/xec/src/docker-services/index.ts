/**
 * Docker Service Presets - Main Entry Point
 *
 * Pre-configured Docker containers for common services (Redis, PostgreSQL,
 * MySQL, MongoDB, Kafka, RabbitMQ, SSH). Moved here from @xec-sh/core: they
 * are a CLI convenience built on top of core's public DockerEphemeralFluentAPI,
 * not part of the execution engine.
 */

import type { ExecutionEngine } from '@xec-sh/core';
import type { ServicePresetConfig } from './types.js';

import { SSHFluentAPI } from './ssh.js';
import { ServiceName } from './types.js';
import { RedisFluentAPI, RedisClusterFluentAPI } from './redis.js';
import { KafkaFluentAPI, RabbitMQFluentAPI } from './messaging.js';
import { MySQLFluentAPI, MongoDBFluentAPI, PostgreSQLFluentAPI } from './databases.js';

// Type exports
export * from './types.js';
export { SSHFluentAPI } from './ssh.js';

// Service implementations
export { RedisFluentAPI, RedisClusterFluentAPI } from './redis.js';
export { KafkaFluentAPI, RabbitMQFluentAPI } from './messaging.js';
export { MySQLFluentAPI, MongoDBFluentAPI, PostgreSQLFluentAPI } from './databases.js';

/**
 * Any concrete service preset instance.
 */
export type DockerServiceInstance =
  | RedisFluentAPI
  | RedisClusterFluentAPI
  | PostgreSQLFluentAPI
  | MySQLFluentAPI
  | MongoDBFluentAPI
  | KafkaFluentAPI
  | RabbitMQFluentAPI
  | SSHFluentAPI;

/**
 * Create a service preset by name.
 *
 * Mirrors what `DockerFluentAPI.service()` did before the presets moved out
 * of @xec-sh/core.
 */
export function createDockerService(
  engine: ExecutionEngine,
  name: ServiceName | string,
  config?: Partial<ServicePresetConfig>
): DockerServiceInstance {
  switch (name) {
    case 'redis':
    case ServiceName.Redis:
      return new RedisFluentAPI(engine, config);

    case 'redis-cluster':
      return new RedisClusterFluentAPI(engine, config);

    case 'postgresql':
    case 'postgres':
    case ServiceName.PostgreSQL:
      return new PostgreSQLFluentAPI(engine, config);

    case 'mysql':
    case ServiceName.MySQL:
      return new MySQLFluentAPI(engine, config);

    case 'mongodb':
    case 'mongo':
    case ServiceName.MongoDB:
      return new MongoDBFluentAPI(engine, config);

    case 'kafka':
    case ServiceName.Kafka:
      return new KafkaFluentAPI(engine, config);

    case 'rabbitmq':
    case ServiceName.RabbitMQ:
      return new RabbitMQFluentAPI(engine, config);

    case 'ssh':
    case ServiceName.SSH:
      return new SSHFluentAPI(engine, config);

    default:
      throw new Error(`Unknown service: ${name}`);
  }
}

/**
 * Legacy Redis Cluster configuration (kept for compatibility)
 */
export interface RedisClusterOptions {
  masters?: number;
  replicas?: number;
  basePort?: number;
  image?: string;
  network?: string;
  containerPrefix?: string;
  nodeTimeout?: number;
  redisConfig?: Record<string, string>;
  persistent?: boolean;
  dataPath?: string;
}

/**
 * Legacy Docker Redis Cluster API (wrapper for new API)
 * Kept for backwards compatibility
 */
export class DockerRedisClusterAPI {
  private api: RedisClusterFluentAPI;

  constructor(engine: ExecutionEngine, options?: RedisClusterOptions) {
    this.api = new RedisClusterFluentAPI(engine, {
      cluster: {
        enabled: true,
        masters: options?.masters,
        replicas: options?.replicas,
        nodeTimeout: options?.nodeTimeout
      },
      port: options?.basePort,
      version: options?.image?.replace('redis:', '').replace('-alpine', ''),
      network: options?.network,
      name: options?.containerPrefix,
      persistent: options?.persistent,
      dataPath: options?.dataPath,
      config: options?.redisConfig
    });
  }

  async start() { return await this.api.start(); }
  async stop() { return await this.api.stop(); }
  async remove() { return await this.api.remove(); }
  async exec(command: string) { return await this.api.exec(command); }
  async info() { return await this.api.getClusterInfo(); }
  async nodes() {
    const nodes = await this.api.getClusterNodes();
    return nodes.map((n) => `${n.id} ${n.host}:${n.port} ${n.role}`).join('\n');
  }
  getConnectionString() { return this.api.getConnectionString(); }
  getContainerNames() { return (this.api as any).nodes.map((n: any) => n.config.name); }
  isRunning() { return this.api.isRunning(); }
}

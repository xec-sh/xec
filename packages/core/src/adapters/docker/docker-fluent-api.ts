/**
 * Docker Fluent API - Re-exports from modular structure
 *
 * This file maintains backwards compatibility by re-exporting
 * from the new modular structure in ./docker-fluent-api/
 */

// Import for internal use
import { RedisClusterFluentAPI } from './docker-fluent-api/services/redis.js';

// Re-export types
export * from './docker-fluent-api/types.js';

// Re-export build API
export { DockerBuildFluentAPI } from './docker-fluent-api/build.js';

// Legacy exports for backwards compatibility
export { DockerBuildFluentAPI as DockerFluentBuildAPI } from './docker-fluent-api/build.js';

// Re-export service APIs
export {
  RedisFluentAPI,
  RedisClusterFluentAPI
} from './docker-fluent-api/services/redis.js';

export {
  KafkaFluentAPI,
  RabbitMQFluentAPI
} from './docker-fluent-api/services/messaging.js';

export {
  MySQLFluentAPI,
  MongoDBFluentAPI,
  PostgreSQLFluentAPI
} from './docker-fluent-api/services/databases.js';

// Re-export base classes
export {
  BaseDockerFluentAPI,
  DockerEphemeralFluentAPI,
  DockerPersistentFluentAPI
} from './docker-fluent-api/base.js';

// Re-export main API
export {
  DockerFluentAPI,
  DockerSwarmFluentAPI,
  DockerVolumeFluentAPI,
  DockerComposeFluentAPI,
  DockerNetworkFluentAPI
} from './docker-fluent-api/index.js';

// Legacy Redis Cluster configuration (kept for compatibility)
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
  private api: any;

  constructor(engine: any, options?: RedisClusterOptions) {
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
    return nodes.map((n: any) => `${n.id} ${n.host}:${n.port} ${n.role}`).join('\n');
  }
  getConnectionString() { return this.api.getConnectionString(); }
  getContainerNames() { return this.api.nodes.map((n: any) => n.config.name); }
  isRunning() { return this.api.isRunning(); }
}
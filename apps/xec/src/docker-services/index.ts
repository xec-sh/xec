/**
 * Docker Service Presets - Main Entry Point
 *
 * Pre-configured Docker containers for common services (Redis, PostgreSQL,
 * MySQL, MongoDB, Kafka, RabbitMQ, Elasticsearch and SSH), built on the
 * public Core Docker lifecycle and transports.
 */

import type { ExecutionEngine } from '@xec-sh/core';
import type { ServiceName, ServicePresetConfig } from './types.js';

import { SSHFluentAPI } from './ssh.js';
import { ElasticsearchFluentAPI } from './search.js';
import { RedisFluentAPI, RedisClusterFluentAPI } from './redis.js';
import { KafkaFluentAPI, RabbitMQFluentAPI } from './messaging.js';
import { MySQLFluentAPI, MongoDBFluentAPI, PostgreSQLFluentAPI } from './databases.js';

// Type exports
export * from './types.js';
export { SSHFluentAPI } from './ssh.js';
export { ElasticsearchFluentAPI } from './search.js';

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
  | SSHFluentAPI
  | ElasticsearchFluentAPI;

/**
 * Create a service preset by name.
 *
 * Presets configure the public Core Docker lifecycle; they do not own a transport.
 */
export function createDockerService(
  engine: ExecutionEngine,
  name: ServiceName | string,
  config?: Partial<ServicePresetConfig>
): DockerServiceInstance {
  switch (name) {
    case 'redis':
      return new RedisFluentAPI(engine, config);

    case 'redis-cluster':
      return new RedisClusterFluentAPI(engine, config);

    case 'postgresql':
    case 'postgres':
      return new PostgreSQLFluentAPI(engine, config);

    case 'mysql':
      return new MySQLFluentAPI(engine, config);

    case 'mongodb':
    case 'mongo':
      return new MongoDBFluentAPI(engine, config);

    case 'elasticsearch':
      return new ElasticsearchFluentAPI(engine, config);

    case 'kafka':
      return new KafkaFluentAPI(engine, config);

    case 'rabbitmq':
      return new RabbitMQFluentAPI(engine, config);

    case 'ssh':
      return new SSHFluentAPI(engine, config);

    default:
      throw new Error(`Unknown service: ${name}`);
  }
}

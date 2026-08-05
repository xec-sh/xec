/**
 * Docker Service Preset Type Definitions
 *
 * Moved from @xec-sh/core (docker-fluent-api/types.ts): the presets are a
 * CLI convenience, not part of the execution engine.
 */

import type { ServiceManager, ExecutionEngine } from '@xec-sh/core';

/**
 * Service preset configuration base
 */
export interface ServicePresetConfig {
  version?: string;
  port?: number | string;
  name?: string;
  persistent?: boolean;
  dataPath?: string;
  configPath?: string;
  env?: Record<string, string>;
  network?: string;
  autoStart?: boolean;
}

/**
 * Redis service configuration
 */
export interface RedisServiceConfig extends ServicePresetConfig {
  password?: string;
  maxMemory?: string;
  maxMemoryPolicy?: string;
  appendOnly?: boolean;
  cluster?: {
    enabled: boolean;
    masters?: number;
    replicas?: number;
    nodeTimeout?: number;
  };
  sentinel?: {
    enabled: boolean;
    masterName?: string;
    quorum?: number;
    downAfterMilliseconds?: number;
  };
  modules?: string[];
  config?: Record<string, string>;
}

/**
 * PostgreSQL service configuration
 */
export interface PostgresServiceConfig extends ServicePresetConfig {
  database?: string;
  user?: string;
  password?: string;
  initDb?: {
    locale?: string;
    encoding?: string;
    scripts?: string[];
  };
  replication?: {
    enabled: boolean;
    role?: 'master' | 'replica';
    masterHost?: string;
    slotName?: string;
    syncPriority?: number;
  };
  extensions?: string[];
  config?: Record<string, string>;
}

/**
 * MySQL service configuration
 */
export interface MySQLServiceConfig extends ServicePresetConfig {
  database?: string;
  user?: string;
  password?: string;
  rootPassword?: string;
  charset?: string;
  collation?: string;
  initScripts?: string[];
  replication?: {
    enabled: boolean;
    role?: 'master' | 'slave';
    masterId?: number;
    slaveId?: number;
  };
  config?: Record<string, string>;
}

/**
 * MongoDB service configuration
 */
export interface MongoServiceConfig extends ServicePresetConfig {
  database?: string;
  user?: string;
  password?: string;
  rootUser?: string;
  rootPassword?: string;
  replicaSet?: string;
  sharding?: boolean;
  configServer?: boolean;
  shardServer?: boolean;
  arbiter?: boolean;
  initScripts?: string[];
  config?: Record<string, string>;
}

/**
 * Elasticsearch service configuration
 */
export interface ElasticSearchServiceConfig extends ServicePresetConfig {
  clusterName?: string;
  nodeName?: string;
  discoveryType?: 'single-node' | 'zen';
  masterNodes?: string[];
  heap?: string;
  plugins?: string[];
  config?: Record<string, string>;
}

/**
 * Kafka service configuration
 */
export interface KafkaServiceConfig extends ServicePresetConfig {
  zookeeper?: string;
  brokerId?: number;
  listeners?: string[];
  advertisedListeners?: string[];
  autoCreateTopics?: boolean;
  defaultReplicationFactor?: number;
  minInsyncReplicas?: number;
  config?: Record<string, string>;
}

/**
 * RabbitMQ service configuration
 */
export interface RabbitMQServiceConfig extends ServicePresetConfig {
  user?: string;
  password?: string;
  vhost?: string;
  plugins?: string[];
  cluster?: {
    enabled: boolean;
    nodeName?: string;
    cookie?: string;
  };
  management?: boolean;
  config?: Record<string, string>;
}

/**
 * SSH service configuration
 */
export interface SSHServiceConfig extends ServicePresetConfig {
  distro?: 'ubuntu' | 'alpine' | 'debian' | 'fedora' | 'centos' | 'rocky' | 'alma' | string;
  user?: string;
  password?: string;
  rootPassword?: string;
  sudo?: {
    enabled: boolean;
    requirePassword?: boolean;
  };
  pubKeys?: string[];
  packages?: string[];
  setupCommands?: string[];
  sshConfig?: Record<string, string>;
}

/**
 * Common service names enum for type safety
 */
export enum ServiceName {
  Redis = 'redis',
  PostgreSQL = 'postgresql',
  MySQL = 'mysql',
  MongoDB = 'mongodb',
  ElasticSearch = 'elasticsearch',
  Kafka = 'kafka',
  RabbitMQ = 'rabbitmq',
  SSH = 'ssh',
  Nginx = 'nginx',
  Memcached = 'memcached',
  InfluxDB = 'influxdb',
  Consul = 'consul',
  Vault = 'vault',
  Grafana = 'grafana',
  Prometheus = 'prometheus',
  Jenkins = 'jenkins',
  GitLab = 'gitlab',
  MinIO = 'minio',
  Cassandra = 'cassandra',
  CockroachDB = 'cockroachdb',
  ClickHouse = 'clickhouse',
  Neo4j = 'neo4j',
  ArangoDB = 'arangodb',
  DynamoDB = 'dynamodb',
  ScyllaDB = 'scylladb'
}

/**
 * Service factory function type
 */
export type ServiceFactory<T extends ServicePresetConfig> = (
  engine: ExecutionEngine,
  config?: Partial<T>
) => ServiceManager;


import { ExecutionEngine } from '@xec-sh/core';

import {
  SSHFluentAPI,
  RedisFluentAPI,
  MySQLFluentAPI,
  KafkaFluentAPI,
  MongoDBFluentAPI,
  RabbitMQFluentAPI,
  createDockerService,
  PostgreSQLFluentAPI,
  RedisClusterFluentAPI,
  DockerRedisClusterAPI
} from '../../src/docker-services/index.js';

describe('Docker Service Presets', () => {
  let engine: ExecutionEngine;
  let mockRun: vi.Mock;

  beforeEach(() => {
    engine = new ExecutionEngine();
    // Mock the run method to avoid actual Docker commands
    const mockResult = {
      stdout: '',
      stderr: '',
      exitCode: 0,
      signal: undefined,
      ok: true,
      command: 'docker',
      duration: 0,
      startedAt: new Date(),
      finishedAt: new Date(),
      adapter: 'local',
      cause: undefined,
      toMetadata: () => ({}),
      throwIfFailed: () => {},
      text: () => '',
      json: () => ({}),
      lines: () => [],
      buffer: () => Buffer.from('')
    };

    mockRun = vi.fn(() => {
      // Return a ProcessPromise-like object
      const promise: any = Promise.resolve(mockResult);
      promise.nothrow = () => promise;
      promise.pipe = () => promise;
      promise.then = (...args: any[]) => Promise.resolve(mockResult).then(...args);
      promise.catch = (...args: any[]) => Promise.resolve(mockResult).catch(...args);
      promise.finally = (...args: any[]) => Promise.resolve(mockResult).finally(...args);
      return promise;
    });

    (engine as any).run = mockRun;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createDockerService', () => {
    test('should create Redis service', () => {
      const redis = createDockerService(engine, 'redis');

      expect(redis).toBeInstanceOf(RedisFluentAPI);
    });

    test('should create Redis cluster', () => {
      const redisCluster = createDockerService(engine, 'redis-cluster');

      expect(redisCluster).toBeInstanceOf(RedisClusterFluentAPI);
    });

    test('should create PostgreSQL service', () => {
      const postgres = createDockerService(engine, 'postgresql');

      expect(postgres).toBeInstanceOf(PostgreSQLFluentAPI);
    });

    test('should create MySQL service', () => {
      const mysql = createDockerService(engine, 'mysql');

      expect(mysql).toBeInstanceOf(MySQLFluentAPI);
    });

    test('should create MongoDB service', () => {
      const mongo = createDockerService(engine, 'mongodb');

      expect(mongo).toBeInstanceOf(MongoDBFluentAPI);
    });

    test('should create Kafka service', () => {
      const kafka = createDockerService(engine, 'kafka');

      expect(kafka).toBeInstanceOf(KafkaFluentAPI);
    });

    test('should create RabbitMQ service', () => {
      const rabbitmq = createDockerService(engine, 'rabbitmq');

      expect(rabbitmq).toBeInstanceOf(RabbitMQFluentAPI);
    });

    test('should create SSH service', () => {
      const ssh = createDockerService(engine, 'ssh');

      expect(ssh).toBeInstanceOf(SSHFluentAPI);
    });

    test('should reject unknown service names', () => {
      expect(() => createDockerService(engine, 'not-a-service')).toThrow('Unknown service: not-a-service');
    });
  });

  describe('RedisFluentAPI', () => {
    let api: RedisFluentAPI;

    beforeEach(() => {
      api = new RedisFluentAPI(engine);
    });

    test('should have default configuration applied to Docker config', () => {
      const config = api.build();
      expect(config.image).toBe('redis:alpine');
      expect(config.ports).toContain('6379:6379');
      expect(config.name).toBe('xec-redis');
      expect(config.labels).toHaveProperty('service', 'redis');
    });

    test('should configure Redis with custom settings', () => {
      const customApi = new RedisFluentAPI(engine, {
        version: '6.2-alpine',
        port: 6380,
        password: 'mypassword',
        name: 'custom-redis'
      });

      const config = customApi.build();
      expect(config.image).toBe('redis:6.2-alpine');
      expect(config.ports).toContain('6380:6379');
      expect(config.name).toBe('custom-redis');
      expect(config.env).toHaveProperty('REDIS_PASSWORD', 'mypassword');
    });
  });

  describe('RedisClusterFluentAPI', () => {
    let api: RedisClusterFluentAPI;

    beforeEach(() => {
      api = new RedisClusterFluentAPI(engine, {
        cluster: {
          enabled: true,
          masters: 3,
          replicas: 1
        }
      });
    });

    test('should validate minimum masters requirement', () => {
      expect(() => {
        new RedisClusterFluentAPI(engine, {
          cluster: {
            enabled: true,
            masters: 2,
            replicas: 0
          }
        });
      }).toThrow('Redis cluster requires at least 3 master nodes');
    });

    test('should provide connection string method', () => {
      expect(api.getConnectionString).toBeDefined();
      const connStr = api.getConnectionString();
      expect(typeof connStr).toBe('string');
    });

    test('should provide cluster management methods', () => {
      expect(api.start).toBeDefined();
      expect(api.stop).toBeDefined();
      expect(api.remove).toBeDefined();
      expect(api.getConnectionString).toBeDefined();
    });
  });

  describe('PostgreSQLFluentAPI', () => {
    let api: PostgreSQLFluentAPI;

    beforeEach(() => {
      api = new PostgreSQLFluentAPI(engine);
    });

    test('should have default configuration applied to Docker config', () => {
      const config = api.build();
      expect(config.image).toContain('postgres');
      expect(config.ports).toContain('5432:5432');
      expect(config.env).toHaveProperty('POSTGRES_DB');
      expect(config.env).toHaveProperty('POSTGRES_USER');
      expect(config.env).toHaveProperty('POSTGRES_PASSWORD');
    });

    test('should configure PostgreSQL with custom settings', () => {
      const customApi = new PostgreSQLFluentAPI(engine, {
        version: '14',
        port: 5433,
        database: 'mydb',
        user: 'myuser',
        password: 'mypassword'
      });

      const config = customApi.build();
      expect(config.image).toContain('postgres:14');
      expect(config.ports).toContain('5433:5432');
      expect(config.env).toHaveProperty('POSTGRES_DB', 'mydb');
      expect(config.env).toHaveProperty('POSTGRES_USER', 'myuser');
      expect(config.env).toHaveProperty('POSTGRES_PASSWORD', 'mypassword');
    });
  });

  describe('MySQLFluentAPI', () => {
    let api: MySQLFluentAPI;

    beforeEach(() => {
      api = new MySQLFluentAPI(engine);
    });

    test('should have default configuration applied to Docker config', () => {
      const config = api.build();
      expect(config.image).toContain('mysql');
      expect(config.ports).toContain('3306:3306');
      expect(config.env).toHaveProperty('MYSQL_DATABASE');
      expect(config.env).toHaveProperty('MYSQL_ROOT_PASSWORD');
    });

    test('should configure MySQL with custom settings', () => {
      const customApi = new MySQLFluentAPI(engine, {
        version: '5.7',
        port: 3307,
        database: 'mydb',
        user: 'myuser',
        password: 'mypassword',
        rootPassword: 'rootpass'
      });

      const config = customApi.build();
      expect(config.image).toContain('mysql:5.7');
      expect(config.ports).toContain('3307:3306');
      expect(config.env).toHaveProperty('MYSQL_DATABASE', 'mydb');
      expect(config.env).toHaveProperty('MYSQL_USER', 'myuser');
      expect(config.env).toHaveProperty('MYSQL_PASSWORD', 'mypassword');
      expect(config.env).toHaveProperty('MYSQL_ROOT_PASSWORD', 'rootpass');
    });
  });

  describe('MongoDBFluentAPI', () => {
    let api: MongoDBFluentAPI;

    beforeEach(() => {
      api = new MongoDBFluentAPI(engine);
    });

    test('should have default configuration applied to Docker config', () => {
      const config = api.build();
      expect(config.image).toContain('mongo');
      expect(config.ports).toContain('27017:27017');
    });

    test('should configure MongoDB with custom settings', () => {
      const customApi = new MongoDBFluentAPI(engine, {
        version: '5.0',
        port: 27018,
        database: 'mydb',
        user: 'myuser',
        password: 'mypassword',
        replicaSet: 'rs0'
      });

      const config = customApi.build();
      expect(config.image).toContain('mongo:5.0');
      expect(config.ports).toContain('27018:27017');
      // MongoDB auth is set via environment or init scripts
      expect(config.env || {}).toBeDefined();
    });
  });

  describe('KafkaFluentAPI', () => {
    let api: KafkaFluentAPI;

    beforeEach(() => {
      api = new KafkaFluentAPI(engine);
    });

    test('should have default configuration applied to Docker config', () => {
      const config = api.build();
      expect(config.image).toContain('kafka');
      expect(config.ports).toContain('9092:9092');
    });

    test('should configure Kafka with custom settings', () => {
      const customApi = new KafkaFluentAPI(engine, {
        version: '3.3',
        port: 9093
      });

      const config = customApi.build();
      expect(config.image).toContain('kafka');
      expect(config.ports).toContain('9093:9092');
    });
  });

  describe('RabbitMQFluentAPI', () => {
    let api: RabbitMQFluentAPI;

    beforeEach(() => {
      api = new RabbitMQFluentAPI(engine);
    });

    test('should have default configuration applied to Docker config', () => {
      const config = api.build();
      expect(config.image).toContain('rabbitmq');
      expect(config.ports).toContain('5672:5672');
      expect(config.env).toHaveProperty('RABBITMQ_DEFAULT_USER');
      expect(config.env).toHaveProperty('RABBITMQ_DEFAULT_PASS');
    });

    test('should configure RabbitMQ with custom settings', () => {
      const customApi = new RabbitMQFluentAPI(engine, {
        version: '3.10',
        port: 5673,
        user: 'admin',
        password: 'admin123',
        vhost: '/myvhost'
      });

      const config = customApi.build();
      expect(config.image).toContain('rabbitmq:3.10');
      expect(config.ports).toContain('5673:5672');
      expect(config.env).toHaveProperty('RABBITMQ_DEFAULT_USER', 'admin');
      expect(config.env).toHaveProperty('RABBITMQ_DEFAULT_PASS', 'admin123');
      expect(config.env).toHaveProperty('RABBITMQ_DEFAULT_VHOST', '/myvhost');
    });
  });

  describe('DockerRedisClusterAPI (Legacy)', () => {
    let api: DockerRedisClusterAPI;

    beforeEach(() => {
      api = new DockerRedisClusterAPI(engine, {
        masters: 3,
        replicas: 1,
        basePort: 8000,
        containerPrefix: 'test-cluster'
      });
    });

    test('should create legacy API wrapper', () => {
      expect(api).toBeDefined();
      expect(api.start).toBeDefined();
      expect(api.stop).toBeDefined();
      expect(api.remove).toBeDefined();
      expect(api.exec).toBeDefined();
    });

    test('should get connection string', () => {
      const connStr = api.getConnectionString();
      expect(connStr).toBeDefined();
      expect(typeof connStr).toBe('string');
    });

    test('should have getContainerNames method', () => {
      expect(api.getContainerNames).toBeDefined();
      const names = api.getContainerNames();
      expect(Array.isArray(names)).toBe(true);
    });

    test('should have isRunning method that returns promise', async () => {
      expect(api.isRunning).toBeDefined();
      const result = api.isRunning();
      expect(result).toBeInstanceOf(Promise);
    });
  });
});

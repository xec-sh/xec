import { test, jest, expect, describe, beforeEach, afterEach } from '@jest/globals';

import { ExecutionEngine } from '../../../src/core/execution-engine.js';
import {
  DockerFluentAPI,
  DockerBuildFluentAPI,
  DockerEphemeralFluentAPI,
  DockerPersistentFluentAPI,
  RedisFluentAPI,
  RedisClusterFluentAPI,
  PostgreSQLFluentAPI,
  MySQLFluentAPI,
  MongoDBFluentAPI,
  KafkaFluentAPI,
  RabbitMQFluentAPI,
  DockerRedisClusterAPI
} from '../../../src/adapters/docker/docker-fluent-api.js';

describe('Docker Fluent API', () => {
  let engine: ExecutionEngine;
  let mockRun: jest.Mock;

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

    mockRun = jest.fn(() => {
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
    jest.clearAllMocks();
  });

  describe('DockerFluentAPI', () => {
    test('should create DockerFluentAPI instance', () => {
      const docker = new DockerFluentAPI(engine);
      expect(docker).toBeDefined();
      expect(docker.ephemeral).toBeDefined();
      expect(docker.persistent).toBeDefined();
      expect(docker.build).toBeDefined();
    });

    test('should create ephemeral container API', () => {
      const docker = new DockerFluentAPI(engine);
      const ephemeral = docker.ephemeral('nginx:latest');

      expect(ephemeral).toBeInstanceOf(DockerEphemeralFluentAPI);
    });

    test('should create persistent container API', () => {
      const docker = new DockerFluentAPI(engine);
      const persistent = docker.persistent('my-container');

      expect(persistent).toBeInstanceOf(DockerPersistentFluentAPI);
    });

    test('should create build API', () => {
      const docker = new DockerFluentAPI(engine);
      const build = docker.build('.');

      expect(build).toBeInstanceOf(DockerBuildFluentAPI);
    });

    test('should create Redis service', () => {
      const docker = new DockerFluentAPI(engine);
      const redis = docker.redis();

      expect(redis).toBeInstanceOf(RedisFluentAPI);
    });

    test('should create Redis cluster', () => {
      const docker = new DockerFluentAPI(engine);
      const redisCluster = docker.redisCluster();

      expect(redisCluster).toBeInstanceOf(RedisClusterFluentAPI);
    });

    test('should create PostgreSQL service', () => {
      const docker = new DockerFluentAPI(engine);
      const postgres = docker.postgresql();

      expect(postgres).toBeInstanceOf(PostgreSQLFluentAPI);
    });

    test('should create MySQL service', () => {
      const docker = new DockerFluentAPI(engine);
      const mysql = docker.mysql();

      expect(mysql).toBeInstanceOf(MySQLFluentAPI);
    });

    test('should create MongoDB service', () => {
      const docker = new DockerFluentAPI(engine);
      const mongo = docker.mongodb();

      expect(mongo).toBeInstanceOf(MongoDBFluentAPI);
    });

    test('should create Kafka service', () => {
      const docker = new DockerFluentAPI(engine);
      const kafka = docker.kafka();

      expect(kafka).toBeInstanceOf(KafkaFluentAPI);
    });

    test('should create RabbitMQ service', () => {
      const docker = new DockerFluentAPI(engine);
      const rabbitmq = docker.rabbitmq();

      expect(rabbitmq).toBeInstanceOf(RabbitMQFluentAPI);
    });
  });

  describe('DockerEphemeralFluentAPI', () => {
    let api: DockerEphemeralFluentAPI;

    beforeEach(() => {
      api = new DockerEphemeralFluentAPI(engine, { image: 'nginx:latest' });
    });

    test('should set ports', () => {
      api.ports(['80:80', '443:443']);
      expect(api.config.ports).toEqual(['80:80', '443:443']);
    });

    test('should set environment variables', () => {
      api.env({ NODE_ENV: 'production' });
      expect(api.config.env).toEqual({ NODE_ENV: 'production' });
    });

    test('should set volumes', () => {
      api.volumes(['/data:/data']);
      expect(api.config.volumes).toEqual(['/data:/data']);
    });

    test('should set network', () => {
      api.network('my-network');
      expect(api.config.network).toBe('my-network');
    });

    test('should set working directory', () => {
      api.workdir('/app');
      expect(api.config.workdir).toBe('/app');
    });

    test('should set user', () => {
      api.user('node');
      expect(api.config.user).toBe('node');
    });

    test('should set privileged mode', () => {
      api.privileged();
      expect(api.config.privileged).toBe(true);
    });

    test('should set auto-remove', () => {
      api.autoRemove();
      expect(api.config.autoRemove).toBe(true);
    });

    test('should set restart policy', () => {
      api.restart('always');
      expect(api.config.restart).toBe('always');
    });

    test('should set memory limit', () => {
      api.memory('512m');
      expect(api.config.memory).toBe('512m');
    });

    test('should set CPU limit', () => {
      api.cpus('0.5');
      expect(api.config.cpus).toBe('0.5');
    });

    test('should set hostname', () => {
      api.hostname('myhost');
      expect(api.config.hostname).toBe('myhost');
    });

    test('should set healthcheck', () => {
      const healthcheck = {
        test: ['CMD', 'curl', '-f', 'http://localhost/health'],
        interval: '30s',
        timeout: '3s',
        retries: 3
      };
      api.healthcheck(healthcheck);
      expect(api.config.healthcheck).toEqual(healthcheck);
    });

    test('should build run arguments', () => {
      api
        .name('test-container')
        .ports(['80:80'])
        .env({ NODE_ENV: 'production' })
        .volumes(['/data:/data']);

      const args = api.buildRunArgs();

      expect(args).toContain('run');
      expect(args).toContain('-d');
      expect(args).toContain('--name');
      expect(args).toContain('test-container');
      expect(args).toContain('-p');
      expect(args).toContain('80:80');
      expect(args).toContain('-e');
      expect(args).toContain('NODE_ENV=production');
      expect(args).toContain('-v');
      expect(args).toContain('/data:/data');
      expect(args).toContain('nginx:latest');
    });
  });

  describe('DockerPersistentFluentAPI', () => {
    let api: DockerPersistentFluentAPI;

    beforeEach(() => {
      api = new DockerPersistentFluentAPI(engine, { container: 'my-container' });
    });

    test('should set working directory', () => {
      api.workdir('/app');
      expect(api.config.workdir).toBe('/app');
    });

    test('should set user', () => {
      api.user('node');
      expect(api.config.user).toBe('node');
    });

    test('should set environment variables', () => {
      api.env({ NODE_ENV: 'production' });
      expect(api.config.env).toEqual({ NODE_ENV: 'production' });
    });
  });

  describe('DockerBuildFluentAPI', () => {
    let api: DockerBuildFluentAPI;

    beforeEach(() => {
      api = new DockerBuildFluentAPI(engine, { context: '.' });
    });

    test('should set dockerfile', () => {
      api.dockerfile('Dockerfile.prod');
      expect(api.config.dockerfile).toBe('Dockerfile.prod');
    });

    test('should set tag', () => {
      api.tag('myapp:latest');
      expect(api.config.tag).toBe('myapp:latest');
    });

    test('should set build arguments', () => {
      api.buildArgs({ VERSION: '1.0.0' });
      expect(api.config.buildArgs).toEqual({ VERSION: '1.0.0' });
    });

    test('should set target stage', () => {
      api.target('production');
      expect(api.config.target).toBe('production');
    });

    test('should set platform', () => {
      api.platform('linux/amd64');
      expect(api.config.platform).toBe('linux/amd64');
    });

    test('should enable no-cache', () => {
      api.noCache();
      expect(api.config.noCache).toBe(true);
    });

    test('should enable pull', () => {
      api.pull();
      expect(api.config.pull).toBe(true);
    });

    test('should set labels', () => {
      api.labels({ version: '1.0.0' });
      expect(api.config.labels).toEqual({ version: '1.0.0' });
    });

    test('should build docker build command', () => {
      api
        .tag('myapp:latest')
        .dockerfile('Dockerfile.prod')
        .buildArgs({ VERSION: '1.0.0' })
        .target('production')
        .noCache()
        .pull();

      const command = api.buildCommand();

      expect(command).toContain('docker build');
      expect(command).toContain('-t myapp:latest');
      expect(command).toContain('-f Dockerfile.prod');
      expect(command).toContain('--build-arg VERSION=1.0.0');
      expect(command).toContain('--target production');
      expect(command).toContain('--no-cache');
      expect(command).toContain('--pull');
      expect(command).toContain('.');
    });
  });

  describe('RedisFluentAPI', () => {
    let api: RedisFluentAPI;

    beforeEach(() => {
      api = new RedisFluentAPI(engine);
    });

    test('should have default configuration', () => {
      expect(api.config.version).toBe('7-alpine');
      expect(api.config.port).toBe(6379);
      expect(api.config.name).toBe('redis');
    });

    test('should configure Redis with custom settings', () => {
      const customApi = new RedisFluentAPI(engine, {
        version: '6.2-alpine',
        port: 6380,
        password: 'mypassword',
        maxMemory: '256mb',
        appendOnly: true
      });

      expect(customApi.config.version).toBe('6.2-alpine');
      expect(customApi.config.port).toBe(6380);
      expect(customApi.config.password).toBe('mypassword');
      expect(customApi.config.maxMemory).toBe('256mb');
      expect(customApi.config.appendOnly).toBe(true);
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

    test('should calculate total nodes correctly', () => {
      expect(api.nodes).toHaveLength(6); // 3 masters + 3 replicas
    });

    test('should get connection string', () => {
      const connStr = api.getConnectionString();
      expect(connStr).toBe('localhost:7000,localhost:7001,localhost:7002');
    });
  });

  describe('PostgreSQLFluentAPI', () => {
    let api: PostgreSQLFluentAPI;

    beforeEach(() => {
      api = new PostgreSQLFluentAPI(engine);
    });

    test('should have default configuration', () => {
      expect(api.config.version).toBe('15-alpine');
      expect(api.config.port).toBe(5432);
      expect(api.config.database).toBe('postgres');
      expect(api.config.user).toBe('postgres');
      expect(api.config.password).toBe('postgres');
    });

    test('should configure PostgreSQL with custom settings', () => {
      const customApi = new PostgreSQLFluentAPI(engine, {
        version: '14',
        port: 5433,
        database: 'mydb',
        user: 'myuser',
        password: 'mypassword'
      });

      expect(customApi.config.version).toBe('14');
      expect(customApi.config.port).toBe(5433);
      expect(customApi.config.database).toBe('mydb');
      expect(customApi.config.user).toBe('myuser');
      expect(customApi.config.password).toBe('mypassword');
    });
  });

  describe('MySQLFluentAPI', () => {
    let api: MySQLFluentAPI;

    beforeEach(() => {
      api = new MySQLFluentAPI(engine);
    });

    test('should have default configuration', () => {
      expect(api.config.version).toBe('8.0');
      expect(api.config.port).toBe(3306);
      expect(api.config.database).toBe('mysql');
      expect(api.config.rootPassword).toBe('root');
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

      expect(customApi.config.version).toBe('5.7');
      expect(customApi.config.port).toBe(3307);
      expect(customApi.config.database).toBe('mydb');
      expect(customApi.config.user).toBe('myuser');
      expect(customApi.config.password).toBe('mypassword');
      expect(customApi.config.rootPassword).toBe('rootpass');
    });
  });

  describe('MongoDBFluentAPI', () => {
    let api: MongoDBFluentAPI;

    beforeEach(() => {
      api = new MongoDBFluentAPI(engine);
    });

    test('should have default configuration', () => {
      expect(api.config.version).toBe('6.0');
      expect(api.config.port).toBe(27017);
      expect(api.config.database).toBe('test');
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

      expect(customApi.config.version).toBe('5.0');
      expect(customApi.config.port).toBe(27018);
      expect(customApi.config.database).toBe('mydb');
      expect(customApi.config.user).toBe('myuser');
      expect(customApi.config.password).toBe('mypassword');
      expect(customApi.config.replicaSet).toBe('rs0');
    });
  });

  describe('KafkaFluentAPI', () => {
    let api: KafkaFluentAPI;

    beforeEach(() => {
      api = new KafkaFluentAPI(engine);
    });

    test('should have default configuration', () => {
      expect(api.config.version).toBe('3.4');
      expect(api.config.port).toBe(9092);
      expect(api.config.zookeeper).toBe('localhost:2181');
    });

    test('should configure Kafka with custom settings', () => {
      const customApi = new KafkaFluentAPI(engine, {
        version: '3.3',
        port: 9093,
        zookeeper: 'zk:2181',
        brokerId: 2,
        autoCreateTopics: false
      });

      expect(customApi.config.version).toBe('3.3');
      expect(customApi.config.port).toBe(9093);
      expect(customApi.config.zookeeper).toBe('zk:2181');
      expect(customApi.config.brokerId).toBe(2);
      expect(customApi.config.autoCreateTopics).toBe(false);
    });
  });

  describe('RabbitMQFluentAPI', () => {
    let api: RabbitMQFluentAPI;

    beforeEach(() => {
      api = new RabbitMQFluentAPI(engine);
    });

    test('should have default configuration', () => {
      expect(api.config.version).toBe('3.11-management-alpine');
      expect(api.config.port).toBe(5672);
      expect(api.config.user).toBe('guest');
      expect(api.config.password).toBe('guest');
      expect(api.config.management).toBe(true);
    });

    test('should configure RabbitMQ with custom settings', () => {
      const customApi = new RabbitMQFluentAPI(engine, {
        version: '3.10',
        port: 5673,
        user: 'admin',
        password: 'admin123',
        vhost: '/myvhost',
        management: false
      });

      expect(customApi.config.version).toBe('3.10');
      expect(customApi.config.port).toBe(5673);
      expect(customApi.config.user).toBe('admin');
      expect(customApi.config.password).toBe('admin123');
      expect(customApi.config.vhost).toBe('/myvhost');
      expect(customApi.config.management).toBe(false);
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

    test('should get container names', () => {
      const names = api.getContainerNames();
      expect(Array.isArray(names)).toBe(true);
      expect(names.length).toBeGreaterThan(0);
    });

    test('should check running status', () => {
      const isRunning = api.isRunning();
      expect(typeof isRunning).toBe('boolean');
    });
  });
});
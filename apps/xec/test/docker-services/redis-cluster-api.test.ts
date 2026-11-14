
import { ExecutionEngine } from '@xec-sh/core';

import { RedisClusterFluentAPI } from '../../src/docker-services/index.js';

describe('Docker Redis Cluster API', () => {
  let engine: ExecutionEngine;

  beforeEach(() => {
    engine = new ExecutionEngine();
  });

  afterEach(async () => {
    await engine.dispose();
  });

  test('should validate minimum master nodes requirement', () => {
    expect(() => {
      new RedisClusterFluentAPI(engine, {
        cluster: { enabled: true, masters: 2, replicas: 0 }
      });
    }).toThrow('Redis cluster requires at least 3 master nodes');
  });

  test('should validate minimum total nodes requirement', () => {
    expect(() => {
      new RedisClusterFluentAPI(engine, {
        cluster: { enabled: true, masters: 1, replicas: 1 }
      });
    }).toThrow('Redis cluster requires at least 3 master nodes');
  });

  test('should accept valid configuration', async () => {
    const cluster = new RedisClusterFluentAPI(engine, {
      cluster: { enabled: true, masters: 3, replicas: 1 }
    });

    expect(cluster).toBeDefined();
    expect(cluster.getContainerNames()).toHaveLength(0); // Not started yet
    expect(await cluster.isRunning()).toBe(false);
  });

  test('should use default values', async () => {
    const cluster = new RedisClusterFluentAPI(engine);

    // Check that defaults are applied
    expect(cluster).toBeDefined();
    expect(await cluster.isRunning()).toBe(false);

    // The cluster should have default configuration (3 masters, 1 replica = 6 nodes)
    // We can't check connection string until container names are generated
  });

  test('should initialize with custom prefix', () => {
    const cluster = new RedisClusterFluentAPI(engine, {
      cluster: { enabled: true, masters: 3, replicas: 0 },
      port: 9000,
      name: 'test-redis'
    });

    // Initially no containers until started
    expect(cluster.getContainerNames()).toHaveLength(0);
  });

  test('should handle custom configuration', () => {
    const cluster = new RedisClusterFluentAPI(engine, {
      cluster: { enabled: true, masters: 5, replicas: 2 },
      port: 8000,
      name: 'custom-redis',
      network: 'custom-net',
      persistent: true,
      dataPath: '/custom/path'
    });

    expect(cluster).toBeDefined();

    // Initially no containers until started
    // With 5 masters and 2 replicas each, there would be 15 total nodes when started
    expect(cluster.getContainerNames()).toHaveLength(0);
  });

  test('should throw when cluster is not running', async () => {
    const cluster = new RedisClusterFluentAPI(engine, {
      cluster: { enabled: true, masters: 3, replicas: 0 }
    });

    await expect(cluster.exec('GET key')).rejects.toThrow('Redis cluster is not running');
    await expect(cluster.getClusterInfo()).rejects.toThrow('Redis cluster is not running');
    await expect(cluster.getClusterNodes()).rejects.toThrow('Redis cluster is not running');
  });

  test('should handle stop when not running', async () => {
    const cluster = new RedisClusterFluentAPI(engine, {
      cluster: { enabled: true, masters: 3, replicas: 0 }
    });

    // Should not throw
    await cluster.stop();
    expect(await cluster.isRunning()).toBe(false);
  });
});

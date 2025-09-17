import { test, expect, describe } from '@jest/globals';

import { ExecutionEngine } from '../../../src/core/execution-engine.js';
import { DockerRedisClusterAPI } from '../../../src/adapters/docker/docker-fluent-api.js';

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
      new DockerRedisClusterAPI(engine, {
        masters: 2, // Less than minimum
        replicas: 0
      });
    }).toThrow('Redis cluster requires at least 3 master nodes');
  });

  test('should validate minimum total nodes requirement', () => {
    expect(() => {
      new DockerRedisClusterAPI(engine, {
        masters: 1,
        replicas: 1 // Total = 2, less than minimum
      });
    }).toThrow('Redis cluster requires at least 3 master nodes');
  });

  test('should accept valid configuration', () => {
    const cluster = new DockerRedisClusterAPI(engine, {
      masters: 3,
      replicas: 1
    });

    expect(cluster).toBeDefined();
    expect(cluster.getContainerNames()).toHaveLength(0); // Not started yet
    expect(cluster.isRunning()).toBe(false);
  });

  test('should use default values', () => {
    const cluster = new DockerRedisClusterAPI(engine);

    // Check that defaults are applied
    expect(cluster).toBeDefined();
    expect(cluster.isRunning()).toBe(false);

    // The cluster should have default configuration (3 masters, 1 replica = 6 nodes)
    // We can't check connection string until container names are generated
  });

  test('should generate correct container names', () => {
    const cluster = new DockerRedisClusterAPI(engine, {
      masters: 3,
      replicas: 0,
      basePort: 9000,
      containerPrefix: 'test-redis'
    }) as any; // Cast to any to access private methods

    // Call private method to generate names
    const names = cluster.generateContainerNames();
    expect(names).toEqual(['test-redis-1', 'test-redis-2', 'test-redis-3']);
  });

  test('should handle custom configuration', () => {
    const cluster = new DockerRedisClusterAPI(engine, {
      masters: 5,
      replicas: 2,
      basePort: 8000,
      containerPrefix: 'custom-redis',
      network: 'custom-net',
      nodeTimeout: 10000,
      persistent: true,
      dataPath: '/custom/path'
    }) as any;

    expect(cluster).toBeDefined();

    // Check that configuration is stored correctly
    expect(cluster.options.masters).toBe(5);
    expect(cluster.options.replicas).toBe(2);
    expect(cluster.options.basePort).toBe(8000);
    expect(cluster.options.containerPrefix).toBe('custom-redis');

    // 5 masters * 3 (1 + 2 replicas) = 15 total nodes
    const names = cluster.generateContainerNames();
    expect(names).toHaveLength(15);
    expect(names[0]).toBe('custom-redis-1');
    expect(names[14]).toBe('custom-redis-15');
  });

  test('should throw when cluster is not running', async () => {
    const cluster = new DockerRedisClusterAPI(engine, {
      masters: 3,
      replicas: 0
    });

    await expect(cluster.exec('GET key')).rejects.toThrow('Redis cluster is not running');
    await expect(cluster.info()).rejects.toThrow('Redis cluster is not running');
    await expect(cluster.nodes()).rejects.toThrow('Redis cluster is not running');
  });

  test('should handle stop when not running', async () => {
    const cluster = new DockerRedisClusterAPI(engine, {
      masters: 3,
      replicas: 0
    });

    // Should not throw
    await cluster.stop();
    expect(cluster.isRunning()).toBe(false);
  });
});
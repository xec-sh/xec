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

  test('should accept valid configuration', async () => {
    const cluster = new DockerRedisClusterAPI(engine, {
      masters: 3,
      replicas: 1
    });

    expect(cluster).toBeDefined();
    expect(cluster.getContainerNames()).toHaveLength(0); // Not started yet
    expect(await cluster.isRunning()).toBe(false);
  });

  test('should use default values', async () => {
    const cluster = new DockerRedisClusterAPI(engine);

    // Check that defaults are applied
    expect(cluster).toBeDefined();
    expect(await cluster.isRunning()).toBe(false);

    // The cluster should have default configuration (3 masters, 1 replica = 6 nodes)
    // We can't check connection string until container names are generated
  });

  test('should initialize with custom prefix', () => {
    const cluster = new DockerRedisClusterAPI(engine, {
      masters: 3,
      replicas: 0,
      basePort: 9000,
      containerPrefix: 'test-redis'
    });

    // Initially no containers until started
    expect(cluster.getContainerNames()).toHaveLength(0);
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
    });

    expect(cluster).toBeDefined();

    // Initially no containers until started
    // With 5 masters and 2 replicas each, there would be 15 total nodes when started
    expect(cluster.getContainerNames()).toHaveLength(0);
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
    expect(await cluster.isRunning()).toBe(false);
  });
});
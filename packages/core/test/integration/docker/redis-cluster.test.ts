import { test, expect, describe, afterAll, beforeAll } from '@jest/globals';

import { ExecutionEngine } from '../../../src/core/execution-engine.js';
import { DockerRedisClusterAPI } from '../../../src/adapters/docker/docker-fluent-api.js';

describe('Docker Redis Cluster', () => {
  let engine: ExecutionEngine;
  let cluster: DockerRedisClusterAPI;

  beforeAll(async () => {
    engine = new ExecutionEngine();

    // Check if Docker is available
    try {
      await engine.run`docker version`;
    } catch (error) {
      console.log('Docker not available, skipping Redis cluster tests');
      return;
    }
  });

  afterAll(async () => {
    // Clean up cluster if it exists
    if (cluster) {
      await cluster.remove();
    }
    await engine.dispose();
  });

  test('should create a minimal Redis cluster', async () => {
    // Check Docker availability
    try {
      await engine.run`docker version`;
    } catch {
      console.log('Skipping test - Docker not available');
      return;
    }

    cluster = engine.docker().redisCluster({
      masters: 3,
      replicas: 1,
      containerPrefix: 'test-redis-cluster'
    });

    // Start the cluster
    await cluster.start();

    expect(cluster.isRunning()).toBe(true);

    // Check that we have the expected number of containers
    const containerNames = cluster.getContainerNames();
    expect(containerNames).toHaveLength(6); // 3 masters + 3 replicas

    // Test cluster info
    const info = await cluster.info();
    expect(info).toContain('cluster_state:ok');

    // Test cluster nodes
    const nodes = await cluster.nodes();
    expect(nodes).toContain('master');
    expect(nodes).toContain('slave');

    // Test executing Redis commands
    const setResult = await cluster.exec('SET test-key "test-value"');
    expect(setResult.stdout).toContain('OK');

    const getResult = await cluster.exec('GET test-key');
    expect(getResult.stdout).toContain('test-value');

    // Stop the cluster
    await cluster.stop();
    expect(cluster.isRunning()).toBe(false);

    // Clean up
    await cluster.remove();
  }, 60000); // 60 second timeout for cluster setup

  test('should handle custom Redis configuration', async () => {
    // Check Docker availability
    try {
      await engine.run`docker version`;
    } catch {
      console.log('Skipping test - Docker not available');
      return;
    }

    cluster = engine.docker().redisCluster({
      masters: 3,
      replicas: 0, // No replicas for faster testing
      containerPrefix: 'test-redis-custom',
      basePort: 8001,
      redisConfig: {
        'maxmemory': '100mb',
        'maxmemory-policy': 'allkeys-lru'
      }
    });

    await cluster.start();

    // Verify custom configuration
    const configResult = await engine.run`docker exec test-redis-custom-1 redis-cli CONFIG GET maxmemory`;
    expect(configResult.stdout).toContain('100mb');

    const policyResult = await engine.run`docker exec test-redis-custom-1 redis-cli CONFIG GET maxmemory-policy`;
    expect(policyResult.stdout).toContain('allkeys-lru');

    await cluster.remove();
  }, 60000);

  test('should get connection string', async () => {
    // Check Docker availability
    try {
      await engine.run`docker version`;
    } catch {
      console.log('Skipping test - Docker not available');
      return;
    }

    cluster = engine.docker().redisCluster({
      masters: 3,
      replicas: 0,
      basePort: 9001,
      containerPrefix: 'test-redis-conn'
    });

    await cluster.start();

    const connectionString = cluster.getConnectionString();
    expect(connectionString).toBe('localhost:9001,localhost:9002,localhost:9003');

    await cluster.remove();
  }, 60000);

  test('should validate minimum nodes requirement', () => {
    expect(() => {
      engine.docker().redisCluster({
        masters: 2, // Less than minimum
        replicas: 0
      });
    }).toThrow('Redis cluster requires at least 3 master nodes');

    expect(() => {
      engine.docker().redisCluster({
        masters: 1,
        replicas: 1 // Total nodes = 2, less than minimum
      });
    }).toThrow('Redis cluster requires at least 3 master nodes');
  });
});
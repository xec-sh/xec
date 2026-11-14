import { createServer } from 'node:net';
import { ExecutionEngine } from '@xec-sh/core';
import { randomInt, randomUUID } from 'node:crypto';

import { RedisClusterFluentAPI } from '../../src/docker-services/index.js';

const skipDocker = process.env['SKIP_DOCKER_TESTS'] === 'true' || process.env['CI'] === 'true';
const describeDocker = skipDocker ? describe.skip : describe;

describeDocker('Docker Redis Cluster', () => {
  const runId = `xec-redis-fixture-${randomUUID().slice(0, 8)}`;
  let engine: ExecutionEngine;
  let cluster: RedisClusterFluentAPI | undefined;
  let sequence = 0;
  let basePort: number;

  beforeAll(async () => {
    engine = new ExecutionEngine();
    // Explicit opt-out above is allowed; an unavailable requested dependency is a failure.
    await engine.run`docker version`;
    // Reserve a complete free range before releasing it to Docker. A later
    // competing bind is a startup failure, never permission to stop its owner.
    for (let attempt = 0; attempt < 20; attempt++) {
      const port = randomInt(20000, 40000);
      const reservations = [];
      try {
        for (let offset = 0; offset < 6; offset++) {
          const server = createServer();
          await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(port + offset, '127.0.0.1', resolve);
          });
          reservations.push(server);
        }
        basePort = port;
        return;
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'EADDRINUSE') throw error;
      } finally {
        await Promise.all(reservations.map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))));
      }
    }
    throw new Error('No free six-port range is available for the isolated Redis test');
  });

  afterEach(async () => {
    if (cluster) {
      await cluster.remove();
      cluster = undefined;
    }
  });

  afterAll(async () => { await engine?.dispose(); });

  const create = (port: number, replicas = 0, config?: Record<string, string>) => {
    const name = `${runId}-${sequence++}`;
    cluster = new RedisClusterFluentAPI(engine, {
      name, network: `${name}-net`, port, config: { maxmemory: '32mb', ...config },
      cluster: { enabled: true, masters: 3, replicas },
    });
    return cluster;
  };

  test('creates a usable cluster and stops all owned nodes', async () => {
    const active = create(basePort, 1);
    await active.start();
    expect(await active.isRunning()).toBe(true);
    expect(active.getContainerNames()).toHaveLength(6);
    expect(await active.getClusterInfo()).toContain('cluster_state:ok');
    const roles = (await active.getClusterNodes()).map(node => node.role);
    expect(roles).toContain('master');
    expect(roles).toContain('replica');
    expect((await active.exec('SET test-key "test-value"')).stdout).toContain('OK');
    expect((await active.exec('GET test-key')).stdout).toContain('test-value');
    const identities = (await active.status()).containers.map(container => container.id);
    await active.restart();
    expect((await active.status()).containers.map(container => container.id)).toEqual(identities);
    expect((await active.exec('GET test-key')).stdout).toContain('test-value');
    await active.stop();
    expect(await active.isRunning()).toBe(false);
  }, 120_000);

  test('honors custom Redis settings on its own nodes', async () => {
    const active = create(basePort, 0, { maxmemory: '100mb', 'maxmemory-policy': 'allkeys-lru' });
    await active.start();
    expect((await active.exec('CONFIG GET maxmemory')).stdout).toContain('104857600');
    expect((await active.exec('CONFIG GET maxmemory-policy')).stdout).toContain('allkeys-lru');
  }, 120_000);

  test('reports its configured connection endpoints', async () => {
    const active = create(basePort);
    await active.start();
    expect(active.getConnectionString()).toBe([basePort, basePort + 1, basePort + 2].map(port => `localhost:${port}`).join(','));
  }, 120_000);
});

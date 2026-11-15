import type { SSHConnectionConfig } from '../src/contracts.js';

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm, mkdtemp, writeFile } from 'node:fs/promises';
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { SSHError } from '../src/errors.js';
import { SSHClient } from '../src/client.js';
import { SSHConnectionPool } from '../src/connection-pool.js';

const target: SSHConnectionConfig = { host: 'one.invalid', username: 'operator', password: 'fixture' };
const pools: SSHConnectionPool[] = [];
const directories: string[] = [];
let connected: WeakSet<SSHClient>;
let clients: SSHClient[];
let opened: SSHConnectionConfig[];
let destroyed: Set<SSHClient>;
beforeEach(() => {
  connected = new WeakSet();
  clients = [];
  opened = [];
  destroyed = new Set();
  vi.spyOn(SSHClient.prototype, 'connect').mockImplementation(async function (this: SSHClient, config) {
    clients.push(this);
    opened.push(config);
    connected.add(this);
    return this;
  });
  vi.spyOn(SSHClient.prototype, 'isConnected').mockImplementation(function (this: SSHClient) {
    return connected.has(this);
  });
  vi.spyOn(SSHClient.prototype, 'dispose').mockImplementation(function (this: SSHClient) {
    connected.delete(this);
    destroyed.add(this);
  });
  vi.spyOn(SSHClient.prototype, 'revalidateTrust').mockResolvedValue();
});
afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.dispose()));
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  vi.restoreAllMocks();
});
function pool(
  options: ConstructorParameters<typeof SSHConnectionPool>[0] = {},
  onEvent?: ConstructorParameters<typeof SSHConnectionPool>[2]
) {
  const value = new SSHConnectionPool({ reconnectDelay: 0, ...options }, {}, onEvent);
  pools.push(value);
  return value;
}
function pendingConnection() {
  let ready!: () => void;
  vi.mocked(SSHClient.prototype.connect).mockImplementationOnce(function (this: SSHClient, config) {
    clients.push(this);
    opened.push(config);
    return new Promise((resolve, reject) => {
      const abort = () => reject(new SSHError('cancelled', 'ABORT_ERR'));
      config.signal?.addEventListener('abort', abort, { once: true });
      ready = () => {
        config.signal?.removeEventListener('abort', abort);
        connected.add(this);
        resolve(this);
      };
    });
  });
  return () => ready();
}

describe('owned SSH pool admission and leases', () => {
  it('shares one authenticated client and independently pins concurrent leases', async () => {
    const value = pool({ maxConnections: 1 });
    const [first, second] = await Promise.all([value.acquire(target), value.acquire({ ...target })]);
    expect(first.client).toBe(second.client);
    expect(clients).toHaveLength(1);
    first.release();
    first.release();
    expect(value.getMetrics()).toMatchObject({ activeConnections: 1, reuseCount: 1 });
    second.release();
    expect(value.getMetrics()).toMatchObject({ activeConnections: 0, idleConnections: 1 });
    expect(SSHClient.prototype.revalidateTrust).toHaveBeenCalledOnce();
    expect(opened[0]).toMatchObject({ hostKeyChecking: 'strict', keepaliveInterval: 30000, keepaliveCountMax: 3 });
  });
  it('counts a pending handshake and never evicts an active connection', async () => {
    const value = pool({ maxConnections: 1 });
    const ready = pendingConnection();
    const first = value.acquire(target);
    await vi.waitFor(() => expect(clients).toHaveLength(1));
    await expect(value.acquire({ ...target, host: 'two.invalid' })).rejects.toMatchObject({ code: 'ENOBUFS' });
    ready();
    const lease = await first;
    await expect(value.acquire({ ...target, host: 'two.invalid' })).rejects.toMatchObject({ code: 'ENOBUFS' });
    expect(destroyed.size).toBe(0);
    lease.release();
    const next = await value.acquire({ ...target, host: 'two.invalid' });
    expect(destroyed.has(lease.client)).toBe(true);
    next.release();
  });
  it('cancels a queued borrower without waiting for another handshake or aborting it', async () => {
    const value = pool();
    const ready = pendingConnection();
    const first = value.acquire(target);
    await vi.waitFor(() => expect(clients).toHaveLength(1));
    const controller = new AbortController();
    const queued = value.acquire(target, { signal: controller.signal });
    controller.abort();
    await expect(queued).rejects.toMatchObject({ code: 'ABORT_ERR' });
    expect(destroyed.size).toBe(0);
    ready();
    (await first).release();
    (await value.acquire(target)).release();
    expect(clients).toHaveLength(1);
  });
  it('aborts pending handshakes during disposal and prevents resurrection', async () => {
    const value = pool();
    pendingConnection();
    const first = expect(value.acquire(target)).rejects.toMatchObject({ code: 'ABORT_ERR' });
    await vi.waitFor(() => expect(clients).toHaveLength(1));
    await value.dispose();
    await first;
    expect(destroyed.size).toBe(1);
    expect(value.getMetrics().totalConnections).toBe(0);
    await expect(value.acquire(target)).rejects.toMatchObject({ code: 'ESHUTDOWN' });
  });
  it('closes an unpooled lease on release and never makes it reusable', async () => {
    const value = pool({ enabled: false });
    const first = await value.acquire(target);
    first.release();
    expect(destroyed.has(first.client)).toBe(true);
    const second = await value.acquire(target);
    expect(second.client).not.toBe(first.client);
    second.release();
    expect(value.getMetrics().totalConnections).toBe(0);
  });
  it('retires a rejected trust identity without retrying or interrupting its active lease', async () => {
    const value = pool();
    const first = await value.acquire(target);
    vi.mocked(SSHClient.prototype.revalidateTrust).mockRejectedValueOnce(new SSHError('revoked', 'EHOSTKEY'));
    await expect(value.acquire(target)).rejects.toMatchObject({ code: 'EHOSTKEY' });
    expect(destroyed.size).toBe(0);
    expect(clients).toHaveLength(1);
    await expect(value.acquire(target)).rejects.toMatchObject({ code: 'ENOBUFS' });
    first.release();
    expect(destroyed.has(first.client)).toBe(true);
    expect(value.getMetrics().totalConnections).toBe(0);
  });
  it('cancels revalidation for one borrower without retiring a healthy shared connection', async () => {
    const value = pool();
    const active = await value.acquire(target);
    vi.mocked(SSHClient.prototype.revalidateTrust).mockImplementationOnce(
      (options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new SSHError('cancelled', 'ABORT_ERR')), {
            once: true,
          });
        })
    );
    const controller = new AbortController();
    const rejected = expect(value.acquire(target, { signal: controller.signal })).rejects.toMatchObject({
      code: 'ABORT_ERR',
    });
    await vi.waitFor(() => expect(SSHClient.prototype.revalidateTrust).toHaveBeenCalledOnce());
    controller.abort();
    await rejected;
    const next = await value.acquire(target);
    expect(next.client).toBe(active.client);
    expect(destroyed.size).toBe(0);
    next.release();
    active.release();
  });
  it('retires repeated failed leases only after the last operation completes', async () => {
    const value = pool();
    const active = await value.acquire(target);
    for (let i = 0; i < 4; i++) {
      const lease = await value.acquire(target);
      lease.markFailed();
      lease.markFailed();
      lease.release();
    }
    expect(destroyed.size).toBe(0);
    await expect(value.acquire(target)).rejects.toThrow('retiring');
    active.release();
    expect(destroyed.has(active.client)).toBe(true);
  });
  it('retries only explicitly classified pre-dispatch transport errors and honors the limit', async () => {
    const value = pool({ maxReconnectAttempts: 2 });
    vi.mocked(SSHClient.prototype.connect).mockRejectedValue(new SSHError('reset', 'ECONNRESET'));
    await expect(value.acquire(target)).rejects.toMatchObject({ code: 'ECONNRESET' });
    expect(SSHClient.prototype.connect).toHaveBeenCalledTimes(3);
    expect(value.getMetrics()).toMatchObject({ totalConnections: 0, connectionsFailed: 3 });
  });
  it.each(['EHOSTKEY', 'EAUTH', 'ABORT_ERR'])('does not retry %s', async (code) => {
    const value = pool();
    vi.mocked(SSHClient.prototype.connect).mockRejectedValue(new SSHError('rejected', code));
    await expect(value.acquire(target)).rejects.toMatchObject({ code });
    expect(SSHClient.prototype.connect).toHaveBeenCalledOnce();
  });
  it('disposal cancels a long reconnect delay without opening another client', async () => {
    const value = pool({ reconnectDelay: 60000 });
    vi.mocked(SSHClient.prototype.connect).mockRejectedValue(new SSHError('reset', 'ECONNRESET'));
    const rejected = expect(value.acquire(target)).rejects.toMatchObject({ code: 'ABORT_ERR' });
    await vi.waitFor(() => expect(SSHClient.prototype.connect).toHaveBeenCalledOnce());
    await value.dispose();
    await rejected;
    expect(SSHClient.prototype.connect).toHaveBeenCalledOnce();
  });
  it('does not lend a client which closed immediately after authentication', async () => {
    const value = pool({ autoReconnect: false });
    vi.mocked(SSHClient.prototype.isConnected).mockReturnValue(false);
    await expect(value.acquire(target)).rejects.toMatchObject({ code: 'ECONNRESET' });
    expect(value.getMetrics().totalConnections).toBe(0);
    expect(destroyed.size).toBe(1);
  });
  it('keys leases by authentication and verification policy, ignoring only cancellation', async () => {
    const value = pool();
    const verifier = () => true;
    const first = await value.acquire({ ...target, hostVerifier: verifier });
    first.release();
    const same = await value.acquire({ ...target, hostVerifier: verifier, signal: new AbortController().signal });
    same.release();
    expect(same.client).toBe(first.client);
    for (const changed of [
      { password: 'changed' },
      { hostVerifier: () => true },
      { expectedHostFingerprint: 'changed' },
      { algorithms: { cipher: ['aes128-gcm@openssh.com' as const] } },
    ]) {
      const next = await value.acquire({ ...target, ...changed });
      expect(next.client).not.toBe(first.client);
      next.release();
    }
  });
  it('binds key-file authentication and identity to exactly the bytes read on each acquisition', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'xec-pool-key-'));
    directories.push(dir);
    const path = join(dir, 'key');
    await writeFile(path, 'synthetic-first');
    const value = new SSHConnectionPool({}, { privateKey: 'inherited-key' });
    pools.push(value);
    const config = { ...target, password: undefined, privateKeyPath: path };
    const first = await value.acquire(config);
    first.release();
    expect(opened[0]?.privateKey).toEqual(Buffer.from('synthetic-first'));
    expect(opened[0]?.privateKeyPath).toBeUndefined();
    await writeFile(path, 'synthetic-next');
    const second = await value.acquire(config);
    second.release();
    expect(second.client).not.toBe(first.client);
    expect(opened[1]?.privateKey).toEqual(Buffer.from('synthetic-next'));
    await writeFile(path, Buffer.alloc(1024 * 1024 + 1));
    await expect(value.acquire(config)).rejects.toThrow();
    expect(clients).toHaveLength(2);
  });
  it('releases its own admission if an observer throws and allows the next operation', async () => {
    const observer = vi.fn().mockImplementationOnce(() => {
      throw new Error('sink failed');
    });
    const value = pool({}, observer);
    await expect(value.acquire(target)).rejects.toMatchObject({ code: 'SSH_OBSERVER_ERROR' });
    expect(value.getMetrics().totalConnections).toBe(0);
    expect(destroyed.size).toBe(1);
    (await value.acquire(target)).release();
    expect(clients).toHaveLength(2);
  });
  it('does not leak a reused pin when the metrics observer rejects admission', async () => {
    let rejectMetrics = false;
    const value = pool({}, (event) => {
      if (rejectMetrics && event.type === 'metrics') throw new Error('sink failed');
    });
    (await value.acquire(target)).release();
    rejectMetrics = true;
    await expect(value.acquire(target)).rejects.toMatchObject({ code: 'SSH_OBSERVER_ERROR' });
    expect(value.getMetrics().activeConnections).toBe(0);
    rejectMetrics = false;
    (await value.acquire(target)).release();
    expect(clients).toHaveLength(1);
  });
  it('rejects invalid capacity and deadlines before a transport is opened', () => {
    for (const options of [
      { maxConnections: 0 },
      { idleTimeout: -1 },
      { maxLifetime: NaN },
      { maxReconnectAttempts: 1.5 },
      { keepAliveInterval: 2_147_483_648 },
      { reconnectDelay: 2_147_483_648 },
      { keepAliveInterval: Infinity },
      { reconnectDelay: 0.5 },
    ]) {
      expect(() => pool(options)).toThrow();
    }
    expect(clients).toHaveLength(0);
  });
  it('accepts disabled and maximum native delays without shortening elapsed-age limits', () => {
    const disabled = pool({ keepAliveInterval: 0, reconnectDelay: 0 });
    const maximum = pool({
      keepAliveInterval: 2_147_483_647,
      reconnectDelay: 2_147_483_647,
      idleTimeout: 2_147_483_648,
      maxLifetime: 2_147_483_648,
    });
    expect(disabled.options).toMatchObject({ keepAliveInterval: 0, reconnectDelay: 0 });
    expect(maximum.options).toMatchObject({
      keepAliveInterval: 2_147_483_647,
      reconnectDelay: 2_147_483_647,
      idleTimeout: 2_147_483_648,
      maxLifetime: 2_147_483_648,
    });
    expect(clients).toHaveLength(0);
  });
});

describe('SSH tunnel ownership', () => {
  function tunnelFixture() {
    let closed!: () => void;
    const completion = new Promise<void>((resolve) => {
      closed = resolve;
    });
    const close = vi.fn(async () => {
      closed();
    });
    return {
      localPort: 3000,
      localHost: '127.0.0.1',
      remoteHost: 'localhost',
      remotePort: 80,
      closed: completion,
      close,
    };
  }
  it('pins a forwarding lease until its listener closes, then releases it once', async () => {
    const value = pool();
    const listener = tunnelFixture();
    vi.spyOn(SSHClient.prototype, 'createTunnel').mockResolvedValue(listener);
    const tunnel = await value.tunnel({ remoteHost: 'localhost', remotePort: 80 }, target);
    expect(tunnel.isOpen).toBe(true);
    expect(value.getMetrics().activeConnections).toBe(1);
    expect(tunnel).not.toHaveProperty('open');
    await Promise.all([tunnel.close(), tunnel.close()]);
    expect(listener.close).toHaveBeenCalledOnce();
    expect(tunnel.isOpen).toBe(false);
    expect(value.getMetrics().activeConnections).toBe(0);
  });
  it('tracks unpooled reverse listeners until disposal', async () => {
    const value = pool({ enabled: false });
    const listener = tunnelFixture();
    vi.spyOn(SSHClient.prototype, 'forwardIn').mockResolvedValue({
      port: 4000,
      closed: listener.closed,
      dispose: listener.close,
    });
    const tunnel = await value.reverseTunnel({ remotePort: 0, localPort: 3000 }, target);
    expect(tunnel.remotePort).toBe(4000);
    expect(value.getMetrics().activeConnections).toBe(1);
    await value.dispose();
    await tunnel.closed;
    expect(listener.close).toHaveBeenCalledOnce();
    expect(tunnel.isOpen).toBe(false);
    expect(destroyed.size).toBe(1);
  });
  it('uses an exclusive reverse connection so an uncertain allocation cannot kill another lease', async () => {
    const value = pool();
    const first = await value.acquire(target);
    vi.spyOn(SSHClient.prototype, 'forwardIn').mockRejectedValue(new SSHError('uncertain', 'SSH_OUTCOME_UNKNOWN'));
    await expect(value.reverseTunnel({ remotePort: 0, localPort: 3000 }, target)).rejects.toMatchObject({
      code: 'SSH_OUTCOME_UNKNOWN',
    });
    expect(clients).toHaveLength(2);
    expect(destroyed.has(first.client)).toBe(false);
    expect(value.getMetrics().activeConnections).toBe(1);
    first.release();
  });
  it('surfaces listener cleanup failure and still disposes every owned transport', async () => {
    const value = pool();
    const listener = tunnelFixture();
    listener.close.mockRejectedValueOnce(new Error('close failed'));
    vi.spyOn(SSHClient.prototype, 'createTunnel').mockResolvedValue(listener);
    await value.tunnel({ remoteHost: 'localhost', remotePort: 80 }, target);
    await expect(value.dispose()).rejects.toThrow('cleanup or observation failed');
    expect(destroyed.size).toBe(1);
    expect(value.getMetrics().totalConnections).toBe(0);
    pools.splice(pools.indexOf(value), 1);
    await listener.close();
  });
});

import { SSHClient } from '@xec-sh/ssh';
import { PassThrough } from 'node:stream';
import { once, EventEmitter } from 'node:events';
import { type Socket, createConnection } from 'node:net';
import { it, vi, expect, describe, afterEach } from 'vitest';

import { SSHAdapter } from '../../../src/adapters/ssh/index.js';

const cleanup: Array<() => Promise<unknown> | void> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.useRealTimers(); vi.restoreAllMocks(); });

function fakeTransport() {
  const ssh = new SSHClient();
  const connection = new EventEmitter() as any;
  connection.forwardOut = vi.fn();
  connection.end = vi.fn(); connection.destroy = vi.fn();
  (ssh as unknown as { transport: unknown }).transport = connection;
  return { ssh, connection };
}
async function client(port: number): Promise<Socket> {
  const socket = createConnection({ host: '127.0.0.1', port, allowHalfOpen: true });
  socket.on('error', () => {});
  cleanup.push(() => { socket.destroy(); });
  await once(socket, 'connect');
  return socket;
}

describe('local forward ownership', () => {
  it('closes active sockets even when the client never finishes a graceful close', async () => {
    const { ssh, connection } = fakeTransport();
    const channel = new PassThrough() as any;
    connection.forwardOut.mockImplementation((...args: any[]) => args.at(-1)(undefined, channel));
    const tunnel = await ssh.createTunnel({ remoteHost: '127.0.0.1', remotePort: 9700 });
    cleanup.push(() => tunnel.close());
    await client(tunnel.localPort);
    await vi.waitFor(() => expect(connection.forwardOut).toHaveBeenCalledOnce());
    await tunnel.close(); await tunnel.closed; await tunnel.close();
    expect(channel.destroyed).toBe(true);
    expect(connection.listenerCount('close')).toBe(0);
    expect(connection.listenerCount('error')).toBe(0);
    const probe = createConnection({ host: '127.0.0.1', port: tunnel.localPort });
    const [error] = await once(probe, 'error');
    expect((error as NodeJS.ErrnoException).code).toBe('ECONNREFUSED');
  }, 3000);

  it('cancels an unfinished channel request and destroys a late channel after closure', async () => {
    const { ssh, connection } = fakeTransport();
    const tunnel = await ssh.createTunnel({ remoteHost: '127.0.0.1', remotePort: 9700 });
    cleanup.push(() => tunnel.close());
    await client(tunnel.localPort);
    await vi.waitFor(() => expect(connection.forwardOut).toHaveBeenCalledOnce());
    await tunnel.close();
    const late = new PassThrough();
    connection.forwardOut.mock.calls[0].at(-1)(undefined, late);
    expect(late.destroyed).toBe(true);
    expect(connection.listenerCount('close')).toBe(0);
  }, 3000);

  it('closes its listener and sockets when the SSH transport disappears', async () => {
    const { ssh, connection } = fakeTransport();
    const tunnel = await ssh.createTunnel({ remoteHost: '127.0.0.1', remotePort: 9700 });
    cleanup.push(() => tunnel.close());
    await client(tunnel.localPort);
    connection.emit('close');
    await tunnel.closed;
    expect(connection.listenerCount('close')).toBe(0);
  }, 3000);

  it('makes the public tunnel API bind a real owned local listener', async () => {
    const { connection } = fakeTransport();
    connection.forwardOut.mockImplementation((...args: any[]) => args.at(-1)(undefined, new PassThrough()));
    vi.spyOn(SSHClient.prototype, 'connect').mockImplementation(async function (this: SSHClient) {
      (this as unknown as { transport: unknown }).transport = connection; return this;
    });
    const adapter = new SSHAdapter(); cleanup.push(() => adapter.dispose());
    const handle = await adapter.tunnel({ localPort: 0, remoteHost: 'service.internal', remotePort: 1234 },
      { type: 'ssh', host: 'host.invalid', username: 'operator', password: 'fixture' });
    const socket = await client(handle.localPort);
    const reply = once(socket, 'data'); socket.write('roundtrip');
    expect((await reply)[0].toString()).toBe('roundtrip');
    expect(adapter.getConnectionPoolMetrics().activeConnections).toBe(1);
    await handle.close(); await handle.closed;
    expect(adapter.getConnectionPoolMetrics().activeConnections).toBe(0);
    expect(connection.forwardOut.mock.calls[0].slice(2, 4)).toEqual(['service.internal', 1234]);
  }, 3000);

  it('bounds a forward request and rejects it when the connection closes', async () => {
    const { ssh, connection } = fakeTransport();
    await expect(ssh.forwardOut('127.0.0.1', 1, '127.0.0.1', 9700, { timeoutMs: 10 })).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    const pending = ssh.forwardOut('127.0.0.1', 1, '127.0.0.1', 9700);
    connection.emit('close');
    await expect(pending).rejects.toMatchObject({ code: 'ECONNRESET' });
    expect(connection.listenerCount('error')).toBe(0);
  });
});

function pooled(maxLifetime: number, idleTimeout = 0) {
  vi.useFakeTimers();
  const adapter = new SSHAdapter({ connectionPool: { enabled: true, maxConnections: 5, idleTimeout, keepAlive: false, maxLifetime } });
  const { connection } = fakeTransport();
  vi.spyOn(SSHClient.prototype, 'connect').mockImplementation(async function (this: SSHClient) {
    (this as unknown as { transport: unknown }).transport = connection; return this;
  });
  vi.spyOn(SSHClient.prototype, 'revalidateTrust').mockResolvedValue();
  let finish!: () => void;
  const closed = new Promise<void>(resolve => { finish = resolve; });
  const tunnel = { localPort: 12345, localHost: '127.0.0.1', remoteHost: '127.0.0.1', remotePort: 9700, closed, close: vi.fn(async () => { finish(); }) };
  vi.spyOn(SSHClient.prototype, 'createTunnel').mockResolvedValue(tunnel);
  cleanup.push(() => adapter.dispose());
  return { adapter, connection, tunnel, finish };
}
const target = { type: 'ssh' as const, host: 'node.invalid', username: 'operator', password: 'fixture' };
const forward = { remoteHost: '127.0.0.1', remotePort: 9700 };

describe('pooled tunnel lifetime', () => {
  it('honors disabled maximum age across multiple hourly cleanup periods', async () => {
    const { adapter, connection } = pooled(0);
    const handle = await adapter.tunnel(forward, target); await handle.close();
    await vi.advanceTimersByTimeAsync(3 * 3600000);
    expect(connection.destroy).not.toHaveBeenCalled();
    expect(adapter.getConnectionPoolMetrics().idleConnections).toBe(1);
  });
  it('pins an active tunnel through age and idle cleanup, then releases it exactly once', async () => {
    const { adapter, connection, tunnel } = pooled(1000, 1000);
    const handle = await adapter.tunnel(forward, target);
    await vi.advanceTimersByTimeAsync(2 * 3600000);
    expect(connection.destroy).not.toHaveBeenCalled();
    await Promise.all([handle.close(), handle.close()]);
    expect(adapter.getConnectionPoolMetrics().activeConnections).toBe(0);
    expect(tunnel.close).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60000);
    expect(connection.destroy).toHaveBeenCalledOnce();
  });
  it('releases its lease if opening fails or the underlying tunnel closes', async () => {
    const { adapter, finish } = pooled(0);
    vi.mocked(SSHClient.prototype.createTunnel).mockRejectedValueOnce(new Error('forward refused'));
    await expect(adapter.tunnel(forward, target)).rejects.toThrow('forward refused');
    expect(adapter.getConnectionPoolMetrics().activeConnections).toBe(0);
    const handle = await adapter.tunnel(forward, target);
    expect(adapter.getConnectionPoolMetrics().activeConnections).toBe(1);
    finish(); await handle.closed;
    expect(handle.isOpen).toBe(false);
    expect(adapter.getConnectionPoolMetrics().activeConnections).toBe(0);
  });
  it('retains its lease when local closure fails and releases only after retry', async () => {
    const { adapter, tunnel } = pooled(0);
    tunnel.close.mockRejectedValueOnce(new Error('listener still open'));
    const handle = await adapter.tunnel(forward, target);
    await expect(handle.close()).rejects.toThrow('listener still open');
    expect(handle.isOpen).toBe(true);
    expect(adapter.getConnectionPoolMetrics().activeConnections).toBe(1);
    await handle.close(); await handle.closed;
    expect(handle.isOpen).toBe(false);
    expect(adapter.getConnectionPoolMetrics().activeConnections).toBe(0);
  });
});

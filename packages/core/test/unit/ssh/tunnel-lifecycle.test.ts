import { PassThrough } from 'node:stream';
import { once, EventEmitter } from 'node:events';
import { type Socket, createConnection } from 'node:net';
import { it, vi, expect, describe, afterEach } from 'vitest';

import { NodeSSH } from '../../../src/adapters/ssh/ssh.js';
import { SSHAdapter } from '../../../src/adapters/ssh/index.js';

const cleanup: Array<() => Promise<unknown> | void> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.useRealTimers(); });

function fakeTransport() {
  const ssh = new NodeSSH();
  const connection = new EventEmitter() as any;
  connection.forwardOut = vi.fn();
  connection.end = vi.fn(); connection.destroy = vi.fn();
  ssh.connection = connection;
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

  it('bounds a forward request and rejects it when the connection closes', async () => {
    const { ssh, connection } = fakeTransport();
    await expect(ssh.forwardOut('127.0.0.1', 1, '127.0.0.1', 9700, { timeoutMs: 10 })).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    const pending = ssh.forwardOut('127.0.0.1', 1, '127.0.0.1', 9700);
    connection.emit('close');
    await expect(pending).rejects.toMatchObject({ code: 'ECONNRESET' });
    expect(connection.listenerCount('error')).toBe(0);
  });
});

function pooled(maxLifetime: number) {
  vi.useFakeTimers();
  const adapter = new SSHAdapter({ connectionPool: { enabled: true, maxConnections: 5, idleTimeout: Number.MAX_SAFE_INTEGER, keepAlive: false, maxLifetime } }) as any;
  let finish!: () => void;
  const closed = new Promise<void>(resolve => { finish = resolve; });
  const tunnel = { localPort: 12345, localHost: '127.0.0.1', remoteHost: '127.0.0.1', remotePort: 9700, closed, close: vi.fn(async () => { finish(); }) };
  const connection = { created: Date.now(), lastUsed: Date.now(), activeUseCount: 0, useCount: 1, errors: 0, ssh: { isConnected: () => true, dispose: vi.fn(async () => {}), createTunnel: vi.fn(async () => tunnel) } };
  adapter.connectionPool.set('target', connection);
  vi.spyOn(adapter, 'getConnection').mockResolvedValue(connection);
  cleanup.push(() => adapter.dispose());
  return { adapter, connection, tunnel, finish };
}
const target = { type: 'ssh' as const, host: 'node.invalid', username: 'operator' };
const forward = { remoteHost: '127.0.0.1', remotePort: 9700 };

describe('pooled tunnel lifetime', () => {
  it('honors disabled maximum age across multiple hourly cleanup periods', async () => {
    const { connection } = pooled(0);
    await vi.advanceTimersByTimeAsync(3 * 3600000);
    expect(connection.ssh.dispose).not.toHaveBeenCalled();
  });
  it('pins an active tunnel through age and idle cleanup, then releases it exactly once', async () => {
    const { adapter, connection, tunnel } = pooled(1000);
    adapter.sshConfig.connectionPool.idleTimeout = 1000;
    const handle = await adapter.tunnel(forward, target);
    expect(adapter.getConnection).toHaveBeenCalledWith(target);
    await vi.advanceTimersByTimeAsync(2 * 3600000);
    expect(connection.ssh.dispose).not.toHaveBeenCalled();
    expect(await adapter.getExistingConnection('target', target)).toBe(connection);
    await Promise.all([handle.close(), handle.close()]);
    expect(connection.activeUseCount).toBe(0);
    expect(tunnel.close).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60000);
    expect(connection.ssh.dispose).toHaveBeenCalledOnce();
  });
  it('releases its lease if opening fails or the underlying tunnel closes', async () => {
    const { adapter, connection, finish } = pooled(0);
    connection.ssh.createTunnel.mockRejectedValueOnce(new Error('forward refused'));
    await expect(adapter.tunnel(forward, target)).rejects.toThrow('forward refused');
    expect(connection.activeUseCount).toBe(0);
    const handle = await adapter.tunnel(forward, target);
    expect(connection.activeUseCount).toBe(1);
    finish(); await handle.closed;
    expect(handle.isOpen).toBe(false);
    expect(connection.activeUseCount).toBe(0);
    expect(adapter.activeTunnels.size).toBe(0);
  });
});

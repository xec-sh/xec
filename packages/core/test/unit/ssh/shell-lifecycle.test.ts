import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import { NodeSSH } from '../../../src/adapters/ssh/ssh.js';
import { SSHAdapter } from '../../../src/adapters/ssh/index.js';

function pendingShell() {
  const ssh = new NodeSSH();
  const connection = new EventEmitter() as any;
  connection.shell = vi.fn();
  connection.end = vi.fn(); connection.destroy = vi.fn();
  ssh.connection = connection;
  return { ssh, connection };
}

describe('existing NodeSSH shell lifecycle', () => {
  it('rejects on connection close and removes temporary listeners', async () => {
    const { ssh, connection } = pendingShell();
    const waiting = ssh.requestShell({ cols: 80, rows: 24 });
    connection.emit('close');
    await expect(waiting).rejects.toMatchObject({ code: 'ECONNRESET' });
    expect(connection.listenerCount('error')).toBe(0);
    expect(connection.listenerCount('close')).toBe(0);
  });
  it('times out a refused-to-answer shell and destroys a late channel', async () => {
    const { ssh, connection } = pendingShell();
    await expect(ssh.requestShell({}, { timeoutMs: 10 })).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    const channel = { destroy: vi.fn() };
    connection.shell.mock.calls[0][1](undefined, channel);
    expect(channel.destroy).toHaveBeenCalledTimes(1);
    expect(connection.listenerCount('error')).toBe(0);
  });
  it('cancels a pending shell without taking down unrelated channels', async () => {
    const { ssh, connection } = pendingShell();
    const controller = new AbortController();
    const waiting = ssh.requestShell({}, { signal: controller.signal });
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ code: 'ABORT_ERR' });
    expect(connection.destroy).not.toHaveBeenCalled();
    expect(connection.listenerCount('error')).toBe(0);
  });
  it('does not attempt a handshake with an already aborted signal or conflicting trust policies', async () => {
    const ssh = new NodeSSH(); const controller = new AbortController(); controller.abort();
    await expect(ssh.connect({ host: 'example.invalid', username: 'test', signal: controller.signal })).rejects.toMatchObject({ code: 'ABORT_ERR' });
    await expect(ssh.connect({ host: 'example.invalid', username: 'test', expectedHostFingerprint: `SHA256:${'a'.repeat(43)}`, hostVerifier: () => true })).rejects.toThrow(/cannot be combined/);
    expect(ssh.connection).toBeNull();
  });
  it('force disposal terminates the existing connection immediately', () => {
    const { ssh, connection } = pendingShell(); ssh.dispose(true); ssh.dispose(true);
    expect(connection.destroy).toHaveBeenCalledTimes(1); expect(ssh.connection).toBeNull();
  });
});

describe('SSH pool trust policy', () => {
  it('does not reuse an unchecked connection for strict verification or a different known-hosts file', async () => {
    const adapter = new SSHAdapter() as any;
    const target = { type: 'ssh', host: 'test.invalid', username: 'deploy', password: 'secret' };
    try {
      const permissive = adapter.getConnectionKey({ ...target, hostKeyChecking: 'off' });
      const strict = adapter.getConnectionKey({ ...target, hostKeyChecking: 'strict', knownHostsPath: '/trusted/one' });
      const other = adapter.getConnectionKey({ ...target, hostKeyChecking: 'strict', knownHostsPath: '/trusted/two' });
      expect(new Set([permissive, strict, other]).size).toBe(3);
      expect(strict).not.toContain('secret');
    } finally { await adapter.dispose(); }
  });
  it('reconnection retains strict verification, the inventory and configured handshake budget', async () => {
    const adapter = new SSHAdapter({ defaultConnectOptions: { readyTimeout: 4321 }, hostKeyChecking: 'strict', knownHostsPath: '/trusted/hosts',
      connectionPool: { enabled: false, keepAlive: false, maxConnections: 4, idleTimeout: 1000, reconnectDelay: 0 } }) as any;
    const ssh = { connect: vi.fn(async () => {}) };
    try {
      await adapter.reconnectConnection({ ssh, config: { type: 'ssh', host: 'test.invalid', username: 'deploy', password: 'private' }, reconnectAttempts: 0 });
      expect(ssh.connect).toHaveBeenCalledWith(expect.objectContaining({ hostKeyChecking: 'strict', knownHostsPath: '/trusted/hosts', readyTimeout: 4321 }));
    } finally { await adapter.dispose(); }
  });
});

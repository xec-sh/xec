import { EventEmitter } from 'node:events';
import { it, vi, expect, describe } from 'vitest';

import { NodeSSH } from '../../../src/adapters/ssh/ssh.js';
import { SSHAdapter } from '../../../src/adapters/ssh/index.js';

function pendingShell() {
  const ssh = new NodeSSH();
  const connection = new EventEmitter() as any;
  connection.shell = vi.fn();
  connection.end = vi.fn(); connection.destroy = vi.fn();
  (ssh as unknown as { transport: unknown }).transport = connection;
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
    const channel = Object.assign(new EventEmitter(), { destroy: vi.fn() });
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
  it('does not alias credential boundaries or ambiguous user/host spellings', async () => {
    const adapter = new SSHAdapter() as any;
    try {
      const config = { type: 'ssh', host: 'node.invalid', username: 'operator', privateKey: 'key' };
      expect(adapter.getConnectionKey({ ...config, passphrase: 'a\0b', password: 'c' }))
        .not.toBe(adapter.getConnectionKey({ ...config, passphrase: 'a', password: 'b\0c' }));
      expect(adapter.getConnectionKey({ ...config, username: 'a@b', host: 'c' }))
        .not.toBe(adapter.getConnectionKey({ ...config, username: 'a', host: 'b@c' }));
    } finally { await adapter.dispose(); }
  });
  it('new connections retain strict verification, inventory and handshake budget', async () => {
    const adapter = new SSHAdapter({ defaultConnectOptions: { readyTimeout: 4321 }, hostKeyChecking: 'strict', knownHostsPath: '/trusted/hosts' }) as any;
    try {
      expect(adapter.connectionOptions({ type: 'ssh', host: 'test.invalid', username: 'deploy', password: 'private' }))
        .toMatchObject({ hostKeyChecking: 'strict', knownHostsPath: '/trusted/hosts', readyTimeout: 4321 });
    } finally { await adapter.dispose(); }
  });
});

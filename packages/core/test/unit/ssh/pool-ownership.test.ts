import { Client } from 'ssh2';
import { it, vi, expect, describe, afterEach } from 'vitest';

import { TimeoutError } from '../../../src/core/error.js';
import { NodeSSH } from '../../../src/adapters/ssh/ssh.js';
import { SSHAdapter } from '../../../src/adapters/ssh/index.js';

const adapters: SSHAdapter[] = [];
afterEach(async () => { for (const adapter of adapters.splice(0)) await adapter.dispose(); vi.restoreAllMocks(); });
const target = { type: 'ssh' as const, host: 'one.invalid', username: 'operator', password: 'fixture', hostKeyChecking: 'off' as const };
const command = { command: 'fixture', adapterOptions: target };
const result = { code: 0, signal: null, stdout: 'completed', stderr: '' };
function fixture(limit = 2, enabled = true) {
  const clients: Client[] = [];
  const wire: unknown[] = [];
  vi.spyOn(Client.prototype, 'connect').mockImplementation(function (this: Client, options) {
    clients.push(this); wire.push(options); this.emit('ready'); return this;
  });
  const destroyed = new Set<Client>();
  vi.spyOn(Client.prototype, 'destroy').mockImplementation(function (this: Client) { destroyed.add(this); this.emit('close'); return this; });
  vi.spyOn(NodeSSH.prototype, 'execCommand').mockResolvedValue(result);
  const adapter = new SSHAdapter({ hostKeyChecking: 'strict', knownHostsPath: '/trusted/hosts', defaultConnectOptions: { readyTimeout: 1234 },
    connectionPool: { enabled, maxConnections: limit, idleTimeout: 60000, keepAlive: true, keepAliveInterval: 15000 } });
  adapters.push(adapter);
  return { adapter, clients, destroyed, wire };
}
function pausedCommand() {
  let finish!: () => void;
  vi.mocked(NodeSSH.prototype.execCommand).mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve(result); }));
  return () => finish();
}

describe('SSH connection ownership and admission', () => {
  it('keeps a running command alive when an independent reverse allocation times out', async () => {
    const { adapter, clients, destroyed } = fixture();
    const finish = pausedCommand();
    vi.spyOn(Client.prototype, 'forwardIn').mockImplementation(function (this: Client) { return this; });
    const running = adapter.execute(command);
    await vi.waitFor(() => expect(NodeSSH.prototype.execCommand).toHaveBeenCalledOnce());
    await expect(adapter.reverseTunnel({ remotePort: 0, localPort: 3000, timeoutMs: 10 }, target)).rejects.toMatchObject({ kind: 'outcome-unknown' });
    expect(clients).toHaveLength(2);
    expect(destroyed.has(clients[0]!)).toBe(false);
    expect(destroyed.has(clients[1]!)).toBe(true);
    expect(adapter.getConnectionPoolMetrics()).toMatchObject({ totalConnections: 1, activeConnections: 1 });
    finish(); expect((await running).exitCode).toBe(0);
    expect(adapter.getConnectionPoolMetrics()).toMatchObject({ totalConnections: 1, activeConnections: 0, idleConnections: 1 });
  });
  it('rejects capacity pressure without evicting an active command', async () => {
    const { adapter, clients, destroyed } = fixture(1);
    const finish = pausedCommand();
    const running = adapter.execute(command);
    await vi.waitFor(() => expect(NodeSSH.prototype.execCommand).toHaveBeenCalledOnce());
    await expect(adapter.execute({ ...command, adapterOptions: { ...target, host: 'two.invalid' } })).rejects.toThrow('capacity is busy');
    expect(clients).toHaveLength(1); expect(destroyed.size).toBe(0);
    finish(); await running;
  });
  it('counts pending handshakes in the same capacity limit', async () => {
    const { adapter, clients } = fixture(1);
    vi.mocked(Client.prototype.connect).mockImplementationOnce(function (this: Client) { clients.push(this); return this; });
    const opening = adapter.execute(command);
    await vi.waitFor(() => expect(clients).toHaveLength(1));
    await expect(adapter.execute({ ...command, adapterOptions: { ...target, host: 'two.invalid' } })).rejects.toThrow('capacity is busy');
    clients[0]!.emit('ready'); await opening;
    expect(clients).toHaveLength(1);
  });
  it('evicts only an idle connection and preserves transport trust and liveness options', async () => {
    const { adapter, clients, destroyed, wire } = fixture(1);
    await adapter.execute(command);
    await adapter.execute({ ...command, adapterOptions: { ...target, host: 'two.invalid', hostKeyChecking: 'strict' } });
    expect(clients).toHaveLength(2); expect(destroyed.has(clients[0]!)).toBe(true);
    expect(destroyed.has(clients[1]!)).toBe(false);
    expect(wire[1]).toMatchObject({ host: 'two.invalid', readyTimeout: 1234, keepaliveInterval: 15000, keepaliveCountMax: 3 });
    // Host verification is performed by Xec before credentials are dispatched.
    expect(wire[1]).toHaveProperty('hostVerifier');
    expect(adapter.getConnectionPoolMetrics()).toMatchObject({ totalConnections: 1, connectionsCreated: 2, connectionsDestroyed: 1 });
  });
  it('closes an unpooled connection after its last operation', async () => {
    const { adapter, clients, destroyed } = fixture(1, false);
    await adapter.execute(command);
    expect(destroyed.has(clients[0]!)).toBe(true);
    expect(adapter.getConnectionPoolMetrics().totalConnections).toBe(0);
    await adapter.execute(command);
    expect(clients).toHaveLength(2);
  });
  it('keeps unpooled reverse listeners registered for adapter disposal', async () => {
    const { adapter, destroyed } = fixture(1, false);
    vi.spyOn(Client.prototype, 'forwardIn').mockImplementation(function (this: Client, _host, _port, done) { done!(undefined, 4040); return this; });
    vi.spyOn(Client.prototype, 'unforwardIn').mockImplementation(function (this: Client, _host, _port, done) { done!(); return this; });
    const tunnel = await adapter.reverseTunnel({ remotePort: 0, localPort: 3000 }, target);
    expect(adapter.getConnectionPoolMetrics()).toMatchObject({ totalConnections: 1, activeConnections: 1 });
    await adapter.dispose(); await tunnel.closed;
    expect(tunnel.isOpen).toBe(false); expect(destroyed.size).toBe(1);
    expect(adapter.getConnectionPoolMetrics().totalConnections).toBe(0);
  });
  it('prevents a pending connection from resurrecting a disposed adapter', async () => {
    const { adapter, clients, destroyed } = fixture(1);
    vi.mocked(Client.prototype.connect).mockImplementationOnce(function (this: Client) { clients.push(this); return this; });
    const rejected = expect(adapter.execute(command)).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(clients).toHaveLength(1));
    await adapter.dispose(); await rejected;
    clients[0]!.emit('ready');
    expect(destroyed.size).toBe(1);
    expect(adapter.getConnectionPoolMetrics().totalConnections).toBe(0);
    await expect(adapter.execute(command)).rejects.toThrow('disposed');
  });
  it('does not hand out a connection that closes immediately after authentication', async () => {
    const { adapter } = fixture(1);
    vi.mocked(Client.prototype.connect).mockImplementationOnce(function (this: Client) { this.emit('ready'); this.emit('close'); return this; });
    await expect(adapter.execute(command)).rejects.toThrow('closed before acquisition');
    expect(NodeSSH.prototype.execCommand).not.toHaveBeenCalled();
    expect(adapter.getConnectionPoolMetrics().totalConnections).toBe(0);
  });
  it('shares a pinned connection for concurrent commands to the same target', async () => {
    const { adapter, clients } = fixture(1);
    const finish = pausedCommand();
    const running = adapter.execute(command);
    await vi.waitFor(() => expect(NodeSSH.prototype.execCommand).toHaveBeenCalledOnce());
    await adapter.execute(command);
    expect(clients).toHaveLength(1);
    expect(adapter.getConnectionPoolMetrics().activeConnections).toBe(1);
    finish(); await running;
    expect(adapter.getConnectionPoolMetrics().activeConnections).toBe(0);
  });
  it('carries agent-only authentication and distinct trust policies through the public target', async () => {
    const { adapter, clients, wire } = fixture(4);
    const agent = { getIdentities: vi.fn(), sign: vi.fn() };
    const agentTarget = { ...target, password: undefined, agent, algorithms: { cipher: ['aes128-gcm@openssh.com' as const] } };
    await adapter.execute({ ...command, adapterOptions: agentTarget });
    await adapter.execute({ ...command, adapterOptions: { ...agentTarget, algorithms: { cipher: ['aes128-gcm@openssh.com' as const] } } });
    expect(clients).toHaveLength(1);
    expect(wire[0]).toMatchObject({ algorithms: agentTarget.algorithms });
    expect((wire[0] as { agent?: object }).agent).toBeDefined();
    const changedAgent = { getIdentities: vi.fn(), sign: vi.fn() };
    await adapter.execute({ ...command, adapterOptions: { ...agentTarget, agent: changedAgent } });
    await adapter.execute({ ...command, adapterOptions: { ...agentTarget, hostVerifier: () => true } });
    await adapter.execute({ ...command, adapterOptions: { ...agentTarget, hostVerifier: () => false } });
    expect(clients).toHaveLength(4);
  });
  it('checks target cancellation before borrowing an authenticated connection', async () => {
    const { adapter, clients } = fixture();
    await adapter.execute(command);
    const controller = new AbortController(); controller.abort();
    await expect(adapter.execute({ ...command, adapterOptions: { ...target, signal: controller.signal } })).rejects.toThrow('cancelled');
    expect(clients).toHaveLength(1);
    expect(NodeSSH.prototype.execCommand).toHaveBeenCalledOnce();
  });

  it('retires repeated timeouts without interrupting another active command', async () => {
    const { adapter, clients, destroyed } = fixture(1);
    const finish = pausedCommand();
    const running = adapter.execute(command);
    await vi.waitFor(() => expect(NodeSSH.prototype.execCommand).toHaveBeenCalledOnce());
    for (let i = 0; i < 4; i++) {
      vi.mocked(NodeSSH.prototype.execCommand).mockRejectedValueOnce(new TimeoutError('fixture', 10));
      await expect(adapter.execute(command)).rejects.toBeInstanceOf(TimeoutError);
      expect(destroyed.size).toBe(0);
    }
    await expect(adapter.execute(command)).rejects.toThrow('retiring');
    expect(clients).toHaveLength(1);
    finish(); await running;
    expect(destroyed.has(clients[0]!)).toBe(true);
    expect(adapter.getConnectionPoolMetrics().totalConnections).toBe(0);
  });

});

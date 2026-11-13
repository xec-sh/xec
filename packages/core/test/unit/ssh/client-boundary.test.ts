import type { SSHAgent } from '../../../src/adapters/ssh/contracts.js';

import { Client, BaseAgent } from 'ssh2';
import { it, vi, expect, describe, afterEach } from 'vitest';

import { NodeSSH } from '../../../src/adapters/ssh/ssh.js';

const clients: NodeSSH[] = [];
afterEach(() => { for (const ssh of clients.splice(0)) ssh.dispose(true); vi.restoreAllMocks(); });

describe('Xec public connection boundary', () => {
  it('bridges a plain Xec agent without exposing the transport client', async () => {
    const agent: SSHAgent = { getIdentities: vi.fn(done => done(undefined, [])), sign: vi.fn((_key, _data, _options, done) => done(undefined, Buffer.from('signature'))) };
    let wire: any; const transports: Client[] = [];
    vi.spyOn(Client.prototype, 'connect').mockImplementation(function (this: Client, config) { wire = config; transports.push(this); this.emit('ready'); return this; });
    const ssh = new NodeSSH(); clients.push(ssh);
    await ssh.connect({ host: 'fixture.invalid', username: 'operator', agent, privateKey: Buffer.from('key'), hostKeyChecking: 'off' });
    const transport = transports[0]!;
    expect(wire.agent).toBeInstanceOf(BaseAgent); expect(wire.agent).not.toBe(agent);
    wire.agent.getIdentities(() => {});
    wire.agent.sign('public', Buffer.from('payload'), {}, () => {});
    expect(agent.getIdentities).toHaveBeenCalledOnce(); expect(agent.sign).toHaveBeenCalledOnce();
    expect(ssh.connection).not.toBe(transport); expect(ssh.connection).not.toHaveProperty('exec');
    const closed = vi.fn(); ssh.connection?.once('close', closed);
    transport.emit('close'); expect(closed).toHaveBeenCalledOnce(); expect(ssh.isConnected()).toBe(false);
  });
  it('refuses to replace a live connection and retains its ownership', async () => {
    vi.spyOn(Client.prototype, 'connect').mockImplementation(function (this: Client) { this.emit('ready'); return this; });
    const ssh = new NodeSSH(); clients.push(ssh);
    const config = { host: 'fixture.invalid', username: 'operator', hostKeyChecking: 'off' as const };
    await ssh.connect(config); const first = ssh.connection;
    await expect(ssh.connect(config)).rejects.toThrow('Dispose the existing SSH connection');
    expect(ssh.connection).toBe(first); expect(Client.prototype.connect).toHaveBeenCalledOnce();
  });
});

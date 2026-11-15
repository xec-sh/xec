import type { SSHAgent, SSHChannel, SSHConnectionConfig } from '../../src/contracts.js';

import { EventEmitter } from 'node:events';
import { Duplex, PassThrough } from 'node:stream';
import { it, vi, expect, describe, afterEach } from 'vitest';

import { SSHClient } from '../../src/client.js';
import Client from '../../src/transport/client.js';
import { BaseAgent } from '../../src/transport/agent.js';

const clients: SSHClient[] = [];
afterEach(() => { for (const ssh of clients.splice(0)) ssh.dispose(true); vi.restoreAllMocks(); });

describe('Xec public connection boundary', () => {
  it('bridges a plain Xec agent without exposing the transport client', async () => {
    const agent: SSHAgent = { getIdentities: vi.fn(done => done(undefined, [])), sign: vi.fn((_key, _data, _options, done) => done(undefined, Buffer.from('signature'))) };
    let wire: any; const transports: Client[] = [];
    vi.spyOn(Client.prototype, 'connect').mockImplementation(function (this: Client, config) { wire = config; transports.push(this); this.emit('ready'); return this; });
    const ssh = new SSHClient(); clients.push(ssh);
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
    const ssh = new SSHClient(); clients.push(ssh);
    const config = { host: 'fixture.invalid', username: 'operator', hostKeyChecking: 'off' as const };
    await ssh.connect(config); const first = ssh.connection;
    await expect(ssh.connect(config)).rejects.toThrow('Dispose the existing SSH connection');
    expect(ssh.connection).toBe(first); expect(Client.prototype.connect).toHaveBeenCalledOnce();
  });
});


describe('SSH timer and subsystem input boundaries', () => {
  const maximum = 2_147_483_647;
  it.each([
    ['readyTimeout', 0], ['readyTimeout', 0.5], ['readyTimeout', maximum + 1],
    ['keepaliveInterval', -1], ['keepaliveInterval', 0.5], ['keepaliveInterval', maximum + 1],
    ['timeout', -1], ['timeout', 0.5], ['timeout', maximum + 1],
  ] as const)('rejects %s=%s before allocating a connection', async (name, value) => {
    const connect = vi.spyOn(Client.prototype, 'connect').mockImplementation(function (this: Client) { this.emit('ready'); return this; });
    const ssh = new SSHClient(); clients.push(ssh);
    await expect(ssh.connect({ host: 'fixture.invalid', username: 'operator', hostKeyChecking: 'off', [name]: value })).rejects.toMatchObject({ code: 'EINVAL' });
    expect(connect).not.toHaveBeenCalled();
    expect(ssh.isConnected()).toBe(false);
  });

  it('retains the explicit zero-disable and maximum native timer values', async () => {
    const connect = vi.spyOn(Client.prototype, 'connect').mockImplementation(function (this: Client) { this.emit('ready'); return this; });
    const ssh = new SSHClient(); clients.push(ssh);
    await expect(ssh.connect({ host: 'fixture.invalid', username: 'operator', hostKeyChecking: 'off', readyTimeout: maximum, keepaliveInterval: 0, timeout: 0 })).resolves.toBe(ssh);
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ readyTimeout: maximum, keepaliveInterval: 0, timeout: 0 }));
  });

  it.each([
    { operationTimeoutMs: 0 }, { operationTimeoutMs: 0.5 }, { operationTimeoutMs: maximum + 1 },
    { maxPendingRequests: 0 }, { maxPendingRequests: 65_537 }, { maxPendingRequests: 1.5 },
    { timeoutMs: maximum + 1 },
  ])('rejects invalid SFTP limits %j before opening a subsystem', async request => {
    const ssh = new SSHClient(); clients.push(ssh);
    const sftp = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() });
    const connection = Object.assign(new EventEmitter(), { sftp: vi.fn(done => done(undefined, sftp)), destroy: vi.fn() });
    (ssh as unknown as { transport: unknown }).transport = connection;
    await expect(ssh.requestSFTP(request)).rejects.toMatchObject({ code: 'EINVAL' });
    expect(connection.sftp).not.toHaveBeenCalled();
    expect(sftp.end).not.toHaveBeenCalled();
    expect(connection.listenerCount('close')).toBe(0);
  });

  it.each(['shell', 'forwardIn'] as const)('rejects an overflowing %s opening deadline before dispatch', async kind => {
    const ssh = new SSHClient(); clients.push(ssh);
    const channel = Object.assign(new EventEmitter(), { destroy: vi.fn() });
    const connection = Object.assign(new EventEmitter(), {
      shell: vi.fn(done => done(undefined, channel)),
      forwardIn: vi.fn((_host, _port, done) => done(undefined, 12345)), destroy: vi.fn(),
    });
    (ssh as unknown as { transport: unknown }).transport = connection;
    const operation = kind === 'shell' ? ssh.requestShell(undefined, { timeoutMs: maximum + 1 })
      : ssh.forwardIn('127.0.0.1', 0, undefined, { timeoutMs: maximum + 1 });
    await expect(operation).rejects.toMatchObject({ code: 'EINVAL' });
    expect(connection[kind]).not.toHaveBeenCalled();
    expect(connection.listenerCount('close')).toBe(0);
  });
});


describe('SSH verifier and execution failure boundaries', () => {
  it.each([undefined, null, false, 'denied'])('rejects every thrown verifier value (%s) before authentication', async reason => {
    const accepted = vi.fn();
    vi.spyOn(Client.prototype, 'connect').mockImplementation(function (this: Client, config) {
      config.hostVerifier(Buffer.from('synthetic key'), (valid: boolean) => {
        if (valid) { accepted(); this.emit('ready'); }
        else this.emit('error', new Error('verification refused'));
      });
      return this;
    });
    const ssh = new SSHClient(); clients.push(ssh);
    await expect(ssh.connect({ host: 'fixture.invalid', username: 'operator', hostVerifier: async () => { throw reason; } })).rejects.toMatchObject({ code: 'EHOSTKEY', cause: reason });
    expect(accepted).not.toHaveBeenCalled();
    expect(ssh.isConnected()).toBe(false);
  });

  it('validates trust policy before retaining transport ownership', async () => {
    const connect = vi.spyOn(Client.prototype, 'connect').mockImplementation(function (this: Client) { this.emit('ready'); return this; });
    const ssh = new SSHClient(); clients.push(ssh);
    await expect(ssh.connect({ host: 'fixture.invalid', username: 'operator', hostKeyChecking: 'invalid' as SSHConnectionConfig['hostKeyChecking'] })).rejects.toThrow();
    expect(ssh.isConnected()).toBe(false);
    await expect(ssh.connect({ host: 'fixture.invalid', username: 'operator', hostKeyChecking: 'off' })).resolves.toBe(ssh);
    expect(connect).toHaveBeenCalledOnce();
  });

  function execution() {
    const ssh = new SSHClient(); clients.push(ssh);
    const channel = Object.assign(new Duplex({ read() {}, write(_chunk, _encoding, done) { done(); } }), {
      stderr: new PassThrough(), signal: vi.fn(), close: vi.fn(),
    });
    const connection = Object.assign(new EventEmitter(), {
      exec: vi.fn((_command: string, _options: unknown, accept: (error?: Error, channel?: SSHChannel) => void) => accept(undefined, channel as unknown as SSHChannel)),
      destroy: vi.fn(),
    });
    (ssh as unknown as { transport: unknown }).transport = connection;
    return { ssh, channel, connection };
  }

  it('rejects an unsupported output encoding before dispatch', async () => {
    const { ssh, connection } = execution();
    connection.exec.mockImplementation(() => {});
    await expect(ssh.exec('must-not-run', { encoding: 'invalid' as BufferEncoding, channelOpenTimeoutMs: 5 })).rejects.toMatchObject({ code: 'EINVAL' });
    expect(connection.exec).not.toHaveBeenCalled();
  });


  it.each([0.5, 2_147_483_648])('rejects an invalid exec acknowledgement deadline %s before dispatch', async channelOpenTimeoutMs => {
    const { ssh, channel, connection } = execution();
    connection.exec.mockImplementation((_command, _options, accept) => {
      accept(undefined, channel as unknown as SSHChannel);
      queueMicrotask(() => channel.emit('close', 0));
    });
    await expect(ssh.exec('must-not-run', { channelOpenTimeoutMs })).rejects.toMatchObject({ code: 'EINVAL' });
    expect(connection.exec).not.toHaveBeenCalled();
    channel.stderr.destroy();
  });

  it.each(['onChannel', 'stdout', 'stderr', 'channelError', 'stderrError', 'stdinError'] as const)('keeps %s failure after dispatch outcome unknown', async source => {
    const { ssh, channel, connection } = execution();
    const input = new PassThrough(); const cause = new Error('synthetic consumer failure');
    const operation = ssh.exec('mutate', {
      stdin: input,
      ...(source === 'onChannel' ? { onChannel: () => { throw cause; } } : {}),
      ...(source === 'stdout' ? { onStdout: () => { throw cause; } } : {}),
      ...(source === 'stderr' ? { onStderr: () => { throw cause; } } : {}),
    });
    const outcome = operation.then(value => ({ value }), error => ({ error }));
    await vi.waitFor(() => expect(connection.exec).toHaveBeenCalledOnce());
    if (source === 'stdout') channel.push(Buffer.from('bytes'));
    if (source === 'stderr') channel.stderr.write('bytes');
    if (source === 'channelError') channel.emit('error', cause, true);
    if (source === 'stderrError') channel.stderr.emit('error', cause);
    if (source === 'stdinError') input.emit('error', cause, true);
    expect(await outcome).toMatchObject({ error: { code: 'SSH_OUTCOME_UNKNOWN', outcome: 'unknown', cause } });
    expect(channel.destroyed).toBe(true);
    expect(connection.listenerCount('error')).toBe(0);
    input.destroy(); channel.stderr.destroy();
  });

  it('does not replay a consumer error that happens to contain a channel refusal reason', async () => {
    const { ssh, channel, connection } = execution();
    const cause = Object.assign(new Error('callback failed'), { reason: 1 });
    await expect(ssh.exec('mutate', { onChannel: () => { throw cause; } })).rejects.toMatchObject({ outcome: 'unknown', cause });
    expect(connection.exec).toHaveBeenCalledOnce();
    channel.stderr.destroy();
  });
});

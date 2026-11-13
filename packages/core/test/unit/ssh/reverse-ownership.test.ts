import { EventEmitter } from 'node:events';
import { it, vi, expect, describe, afterEach } from 'vitest';

import { NodeSSH } from '../../../src/adapters/ssh/ssh.js';
import { SSHAdapter } from '../../../src/adapters/ssh/index.js';
import { createSSHExecutionContext } from '../../../src/adapters/ssh/ssh-api.js';

const cleanups: Array<() => Promise<unknown> | void> = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); vi.useRealTimers(); });
function transport() {
  const ssh = new NodeSSH();
  const connection: any = new EventEmitter();
  connection.destroy = vi.fn(() => { connection.emit('close'); });
  connection.end = connection.destroy;
  connection.forwardIn = vi.fn((_host: string, _port: number, done: (error?: Error, port?: number) => void) => done(undefined, 4040));
  connection.unforwardIn = vi.fn((_host: string, _port: number, done: (error?: Error, port?: number) => void) => done());
  (ssh as unknown as { transport: unknown }).transport = connection;
  cleanups.push(() => { connection.emit('close'); });
  return { ssh, connection };
}
function pooled() {
  const adapter: any = new SSHAdapter({ connectionPool: { enabled: false } });
  const one = transport(), two = transport();
  const entries = [one, two].map(({ ssh }) => ({ ssh, activeUseCount: 0, lastUsed: Date.now() }));
  vi.spyOn(adapter, 'getConnection').mockImplementation(async (target: any) => { const entry = entries[target.host === 'one.invalid' ? 0 : 1]!; entry.activeUseCount++; return entry; });
  cleanups.push(async () => { one.connection.emit('close'); two.connection.emit('close'); await adapter.dispose(); });
  return { adapter, one, two, entries };
}
const target = { type: 'ssh' as const, host: 'one.invalid', username: 'operator' };
const options = { remotePort: 4040, localPort: 3000 };

describe('reverse tunnel ownership', () => {
  it('binds a high-level context to its explicit target without an incidental remote command', async () => {
    const reverseTunnel = vi.fn().mockResolvedValue({});
    const engine: any = { getAdapter: () => ({ reverseTunnel }), with: vi.fn() };
    const context = createSSHExecutionContext(engine, target);
    await context.reverseTunnel(options);
    expect(reverseTunnel).toHaveBeenCalledWith(options, target);
    expect(engine.with).not.toHaveBeenCalled();
  });
  it('tracks equal remote addresses on different hosts independently and pins each connection', async () => {
    const { adapter, one, two, entries } = pooled();
    adapter.lastUsedSSHOptions = { ...target, host: 'unexpected.invalid' };
    const [first, second] = await Promise.all([
      adapter.reverseTunnel(options, target), adapter.reverseTunnel(options, { ...target, host: 'two.invalid' }),
    ]);
    expect(adapter.activeTunnels.size).toBe(2);
    expect(entries.map(entry => entry.activeUseCount)).toEqual([1, 1]);
    expect(one.connection.forwardIn).toHaveBeenCalledOnce();
    expect(two.connection.forwardIn).toHaveBeenCalledOnce();
    await Promise.all([first.close(), first.close()]);
    expect(one.connection.unforwardIn).toHaveBeenCalledOnce();
    expect(second.isOpen).toBe(true);
    expect(adapter.activeTunnels.size).toBe(1);
    two.connection.emit('close'); await second.closed;
    expect(second.isOpen).toBe(false);
    expect(entries.map(entry => entry.activeUseCount)).toEqual([0, 0]);
    expect(adapter.activeTunnels.size).toBe(0);
  });
  it('retains the connection lease and listener after a failed unbind until retry confirms closure', async () => {
    const { adapter, one, entries } = pooled();
    one.connection.unforwardIn.mockImplementationOnce((_host: string, _port: number, done: (error?: Error, port?: number) => void) => done(new Error('unbind refused')));
    const tunnel = await adapter.reverseTunnel(options, target);
    await expect(tunnel.close()).rejects.toThrow('unbind refused');
    expect(tunnel.isOpen).toBe(true);
    expect(entries[0]!.activeUseCount).toBe(1);
    expect(one.connection.listenerCount('tcp connection')).toBe(1);
    await tunnel.close(); await tunnel.closed;
    expect(tunnel.isOpen).toBe(false);
    expect(entries[0]!.activeUseCount).toBe(0);
    expect(one.connection.listenerCount('tcp connection')).toBe(0);
  });
  it('bounds unconfirmed closure, permits retry and releases on transport loss', async () => {
    vi.useFakeTimers();
    const { ssh, connection } = transport();
    connection.unforwardIn.mockImplementation(() => {});
    const tunnel = await ssh.forwardIn('127.0.0.1', 4040, vi.fn());
    const first = expect(tunnel.dispose()).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    await vi.advanceTimersByTimeAsync(15000); await first;
    expect(connection.listenerCount('tcp connection')).toBe(1);
    const retry = tunnel.dispose();
    connection.emit('close');
    await retry; await tunnel.closed;
    expect(connection.listenerCount('tcp connection')).toBe(0);
    expect(connection.listenerCount('close')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('accepts a late successful unbind acknowledgement after its deadline', async () => {
    vi.useFakeTimers();
    const { ssh, connection } = transport();
    let acknowledge!: () => void;
    connection.unforwardIn.mockImplementation((_host: string, _port: number, done: (error?: Error, port?: number) => void) => { acknowledge = done; });
    const tunnel = await ssh.forwardIn('127.0.0.1', 4040, vi.fn());
    const first = expect(tunnel.dispose()).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    await vi.advanceTimersByTimeAsync(15000); await first;
    acknowledge();
    await tunnel.closed;
    await tunnel.dispose();
    expect(connection.unforwardIn).toHaveBeenCalledOnce();
    expect(connection.listenerCount('tcp connection')).toBe(0);
    expect(connection.listenerCount('close')).toBe(0);
  });

  it.each(['tcp', 'unix'])('bounds %s listener opening and invalidates the uncertain connection', async (kind) => {
    vi.useFakeTimers();
    const { ssh, connection } = transport();
    let acknowledge!: (...args: any[]) => void;
    connection.forwardIn.mockImplementation((_host: string, _port: number, done: (error?: Error, port?: number) => void) => { acknowledge = done; });
    connection.openssh_forwardInStreamLocal = vi.fn((_path: string, done: (error?: Error) => void) => { acknowledge = done; });
    const opening = kind === 'tcp' ? ssh.forwardIn('127.0.0.1', 0, vi.fn(), { timeoutMs: 20 })
      : ssh.forwardInStreamLocal('/tmp/fixture.sock', vi.fn(), { timeoutMs: 20 });
    const rejected = expect(opening).rejects.toMatchObject({ kind: 'outcome-unknown', originalError: { code: 'ETIMEDOUT' } });
    await vi.advanceTimersByTimeAsync(20); await rejected;
    expect(connection.destroy).toHaveBeenCalledOnce();
    acknowledge(undefined, 4040);
    expect(connection.listenerCount('tcp connection') + connection.listenerCount('unix connection')).toBe(0);
    expect(ssh.isConnected()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels before dispatch without poisoning a usable connection', async () => {
    const { ssh, connection } = transport();
    const abort = new AbortController(); abort.abort();
    await expect(ssh.forwardIn('127.0.0.1', 0, undefined, { signal: abort.signal })).rejects.toMatchObject({ code: 'ABORT_ERR' });
    expect(connection.forwardIn).not.toHaveBeenCalled();
    expect(connection.destroy).not.toHaveBeenCalled();
  });
  it('cancels an in-flight allocation without replay or installing a late handler', async () => {
    const { ssh, connection } = transport();
    connection.forwardIn.mockImplementation(() => {});
    const abort = new AbortController();
    const opening = ssh.forwardIn('127.0.0.1', 0, vi.fn(), { signal: abort.signal });
    abort.abort();
    await expect(opening).rejects.toMatchObject({ kind: 'outcome-unknown', originalError: { code: 'ABORT_ERR' } });
    expect(connection.forwardIn).toHaveBeenCalledOnce();
    expect(connection.destroy).toHaveBeenCalledOnce();
  });
  it('distinguishes an explicit refusal from a lost global reply', async () => {
    const { ssh, connection } = transport();
    connection.forwardIn.mockImplementationOnce((_host: string, _port: number, done: (error?: Error, port?: number) => void) => done(new Error('Unable to bind to 127.0.0.1:4040')));
    await expect(ssh.forwardIn('127.0.0.1', 4040)).rejects.toMatchObject({ code: 'SSH_FORWARD_REFUSED' });
    expect(connection.destroy).not.toHaveBeenCalled();
    connection.forwardIn.mockImplementationOnce((_host: string, _port: number, done: (error?: Error, port?: number) => void) => done(new Error('No response from server')));
    await expect(ssh.forwardIn('127.0.0.1', 4040)).rejects.toMatchObject({ kind: 'outcome-unknown' });
    expect(connection.destroy).toHaveBeenCalledOnce();
  });
  it('handles a connection arriving synchronously with the allocation reply', async () => {
    const { ssh, connection } = transport();
    const incoming = vi.fn();
    connection.forwardIn.mockImplementationOnce((_host: string, _port: number, done: (error?: Error, port?: number) => void) => {
      done(undefined, 4040);
      connection.emit('tcp connection', { destIP: '127.0.0.1', destPort: 4040 }, vi.fn(), vi.fn());
    });
    const tunnel = await ssh.forwardIn('127.0.0.1', 0, incoming);
    expect(incoming).toHaveBeenCalledOnce();
    await tunnel.dispose();
  });

  it('uses the same retryable acknowledgement contract for Unix listeners', async () => {
    const { ssh, connection } = transport();
    connection.openssh_forwardInStreamLocal = vi.fn((_path: string, done: (error?: Error) => void) => done());
    connection.openssh_unforwardInStreamLocal = vi.fn((_path: string, done: (error?: Error) => void) => done());
    connection.openssh_unforwardInStreamLocal.mockImplementationOnce((_path: string, done: (error?: Error) => void) => done(new Error('unconfirmed')));
    const tunnel = await ssh.forwardInStreamLocal('/tmp/xec-fixture.sock', vi.fn());
    await expect(tunnel.dispose()).rejects.toThrow('unconfirmed');
    expect(connection.listenerCount('unix connection')).toBe(1);
    await tunnel.dispose(); await tunnel.closed;
    expect(connection.listenerCount('unix connection')).toBe(0);
    expect(connection.listenerCount('close')).toBe(0);
  });

});

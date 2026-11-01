import { EventEmitter } from 'node:events';
import { Duplex, PassThrough } from 'node:stream';
import { it, vi, expect, describe, afterEach } from 'vitest';

import { NodeSSH } from '../../../src/adapters/ssh/ssh.js';
import { SSHAdapter } from '../../../src/adapters/ssh/index.js';
import { classifyFailure } from '../../../src/core/failure-kind.js';
import { withExecutionRetry } from '../../../src/utils/retry-adapter.js';
import { ExecutionOutcomeUnknownError } from '../../../src/core/error.js';

const cleanup: Array<() => void | Promise<unknown>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.useRealTimers(); });
function fixture() {
  const ssh = new NodeSSH();
  const channel = Object.assign(new Duplex({ read() {}, write(_chunk, _encoding, done) { done(); } }), {
    stderr: new PassThrough(), signal: vi.fn(), close: vi.fn(),
  });
  const connection: any = new EventEmitter();
  connection.exec = vi.fn((_cmd, _options, accept) => accept(undefined, channel));
  (ssh as unknown as { transport: unknown }).transport = connection;
  cleanup.push(() => { channel.destroy(); channel.stderr.destroy(); connection.emit('close'); });
  return { ssh, channel, connection };
}
async function started(connection: any) { await vi.waitFor(() => expect(connection.exec).toHaveBeenCalledOnce()); }
function complete(channel: any, status: number | null = 0, signal: string | null = null) {
  channel.emit('exit', status, signal); channel.push(null); channel.stderr.end(); channel.emit('close', status, signal);
}

describe('SSH execution acknowledgement and lifetime', () => {
  it('decodes a UTF-8 character split across independent packets without corruption', async () => {
    const { ssh, channel, connection } = fixture();
    const waiting = ssh.execCommand('inspect', { noTrim: true }); await started(connection);
    const value = Buffer.from('Привет 🌐\n');
    for (const part of value) channel.push(Buffer.from([part]));
    complete(channel);
    expect(await waiting).toMatchObject({ stdout: 'Привет 🌐\n', code: 0 });
  });
  it('preserves binary standard input exactly', async () => {
    const { ssh, channel, connection } = fixture();
    const data = Buffer.from([0, 255, 192, 128, 10]);
    const end = vi.spyOn(channel, 'end');
    const waiting = ssh.execCommand('consume', { stdin: data }); await started(connection);
    expect(end).toHaveBeenCalledWith(data); complete(channel); await waiting;
  });
  it('does not turn a closed channel without exit evidence into success', async () => {
    const { ssh, channel, connection } = fixture();
    const waiting = expect(ssh.execCommand('mutate')).rejects.toMatchObject({ code: 'SSH_OUTCOME_UNKNOWN', recoverable: false });
    await started(connection); channel.emit('close'); await waiting;
    expect(connection.listenerCount('close')).toBe(0);
    expect(connection.listenerCount('error')).toBe(0);
  });
  it('reports loss before the exec acknowledgement and destroys a late channel', async () => {
    const { ssh, channel, connection } = fixture();
    connection.exec.mockImplementation(() => {});
    const waiting = expect(ssh.execCommand('mutate')).rejects.toMatchObject({ kind: 'outcome-unknown' });
    await started(connection); connection.emit('close'); await waiting;
    connection.exec.mock.calls[0][2](undefined, channel);
    expect(channel.destroyed).toBe(true);
  });
  it('rejects a transport loss after dispatch instead of returning a synthetic timeout result', async () => {
    const { ssh, connection } = fixture();
    const adapter = new SSHAdapter({ connectionPool: { enabled: false } }) as any;
    cleanup.push(() => adapter.dispose());
    vi.spyOn(adapter, 'getConnection').mockResolvedValue({ ssh, activeUseCount: 0, lastUsed: Date.now(), errors: 0, host: 'node.invalid' });
    const waiting = adapter.execute({ command: 'mutate', adapterOptions: { type: 'ssh', host: 'node.invalid', username: 'deploy' } });
    const outcome = expect(waiting).rejects.toMatchObject({ kind: 'outcome-unknown', recoverable: false });
    await started(connection); connection.emit('error', Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }));
    await outcome; expect(connection.exec).toHaveBeenCalledOnce();
  });
  it('has a finite acknowledgement deadline and releases its listeners', async () => {
    vi.useFakeTimers();
    const { ssh, connection } = fixture(); connection.exec.mockImplementation(() => {});
    const waiting = expect(ssh.execCommand('mutate', { channelOpenTimeoutMs: 25 })).rejects.toMatchObject({ kind: 'outcome-unknown' });
    await vi.advanceTimersByTimeAsync(25); await waiting;
    expect(connection.listenerCount('close')).toBe(0); expect(connection.listenerCount('error')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels a queued command before it can reach the server', async () => {
    const { ssh, connection } = fixture(); connection.exec.mockImplementation(() => {});
    const busy = Array.from({ length: 8 }, () => ssh.execCommand('busy').catch(error => error));
    await vi.waitFor(() => expect(connection.exec).toHaveBeenCalledTimes(8));
    const controller = new AbortController();
    const queued = expect(ssh.execCommand('must-not-run', { signal: controller.signal })).rejects.toMatchObject({ code: 'ABORT_ERR' });
    controller.abort(); await queued;
    connection.emit('close'); await Promise.all(busy);
    expect(connection.exec).toHaveBeenCalledTimes(8);
  });
  it('rejects retained output overflow and terminates the channel', async () => {
    const { ssh, channel, connection } = fixture();
    const waiting = expect(ssh.execCommand('produce', { maxBuffer: 4 })).rejects.toMatchObject({ code: 'MAX_BUFFER_EXCEEDED' });
    await started(connection); channel.push(Buffer.from('too large')); await waiting;
    expect(channel.signal).toHaveBeenCalledWith('TERM'); expect(channel.destroyed).toBe(true);
  });
  it('surfaces consumer exceptions and does not leak connection listeners', async () => {
    const { ssh, channel, connection } = fixture();
    const waiting = expect(ssh.execCommand('inspect', { onStdout: () => { throw new Error('sink failed'); } })).rejects.toThrow('sink failed');
    await started(connection); channel.push(Buffer.from('data')); await waiting;
    expect(connection.listenerCount('error')).toBe(0); expect(channel.destroyed).toBe(true);
  });
  it('preserves a terminating signal as a nonzero adapter outcome', async () => {
    const { ssh, channel, connection } = fixture();
    const adapter = new SSHAdapter({ connectionPool: { enabled: false } }) as any;
    cleanup.push(() => adapter.dispose());
    vi.spyOn(adapter, 'getConnection').mockResolvedValue({ ssh, activeUseCount: 0, lastUsed: Date.now(), errors: 0, host: 'node.invalid' });
    const waiting = adapter.execute({ command: 'inspect', nothrow: true, adapterOptions: { type: 'ssh', host: 'node.invalid', username: 'deploy' } });
    await started(connection); complete(channel, null, 'TERM');
    expect(await waiting).toMatchObject({ exitCode: 143, signal: 'SIGTERM' });
  });
  it('keeps unknown completion separate from a reconnectable transport failure', () => {
    expect(classifyFailure({ code: 'SSH_OUTCOME_UNKNOWN', message: 'Connection lost' })).toBe('outcome-unknown');
  });
  it('does not replay unknown execution through the high-level retry policy', async () => {
    const execute = vi.fn(async () => { throw new ExecutionOutcomeUnknownError(); });
    await expect(withExecutionRetry(execute, { maxRetries: 3, initialDelay: 1 })).rejects.toMatchObject({ kind: 'outcome-unknown' });
    expect(execute).toHaveBeenCalledOnce();
  });
  it('never dispatches queued commands after the connection is lost', async () => {
    const { ssh, connection } = fixture(); connection.exec.mockImplementation(() => {});
    const busy = Array.from({ length: 8 }, () => ssh.execCommand('busy').catch(error => error));
    await vi.waitFor(() => expect(connection.exec).toHaveBeenCalledTimes(8));
    const queued = expect(ssh.execCommand('must-not-run')).rejects.toMatchObject({ code: 'ECONNRESET' });
    connection.emit('close'); await Promise.all(busy); await queued;
    expect(connection.exec).toHaveBeenCalledTimes(8);
  });

});

import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { it, vi, expect, describe, afterEach } from 'vitest';

import { NodeSSH } from '../../../src/adapters/ssh/ssh.js';

const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); vi.useRealTimers(); });
function fixture() {
  const ssh = new NodeSSH();
  const sftp: any = new EventEmitter();
  sftp.end = vi.fn(() => sftp.emit('end'));
  sftp.destroy = vi.fn(() => sftp.emit('close'));
  sftp.readdir = vi.fn(); sftp.fastPut = vi.fn(); sftp.fastGet = vi.fn(); sftp.stat = vi.fn(); sftp.exists = vi.fn();
  const connection: any = new EventEmitter();
  connection.sftp = vi.fn(done => done(undefined, sftp));
  (ssh as unknown as { transport: unknown }).transport = connection;
  cleanup.push(() => { connection.emit('close'); });
  return { ssh, sftp, connection };
}
function read(sftp: any): Promise<unknown> {
  return new Promise((resolve, reject) => sftp.readdir('/fixture', (error: Error, files: unknown) => error ? reject(error) : resolve(files)));
}
function upload(sftp: any, step?: (...args: any[]) => void): Promise<void> {
  return new Promise((resolve, reject) => sftp.fastPut('/local', '/remote', { step }, (error: Error) => error ? reject(error) : resolve()));
}

describe('Xec SFTP request ownership', () => {
  it('settles a request when the transport closes without invoking the library callback', async () => {
    const { ssh, connection, sftp } = fixture();
    const managed = await ssh.requestSFTP();
    const pending = expect(read(managed)).rejects.toMatchObject({ code: 'ECONNRESET' });
    connection.emit('close'); await pending;
    sftp.readdir.mock.calls[0][1](undefined, ['late']);
    expect(connection.listenerCount('error')).toBe(0);
    expect(connection.listenerCount('close')).toBe(0);
  });
  it('marks an interrupted write as unknown and never repeats it', async () => {
    const { ssh, connection, sftp } = fixture();
    const managed = await ssh.requestSFTP();
    const pending = expect(upload(managed)).rejects.toMatchObject({ kind: 'outcome-unknown', recoverable: false });
    connection.emit('close'); await pending;
    expect(sftp.fastPut).toHaveBeenCalledOnce();
  });
  it('preserves uncertainty when the library fails a write callback before emitting connection closure', async () => {
    const { ssh, sftp } = fixture(); const managed = await ssh.requestSFTP();
    const pending = expect(upload(managed)).rejects.toMatchObject({ kind: 'outcome-unknown', recoverable: false });
    sftp.fastPut.mock.calls[0][3](Object.assign(new Error('No response from server'), { code: 'ECONNRESET' }));
    await pending; expect(sftp.fastPut).toHaveBeenCalledOnce();
  });
  it('bounds a stalled SFTP operation and ends its subsystem', async () => {
    vi.useFakeTimers();
    const { ssh, sftp } = fixture();
    const managed = await ssh.requestSFTP({ operationTimeoutMs: 30 });
    const pending = expect(read(managed)).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    await vi.advanceTimersByTimeAsync(30); await pending;
    expect(sftp.destroy).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('renews a transfer deadline only when progress arrives', async () => {
    vi.useFakeTimers();
    const { ssh, sftp } = fixture();
    const managed = await ssh.requestSFTP({ operationTimeoutMs: 30 });
    const step = vi.fn(), pending = upload(managed, step);
    for (let index = 0; index < 4; index++) {
      await vi.advanceTimersByTimeAsync(20);
      sftp.fastPut.mock.calls[0][2].step(index * 1024, 1024, 4096);
    }
    sftp.fastPut.mock.calls[0][3](); await pending;
    expect(step).toHaveBeenCalledTimes(4); expect(sftp.destroy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds outstanding requests and recovers capacity after completion', async () => {
    const { ssh, sftp } = fixture();
    const managed = await ssh.requestSFTP({ maxPendingRequests: 1 });
    const first = read(managed);
    await expect(read(managed)).rejects.toMatchObject({ code: 'ENOBUFS' });
    expect(sftp.readdir).toHaveBeenCalledOnce();
    sftp.readdir.mock.calls[0][1](undefined, []); await first;
    const next = read(managed); sftp.readdir.mock.calls[1][1](undefined, []); await next;
  });
  it('cancels an opened subsystem and rejects subsequent work', async () => {
    const { ssh, sftp } = fixture(); const controller = new AbortController();
    const managed = await ssh.requestSFTP({ signal: controller.signal });
    const pending = expect(read(managed)).rejects.toMatchObject({ code: 'ABORT_ERR' });
    controller.abort(); await pending;
    await expect(read(managed)).rejects.toMatchObject({ code: 'ABORT_ERR' });
    expect(sftp.readdir).toHaveBeenCalledOnce(); expect(sftp.destroy).toHaveBeenCalledOnce();
  });
  it('has a bounded opening deadline and closes a resource that arrives after cancellation', async () => {
    vi.useFakeTimers();
    const { ssh, sftp, connection } = fixture(); connection.sftp.mockImplementation(() => {});
    const pending = expect(ssh.requestSFTP({ timeoutMs: 20 })).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    await vi.advanceTimersByTimeAsync(20); await pending;
    connection.sftp.mock.calls[0][0](undefined, sftp);
    expect(sftp.destroy).toHaveBeenCalledOnce(); expect(connection.listenerCount('close')).toBe(0);
  });
  it('keeps chaining inside the guard and ignores progress after completion', async () => {
    vi.useFakeTimers();
    const { ssh, sftp } = fixture(); const managed = await ssh.requestSFTP();
    expect(managed.on('custom', () => {})).toBe(managed);
    const waiting = upload(managed);
    sftp.fastPut.mock.calls[0][3](); await waiting;
    sftp.fastPut.mock.calls[0][2].step(1, 1, 1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('settles every outstanding request and stops a transfer if a progress consumer throws', async () => {
    const { ssh, sftp } = fixture(); const managed = await ssh.requestSFTP();
    const first = expect(read(managed)).rejects.toThrow('progress sink failed');
    const second = expect(upload(managed, () => { throw new Error('progress sink failed'); })).rejects.toMatchObject({ kind: 'outcome-unknown' });
    sftp.fastPut.mock.calls[0][2].step(1, 1, 1);
    await Promise.all([first, second]); expect(sftp.destroy).toHaveBeenCalledOnce();
  });
  it('bounds a stalled stream without putting a readable stream into flowing mode', async () => {
    vi.useFakeTimers();
    const { ssh, sftp } = fixture(); const stream = new PassThrough();
    sftp.createReadStream = vi.fn(() => stream);
    const managed = await ssh.requestSFTP({ operationTimeoutMs: 20 });
    const owned = managed.createReadStream('/fixture');
    const error = new Promise(resolve => owned.once('error', resolve));
    expect(owned.readableFlowing).toBeNull();
    await vi.advanceTimersByTimeAsync(20);
    expect(await error).toMatchObject({ code: 'ETIMEDOUT' });
    expect(owned.destroyed).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it('distinguishes missing files from an interrupted existence check', async () => {
    const { ssh, connection } = fixture(); const managed = await ssh.requestSFTP();
    const result = new Promise(resolve => managed.exists('/fixture', (exists, error) => resolve({ exists, error })));
    connection.emit('close');
    expect(await result).toMatchObject({ exists: false, error: { code: 'ECONNRESET' } });
  });

});

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, vi, expect, describe, afterEach } from 'vitest';
import { rm, mkdir, mkdtemp, writeFile } from 'node:fs/promises';

import { NodeSSH } from '../../../src/adapters/ssh/ssh.js';
import { SSHAdapter } from '../../../src/adapters/ssh/index.js';

const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function directory() { const path = await mkdtemp(join(tmpdir(), 'xec-sftp-')); cleanups.push(() => rm(path, { recursive: true, force: true })); return path; }

describe('directory transfer ownership', () => {
  it('creates the remote root even if the source is empty, and includes hidden files by default', async () => {
    const local = await directory(), ssh = new NodeSSH();
    const sftp = { end: vi.fn() } as any;
    vi.spyOn(ssh, 'requestSFTP').mockResolvedValue(sftp);
    const create = vi.spyOn(ssh, 'mkdir').mockResolvedValue();
    const put = vi.spyOn(ssh, 'putFile').mockResolvedValue();
    expect(await ssh.putDirectory(local, '/destination')).toBe(true);
    expect(create).toHaveBeenCalledWith('/destination', 'sftp', sftp);
    await writeFile(join(local, '.config'), 'content');
    await mkdir(join(local, 'empty'));
    expect(await ssh.putDirectory(local, '/destination')).toBe(true);
    expect(put).toHaveBeenCalledWith(join(local, '.config'), '/destination/.config', sftp, {});
    expect(create).toHaveBeenCalledWith('/destination/empty', 'sftp', sftp);
  });
  it('drains already dispatched uploads before closing a failed batch', async () => {
    const ssh = new NodeSSH(), sftp = { end: vi.fn() } as any;
    vi.spyOn(ssh, 'requestSFTP').mockResolvedValue(sftp);
    let finish!: () => void;
    const active = new Promise<void>(resolve => { finish = resolve; });
    vi.spyOn(ssh, 'putFile').mockImplementation(async local => {
      if (local === 'one') throw new Error('upload failed');
      await active;
    });
    const operation = expect(ssh.putFiles([{ local: 'one', remote: '/one' }, { local: 'two', remote: '/two' }], { concurrency: 2 })).rejects.toThrow('upload failed');
    await vi.waitFor(() => expect(ssh.putFile).toHaveBeenCalledTimes(2));
    expect(sftp.end).not.toHaveBeenCalled(); finish(); await operation;
    expect(sftp.end).toHaveBeenCalledOnce();
  });
  it('rejects nested traversal failures and releases the subsystem', async () => {
    const ssh = new NodeSSH(), local = await directory();
    const sftp = { end: vi.fn(), readdir: vi.fn((path, done) => path === '/root'
      ? done(undefined, [{ filename: 'child', attrs: { isDirectory: () => true } }]) : done(new Error('permission denied'))) } as any;
    vi.spyOn(ssh, 'requestSFTP').mockResolvedValue(sftp);
    await expect(ssh.getDirectory(local, '/root')).rejects.toThrow('permission denied');
    expect(sftp.end).toHaveBeenCalledOnce();
  });
  it('rejects path separators from a malicious server before creating local files', async () => {
    const ssh = new NodeSSH(), local = await directory();
    const sftp = { end: vi.fn(), readdir: vi.fn((_path, done) => done(undefined, [{ filename: '../escape', attrs: {} }])) } as any;
    vi.spyOn(ssh, 'requestSFTP').mockResolvedValue(sftp);
    await expect(ssh.getDirectory(join(local, 'destination'), '/root')).rejects.toMatchObject({ code: 'EPROTO' });
    expect(sftp.end).toHaveBeenCalledOnce();
  });
  it('retains a pool lease and surfaces directory failure instead of reporting success', async () => {
    const adapter = new SSHAdapter() as any;
    cleanups.push(() => adapter.dispose());
    let finish!: () => void;
    const active = new Promise<void>(resolve => { finish = resolve; });
    const connection = { activeUseCount: 0, lastUsed: 0, ssh: {
      withSFTP: async (callback: (sftp: unknown) => Promise<unknown>) => callback({}),
      getDirectory: async (_local: string, _remote: string, options: any) => {
        await active; options.tick('/local', '/remote', new Error('unconfirmed download')); return false;
      },
    } };
    vi.spyOn(adapter, 'getConnection').mockResolvedValue(connection);
    const outcome = expect(adapter.downloadDirectory('/remote', '/local', { type: 'ssh', host: 'fixture' })).rejects.toThrow('unconfirmed download');
    await vi.waitFor(() => expect(connection.activeUseCount).toBe(1));
    finish(); await outcome;
    expect(connection.activeUseCount).toBe(0); expect(connection.lastUsed).toBeGreaterThan(0);
  });
});

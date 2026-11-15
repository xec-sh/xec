import type { SFTPEntry, SFTPClient } from '../../src/contracts.js';

import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { it, vi, expect, describe, afterEach } from 'vitest';
import { rm, stat, mkdir, chmod, rename, mkdtemp, readdir, symlink, readFile, realpath, writeFile } from 'node:fs/promises';

import { SSHClient } from '../../src/client.js';

const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.restoreAllMocks(); });
async function directory() {
  const value = await realpath(await mkdtemp(join(tmpdir(), 'xec-directory-boundary-')));
  cleanups.push(() => rm(value, { recursive: true, force: true }));
  return value;
}
function entry(filename: string, directory = false): SFTPEntry {
  return { filename, longname: filename, attrs: { isDirectory: () => directory, isFile: () => !directory } } as SFTPEntry;
}
function fixture(tree: Record<string, SFTPEntry[]>) {
  const ssh = new SSHClient();
  const sftp = { end: vi.fn(), readdir: vi.fn((path: string, done: (error: Error | undefined, list?: SFTPEntry[]) => void) => done(undefined, tree[path] ?? [])) } as unknown as SFTPClient;
  vi.spyOn(ssh, 'requestSFTP').mockResolvedValue(sftp);
  return { ssh, sftp };
}

describe('directory download boundaries', () => {
  it('forwards the declared SFTP lifecycle limits for a multi-file upload', async () => {
    const { ssh } = fixture({}); const signal = new AbortController().signal;
    const options = { signal, timeoutMs: 13, operationTimeoutMs: 17, maxPendingRequests: 3 };
    vi.spyOn(ssh, 'putFile').mockResolvedValue();
    await ssh.putFiles([{ local: 'source', remote: '/target' }], options);
    expect(ssh.requestSFTP).toHaveBeenCalledWith(expect.objectContaining(options));
  });

  it.each(['ancestor', 'leaf'] as const)('rejects a pre-existing %s symlink without touching outside data', async kind => {
    const root = await directory(), outside = await directory();
    const { ssh } = fixture({ '/remote': [entry('child', true)], '/remote/child': [entry('secret')] });
    await writeFile(join(outside, 'secret'), 'original');
    if (kind === 'ancestor') await symlink(outside, join(root, 'child'), 'dir');
    else { await mkdir(join(root, 'child')); await symlink(join(outside, 'secret'), join(root, 'child', 'secret')); }
    const get = vi.spyOn(ssh, 'getFile').mockImplementation(async local => { await writeFile(local, 'attacker'); });
    await expect(ssh.getDirectory(root, '/remote')).rejects.toMatchObject({ code: 'EUNSAFEPATH' });
    expect(get).not.toHaveBeenCalled();
    expect(await readFile(join(outside, 'secret'), 'utf8')).toBe('original');
  });

  it.each(['data:stream', 'CON', 'nul.txt', 'LPT1.log', 'trailing.', 'trailing ', 'wild?.txt', 'CON .txt', 'CONIN$'])('refuses nonportable remote filename %s', async name => {
    const root = await directory(), { ssh } = fixture({ '/remote': [entry(name)] });
    const get = vi.spyOn(ssh, 'getFile').mockResolvedValue();
    await expect(ssh.getDirectory(root, '/remote')).rejects.toMatchObject({ code: 'EPROTO' });
    expect(get).not.toHaveBeenCalled();
    expect(await readdir(root)).toEqual([]);
  });

  it('bounds an endlessly deep directory supplied by the server', async () => {
    const root = await directory(), { ssh, sftp } = fixture({});
    vi.mocked(sftp.readdir).mockImplementation((path, done) => done(undefined, String(path).split('/').length < 12 ? [entry('child', true)] : []));
    await expect(ssh.getDirectory(root, '/remote', { maxDepth: 2 })).rejects.toMatchObject({ code: 'EFBIG' });
    expect(sftp.readdir).toHaveBeenCalledTimes(3);
    expect(await readdir(root)).toEqual([]);
  });

  it('bounds all observed entries, including rejected entries', async () => {
    const root = await directory(), { ssh } = fixture({ '/remote': [entry('one'), entry('two')] });
    await expect(ssh.getDirectory(root, '/remote', { maxEntries: 1, validate: () => false })).rejects.toMatchObject({ code: 'EFBIG' });
    expect(await readdir(root)).toEqual([]);
  });

  it('never replaces a valid destination with a partial failed download', async () => {
    const root = await directory(), { ssh } = fixture({ '/remote': [entry('file')] });
    await writeFile(join(root, 'file'), 'previous');
    vi.spyOn(ssh, 'getFile').mockImplementation(async local => { await writeFile(local, 'partial'); throw new Error('download lost'); });
    expect(await ssh.getDirectory(root, '/remote')).toBe(false);
    expect(await readFile(join(root, 'file'), 'utf8')).toBe('previous');
    expect(await readdir(root)).toEqual(['file']);
  });

  it('publishes a complete file from private staging and retains unrelated files', async () => {
    const root = await directory(), { ssh } = fixture({ '/remote': [entry('child', true)], '/remote/child': [entry('file')] });
    await writeFile(join(root, 'unrelated'), 'keep');
    let staged: string | undefined;
    vi.spyOn(ssh, 'getFile').mockImplementation(async local => { staged = local; await mkdir(dirname(local), { recursive: true }); await writeFile(local, 'complete'); });
    expect(await ssh.getDirectory(root, '/remote')).toBe(true);
    expect(staged).not.toBe(join(root, 'child', 'file'));
    expect(await readFile(join(root, 'child', 'file'), 'utf8')).toBe('complete');
    expect(await readFile(join(root, 'unrelated'), 'utf8')).toBe('keep');
    expect((await readdir(root)).sort()).toEqual(['child', 'unrelated']);
  });
});


describe('directory download publication ownership', () => {
  it('rejects aliases that would collide on a case-insensitive destination', async () => {
    const root = await directory(), { ssh } = fixture({ '/remote': [entry('File'), entry('file')] });
    const get = vi.spyOn(ssh, 'getFile').mockResolvedValue();
    await expect(ssh.getDirectory(root, '/remote')).rejects.toMatchObject({ code: 'EPROTO' });
    expect(get).not.toHaveBeenCalled();
  });
  it('detects a changed ancestor after download and retains foreign data', async () => {
    const root = await directory(), { ssh } = fixture({ '/remote': [entry('child', true)], '/remote/child': [entry('file')] });
    vi.spyOn(ssh, 'getFile').mockImplementation(async local => {
      await writeFile(local, 'downloaded');
      await rename(join(root, 'child'), join(root, 'original'));
      await mkdir(join(root, 'child')); await writeFile(join(root, 'child', 'file'), 'foreign');
    });
    const tick = vi.fn();
    expect(await ssh.getDirectory(root, '/remote', { tick })).toBe(false);
    expect(tick).toHaveBeenCalledWith(join(root, 'child', 'file'), '/remote/child/file', expect.objectContaining({ code: 'EUNSAFEPATH' }));
    expect(await readFile(join(root, 'child', 'file'), 'utf8')).toBe('foreign');
    expect((await readdir(root)).sort()).toEqual(['child', 'original']);
  });
  it.skipIf(process.platform === 'win32')('preserves restrictive permissions when atomically replacing an existing file', async () => {
    const root = await directory(), { ssh } = fixture({ '/remote': [entry('file')] });
    await writeFile(join(root, 'file'), 'previous'); await chmod(join(root, 'file'), 0o600);
    vi.spyOn(ssh, 'getFile').mockImplementation(async local => { await writeFile(local, 'complete', { mode: 0o644 }); });
    expect(await ssh.getDirectory(root, '/remote')).toBe(true);
    expect((await stat(join(root, 'file'))).mode & 0o777).toBe(0o600);
  });
});


it('retains a foreign replacement staging directory and reports both transfer and cleanup failures', async () => {
  const root = await directory(), { ssh } = fixture({ '/remote': [entry('file')] });
  const cause = new Error('download interrupted');
  let foreign: string | undefined;
  vi.spyOn(ssh, 'getFile').mockImplementation(async local => {
    const staging = dirname(local); foreign = staging;
    await rename(staging, join(root, 'original-staging'));
    await mkdir(staging); await writeFile(join(staging, 'foreign'), 'keep');
    throw cause;
  });
  const error = await ssh.getDirectory(root, '/remote').then(() => undefined, failure => failure);
  expect(error).toBeInstanceOf(AggregateError);
  expect(error.errors).toEqual([cause, expect.objectContaining({ code: 'EUNSAFEPATH' })]);
  expect(error.cause).toBe(cause);
  expect(await readFile(join(foreign!, 'foreign'), 'utf8')).toBe('keep');
  expect(await readdir(join(root, 'original-staging'))).toEqual([]);
});

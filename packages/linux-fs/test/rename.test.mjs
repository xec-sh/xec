import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';
import { constants as fsFlags } from 'node:fs';
import { renameNoReplace } from '@xec-sh/linux-fs';
import { rm, link, open, chmod, lstat, mkdir, rename, mkdtemp, symlink, readFile, readlink } from 'node:fs/promises';

const supported = process.platform === 'linux' && ['x64', 'arm64'].includes(process.arch);
async function fixture(t) {
  const path = await mkdtemp(join(tmpdir(), 'xec-publish-'));
  const directory = await open(path, fsFlags.O_RDONLY | fsFlags.O_DIRECTORY | fsFlags.O_NOFOLLOW);
  t.after(async () => { await directory.close(); await rm(path, { recursive: true, force: true }); });
  async function prepare(name) {
    const file = await open(join(path, name), 'wx', 0o600);
    try { await file.writeFile(name); await file.sync(); return await file.stat({ bigint: true }); }
    finally { await file.close(); }
  }
  return { path, directory, prepare };
}
const rejected = (code) => ({ name: 'RenameNoReplaceError', outcome: 'not-published', code });

test('one contender publishes the synced inode; all others keep their original single links', { skip: !supported }, async t => {
  const { path, directory, prepare } = await fixture(t);
  const names = Array.from({ length: 12 }, (_, i) => 'source-' + i);
  const original = await Promise.all(names.map(prepare));
  const results = await Promise.allSettled(names.map(name => renameNoReplace(directory, name, 'result')));
  const winners = names.filter((_, i) => results[i].status === 'fulfilled');
  assert.equal(winners.length, 1);
  assert.equal(await readFile(join(path, 'result'), 'utf8'), winners[0]);
  for (const [i, name] of names.entries()) {
    if (name === winners[0]) await assert.rejects(lstat(join(path, name)), { code: 'ENOENT' });
    else assert.deepEqual({ code: results[i].reason.code, outcome: results[i].reason.outcome }, { code: 'EEXIST', outcome: 'not-published' });
    const file = await lstat(join(path, name === winners[0] ? 'result' : name), { bigint: true });
    assert.equal(file.nlink, 1n);
    assert.equal(file.ino, original[i].ino);
  }
});

test('preserves an existing destination symlink and rejects symlink or hard-linked sources', { skip: !supported }, async t => {
  const { path, directory, prepare } = await fixture(t);
  await prepare('source');
  await symlink('absent', join(path, 'link'));
  await assert.rejects(renameNoReplace(directory, 'source', 'link'), rejected('EEXIST'));
  assert.equal(await readlink(join(path, 'link')), 'absent');
  await assert.rejects(renameNoReplace(directory, 'link', 'new'), rejected('EINVAL'));
  await link(join(path, 'source'), join(path, 'alias'));
  await assert.rejects(renameNoReplace(directory, 'source', 'new'), rejected('EINVAL'));
  await assert.rejects(lstat(join(path, 'new')), { code: 'ENOENT' });
});

test('uses the inherited directory when its old pathname has been reassigned', { skip: !supported }, async t => {
  const { path, prepare } = await fixture(t);
  await mkdir(join(path, 'parent'), { mode: 0o700 });
  await prepare('parent/source');
  const pinned = await open(join(path, 'parent'), fsFlags.O_RDONLY | fsFlags.O_DIRECTORY);
  try {
    await rename(join(path, 'parent'), join(path, 'moved'));
    await mkdir(join(path, 'parent'), { mode: 0o700 });
    await renameNoReplace(pinned, 'source', 'result');
    assert.equal(await readFile(join(path, 'moved', 'result'), 'utf8'), 'parent/source');
    await assert.rejects(lstat(join(path, 'parent', 'result')), { code: 'ENOENT' });
  } finally { await pinned.close(); }
});

test('rejects invalid names, missing source, and directories writable by other users', { skip: !supported }, async t => {
  const { path, directory, prepare } = await fixture(t);
  await prepare('source');
  for (const invalid of ['', '.', '..', '../escape', 'slash/name', '\0', '\ud800', 'source'])
    await assert.rejects(renameNoReplace(directory, 'source', invalid), rejected('EINVAL'));
  await assert.rejects(renameNoReplace(directory, 'missing', 'new'), rejected('ENOENT'));
  await assert.rejects(renameNoReplace(directory, 'source', 'new', AbortSignal.abort()), rejected('ABORT_ERR'));
  await chmod(path, 0o770);
  await assert.rejects(renameNoReplace(directory, 'source', 'new'), rejected('EPERM'));
  await assert.rejects(lstat(join(path, 'new')), { code: 'ENOENT' });
});

test('reports unsupported platforms before starting any operation', { skip: supported }, async () => {
  await assert.rejects(renameNoReplace(undefined, 'source', 'dest'), rejected('ENOTSUP'));
});

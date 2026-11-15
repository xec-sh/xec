import type { ChildProcess } from 'node:child_process';

import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { it, vi, expect, afterAll, beforeAll, afterEach, beforeEach } from 'vitest';
import { rm, link, chmod, mkdir, unlink, rename, mkdtemp, readdir, symlink, readFile, writeFile } from 'node:fs/promises';

import { MemoryCache } from '../../../src/module/module-cache.js';
import { ModuleFetcher } from '../../../src/module/module-fetcher.js';
import { IntegrityError, computeModuleIdentity, ModuleIntegrityVerifier } from '../../../src/module/module-integrity.js';

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, link: vi.fn(actual.link), unlink: vi.fn(actual.unlink) };
});

let directory: string, nativeDirectory: string, driver: string;
const children = new Set<ChildProcess>();
const firstURL = 'https://esm.sh/first.js', secondURL = 'https://esm.sh/second.js';
const firstSource = 'export const value = 1;', secondSource = 'export const value = 2;';
const descriptor = () => join(directory, 'module-lock.json');
const pinPath = (url: string) => join(`${descriptor()}.pins`, computeModuleIdentity(url) + '.json');
const verifier = (mode: 'lockfile' | 'strict' = 'lockfile') => new ModuleIntegrityVerifier(directory, { mode });

beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'xec-immutable-pins-')); });
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) { const closed = once(child, 'close'); child.kill(); await closed; }
  }
  children.clear();
  await rm(directory, { recursive: true, force: true });
});

beforeAll(async () => {
  nativeDirectory = await mkdtemp(join(tmpdir(), 'xec-pin-process-fixture-'));
  const owner = join(nativeDirectory, 'integrity.mjs');
  await build({ entryPoints: [fileURLToPath(new URL('../../../src/module/module-integrity.ts', import.meta.url))], outfile: owner, platform: 'node', format: 'esm', bundle: true, logLevel: 'silent' });
  driver = join(nativeDirectory, 'writer.mjs');
  await writeFile(driver, `
import fs from 'node:fs/promises';
import { dirname } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
const [directory, serialized, pause] = process.argv.slice(2);
const entries = JSON.parse(serialized);
if (pause) {
  const link = fs.link;
  fs.link = async (source, target) => {
    const pin = dirname(String(target)).endsWith('.pins');
    if (pin && pause === 'before-link') { process.send({ kind: pause }); await new Promise(() => {}); }
    const result = await link(source, target);
    if (pin && pause === 'after-link') { process.send({ kind: pause }); await new Promise(() => {}); }
    return result;
  };
  syncBuiltinESMExports();
}
const { ModuleIntegrityVerifier } = await import(${JSON.stringify(pathToFileURL(owner).href)});
const subject = new ModuleIntegrityVerifier(directory);
await Promise.all(entries.map(([url, source]) => subject.verify(url, source)));
process.on('message', async message => {
  if (message !== 'save') return;
  try { await subject.save(); process.send({ kind: 'result', ok: true }); }
  catch (error) { process.send({ kind: 'result', ok: false, name: error.name, message: error.message }); }
  finally { process.disconnect(); }
});
process.send({ kind: 'prepared' });
`);
});
afterAll(async () => { await rm(nativeDirectory, { recursive: true, force: true }); });

interface WriterResult { kind: 'result'; ok: boolean; name?: string; message?: string }
async function startWriter(entries: [string, string][], pause?: 'before-link' | 'after-link') {
  const child = spawn(process.execPath, [driver, directory, JSON.stringify(entries), ...(pause ? [pause] : [])], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  children.add(child);
  let stderr = '';
  child.stderr!.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-4096); });
  const waitFor = <T>(kind: string) => new Promise<T>((resolve, reject) => {
    const message = (value: unknown) => {
      if (value && typeof value === 'object' && 'kind' in value && value.kind === kind) { cleanup(); resolve(value as T); }
    };
    const failed = () => { cleanup(); reject(new Error(`Native pin writer ended before ${kind}: ${stderr}`)); };
    const cleanup = () => { child.off('message', message); child.off('error', failed); child.off('close', failed); };
    child.on('message', message); child.once('error', failed); child.once('close', failed);
  });
  await waitFor('prepared');
  return { child, waitFor, save() { const result = waitFor<WriterResult>('result'); child.send('save'); return result; } };
}

it('preserves separate pins from writers that observed the same empty store', async () => {
  const left = verifier(), right = verifier();
  await Promise.all([left.verify(firstURL, firstSource), right.verify(secondURL, secondSource)]);
  await Promise.all([left.save(), right.save()]);
  expect((await readdir(`${descriptor()}.pins`)).sort()).toEqual([firstURL, secondURL].map(url => computeModuleIdentity(url) + '.json').sort());
  await expect(verifier('strict').verify(firstURL, firstSource)).resolves.toBeUndefined();
  await expect(verifier('strict').verify(secondURL, secondSource)).resolves.toBeUndefined();
});

it('rejects a conflicting stale writer and leaves the established pin unchanged', async () => {
  const left = verifier(), right = verifier();
  await Promise.all([left.verify(firstURL, firstSource), right.verify(firstURL, secondSource)]);
  await left.save(); const established = await readFile(pinPath(firstURL), 'utf8');
  await expect(right.save()).rejects.toBeInstanceOf(IntegrityError);
  expect(await readFile(pinPath(firstURL), 'utf8')).toBe(established);
});

it('coalesces identical pending pins and rejects conflicting decisions in one instance', async () => {
  const subject = verifier();
  await Promise.all([subject.verify(firstURL, firstSource), subject.verify(firstURL, firstSource)]);
  await expect(subject.verify(firstURL, secondSource)).rejects.toBeInstanceOf(IntegrityError);
  await Promise.all([subject.save(), subject.save()]);
  expect(await readdir(`${descriptor()}.pins`)).toEqual([computeModuleIdentity(firstURL) + '.json']);
});

it('accepts the same immutable decision from independently prepared writers', async () => {
  const left = verifier(), right = verifier();
  await Promise.all([left.verify(firstURL, firstSource), right.verify(firstURL, firstSource)]);
  await Promise.all([left.save(), right.save()]);
  expect(await readdir(`${descriptor()}.pins`)).toEqual([computeModuleIdentity(firstURL) + '.json']);
});

it('observes current pins through an already-created strict verifier', async () => {
  const strict = verifier('strict');
  await expect(strict.assertFetchAllowed(firstURL)).rejects.toBeInstanceOf(IntegrityError);
  const seed = verifier(); await seed.verify(firstURL, firstSource); await seed.save();
  await expect(strict.assertFetchAllowed(firstURL)).resolves.toBeUndefined();
  await writeFile(pinPath(firstURL), '{ malformed');
  await expect(strict.assertFetchAllowed(firstURL)).rejects.toThrow(/malformed/);
});

it('rejects the interim mutable v2 format before any network request or migration', async () => {
  const old = JSON.stringify({ version: 2, modules: {} }); await writeFile(descriptor(), old);
  const network = vi.fn(); vi.stubGlobal('fetch', network);
  await expect(new ModuleFetcher(new MemoryCache<string>(), verifier()).fetch(firstURL)).rejects.toThrow(/mutable snapshots/);
  expect(network).not.toHaveBeenCalled(); expect(await readFile(descriptor(), 'utf8')).toBe(old);
});

it.skipIf(process.platform === 'win32')('supports reviewed stores in normal 0755 repositories with 0644 records', async () => {
  const repository = join(directory, 'reviewed-repository'); await mkdir(repository, { mode: 0o755 });
  const location = join(repository, 'module-lock.json');
  const subject = new ModuleIntegrityVerifier(join(directory, 'unused-cache'), { lockfilePath: location });
  await subject.verify(firstURL, firstSource); await subject.save();
  await chmod(`${location}.pins`, 0o755); await chmod(location, 0o644);
  await chmod(join(`${location}.pins`, computeModuleIdentity(firstURL) + '.json'), 0o644);
  const reviewed = new ModuleIntegrityVerifier(join(directory, 'another-unused-cache'), { lockfilePath: location, mode: 'strict' });
  await expect(reviewed.verify(firstURL, firstSource)).resolves.toBeUndefined();
  await subject.verify(secondURL, secondSource); await subject.save();
  await expect(reviewed.verify(secondURL, secondSource)).resolves.toBeUndefined();
});

it.skipIf(process.platform === 'win32').each(['descriptor', 'pin'])('rejects an existing %s that other users can write', async record => {
  const subject = verifier(); await subject.verify(firstURL, firstSource); await subject.save();
  await chmod(record === 'descriptor' ? descriptor() : pinPath(firstURL), 0o666);
  await expect(verifier('strict').assertFetchAllowed(firstURL)).rejects.toThrow(/no other writers/);
});

it.skipIf(process.platform === 'win32')('rejects an existing descriptor parent that other users can replace', async () => {
  const subject = verifier(); await subject.verify(firstURL, firstSource); await subject.save();
  await chmod(directory, 0o777);
  await expect(verifier('strict').assertFetchAllowed(firstURL)).rejects.toThrow(/no other writers/);
});

it.skipIf(process.platform === 'win32')('rejects an existing pin directory that other users can write', async () => {
  const subject = verifier(); await subject.verify(firstURL, firstSource); await subject.save();
  await chmod(`${descriptor()}.pins`, 0o777);
  await expect(verifier('strict').assertFetchAllowed(firstURL)).rejects.toThrow(/no other writers/);
});

it('limits descriptor and pin reads and refuses a missing pin directory', async () => {
  await writeFile(descriptor(), ' '.repeat(16 * 1024 + 1));
  await expect(verifier().assertFetchAllowed(firstURL)).rejects.toThrow(/16 KiB/);
  await writeFile(descriptor(), JSON.stringify({ version: 2, storage: 'immutable-pins' }));
  await expect(verifier().assertFetchAllowed(firstURL)).rejects.toMatchObject({ code: 'ENOENT' });
  await mkdir(`${descriptor()}.pins`, { mode: 0o700 });
  await writeFile(pinPath(firstURL), ' '.repeat(16 * 1024 + 1));
  await expect(verifier('strict').assertFetchAllowed(firstURL)).rejects.toThrow(/16 KiB/);
  expect(() => verifier().assertHostAllowed('https://esm.sh/' + 'x'.repeat(8192))).toThrow(/8 KiB/);
});

it.skipIf(process.platform === 'win32')('refuses symbolic links for the descriptor and pins', async () => {
  const target = join(directory, 'foreign.json'); await writeFile(target, '{}'); await symlink(target, descriptor());
  await expect(verifier().assertFetchAllowed(firstURL)).rejects.toThrow();
  await unlink(descriptor()); const seed = verifier(); await seed.verify(firstURL, firstSource); await seed.save();
  await unlink(pinPath(firstURL)); await symlink(target, pinPath(firstURL));
  await expect(verifier('strict').assertFetchAllowed(firstURL)).rejects.toThrow();
  expect(await readFile(target, 'utf8')).toBe('{}');
});

it.skipIf(process.platform === 'win32')('refuses a FIFO pin without waiting for a writer', async () => {
  const seed = verifier(); await seed.verify(firstURL, firstSource); await seed.save();
  await unlink(pinPath(firstURL)); execFileSync('mkfifo', [pinPath(firstURL)]);
  await expect(verifier('strict').assertFetchAllowed(firstURL)).rejects.toThrow(/regular file/);
});

it('reports cleanup failure and retains the pending decision for an exact retry', async () => {
  const seed = verifier(); await seed.verify(secondURL, secondSource); await seed.save();
  const subject = verifier(); await subject.verify(firstURL, firstSource);
  const failure = new Error('synthetic owned cleanup failure'); vi.mocked(unlink).mockRejectedValueOnce(failure);
  await expect(subject.save()).rejects.toBe(failure);
  await expect(verifier('strict').verify(firstURL, firstSource)).resolves.toBeUndefined();
  await expect(subject.save()).resolves.toBeUndefined();
});

it('retains valid partial pins and rejects a later competing decision without deleting either author', async () => {
  const left = verifier(), right = verifier();
  await left.verifyAll([firstURL, secondURL], firstSource); await right.verify(secondURL, secondSource);
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  const initialize = verifier(); await initialize.verify('https://esm.sh/seed.js', firstSource); await initialize.save();
  vi.mocked(link).mockImplementationOnce(async (source, target) => { await actual.link(source, target); await right.save(); });
  await expect(left.save()).rejects.toBeInstanceOf(IntegrityError);
  await expect(verifier('strict').verify(firstURL, firstSource)).resolves.toBeUndefined();
  await expect(verifier('strict').verify(secondURL, secondSource)).resolves.toBeUndefined();
});

it('does not delete a foreign replacement at its former staging path', async () => {
  const seed = verifier(); await seed.verify(secondURL, secondSource); await seed.save();
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  let replacement: string | undefined;
  vi.mocked(link).mockImplementationOnce(async (source, target) => {
    await actual.link(source, target); replacement = String(source);
    await rename(source, join(directory, 'retained-original')); await writeFile(source, 'foreign replacement');
  });
  const subject = verifier(); await subject.verify(firstURL, firstSource);
  await expect(subject.save()).rejects.toThrow(/ownership changed/);
  expect(await readFile(replacement!, 'utf8')).toBe('foreign replacement');
});

it('fails explicitly when exclusive publication is unsupported, without an overwrite fallback', async () => {
  const seed = verifier(); await seed.verify(secondURL, secondSource); await seed.save();
  const subject = verifier(); await subject.verify(firstURL, firstSource);
  vi.mocked(link).mockRejectedValueOnce(Object.assign(new Error('hard links unavailable'), { code: 'ENOTSUP' }));
  await expect(subject.save()).rejects.toMatchObject({ code: 'ENOTSUP' });
  await expect(readFile(pinPath(firstURL))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await readdir(`${descriptor()}.pins`)).toEqual([computeModuleIdentity(secondURL) + '.json']);
});

it('preserves independent native-process writers without a shared in-memory queue', async () => {
  const writers = await Promise.all(Array.from({ length: 4 }, (_, index) => startWriter([
    [`https://esm.sh/process-${index}.js`, firstSource], [`https://esm.sh/process-${index}-other.js`, secondSource],
  ])));
  expect((await Promise.all(writers.map(writer => writer.save()))).every(result => result.ok)).toBe(true);
  expect(await readdir(`${descriptor()}.pins`)).toHaveLength(8);
});

it('accepts identical native-process pins without republishing or replacing the winner', async () => {
  const writers = await Promise.all(Array.from({ length: 3 }, () => startWriter([[firstURL, firstSource]])));
  expect((await Promise.all(writers.map(writer => writer.save()))).every(result => result.ok)).toBe(true);
  expect(await readdir(`${descriptor()}.pins`)).toEqual([computeModuleIdentity(firstURL) + '.json']);
});

it('allows exactly one native-process winner for competing digests of one URL', async () => {
  const writers = await Promise.all([startWriter([[firstURL, firstSource]]), startWriter([[firstURL, secondSource]])]);
  const results = await Promise.all(writers.map(writer => writer.save()));
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(results.find(result => !result.ok)).toMatchObject({ name: 'IntegrityError' });
  const winner = results[0]!.ok ? firstSource : secondSource;
  await expect(verifier('strict').verify(firstURL, winner)).resolves.toBeUndefined();
});

it.each(['before-link', 'after-link'] as const)('a native writer exit %s never exposes a partial pin or blocks unrelated writers', async pause => {
  const writer = await startWriter([[firstURL, firstSource]], pause);
  const reached = writer.waitFor(pause); writer.child.send('save'); await reached;
  const closed = once(writer.child, 'close'); writer.child.kill(); await closed;
  if (pause === 'before-link') await expect(verifier('strict').assertFetchAllowed(firstURL)).rejects.toBeInstanceOf(IntegrityError);
  else await expect(verifier('strict').verify(firstURL, firstSource)).resolves.toBeUndefined();
  const next = verifier(); await next.verify(secondURL, secondSource); await next.save();
  await expect(verifier('strict').verify(secondURL, secondSource)).resolves.toBeUndefined();
});

import os from 'node:os';
import ts from 'typescript';
import path from 'node:path';
import fs from 'node:fs/promises';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { withKernelFileLock } from '../../../src/utils/file-lock.js';

const supported = ['darwin', 'linux'].includes(process.platform);
let root: string;
const children: ChildProcess[] = [];

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-kernel-lock-'));
  await fs.chmod(root, 0o700);
});
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'close');
      child.send?.('exit');
      await exited;
    }
  }
  await fs.rm(root, { recursive: true, force: true });
});

describe.skipIf(!supported)('native kernel file locks', () => {
  it('serializes concurrent callers and retains the lock inode after release', async () => {
    const file = path.join(root, 'build.lock');
    let active = 0;
    let peak = 0;
    const values = await Promise.all([1, 2, 3].map(value => withKernelFileLock(file, async () => {
      active++;
      peak = Math.max(peak, active);
      await delay(20);
      active--;
      return value;
    })));
    expect(values).toEqual([1, 2, 3]);
    expect(peak).toBe(1);
    const initial = await fs.stat(file);
    await withKernelFileLock(file, async () => undefined);
    const later = await fs.stat(file);
    expect([later.dev, later.ino, later.mode & 0o777]).toEqual([initial.dev, initial.ino, 0o600]);
  });

  it('releases the lock after a callback failure and propagates that same error', async () => {
    const file = path.join(root, 'build.lock');
    const failure = new Error('build failed');
    await expect(withKernelFileLock(file, async () => { throw failure; })).rejects.toBe(failure);
    await expect(withKernelFileLock(file, async () => 42, 0)).resolves.toBe(42);
  });

  it('allows independent lock files to run concurrently', async () => {
    let entered = 0;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    await Promise.all(['a.lock', 'b.lock'].map(name => withKernelFileLock(path.join(root, name), async () => {
      if (++entered === 2) release();
      await barrier;
    })));
    expect(entered).toBe(2);
  });

  it('enforces the acquisition timeout and releases a lock after the holder exits without finally', async () => {
    const file = path.join(root, 'build.lock');
    const implementation = await fs.readFile(fileURLToPath(new URL('../../../src/utils/file-lock.ts', import.meta.url)), 'utf8');
    // A standalone ESM fixture runs in a second real process outside a package boundary.
    const module = path.join(root, 'lock.mjs');
    await fs.writeFile(module, ts.transpileModule(implementation, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText);
    const fixture = path.join(root, 'holder.mjs');
    await fs.writeFile(fixture, `import { withKernelFileLock } from ${JSON.stringify(pathToFileURL(module).href)};
await withKernelFileLock(process.argv[2], async () => {
  process.send('held');
  await new Promise(resolve => process.on('message', message => {
    if (message === 'exit') process.exit(23);
    if (message === 'release') resolve();
  }));
});
process.disconnect();`);
    const child = spawn(process.execPath, [fixture, file], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    children.push(child);
    let errors = '';
    child.stderr!.on('data', chunk => { errors += chunk.toString(); });
    const ready = await Promise.race([
      once(child, 'message'),
      once(child, 'close').then(() => { throw new Error('Lock holder exited before acquisition: ' + errors); }),
    ]);
    expect(ready[0]).toBe('held');
    let entered = false;
    await expect(withKernelFileLock(file, async () => { entered = true; }, 1)).rejects.toThrow('not acquired');
    expect(entered).toBe(false);
    const exited = once(child, 'close');
    child.send('exit');
    expect((await exited)[0]).toBe(23);
    await expect(withKernelFileLock(file, async () => 'reacquired', 0)).resolves.toBe('reacquired');
  });

  it('rejects symlink and shared parent directories before invoking the callback', async () => {
    const privateDirectory = path.join(root, 'private');
    await fs.mkdir(privateDirectory, { mode: 0o700 });
    const alias = path.join(root, 'alias');
    await fs.symlink(privateDirectory, alias);
    await expect(withKernelFileLock(path.join(alias, 'build.lock'), async () => undefined)).rejects.toThrow('private parent');
    await fs.chmod(privateDirectory, 0o755);
    await expect(withKernelFileLock(path.join(privateDirectory, 'build.lock'), async () => undefined)).rejects.toThrow('private parent');
  });

  it('rejects symlink and hard-linked lock files without altering their targets', async () => {
    const target = path.join(root, 'target');
    await fs.writeFile(target, 'preserved', { mode: 0o600 });
    const link = path.join(root, 'link');
    await fs.symlink(target, link);
    await expect(withKernelFileLock(link, async () => undefined)).rejects.toThrow();
    await fs.unlink(link);
    await fs.link(target, link);
    await expect(withKernelFileLock(link, async () => undefined)).rejects.toThrow('hard links');
    expect(await fs.readFile(target, 'utf8')).toBe('preserved');
  });

  it('tightens an owned read-only-for-others file and rejects other writers', async () => {
    const file = path.join(root, 'build.lock');
    await fs.writeFile(file, '', { mode: 0o644 });
    await withKernelFileLock(file, async () => {
      expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
    });
    await fs.chmod(file, 0o666);
    await expect(withKernelFileLock(file, async () => undefined)).rejects.toThrow('other writers');
  });

  it.each([-1, NaN, Infinity, 1.5, 2_147_483_647])('rejects invalid acquisition timeout %s', async seconds => {
    await expect(withKernelFileLock(path.join(root, 'build.lock'), async () => undefined, seconds)).rejects.toThrow('timeout');
    expect(await fs.readdir(root)).toEqual([]);
  });
});

it.skipIf(supported)('reports unsupported kernel locking platforms explicitly', async () => {
  await expect(withKernelFileLock(path.join(root, 'build.lock'), async () => undefined)).rejects.toThrow('macOS lockf or Linux flock');
});

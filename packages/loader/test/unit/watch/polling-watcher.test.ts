import * as os from 'node:os';
import { build } from 'esbuild';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import nativeFs, { promises as fs } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { spawn, execFile } from 'node:child_process';

import { watchFiles, FileWatcher } from '../../../src/watch/file-watcher.js';

/** Real filesystem mutations exercise the polling contract independently of
 * native notification delivery. No working application or source is touched. */
describe('FileWatcher polling', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-poll-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  /** Resolve on the first change event, or reject once the budget is spent. */
  const nextChange = (watcher: FileWatcher, budgetMs = 5000): Promise<string> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no change event')), budgetMs);
      watcher.once('change', event => {
        clearTimeout(timer);
        resolve(event.path);
      });
    });

  it('reports a modified file', async () => {
    const file = path.join(dir, 'watched.txt');
    await fs.writeFile(file, 'before');

    const watcher = new FileWatcher(dir, { poll: true, pollInterval: 50, debounce: 10, extensions: [] });
    watcher.start();

    try {
      const seen = nextChange(watcher);
      // A modification the first sweep cannot mistake for the initial state.
      await new Promise(resolve => setTimeout(resolve, 80));
      await fs.writeFile(file, 'after');

      expect(await seen).toBe(file);
    } finally {
      watcher.close();
    }
  }, 20_000);

  it('reports a newly created file', async () => {
    const watcher = new FileWatcher(dir, { poll: true, pollInterval: 50, debounce: 10, extensions: [] });
    watcher.start();

    try {
      const seen = nextChange(watcher);
      await new Promise(resolve => setTimeout(resolve, 80));
      await fs.writeFile(path.join(dir, 'created.txt'), 'new');

      expect(await seen).toBe(path.join(dir, 'created.txt'));
    } finally {
      watcher.close();
    }
  }, 20_000);

  it('stays silent about files that were already there', async () => {
    await fs.writeFile(path.join(dir, 'existing.txt'), 'old');

    const watcher = new FileWatcher(dir, { poll: true, pollInterval: 50, debounce: 10, extensions: [] });
    const events: string[] = [];
    watcher.on('change', event => events.push(event.path));
    watcher.start();

    try {
      // Several sweeps must pass with nothing touched: a watcher that
      // announces the existing tree on startup triggers the rebuild the
      // operator started it to avoid.
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(events).toEqual([]);
    } finally {
      watcher.close();
    }
  }, 20_000);

  it('honours the ignore list', async () => {
    await fs.mkdir(path.join(dir, 'node_modules'));

    const watcher = new FileWatcher(dir, {
      poll: true,
      pollInterval: 50,
      debounce: 10,
      extensions: [],
      ignore: ['node_modules'],
    });
    const events: string[] = [];
    watcher.on('change', event => events.push(event.path));
    watcher.start();

    try {
      await new Promise(resolve => setTimeout(resolve, 80));
      await fs.writeFile(path.join(dir, 'node_modules', 'noise.txt'), 'x');
      await new Promise(resolve => setTimeout(resolve, 250));

      expect(events).toEqual([]);
    } finally {
      watcher.close();
    }
  }, 20_000);

  it('stops sweeping once closed', async () => {
    const watcher = new FileWatcher(dir, { poll: true, pollInterval: 50, debounce: 10, extensions: [] });
    watcher.start();
    watcher.close();

    const events: string[] = [];
    watcher.on('change', event => events.push(event.path));
    await fs.writeFile(path.join(dir, 'after-close.txt'), 'x');
    await new Promise(resolve => setTimeout(resolve, 250));

    expect(events).toEqual([]);
  }, 20_000);

  it('detects atomic replacements even when the editor preserves size and mtime', async () => {
    const file = path.join(dir, 'atomic.txt'), temporary = path.join(dir, 'replacement.tmp');
    await fs.writeFile(file, 'before');
    const previous = await fs.stat(file);
    const watcher = new FileWatcher(dir, { poll: true, pollInterval: 30, debounce: 10, extensions: ['.txt'] });
    watcher.start();
    try {
      const seen = nextChange(watcher);
      await fs.writeFile(temporary, 'after!');
      await fs.utimes(temporary, previous.atime, previous.mtime);
      await fs.rename(temporary, file);
      expect(await seen).toBe(file);
      expect(await fs.readFile(file, 'utf8')).toBe('after!');
    } finally { watcher.close(); }
  });

  it('keeps nested paths relative to their configured root', async () => {
    await fs.mkdir(path.join(dir, 'nested'));
    const watcher = new FileWatcher(dir, { poll: true, pollInterval: 30, debounce: 10, extensions: [] });
    watcher.start();
    try {
      const event = new Promise<{ relativePath: string }>(resolve => watcher.once('change', resolve));
      await fs.writeFile(path.join(dir, 'nested/created.txt'), 'new');
      expect(await event).toMatchObject({ relativePath: path.join('nested', 'created.txt') });
    } finally { watcher.close(); }
  });

  it('reports removed files as unlink without announcing them as existing', async () => {
    const file = path.join(dir, 'removed.txt');
    await fs.writeFile(file, 'before');
    const watcher = new FileWatcher(dir, { poll: true, pollInterval: 30, debounce: 10, extensions: [] });
    watcher.start();
    try {
      const event = new Promise<{ type: string; path: string }>(resolve => watcher.once('change', resolve));
      await fs.rm(file);
      expect(await event).toMatchObject({ type: 'unlink', path: file });
    } finally { watcher.close(); }
  });

  it('fails visibly and closes if a configured polling root disappears', async () => {
    await fs.writeFile(path.join(dir, 'preserved.txt'), 'before');
    const watcher = new FileWatcher(dir, { poll: true, pollInterval: 30, debounce: 10, extensions: [] });
    const events: string[] = [];
    const failed = new Promise<Error>(resolve => watcher.once('error', resolve));
    watcher.on('ready', () => events.push('ready'));
    watcher.on('change', event => events.push(event.type));
    watcher.on('close', () => events.push('closed'));
    watcher.start();
    await fs.rm(dir, { recursive: true });
    expect(await failed).toMatchObject({ code: 'ENOENT' });
    expect(events).toEqual(['ready', 'closed']);
    expect(() => watcher.start()).toThrow('closed');
  });

  it('does not announce ready after an incomplete initial subscription', () => {
    const watcher = new FileWatcher([dir, path.join(dir, 'absent')], { poll: true });
    const events: string[] = [];
    watcher.on('error', () => events.push('error'));
    watcher.on('ready', () => events.push('ready'));
    watcher.on('close', () => events.push('closed'));
    watcher.start();
    expect(events).toEqual(['error', 'closed']);
  });

  it('starts once and closes its only polling schedule', () => {
    vi.useFakeTimers();
    const watcher = new FileWatcher(dir, { poll: true });
    const ready = vi.fn();
    watcher.on('ready', ready);
    try {
      watcher.start(); watcher.start();
      expect(ready).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(1);
      watcher.close();
      expect(vi.getTimerCount()).toBe(0);
    } finally { watcher.close(); vi.useRealTimers(); }
  });

  it.each([0, -1, Infinity, NaN])('rejects invalid polling interval %s', pollInterval => {
    expect(() => new FileWatcher(dir, { poll: true, pollInterval })).toThrow('pollInterval');
  });

  it('reports a deferred filesystem I/O error without claiming unlink', async () => {
    const file = path.join(dir, 'pending.txt');
    await fs.writeFile(file, 'before');
    const watcher = new FileWatcher(dir, { poll: true, pollInterval: 100, debounce: 10, extensions: [] });
    const changes: string[] = [];
    watcher.on('change', event => changes.push(event.type));
    const failure = new Promise<Error>(resolve => watcher.once('error', resolve));
    watcher.start();
    const stat = nativeFs.statSync;
    let calls = 0;
    const probe = vi.spyOn(nativeFs, 'statSync').mockImplementation((...args: Parameters<typeof stat>) => {
      if (args[0] === file && ++calls > 1) throw Object.assign(new Error('fixture I/O failure'), { code: 'EIO' });
      return Reflect.apply(stat, nativeFs, args);
    });
    syncBuiltinESMExports();
    try {
      await fs.writeFile(file, 'after');
      expect(await failure).toMatchObject({ code: 'EIO' });
      expect(changes).toEqual([]);
      expect(() => watcher.start()).toThrow('closed');
    } finally { watcher.close(); probe.mockRestore(); syncBuiltinESMExports(); }
  });

  it('reports synchronous convenience-handler errors through the same path as rejections', async () => {
    const error = new Error('synchronous handler failure');
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stop = watchFiles(dir, () => { throw error; }, { poll: true, pollInterval: 30, debounce: 10, extensions: [] });
    try {
      await fs.writeFile(path.join(dir, 'created.txt'), 'new');
      const deadline = Date.now() + 5000;
      while (!reported.mock.calls.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
      expect(reported).toHaveBeenCalledWith('Watch handler error:', error);
    } finally { stop(); reported.mockRestore(); }
  });

  it('keeps a public polling CLI alive until close, with explicit background opt-out', async () => {
    const consumer = path.join(dir, 'consumer'), watched = path.join(dir, 'watched');
    const pkg = path.join(consumer, 'node_modules/@xec-sh/loader');
    await fs.mkdir(pkg, { recursive: true });
    await fs.mkdir(watched);
    await fs.writeFile(path.join(pkg, 'package.json'), JSON.stringify({
      name: '@xec-sh/loader', type: 'module', exports: { './watch': './watch.js' },
    }));
    await build({ entryPoints: [fileURLToPath(new URL('../../../src/watch/index.ts', import.meta.url))],
      outfile: path.join(pkg, 'watch.js'), bundle: true, platform: 'node', format: 'esm' });
    const script = path.join(consumer, 'run.mjs');
    await fs.writeFile(script, `import { FileWatcher } from '@xec-sh/loader/watch';
const watcher = new FileWatcher(process.argv[2], { poll: true, persistent: process.argv[3] !== 'background' });
watcher.on('ready', () => console.log('ready'));
watcher.on('close', () => console.log('closed'));
process.on('SIGTERM', () => watcher.close());
process.on('beforeExit', () => console.log('idle'));
watcher.start();
`);
    const child = spawn(process.execPath, [script, watched], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', stderr = '', ended = false;
    child.stdout.on('data', chunk => { output += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    const exit = new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', code => { ended = true; resolve(code); });
    });
    try {
      const deadline = Date.now() + 5000;
      while (!ended && !output.includes('ready') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
      expect(output, stderr).toContain('ready');
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(ended, 'a subscribed CLI must remain alive without another active handle').toBe(false);
      child.kill('SIGTERM');
      expect(await exit).toBe(0);
      expect(output).toContain('closed');
      expect(output).toContain('idle');
    } finally {
      if (!ended) { child.kill('SIGTERM'); await exit; }
    }
    const background = await promisify(execFile)(process.execPath, [script, watched, 'background'], { timeout: 5000 });
    expect(background.stdout).toBe('ready\nidle\n');
  });

});

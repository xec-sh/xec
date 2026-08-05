import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';

import { FileWatcher } from '../../../src/watch/file-watcher.js';

/**
 * Polling is not a lesser strategy — it is the only one that works when
 * `fs.watch` cannot deliver. A wedged fseventsd leaves every macOS watcher
 * silent while still reporting success, which is how a watch session can
 * appear to run for an hour and fire nothing; network filesystems never
 * deliver at all. The flag existed and selected nothing.
 *
 * These tests use the polling path exclusively, so they pass on a machine
 * whose native watcher is dead — the machine this was written on.
 */
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
});

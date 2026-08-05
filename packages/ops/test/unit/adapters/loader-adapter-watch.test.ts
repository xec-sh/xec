import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { EventEmitter } from 'node:events';

/**
 * Watch reloads run in a child process so a long session does not accumulate
 * one never-evicted module set per file change. The spawn boundary is mocked
 * (a real spawn here would re-run the test runner's own argv); the reload
 * routing and the recursion guard are exercised for real.
 */
const spawnCalls: Array<{ cmd: string; args: string[]; opts: any }> = [];
let lastChild: EventEmitter | undefined;

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn((cmd: string, args: string[], opts: any) => {
      const child = new EventEmitter();
      spawnCalls.push({ cmd, args, opts });
      lastChild = child;
      return child;
    }),
  };
});

import { ScriptLoader } from '../../../src/adapters/loader-adapter.js';

describe('ScriptLoader watch reload (child process)', () => {
  beforeEach(() => {
    spawnCalls.length = 0;
    lastChild = undefined;
    delete process.env['XEC_WATCH_RELOAD'];
  });

  it('runReloadChild re-runs the current invocation with the reload flag set', async () => {
    const loader = new ScriptLoader({ quiet: true });

    const promise = (loader as any).runReloadChild() as Promise<void>;
    expect(spawnCalls).toHaveLength(1);
    lastChild!.emit('exit', 0, null);
    await promise;

    const call = spawnCalls[0]!;
    expect(call.cmd).toBe(process.execPath);
    expect(call.args).toEqual(process.argv.slice(1)); // same argv — script, target, flags
    expect(call.opts.stdio).toBe('inherit');
    expect(call.opts.env['XEC_WATCH_RELOAD']).toBe('1');
  });

  it('a watched-file change re-runs in a child, not in this process', async () => {
    const loader = new ScriptLoader({ quiet: true });
    const inProcess = vi.spyOn(loader as any, 'executeScriptInternal');

    const promise = (loader as any).onWatchChange() as Promise<void>;
    expect(spawnCalls).toHaveLength(1); // the reload went to a child...
    lastChild!.emit('exit', 0, null);
    await promise;

    expect(inProcess).not.toHaveBeenCalled(); // ...never re-imported in-process
  });

  it('runs once in-process when invoked as a reload child, without nesting a watcher', async () => {
    process.env['XEC_WATCH_RELOAD'] = '1';
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-watch-'));
    const script = path.join(dir, 's.mjs');
    await fs.writeFile(script, `globalThis.__watchChildRan = (globalThis.__watchChildRan || 0) + 1;`);

    try {
      const loader = new ScriptLoader({ quiet: true });
      const watch = vi.spyOn(loader as any, 'executeWithWatch');

      const result = await loader.executeScript(script, { watch: true });

      expect(result.success).toBe(true);
      expect(watch).not.toHaveBeenCalled(); // the guard skipped watch mode
      expect((globalThis as any).__watchChildRan).toBe(1); // ran exactly once
      expect(spawnCalls).toHaveLength(0); // and stayed in-process — no child
    } finally {
      delete (globalThis as any).__watchChildRan;
      delete process.env['XEC_WATCH_RELOAD'];
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

import type { Command, ExecutionResult } from '../../../src/index.js';

import { within } from '../../../src/utils/within.js';
import { ExecutionEngine } from '../../../src/core/execution-engine.js';
import { parallel, ParallelEngine } from '../../../src/utils/parallel.js';

const ok = (command = '') => ({ command, exitCode: 0, ok: true }) as ExecutionResult;
const fake = (execute: (command: Command) => Promise<ExecutionResult>) => ({ execute }) as ExecutionEngine;

describe('parallel admission and completion', () => {
  it.each([0, -1, NaN, 1.5, -Infinity, Number.MAX_VALUE])('rejects invalid concurrency %s before execution', async limit => {
    const execute = vi.fn(async () => ok());
    await expect(parallel(['one'], fake(execute), { maxConcurrent: limit })).rejects.toThrow(/positive safe integer/);
    await expect(parallel(['one'], fake(execute), { maxConcurrency: limit })).rejects.toThrow(/positive safe integer/);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([-1, NaN, Infinity])('rejects invalid timeout %s before execution', async timeout => {
    const execute = vi.fn(async () => ok());
    await expect(parallel(['one'], fake(execute), { timeout })).rejects.toThrow(/non-negative finite/);
    expect(execute).not.toHaveBeenCalled();
  });

  it('combines caller cancellation and the scoped signal with its deadline', async () => {
    const caller = new AbortController();
    const parent = new AbortController();
    const seen: AbortSignal[] = [];
    const engine = fake(async command => new Promise<ExecutionResult>((_resolve, reject) => {
      seen.push(command.signal!);
      command.signal!.addEventListener('abort', () => reject(command.signal!.reason), { once: true });
    }));
    const reason = new Error('caller cancelled');
    const pending = within({ signal: parent.signal }, () => parallel([{ command: 'one', signal: caller.signal }], engine, { timeout: 5000 }));
    expect(seen).toHaveLength(1);
    caller.abort(reason);
    expect((await pending).failed).toEqual([reason]);
    expect(parent.signal.aborted).toBe(false);
  });

  it('keeps every already-started result after an unlimited stopOnError failure', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const engine = fake(async command => {
      if (command.command === 'failed') throw new Error('failed');
      await gate;
      return ok(command.command);
    });
    const pending = parallel(['failed', 'still-running', 'also-running'], engine, { stopOnError: true });
    release();
    const result = await pending;
    expect(result.results).toHaveLength(3);
    expect(result.succeeded.map(entry => entry.command)).toEqual(['still-running', 'also-running']);
    expect(result.failed).toHaveLength(1);
  });

  it('waits for active commands before reporting a failed progress callback', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let closed = false;
    let returned = false;
    const reason = new Error('progress consumer rejected');
    const engine = fake(async command => {
      if (command.command === 'slow') { await gate; closed = true; }
      return ok(command.command);
    });
    const pending = parallel(['fast', 'slow', 'not-started'], engine, {
      maxConcurrent: 2, onProgress: () => { throw reason; },
    }).catch(error => { returned = true; return error; });
    await Promise.resolve();
    expect(returned).toBe(false);
    release();
    expect(await pending).toBe(reason);
    expect(closed).toBe(true);
  });

  it.each(['filter', 'some'] as const)('uses the same bounded scheduler for %s', async method => {
    let active = 0;
    let peak = 0;
    let completed = 0;
    const engine = fake(async command => {
      peak = Math.max(peak, ++active);
      await new Promise<void>(resolve => setImmediate(resolve));
      active--; completed++;
      return ok(command.command);
    });
    const wrapper = new ParallelEngine(engine);
    if (method === 'filter') expect(await wrapper.filter(['a', 'b', 'c'], item => item, { maxConcurrent: 1 })).toEqual(['a', 'b', 'c']);
    else expect(await wrapper.some(['a', 'b', 'c'], { maxConcurrent: 1 })).toBe(true);
    expect(peak).toBe(1);
    expect(active).toBe(0);
    expect(completed).toBe(3);
  });

  it('cancels a real lazy ProcessPromise through its parallel deadline and awaits native exit', async () => {
    const engine = new ExecutionEngine({ adapters: { local: { forceImplementation: 'node' } } });
    const command = engine.execute;
    const handles: number[] = [];
    vi.spyOn(engine, 'execute').mockImplementation(input => command.call(engine, {
      ...input, onSpawn: (handle: { pid?: number }) => { if (handle.pid) handles.push(handle.pid); },
    }));
    try {
      const pending = engine.run`${process.execPath} -e ${'setInterval(()=>{},1000)'}`.nothrow();
      const result = await parallel([pending], engine, { timeout: 300 });
      expect(handles).toHaveLength(1);
      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      for (const pid of handles) expect(() => process.kill(pid, 0)).toThrow();
    } finally { await engine.dispose(); }
  });
});

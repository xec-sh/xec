import { it, expect, describe } from 'vitest';

import { Pipeline, type PipelineEvent } from '../../src/pipeline/index.js';

describe('pipeline execution lifecycle', () => {
  it('validates the entire graph before executing an independent step', async () => {
    let executed = false;
    const pipeline = Pipeline.create('invalid')
      .step('independent', { run: async () => { executed = true; } })
      .step('dependent', { run: 'echo never', dependsOn: ['missing'] });
    await expect(pipeline.run()).rejects.toThrow('unknown step missing');
    expect(executed).toBe(false);
    await expect(Pipeline.create('cycle').step('a', { run: 'true', dependsOn: ['b'] })
      .step('b', { run: 'true', dependsOn: ['a'] }).run()).rejects.toThrow('Circular');
  });

  it('runs independent work concurrently and waits for dependencies', async () => {
    const order: string[] = [];
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const result = await Pipeline.create('parallel')
      .step('a', { run: async () => { order.push('a-start'); await barrier; order.push('a-end'); } })
      .step('b', { run: async () => { order.push('b'); release(); } })
      .step('c', { run: async () => { order.push('c'); }, dependsOn: ['a', 'b'] })
      .run({}, { concurrency: 2 });
    expect(result.status).toBe('success');
    expect(order).toEqual(['a-start', 'b', 'a-end', 'c']);
    expect(result.steps.map(s => s.name)).toEqual(['a', 'b', 'c']);
  });

  it('streams both outputs without blocking the host event loop', async () => {
    const events: PipelineEvent[] = [];
    let ticked = false;
    const timer = setTimeout(() => { ticked = true; }, 10);
    try {
      const result = await Pipeline.create('stream').step('node', {
        run: { command: process.execPath, args: ['-e', 'process.stdout.write("start");setTimeout(()=>{process.stderr.write("warning");process.stdout.write("end")},80)'] },
      }).run({}, { onEvent: event => { events.push(event); } });
      expect(ticked).toBe(true);
      expect(result.steps[0]?.stdout).toBe('startend');
      expect(result.steps[0]?.stderr).toBe('warning');
      expect(events[0]?.type).toBe('step-start');
      expect(events.at(-1)?.type).toBe('step-complete');
      expect(events.filter(e => e.type === 'step-output').length).toBeGreaterThan(1);
    } finally { clearTimeout(timer); }
  });

  it('retains a bounded output tail without failing a verbose command', async () => {
    let streamed = 0;
    const result = await Pipeline.create('verbose').step('node', {
      run: { command: process.execPath, args: ['-e', 'process.stdout.write("x".repeat(2*1024*1024)+"END")'] },
    }).run({}, { outputLimit: 1024, onEvent: event => { if (event.type === 'step-output') streamed += Buffer.byteLength(event.text); } });
    expect(result.success).toBe(true);
    expect(streamed).toBe(2 * 1024 * 1024 + 3);
    expect(Buffer.byteLength(result.steps[0]!.stdout)).toBeLessThanOrEqual(1024);
    expect(result.steps[0]?.stdout.endsWith('END')).toBe(true);
    expect(result.steps[0]?.outputTruncated).toBe(true);
  });

  it('cancels a live process before reporting completion and skips dependents', async () => {
    const controller = new AbortController();
    let pid: number | undefined;
    let dependentRan = false;
    const result = await Pipeline.create('abort').step('long', {
      run: { command: process.execPath, args: ['-e', 'console.log("ready");setInterval(()=>{},1000)'], onSpawn: child => { pid = child.pid; } },
    }).step('dependent', { run: async () => { dependentRan = true; }, dependsOn: ['long'] })
      .run({}, { signal: controller.signal, onEvent: event => {
        if (event.type === 'step-output' && event.text.includes('ready')) controller.abort();
      } });
    expect(result.status).toBe('cancelled');
    expect(result.success).toBe(false);
    expect(result.steps[0]?.cancelled).toBe(true);
    expect(dependentRan).toBe(false);
    expect(pid).toBeTypeOf('number');
    expect(() => process.kill(pid!, 0)).toThrow();
  });

  it('does not start anything for an already aborted run', async () => {
    let ran = false;
    const result = await Pipeline.create('aborted').step('never', { run: async () => { ran = true; } })
      .run({}, { signal: AbortSignal.abort() });
    expect(result.status).toBe('cancelled');
    expect(ran).toBe(false);
  });

  it('retains a failed matrix variant when deciding dependent readiness', async () => {
    let ran = false;
    const result = await Pipeline.create('matrix-failure').step('matrix', {
      matrix: { CASE: ['bad', 'good'] }, run: async ctx => { if (ctx.env.CASE === 'bad') throw new Error('bad variant'); },
    }).step('dependent', { run: async () => { ran = true; }, dependsOn: ['matrix'] }).run();
    expect(result.success).toBe(false);
    expect(ran).toBe(false);
    expect(result.steps.at(-1)?.skipped).toBe(true);
  });

  it('cancels when a streaming observer fails instead of dropping the failure', async () => {
    let pid: number | undefined;
    const failure = new Error('journal unavailable');
    await expect(Pipeline.create('observer').step('long', {
      run: { command: process.execPath, args: ['-e', 'console.log("ready");setInterval(()=>{},1000)'], onSpawn: child => { pid = child.pid; } },
    }).run({}, { onEvent: event => { if (event.type === 'step-output') throw failure; } })).rejects.toBe(failure);
    expect(pid).toBeTypeOf('number');
    expect(() => process.kill(pid!, 0)).toThrow();
  });

  it('allows a host to provide its existing execution engine', async () => {
    const result = await Pipeline.create('embedded').step('inspect', { run: 'inspect' }).run({}, {
      execute: async command => {
        expect(command.command).toBe('inspect');
        return { exitCode: 0, stdout: 'host result', stderr: 'host warning' };
      },
    });
    expect(result.steps[0]?.stdout).toBe('host result');
    expect(result.steps[0]?.stderr).toBe('host warning');
  });
});

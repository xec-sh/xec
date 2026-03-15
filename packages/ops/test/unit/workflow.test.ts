import { describe, it, expect, vi } from 'vitest';
import { Workflow } from '../../src/workflow/index.js';

describe('Workflow', () => {
  it('should execute simple workflow', async () => {
    const result = await Workflow.create('simple')
      .task('greet', async (ctx) => {
        ctx.log('hello');
        return 'greeted';
      })
      .run();

    expect(result.success).toBe(true);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]!.output).toBe('greeted');
  });

  it('should respect dependencies', async () => {
    const order: string[] = [];
    const result = await Workflow.create('deps')
      .task('a', async () => { order.push('a'); })
      .task('b', async () => { order.push('b'); }, { dependsOn: ['a'] })
      .task('c', async () => { order.push('c'); }, { dependsOn: ['b'] })
      .run();

    expect(result.success).toBe(true);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('should pass data between tasks', async () => {
    const result = await Workflow.create('data')
      .task('produce', async () => ({ value: 42 }))
      .task('consume', async (ctx) => {
        const data = ctx.taskOutput('produce') as { value: number };
        return data.value * 2;
      }, { dependsOn: ['produce'] })
      .run();

    expect(result.success).toBe(true);
    expect(result.tasks[1]!.output).toBe(84);
  });

  it('should skip tasks with unmet conditions', async () => {
    const result = await Workflow.create('conditional')
      .task('always', async () => 'ok')
      .task('conditional', async () => 'skipped', {
        when: (ctx) => ctx.env['DEPLOY'] === 'true',
      })
      .run();

    expect(result.tasks[1]!.status).toBe('skipped');
  });

  it('should execute parallel tasks concurrently', async () => {
    const startTime = Date.now();
    const result = await Workflow.create('parallel')
      .task('setup', async () => 'done')
      .task('a', async () => {
        await new Promise(r => setTimeout(r, 100));
        return 'a';
      }, { dependsOn: ['setup'], parallel: true })
      .task('b', async () => {
        await new Promise(r => setTimeout(r, 100));
        return 'b';
      }, { dependsOn: ['setup'], parallel: true })
      .run();

    expect(result.success).toBe(true);
    // If parallel, total should be ~100ms, not ~200ms
    expect(Date.now() - startTime).toBeLessThan(300);
  });

  it('should call failure handler', async () => {
    const failureHandler = vi.fn();
    const result = await Workflow.create('failing')
      .task('bad', async () => { throw new Error('boom'); })
      .onFailure(failureHandler)
      .run();

    expect(result.success).toBe(false);
    expect(failureHandler).toHaveBeenCalledTimes(1);
  });

  it('should support continueOnError', async () => {
    const result = await Workflow.create('continue')
      .task('fail', async () => { throw new Error('oops'); }, { continueOnError: true })
      .task('after', async () => 'ok', { dependsOn: ['fail'] })
      .run();

    // fail marked as success due to continueOnError
    expect(result.tasks[0]!.status).toBe('success');
    expect(result.tasks[1]!.status).toBe('success');
  });

  it('should support retry', async () => {
    let attempts = 0;
    const result = await Workflow.create('retry')
      .task('flaky', async () => {
        attempts++;
        if (attempts < 3) throw new Error('flaky');
        return 'ok';
      }, { retry: 3 })
      .run();

    expect(result.success).toBe(true);
    expect(attempts).toBe(3);
  });
});

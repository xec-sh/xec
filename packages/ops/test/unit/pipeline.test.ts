import { describe, it, expect } from 'vitest';
import { Pipeline } from '../../src/pipeline/index.js';

describe('Pipeline', () => {
  it('should execute simple pipeline', async () => {
    const result = await Pipeline.create('test')
      .step('greet', { run: 'echo hello' })
      .run();

    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]!.success).toBe(true);
    expect(result.steps[0]!.stdout).toContain('hello');
  });

  it('should respect dependencies', async () => {
    const order: string[] = [];
    const result = await Pipeline.create('deps')
      .step('a', { run: async () => { order.push('a'); } })
      .step('b', { run: async () => { order.push('b'); }, dependsOn: ['a'] })
      .step('c', { run: async () => { order.push('c'); }, dependsOn: ['b'] })
      .run();

    expect(result.success).toBe(true);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('should skip steps when dependency fails', async () => {
    const result = await Pipeline.create('fail')
      .step('fail', { run: 'exit 1' })
      .step('skipped', { run: 'echo ok', dependsOn: ['fail'] })
      .run();

    expect(result.success).toBe(false);
    expect(result.steps[1]!.skipped).toBe(true);
  });

  it('should evaluate conditions', async () => {
    const result = await Pipeline.create('cond')
      .step('always', { run: 'echo ok' })
      .step('conditional', {
        run: 'echo skipped',
        condition: (ctx) => ctx.branch === 'main',
      })
      .run({ branch: 'develop' });

    expect(result.steps[1]!.skipped).toBe(true);
  });

  it('should pass condition when matched', async () => {
    const result = await Pipeline.create('cond')
      .step('deploy', {
        run: 'echo deployed',
        condition: (ctx) => ctx.branch === 'main',
      })
      .run({ branch: 'main' });

    expect(result.steps[0]!.success).toBe(true);
    expect(result.steps[0]!.skipped).toBeUndefined();
  });

  it('should retry failed steps', async () => {
    let attempts = 0;
    const result = await Pipeline.create('retry')
      .step('flaky', {
        run: async () => {
          attempts++;
          if (attempts < 3) throw new Error('flaky');
        },
        retry: { maxAttempts: 3, delay: 10 },
      })
      .run();

    expect(result.success).toBe(true);
    expect(attempts).toBe(3);
  });

  it('should expand matrix', async () => {
    const result = await Pipeline.create('matrix')
      .step('test', {
        run: 'echo matrix',
        matrix: { os: ['linux', 'mac'], node: ['18', '20'] },
      })
      .run();

    expect(result.steps).toHaveLength(4);
    expect(result.steps.every(s => s.success)).toBe(true);
  });

  it('should support continueOnError', async () => {
    const result = await Pipeline.create('continue')
      .step('fail', { run: 'exit 1', continueOnError: true })
      .step('after', { run: 'echo ok', dependsOn: ['fail'] })
      .run();

    // fail step marked as success due to continueOnError
    expect(result.steps[0]!.success).toBe(true);
    expect(result.steps[1]!.success).toBe(true);
  });

  it('should set environment variables', async () => {
    const result = await Pipeline.create('env')
      .env({ MY_VAR: 'hello' })
      .step('check', { run: 'echo $MY_VAR' })
      .run();

    expect(result.steps[0]!.stdout).toContain('hello');
  });
});

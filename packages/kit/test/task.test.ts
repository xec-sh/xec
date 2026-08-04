import { vi, test, expect, describe, afterEach, beforeEach } from 'vitest';

import * as prompts from '../src/index.js';
import { MockWritable } from './test-utils.js';

describe('tasks', () => {
  let output: MockWritable;

  beforeEach(() => {
    output = new MockWritable();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('runs tasks sequentially and reports results', async () => {
    const order: string[] = [];

    const promise = prompts.tasks(
      [
        { title: 'first', task: async () => { order.push('first'); return 'first done'; } },
        { title: 'skipped', enabled: false, task: async () => { order.push('skipped'); } },
        { title: 'second', task: async () => { order.push('second'); } },
      ],
      { output }
    );
    await vi.runAllTimersAsync();
    await promise;

    expect(order).toEqual(['first', 'second']);
    expect(output.buffer.join('')).toContain('first done');
  });

  /**
   * Regression: when a task threw, tasks() propagated the exception without
   * stopping the spinner — its interval and process hooks stayed alive after
   * the rejection, and no error state was ever rendered.
   */
  test('stops the spinner in error state when a task throws', async () => {
    const promise = prompts
      .tasks(
        [{ title: 'boom', task: async () => { throw new Error('task failed'); } }],
        { output }
      )
      .catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    const error = await promise;

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('task failed');
    // spinner rendered the error message and stopped writing
    expect(output.buffer.join('')).toContain('task failed');
    const countAfter = output.buffer.length;
    vi.advanceTimersByTime(800);
    expect(output.buffer.length).toBe(countAfter);
  });
});

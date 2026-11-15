import type { TaskStep, TaskDefinition } from '@xec-sh/ops/config/types';

import { it, expect, describe, expectTypeOf } from 'vitest';

import { TaskParser } from '../../../src/config/task-parser.js';

const unsupported = ['hooks', 'emits', 'on', 'cache', 'schedule', 'template', 'dependsOn'] as const;

describe('public task contract', () => {
  it('does not advertise capabilities the runtime rejects', () => {
    for (const key of unsupported) expectTypeOf<TaskDefinition>().not.toHaveProperty(key);
    expectTypeOf<TaskStep>().not.toHaveProperty('parallel');
  });

  it.each(unsupported)('rejects %s explicitly before execution', key => {
    const parser = new TaskParser();
    expect(parser.parseTask('check', { command: 'node --version', [key]: {} })).toBeNull();
    expect(parser.getErrors()).toEqual([expect.objectContaining({ path: `tasks.check.${key}`, message: 'Unsupported task capability; use an explicit script or operation API' })]);
  });

  it('types and accepts implemented conditions, registration and success handlers', () => {
    const definition = {
      steps: [{ command: 'node --version', when: false, register: 'version', onSuccess: 'abort' }],
      onSuccess: { emit: 'completed' }, onError: { command: 'node --version' },
    } satisfies TaskDefinition;
    expect(new TaskParser().parseTask('check', definition)).toEqual(definition);
  });
});

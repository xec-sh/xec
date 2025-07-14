import { vi } from 'vitest';

import { createMockLogger } from './test-helpers.js';

import type { TaskContext, ExecutionContext } from '../../src/context/provider.js';

export function createMockExecutionContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    recipeId: 'test-recipe',
    dryRun: false,
    verbose: false,
    parallel: true,
    timeout: undefined,
    globalVars: {},
    secrets: {},
    hosts: [],
    tags: [],
    logger: createMockLogger(),
    ...overrides
  };
}

export function createMockTaskContext(overrides?: Partial<TaskContext>): TaskContext {
  return {
    taskId: 'test-task',
    vars: {},
    logger: createMockLogger(),
    phase: undefined,
    host: undefined,
    attempt: undefined,
    ...overrides
  };
}

export function createMockContextProvider() {
  let currentContext: any = null;
  
  return {
    run: vi.fn(async (context: any, fn: () => any) => {
      const prevContext = currentContext;
      currentContext = context;
      try {
        const result = await fn();
        return result;
      } finally {
        currentContext = prevContext;
      }
    }),
    getAllVariables: vi.fn(() => currentContext?.globalVars || {}),
    getContext: vi.fn(() => currentContext)
  };
}

export function createMockContextBuilder(context: ExecutionContext) {
  return {
    build: vi.fn(() => context)
  };
}

export function createSkipTaskError(message: string) {
  const error = new Error(message);
  error.name = 'SkipTaskError';
  return error;
}
import { AsyncLocalStorage } from 'node:async_hooks';

import type { ExecutionConfig } from '../types/execution.js';

// Export the AsyncLocalStorage instance so ExecutionEngine can use the same one
export const asyncLocalStorage = new AsyncLocalStorage<Partial<ExecutionConfig>>();

export async function within<T>(
  config: Partial<ExecutionConfig>,
  fn: () => T | Promise<T>
): Promise<T> {
  return asyncLocalStorage.run(config, fn);
}

export function withinSync<T>(
  config: Partial<ExecutionConfig>,
  fn: () => T
): T {
  return asyncLocalStorage.run(config, fn);
}

export function getLocalContext(): Partial<ExecutionConfig> | undefined {
  return asyncLocalStorage.getStore();
}



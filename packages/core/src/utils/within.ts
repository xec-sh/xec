import type { ExecutionConfig } from '../types/execution.js';

import { AsyncLocalStorage } from 'node:async_hooks';

// Export the AsyncLocalStorage instance so ExecutionEngine can use the same one
export const asyncLocalStorage = new AsyncLocalStorage<Partial<ExecutionConfig>>();

/**
 * Run `fn` in an isolated configuration scope.
 *
 * Two shapes are accepted:
 *
 * - `within(fn)` — the scope starts as a copy of the current one, and
 *   anything `fn` changes with `$.defaults(...)` is confined to it. This is
 *   the form zx uses, and the form our own README documented; passing it a
 *   single function used to reach `AsyncLocalStorage.run(fn, undefined)` and
 *   fail with `Function.prototype.apply was called on undefined`, which says
 *   nothing about what the caller did wrong.
 * - `within(config, fn)` — the same, with the scope seeded from `config`.
 *
 * @param configOrFn - Scope configuration, or the function to run.
 * @param maybeFn - The function to run, when configuration was given.
 * @returns Whatever `fn` returns.
 */
export async function within<T>(fn: () => T | Promise<T>): Promise<T>;
export async function within<T>(cwd: string, fn: () => T | Promise<T>): Promise<T>;
export async function within<T>(
  config: Partial<ExecutionConfig>,
  fn: () => T | Promise<T>
): Promise<T>;
export async function within<T>(
  configOrFn: string | Partial<ExecutionConfig> | (() => T | Promise<T>),
  maybeFn?: () => T | Promise<T>
): Promise<T> {
  const [config, fn] = normalizeWithinArgs(configOrFn, maybeFn);
  return asyncLocalStorage.run(config, fn);
}

export function withinSync<T>(fn: () => T): T;
export function withinSync<T>(cwd: string, fn: () => T): T;
export function withinSync<T>(config: Partial<ExecutionConfig>, fn: () => T): T;
export function withinSync<T>(
  configOrFn: string | Partial<ExecutionConfig> | (() => T),
  maybeFn?: () => T
): T {
  const [config, fn] = normalizeWithinArgs<T>(configOrFn, maybeFn);
  return asyncLocalStorage.run(config, fn as () => T);
}

/**
 * Sort out which of the two call shapes was used.
 *
 * @param configOrFn - First argument.
 * @param maybeFn - Second argument, when present.
 * @returns The scope configuration and the function to run.
 * @throws {TypeError} When no function was supplied — named clearly, rather
 *   than surfacing as an internal AsyncLocalStorage failure.
 */
function normalizeWithinArgs<T>(
  configOrFn: string | Partial<ExecutionConfig> | (() => T | Promise<T>),
  maybeFn?: () => T | Promise<T>
): [Partial<ExecutionConfig>, () => T | Promise<T>] {
  if (typeof configOrFn === 'function') {
    // Inherit the enclosing scope so nesting composes; a fresh empty scope
    // would silently discard the settings the caller is running under.
    return [{ ...asyncLocalStorage.getStore() }, configOrFn];
  }

  if (typeof maybeFn !== 'function') {
    throw new TypeError(
      'within() requires a function: within(fn), within(cwd, fn) or within(config, fn)'
    );
  }

  // A bare directory is the common case and the form the documentation
  // shows. It used to be stored as the scope itself — a string where an
  // object was expected — so every property read came back undefined and the
  // scope silently did nothing.
  if (typeof configOrFn === 'string') {
    return [{ ...asyncLocalStorage.getStore(), cwd: configOrFn }, maybeFn];
  }

  return [configOrFn, maybeFn];
}

export function getLocalContext(): Partial<ExecutionConfig> | undefined {
  return asyncLocalStorage.getStore();
}



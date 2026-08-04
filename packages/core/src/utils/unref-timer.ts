/**
 * Stop a timer from holding the process open, on every runtime.
 *
 * Node returns a `Timeout` object from `setInterval`, and calling `.unref()`
 * on it means a background sweep does not keep a finished program alive. Deno
 * returns a plain number, so the same call throws
 * `this.cleanupInterval.unref is not a function` — which happened during
 * module construction, so importing the package failed outright on Deno even
 * though every line of it was otherwise portable.
 *
 * Deno's own spelling of the operation is `Deno.unrefTimer(id)`. Skipping it
 * was not harmless: the module-level cache sweep in `utils/cache.ts` starts
 * on import, so every Deno program that imported the package kept running
 * after its last line until something killed it.
 *
 * @param timer - Whatever `setInterval` or `setTimeout` returned.
 * @returns The same timer, so this can wrap the call site.
 */
export function unrefTimer<T>(timer: T): T {
  const candidate = timer as { unref?: () => void };

  if (typeof candidate?.unref === 'function') {
    candidate.unref();
    return timer;
  }

  if (typeof timer === 'number' && typeof globalThis.Deno?.unrefTimer === 'function') {
    globalThis.Deno.unrefTimer(timer);
  }

  return timer;
}

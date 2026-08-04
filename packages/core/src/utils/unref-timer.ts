/**
 * Stop a timer from holding the process open, where the runtime allows it.
 *
 * Node returns a `Timeout` object from `setInterval`, and calling `.unref()`
 * on it means a background sweep does not keep a finished program alive. Deno
 * returns a plain number, so the same call throws
 * `this.cleanupInterval.unref is not a function` — which happened during
 * module construction, so importing the package failed outright on Deno even
 * though every line of it was otherwise portable.
 *
 * Where `unref` is unavailable the timer simply keeps its default behaviour;
 * that is a smaller problem than not running at all.
 *
 * @param timer - Whatever `setInterval` or `setTimeout` returned.
 * @returns The same timer, so this can wrap the call site.
 */
export function unrefTimer<T>(timer: T): T {
  const candidate = timer as { unref?: () => void };

  if (typeof candidate?.unref === 'function') {
    candidate.unref();
  }

  return timer;
}

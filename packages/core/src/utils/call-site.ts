/**
 * Records where in the caller's code a command was written.
 *
 * A failure message that names the command still leaves the reader hunting
 * for which of the fourteen `$` calls in the file it was. The frame turns
 * that into a click. It matters most exactly where debugging is hardest —
 * a deploy script at 3am, or an agent reasoning about its own failed step.
 *
 * The capture costs ~1.4µs per command because the stack is captured but not
 * formatted; formatting (~2.5µs more) happens only if the command actually
 * fails. Against a process spawn of several milliseconds that is ~0.03%, but
 * it is not free, hence {@link ExecutionEngineConfig.captureCallSite}.
 */

/** Frames inside the library itself; never the answer the reader wants. */
const INTERNAL_FRAME = /[/\\](?:packages[/\\]core[/\\](?:src|dist)|node_modules[/\\]@xec-sh[/\\]core)[/\\]/;

/** Node's own internals, which are equally never the answer. */
const NODE_INTERNAL_FRAME = /\((?:node:|internal[/\\])/;

/**
 * Capture the current stack, cheaply.
 *
 * Returns an opaque holder rather than a string: formatting a stack is the
 * expensive half, and most commands succeed, so it is deferred to
 * {@link resolveCallSite}.
 *
 * @returns A holder to pass to {@link resolveCallSite}, or null when disabled.
 */
export function captureCallSite(): { stack?: string } {
  const holder: { stack?: string } = {};
  Error.captureStackTrace(holder, captureCallSite);
  return holder;
}

/**
 * Find the caller's own frame in a captured stack.
 *
 * @param holder - The value returned by {@link captureCallSite}.
 * @returns Something like `file:///app/deploy.ts:42:17`, or an empty string
 *   when no frame outside the library and Node's internals can be found.
 */
export function resolveCallSite(holder: { stack?: string } | null | undefined): string {
  const stack = holder?.stack;
  if (!stack) return '';

  for (const line of stack.split('\n').slice(1)) {
    const frame = line.trim();
    if (!frame.startsWith('at ')) continue;
    if (INTERNAL_FRAME.test(frame) || NODE_INTERNAL_FRAME.test(frame)) continue;

    // Prefer the parenthesised location — `at fn (file:1:2)` — falling back
    // to the bare form used for top-level frames.
    const location = frame.match(/\(([^)]+)\)$/)?.[1] ?? frame.slice(3);
    return location.trim();
  }

  return '';
}

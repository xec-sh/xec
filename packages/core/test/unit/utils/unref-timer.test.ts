import { unrefTimer } from '../../../src/utils/unref-timer.js';

/**
 * `unrefTimer` existed because Deno's `setInterval` returns a plain number,
 * so Node's `timer.unref()` is not there to call. The shim's first version
 * simply gave up on Deno — and since the module-level cache sweep in
 * `utils/cache.ts` starts on import, every Deno program that imported the
 * package kept running after its last line until something killed it.
 *
 * Deno spells the same operation `Deno.unrefTimer(id)`; the shim must reach
 * for it when the runtime hands back a number instead of a Timeout.
 */
describe('unrefTimer detaches the timer from the process lifetime', () => {
  const realDeno = globalThis.Deno;

  afterEach(() => {
    globalThis.Deno = realDeno;
  });

  it('calls unref() on a Node timer object', () => {
    let unreffed = false;
    const timer = setInterval(() => {}, 60_000) as NodeJS.Timeout & { unref: () => NodeJS.Timeout };
    const originalUnref = timer.unref.bind(timer);
    timer.unref = () => { unreffed = true; return originalUnref(); };

    try {
      expect(unrefTimer(timer)).toBe(timer);
      expect(unreffed).toBe(true);
    } finally {
      clearInterval(timer);
    }
  });

  it('hands a numeric timer to the runtime\'s own unref', () => {
    const seen: number[] = [];
    globalThis.Deno = {
      version: { deno: 'test', v8: 'test', typescript: 'test' },
      unrefTimer: (id: number) => { seen.push(id); },
    } as typeof globalThis.Deno;

    expect(unrefTimer(42)).toBe(42);
    expect(seen).toEqual([42]);
  });

  it('leaves a numeric timer alone when the runtime offers no unref', () => {
    globalThis.Deno = undefined;

    // Nothing to assert beyond survival: a bare number has no unref, and the
    // first version of the shim crashed module construction on exactly this.
    expect(unrefTimer(42)).toBe(42);
  });
});

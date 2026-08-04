import { $, ExecutionEngine, createCallableEngine } from '../../../src/index.js';
import { resolveCallSite, captureCallSite } from '../../../src/utils/call-site.js';

/**
 * A failure that names the command still leaves the reader hunting for which
 * of the fourteen `$` calls in the file it was. The frame turns that into a
 * click — and it matters most exactly where debugging is hardest: a deploy
 * script at 3am, or an agent reasoning about its own failed step.
 *
 * zx has carried this since its first release; this closes the last gap the
 * direct comparison found.
 */
describe('a failure names the line that wrote the command', () => {
  it('points at the caller, not at library internals', async () => {
    const error = await $`sh -c 'exit 3'`.catch((e: Error) => e);

    expect(error.message).toContain('at ');
    // The frame must be this test file — a frame inside the engine would be
    // technically true and completely useless.
    expect(error.message).toContain('call-site.test.ts');
  }, 15_000);

  it('survives the configuration chain', async () => {
    // Each chained call builds a new command; the frame must keep pointing
    // at where the caller wrote it, not at the last chaining method.
    const error = await $.exec('sh -c "exit 3"')
      .env({ A: '1' })
      .timeout('10s')
      .catch((e: Error) => e);

    expect(error.message).toContain('call-site.test.ts');
  }, 15_000);

  it('can be switched off for throughput-sensitive embedding', async () => {
    const engine = createCallableEngine(new ExecutionEngine({ captureCallSite: false }));

    const error = await engine.exec('sh -c "exit 3"').catch((e: Error) => e);

    expect(error.message).toContain('exit code 3');
    expect(error.message).not.toContain('call-site.test.ts');
  }, 15_000);
});

describe('a failing command rejects, whatever the caller uses to observe it', () => {
  // `.catch()` and `.then(null, fn)` arrive with no onfulfilled. The branch
  // that decides whether to throw used to test for one, so both took the
  // non-throwing path: a failed command resolved with its result and the
  // handler never ran — a standard promise idiom silently reporting success.
  it('rejects through .catch()', async () => {
    const caught = await $`sh -c 'exit 3'`.catch((e: Error) => e);

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe('CommandError');
  }, 15_000);

  it('rejects through .then(null, onrejected)', async () => {
    const caught = await $`sh -c 'exit 3'`.then(null, (e: Error) => e);

    expect((caught as Error).name).toBe('CommandError');
  }, 15_000);

  it('still resolves a successful command through .catch()', async () => {
    const result = await $`echo fine`.catch(() => null);

    expect(result?.stdout.trim()).toBe('fine');
  }, 15_000);

  it('leaves nothrow and the transform helpers alone', async () => {
    expect((await $`sh -c 'exit 3'`.nothrow()).exitCode).toBe(3);
    expect(await $`echo hi`.text()).toBe('hi');
  }, 15_000);
});

describe('resolveCallSite', () => {
  it('skips library and Node-internal frames', () => {
    const resolved = resolveCallSite(captureCallSite());

    expect(resolved).toContain('call-site.test.ts');
    expect(resolved).not.toContain('node:internal');
  });

  it('returns an empty string when there is nothing to resolve', () => {
    expect(resolveCallSite(null)).toBe('');
    expect(resolveCallSite({})).toBe('');
    expect(resolveCallSite({ stack: 'Error\n    at (node:internal/x:1:1)' })).toBe('');
  });
});

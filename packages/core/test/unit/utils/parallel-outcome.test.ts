import { $, parallel } from '../../../src/index.js';

/**
 * `parallel` sorted commands by whether their promise resolved, not by whether
 * they worked.
 *
 * The two differ exactly where it matters. To attempt every host instead of
 * stopping at the first failure you use `.nothrow()`, which makes a failed
 * command resolve — so every host landed in `succeeded`, and a rollout where
 * three machines exited non-zero reported `failed: 0`.
 *
 * That is the one question the caller asked. `succeeded` now means the command
 * succeeded.
 */
describe('parallel reports what actually happened', () => {
  const ok = () => $`echo fine`.nothrow();
  const bad = (code: number) => $`sh -c ${`exit ${code}`}`.nothrow();

  it('counts a non-zero exit as a failure', async () => {
    const result = await parallel([ok(), bad(1), ok()], {});

    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
  }, 30_000);

  it('keeps the failed result, not just the fact of failure', async () => {
    const result = await parallel([bad(3)], {});

    const [failure] = result.failed;
    expect(failure).toMatchObject({ exitCode: 3, ok: false });
  }, 30_000);

  it('agrees with the ok flag on every result', async () => {
    const result = await parallel([ok(), bad(1), bad(2), ok()], {});

    expect(result.succeeded).toHaveLength(result.results.filter(r => 'ok' in r && r.ok).length);
    expect(result.succeeded.every(r => r.ok)).toBe(true);
  }, 30_000);

  it('classifies the same way under a concurrency limit', async () => {
    // The limited and unlimited paths are separate loops; both were wrong, and
    // a fix to one would not have shown up in the other.
    const result = await parallel([ok(), bad(1), ok(), bad(1)], { maxConcurrent: 2 });

    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(2);
  }, 30_000);

  it('still records a command that threw', async () => {
    // Without .nothrow() a failure rejects; it must be a failure either way.
    const result = await parallel([$`sh -c 'exit 1'`, ok()], {});

    expect(result.failed).toHaveLength(1);
    expect(result.succeeded).toHaveLength(1);
  }, 30_000);

  it('reports every command as succeeded when they all work', async () => {
    const result = await parallel([ok(), ok(), ok()], { maxConcurrent: 2 });

    expect(result.failed).toHaveLength(0);
    expect(result.succeeded).toHaveLength(3);
    expect(result.results).toHaveLength(3);
  }, 30_000);

  it('stops early on a non-zero exit when asked to', async () => {
    const result = await parallel([bad(1), ok(), ok(), ok()], { stopOnError: true, maxConcurrent: 1 });

    // stopOnError exists so a bad rollout does not reach every host; a
    // non-zero exit has to trip it, or it only guards against thrown errors.
    expect(result.succeeded.length).toBeLessThan(3);
  }, 30_000);
});

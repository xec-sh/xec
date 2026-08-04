import { $, parallel } from '../../../src/index.js';

/**
 * A concurrency limit on an infrastructure tool is a safety control, not a
 * tuning knob: "roll out to 100 hosts, five at a time" is a different
 * operation from "hit all 100 now".
 *
 * The option existed only as `maxConcurrency` while every example — both
 * READMEs included — said `maxConcurrent`, and the second parameter was an
 * engine, so the documented call `parallel(cmds, { maxConcurrent: 5 })`
 * passed its options where an engine was expected. Both mistakes were
 * silent: the limit became Infinity and every command started at once.
 */
describe('parallel honours its concurrency limit', () => {
  /** Six commands of ~300ms each; the wall clock reveals the real limit. */
  const batch = () => Array.from({ length: 6 }, () => $`sleep 0.3`.nothrow());

  it('limits with the documented option name and call shape', async () => {
    const started = Date.now();
    await parallel(batch(), { maxConcurrent: 2 });
    const elapsed = Date.now() - started;

    // Three waves of two: ~900ms. Unlimited would finish in ~300ms.
    expect(elapsed).toBeGreaterThan(700);
  }, 30_000);

  it('accepts the older option spelling', async () => {
    const started = Date.now();
    await parallel(batch(), { maxConcurrency: 2 });

    expect(Date.now() - started).toBeGreaterThan(700);
  }, 30_000);

  it('still accepts an explicit engine', async () => {
    const started = Date.now();
    await parallel(batch(), $, { maxConcurrent: 3 });
    const elapsed = Date.now() - started;

    // Two waves of three: ~600ms.
    expect(elapsed).toBeGreaterThan(450);
    expect(elapsed).toBeLessThan(1_500);
  }, 30_000);

  it('runs everything at once when no limit is given', async () => {
    const started = Date.now();
    await parallel(batch(), {});

    expect(Date.now() - started).toBeLessThan(900);
  }, 30_000);

  it('returns a result for every command', async () => {
    const result = await parallel(
      [$`echo one`.nothrow(), $`echo two`.nothrow()],
      { maxConcurrent: 1 }
    );

    expect(result.results).toHaveLength(2);
    expect(result.succeeded).toHaveLength(2);
  }, 30_000);
});

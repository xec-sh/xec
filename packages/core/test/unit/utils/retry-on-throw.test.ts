import { $, retry, RetryError, CommandError } from '../../../src/index.js';

/**
 * `retry` inspected `result.exitCode` and never caught anything. But a command
 * throws on failure by default — that is the engine's whole contract — so the
 * obvious call
 *
 *     await retry(() => $`flaky-thing`, { maxRetries: 5 })
 *
 * ran the command exactly once and let the CommandError out. The retry did
 * nothing, and nothing said so: the caller saw the same error they would have
 * seen without it, five retries later than they thought.
 *
 * Retrying is a safety control on infrastructure — "the deploy survives one
 * flaky network hop" — so failing open and silently is the worst shape it
 * could have.
 */
describe('retry retries a command that throws', () => {
  /** A command that fails until a marker file appears, then succeeds. */
  const flaky = (marker: string) =>
    $`sh -c ${`test -f ${marker} || { touch ${marker}; exit 1; }`}`;

  it('retries the natural call shape, without .nothrow()', async () => {
    const marker = `/tmp/xec-retry-probe-${process.pid}-a`;
    await $`rm -f ${marker}`.nothrow();

    // First attempt exits 1 and throws; the retry must swallow that and run again.
    const result = await retry(() => flaky(marker), { maxRetries: 3, initialDelay: 10 });

    expect(result.exitCode).toBe(0);
    await $`rm -f ${marker}`.nothrow();
  }, 30_000);

  it('still works when the caller opts out of throwing', async () => {
    const marker = `/tmp/xec-retry-probe-${process.pid}-b`;
    await $`rm -f ${marker}`.nothrow();

    const result = await retry(() => flaky(marker).nothrow(), { maxRetries: 3, initialDelay: 10 });

    expect(result.exitCode).toBe(0);
    await $`rm -f ${marker}`.nothrow();
  }, 30_000);

  it('counts attempts the same whether the command throws or not', async () => {
    let thrown = 0;
    let quiet = 0;

    await retry(() => { thrown++; return $`sh -c 'exit 1'`; }, { maxRetries: 2, initialDelay: 5 })
      .catch(() => undefined);
    await retry(() => { quiet++; return $`sh -c 'exit 1'`.nothrow(); }, { maxRetries: 2, initialDelay: 5 })
      .catch(() => undefined);

    expect(thrown).toBe(quiet);
    expect(thrown).toBe(3); // the initial attempt plus two retries
  }, 30_000);

  it('reports exhaustion as a RetryError carrying every attempt', async () => {
    const error = await retry(() => $`sh -c 'exit 3'`, { maxRetries: 2, initialDelay: 5 })
      .then(() => null, (e: unknown) => e as RetryError);

    expect(error).toBeInstanceOf(RetryError);
    expect(error!.attempts).toBe(3);
    expect(error!.results).toHaveLength(3);
    expect(error!.lastResult.exitCode).toBe(3);
  }, 30_000);

  it('does not swallow errors that are not command failures', async () => {
    // A bug in the caller's own callback must surface immediately, not be
    // retried three times and then reported as a flaky command.
    let calls = 0;
    const error = await retry(
      async () => { calls++; throw new TypeError('bug in the callback'); },
      { maxRetries: 3, initialDelay: 5 }
    ).then(() => null, (e: unknown) => e as Error);

    expect(error).toBeInstanceOf(TypeError);
    expect(calls).toBe(1);
  }, 30_000);

  it('honours isRetryable when the command threw', async () => {
    let calls = 0;
    const error = await retry(
      () => { calls++; return $`sh -c 'exit 42'`; },
      { maxRetries: 3, initialDelay: 5, isRetryable: result => result.exitCode !== 42 }
    ).then(() => null, (e: unknown) => e as RetryError);

    expect(error).toBeInstanceOf(RetryError);
    expect(calls).toBe(1);
  }, 30_000);

  it('leaves the thrown CommandError reachable as the cause', async () => {
    const error = await retry(() => $`sh -c 'exit 7'`, { maxRetries: 1, initialDelay: 5 })
      .then(() => null, (e: unknown) => e as RetryError);

    expect(error!.lastResult.exitCode).toBe(7);
    expect(error!.cause).toBeInstanceOf(CommandError);
  }, 30_000);
});

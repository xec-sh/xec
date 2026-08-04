import { $ } from '../../src/index.js';

/**
 * Output larger than the OS pipe buffer must survive intact.
 *
 * The collecting Transform pushed into its own readable side, which nothing
 * consumed. Once that buffer filled it back-pressured the child's stdout into
 * the 64 KB pipe and the process deadlocked. The observed behaviour was the
 * worst possible shape: at 70 KB the command returned an EMPTY stdout with
 * exit code 0 — a silent total data loss reported as success — and past
 * ~128 KB it hung forever.
 *
 * Anything real trips this: reading a file, `kubectl get -o json`,
 * `docker logs`, a verbose build.
 */
describe('output larger than the pipe buffer', () => {
  /** Emit exactly `size` bytes without depending on shell built-ins. */
  const emit = (size: number) => `node -e "process.stdout.write('a'.repeat(${size}))"`;

  it.each([
    ['just under the 64 KB pipe', 60_000],
    ['exactly the pipe size', 65_536],
    ['just over — used to return empty', 70_000],
    ['well over — used to hang', 250_000],
    ['a megabyte', 1_000_000],
  ])('returns all bytes: %s', async (_label, size) => {
    // $.exec is the path for a command held in a string; the $ tag would
    // quote it into a single argument.
    const result = await $.exec(emit(size)).nothrow();

    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBe(size);
  }, 30_000);

  it('keeps stdout and stderr separate and complete when both are large', async () => {
    const result = await $.exec(
      `node -e "process.stdout.write('O'.repeat(200000)); process.stderr.write('E'.repeat(200000))"`
    ).nothrow();

    expect(result.stdout.length).toBe(200_000);
    expect(result.stderr.length).toBe(200_000);
    expect(result.stdout).not.toContain('E');
    expect(result.stderr).not.toContain('O');
  }, 30_000);

  it('does not deadlock when the output is never read by the caller', async () => {
    // A caller that ignores stdout must not wedge the child either.
    const result = await $.exec(emit(500_000)).nothrow();
    expect(result.exitCode).toBe(0);
  }, 30_000);
});

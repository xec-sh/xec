import { $ } from '../../src/index.js';
import { resolveExitCode } from '../../src/core/failure-kind.js';

/**
 * A process killed by a signal must never look like a success.
 *
 * Node reports `code: null, signal: 'SIGKILL'` for a signalled process, and
 * that null was coalesced to 0 — so an OOM kill, or an orchestrator stopping
 * a pod mid-deploy, produced `exitCode: 0, ok: true`. CI would treat a killed
 * deployment as green.
 */
describe('a signalled process reports failure', () => {
  it.each([
    ['SIGKILL', 137],
    ['SIGTERM', 143],
  ])('reports %s as exit %i and not ok', async (signal, expected) => {
    const result = await $.exec(`sh -c 'kill -${signal.replace('SIG', '')} $$'`).nothrow();

    expect(result.ok).toBe(false);
    expect(result.signal).toBe(signal);
    // Shells report 128 + signum; a caller that only reads the number still
    // sees a failure.
    expect(result.exitCode).toBe(expected);
  }, 20_000);

  it('leaves ordinary exit codes untouched', async () => {
    for (const code of [0, 1, 3, 42]) {
      const result = await $.exec(`exit ${code}`).nothrow();
      expect(result.exitCode).toBe(code);
      expect(result.ok).toBe(code === 0);
    }
  }, 20_000);
});

describe('resolveExitCode', () => {
  it('passes a real exit code through', () => {
    expect(resolveExitCode(0)).toBe(0);
    expect(resolveExitCode(7)).toBe(7);
  });

  it('applies the 128 + signum convention', () => {
    expect(resolveExitCode(null, 'SIGKILL')).toBe(137);
    expect(resolveExitCode(null, 'SIGTERM')).toBe(143);
    expect(resolveExitCode(undefined, 'SIGINT')).toBe(130);
  });

  it('prefers a real exit code over a signal', () => {
    // Some transports report both; the code is the more specific fact.
    expect(resolveExitCode(3, 'SIGTERM')).toBe(3);
  });

  it('reports an unknown signal as a failure rather than success', () => {
    expect(resolveExitCode(null, 'SIGWEIRD')).toBe(128);
  });

  it('falls back to 0 only when there is neither code nor signal', () => {
    expect(resolveExitCode(null, null)).toBe(0);
  });
});

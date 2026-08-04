import { createOptimizedMasker } from '../../../src/utils/optimized-masker.js';
import {
  DEFAULT_REDACTION,
  createDefaultSensitivePatterns,
} from '../../../src/utils/sensitive-patterns.js';

/**
 * Every result's stdout, stderr and command string is masked before it is
 * returned, so the cost of the pattern set is the cost of every command.
 *
 * A pattern that backtracks quadratically does not fail visibly — it makes the
 * caller look like it hung. Two did: one anchored on a character class rather
 * than a literal, which gave the engine a candidate start at every letter and
 * turned 200 KB of ordinary output into 29 seconds; and a PEM rule whose body
 * scanned to end-of-input from every unterminated header, which turned 800 KB
 * of key-shaped output into 6.8 seconds. Both surfaced as `$` never resolving
 * on output above ~128 KB.
 *
 * These inputs are shaped to defeat each pattern's start-position search. The
 * budget is ~100x the honest cost, so it tolerates a loaded CI machine while
 * still failing by orders of magnitude if the quadratic behaviour returns.
 */
const SIZE = 800_000;
const BUDGET_MS = 2_000;

/** Repeat `unit` until it fills exactly `SIZE` characters. */
function fill(unit: string): string {
  return unit.repeat(Math.ceil(SIZE / unit.length)).slice(0, SIZE);
}

describe('masking cost on large output', () => {
  it.each([
    ['plain letters', fill('a')],
    ['no whitespace, all pattern characters', fill('aB0_-+./:')],
    ['url-shaped with no credentials', fill('://a:')],
    ['word boundaries everywhere', fill('ab ')],
    ['key-shaped assignments', fill('PASSWORD=')],
    ['PEM headers with no matching footer', fill('-----BEGIN PRIVATE KEY-----x')],
    ['quoted JSON keys', fill('"token": "')],
    ['repeated flags', fill('--password ')],
    ['base64', fill('QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=')],
  ])('masks 800 KB of %s within budget', (_label, text) => {
    // A fresh masker per case: the patterns carry /g, so a shared instance
    // would let one case's lastIndex change the next case's work.
    const mask = createOptimizedMasker(createDefaultSensitivePatterns(), DEFAULT_REDACTION);

    const started = process.hrtime.bigint();
    mask(text);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    expect(elapsedMs).toBeLessThan(BUDGET_MS);
  }, 60_000);

  it('scales linearly rather than quadratically with input size', () => {
    const mask = createOptimizedMasker(createDefaultSensitivePatterns(), DEFAULT_REDACTION);
    const measure = (length: number): number => {
      const text = 'a'.repeat(length);
      // Warm the JIT so the first measurement is not the slow one.
      mask(text);
      const started = process.hrtime.bigint();
      mask(text);
      return Number(process.hrtime.bigint() - started) / 1e6;
    };

    const small = measure(200_000);
    const large = measure(800_000);

    // Four times the input: linear predicts ~4x, quadratic ~16x. The
    // threshold sits between the two, well clear of timer noise at these
    // sizes.
    expect(large).toBeLessThan(Math.max(small, 1) * 8);
  }, 60_000);
});

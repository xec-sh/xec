import { parseDuration } from '../../src/utils/helpers.js';
import { createOptimizedMasker } from '../../src/utils/optimized-masker.js';
import { DEFAULT_REDACTION, createDefaultSensitivePatterns } from '../../src/utils/sensitive-patterns.js';

/**
 * Property tests over the pure functions the engine trusts blindly.
 *
 * No framework: a seeded generator keeps every run identical, so a failure
 * here reproduces on the first retry instead of vanishing. Each property
 * prints its counterexample through the assertion message.
 */

/** mulberry32 — small, seeded, good enough to explore an input space. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('parseDuration invariants', () => {
  const UNITS: Array<[string, number]> = [
    ['ms', 1],
    ['s', 1000], ['sec', 1000], ['second', 1000], ['seconds', 1000],
    ['m', 60_000], ['min', 60_000], ['minute', 60_000], ['minutes', 60_000],
    ['h', 3_600_000], ['hour', 3_600_000], ['hours', 3_600_000],
    ['d', 86_400_000], ['day', 86_400_000], ['days', 86_400_000],
  ];

  it('never returns NaN — it throws instead', () => {
    // The historical failure: `{ timeout: '5m' }` became NaN, the clamp
    // turned NaN into 1ms, and a five-minute deadline fired after one
    // millisecond while the error message still said "after 5mms". NaN out
    // of this function is the seed of that whole chain.
    const rand = prng(0xdece11);
    const alphabet = '0123456789.smhd XmMbB-+e_';

    for (let i = 0; i < 2000; i++) {
      const length = 1 + Math.floor(rand() * 10);
      let candidate = '';
      for (let j = 0; j < length; j++) {
        candidate += alphabet[Math.floor(rand() * alphabet.length)];
      }

      let result: number | undefined;
      try {
        result = parseDuration(candidate);
      } catch {
        continue; // rejection is a valid answer; lying is not
      }

      expect(Number.isNaN(result), `parseDuration(${JSON.stringify(candidate)}) returned NaN`).toBe(false);
    }
  });

  it('scales linearly in the value for every unit', () => {
    const rand = prng(0x5ca1e);

    for (let i = 0; i < 500; i++) {
      const [unit, multiplier] = UNITS[Math.floor(rand() * UNITS.length)]!;
      const value = Math.round(rand() * 10_000) / 10; // one decimal, like real timeouts

      const parsed = parseDuration(`${value}${unit}`);

      expect(parsed, `${value}${unit}`).toBe(Math.round(value * multiplier));
    }
  });

  it('treats unit aliases identically', () => {
    const rand = prng(0xa11a5);
    const aliasGroups = [
      ['s', 'sec', 'second', 'seconds'],
      ['m', 'min', 'minute', 'minutes'],
      ['h', 'hour', 'hours'],
      ['d', 'day', 'days'],
    ];

    for (let i = 0; i < 300; i++) {
      const group = aliasGroups[Math.floor(rand() * aliasGroups.length)]!;
      const value = Math.round(rand() * 1000);
      const results = group.map(unit => parseDuration(`${value}${unit}`));

      expect(new Set(results).size, `${value} across ${group.join(',')} → ${results.join(',')}`).toBe(1);
    }
  });

  it('is case-insensitive in the unit and tolerant of surrounding space', () => {
    const rand = prng(0xca5e);

    for (let i = 0; i < 300; i++) {
      const [unit] = UNITS[Math.floor(rand() * UNITS.length)]!;
      const value = Math.round(rand() * 500);
      const spaced = `  ${value} ${unit.toUpperCase()}  `;

      expect(parseDuration(spaced), JSON.stringify(spaced)).toBe(parseDuration(`${value}${unit}`));
    }
  });

  it('passes numbers through untouched', () => {
    const rand = prng(0x90d);

    for (let i = 0; i < 300; i++) {
      const n = Math.floor(rand() * 2 ** 31);

      expect(parseDuration(n)).toBe(n);
    }
  });
});

describe('sensitive masking invariants', () => {
  const mask = createOptimizedMasker(createDefaultSensitivePatterns(), DEFAULT_REDACTION);

  const SECRET_SHAPES = [
    (secret: string) => `password=${secret}`,
    (secret: string) => `--password ${secret}`,
    (secret: string) => `token=${secret}`,
    (secret: string) => `api_key=${secret}`,
    (secret: string) => `Authorization: Bearer ${secret}`,
  ];

  /** A secret that looks like real credentials, not like prose. */
  function makeSecret(rand: () => number): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let secret = '';
    for (let j = 0; j < 24; j++) {
      secret += alphabet[Math.floor(rand() * alphabet.length)];
    }
    return secret;
  }

  it('is idempotent', () => {
    // Output flows through more than one masking point — error text, event
    // payloads, logs. If a second pass changed the text again, redaction
    // markers would themselves get chewed up and diffs would churn.
    const rand = prng(0x1de0);

    for (let i = 0; i < 300; i++) {
      const shape = SECRET_SHAPES[Math.floor(rand() * SECRET_SHAPES.length)]!;
      const text = `deploy --host h${i} ${shape(makeSecret(rand))} --verbose`;
      const once = mask(text);

      expect(mask(once), text).toBe(once);
    }
  });

  it('never lets the secret value through a known credential shape', () => {
    const rand = prng(0x5ec3e7);

    for (let i = 0; i < 300; i++) {
      const secret = makeSecret(rand);
      const shape = SECRET_SHAPES[Math.floor(rand() * SECRET_SHAPES.length)]!;
      const masked = mask(`run ${shape(secret)} --retry 3`);

      expect(masked.includes(secret), `${shape(secret)} → ${masked}`).toBe(false);
    }
  });

  it('leaves text without credentials alone', () => {
    const rand = prng(0xc1ea2);
    const words = ['build', 'deploy', 'status', 'restart', 'logs', 'uptime', 'echo', 'ls', '-la', '--verbose'];

    for (let i = 0; i < 300; i++) {
      const count = 1 + Math.floor(rand() * 6);
      const text = Array.from({ length: count }, () => words[Math.floor(rand() * words.length)]).join(' ');

      expect(mask(text)).toBe(text);
    }
  });
});

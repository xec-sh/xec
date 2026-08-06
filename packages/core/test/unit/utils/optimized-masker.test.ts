import type { RedactionShape, SensitivePattern } from '../../../src/utils/optimized-masker.js';

import { createOptimizedMasker } from '../../../src/utils/optimized-masker.js';
import { DEFAULT_REDACTION, defaultSensitiveRules } from '../../../src/utils/sensitive-patterns.js';

/**
 * How much of a line survives being redacted.
 *
 * A pattern decides *whether* something is a credential; this decides what
 * is left once it is. Both failures are silent in opposite directions:
 * replace too little and the secret is still there, replace too much and
 * the reader loses the line that would have told them what happened —
 * `PGPASSWORD=[REDACTED]` is useful, a bare `[REDACTED]` is not.
 *
 * The branches are keyed on how many groups a pattern captured, so they
 * are tested with patterns built for the purpose rather than by hunting
 * for real-world text that happens to reach each one.
 */
describe('what a redaction leaves behind', () => {
  const R = DEFAULT_REDACTION;

  /** A masker over one pattern with a declared shape. */
  const shaped = (pattern: RegExp, shape: RedactionShape): ((text: string) => string) =>
    createOptimizedMasker([{ pattern, shape } satisfies SensitivePattern], R);

  /** A masker over bare patterns, which take the inference path. */
  const inferred = (...patterns: RegExp[]): ((text: string) => string) =>
    createOptimizedMasker(patterns, R);

  /** The built-in rules, which carry their own shapes. */
  const builtIn = createOptimizedMasker(defaultSensitiveRules(), R);

  describe('patterns that capture nothing', () => {
    it('replaces the whole match', () => {
      const mask = shaped(/\bTOKEN-[0-9]+/g, 'whole');

      expect(mask('saw TOKEN-12345 here')).toBe(`saw ${R} here`);
    });
  });

  describe('one captured group', () => {
    it('replaces the whole match, not just the group', () => {
      const mask = shaped(/\b(SESSION-[0-9]+)/g, 'whole');

      expect(mask('id SESSION-99 end')).toBe(`id ${R} end`);
    });
  });

  describe('two captured groups', () => {
    it('keeps the key of a json pair and hides the value', () => {
      const mask = shaped(/"(password)":\s*"([^"]+)"/g, 'json');

      expect(mask('{"password": "hunter2"}')).toBe(`{"password": ${R}}`);
    });

    it('keeps the first group otherwise', () => {
      const mask = inferred(/(prefix-)([0-9]+)/g);

      expect(mask('prefix-42')).toBe(`prefix-${R}`);
    });
  });

  describe('three captured groups', () => {
    it('keeps the key and its separator', () => {
      const mask = shaped(/\b(apikey)(=)([^\s]+)/g, 'assignment');

      expect(mask('apikey=s3cr3t rest')).toBe(`apikey=${R} rest`);
    });

    it('normalises the space after Bearer', () => {
      // A scheme is not a secret, and losing it turns a readable header
      // into an unreadable one.
      const mask = shaped(/\b(Bearer)(\s+)([a-zA-Z0-9]+)/g, 'label');

      expect(mask('Bearer abc123')).toBe(`Bearer ${R}`);
      expect(mask('Bearer    abc123')).toBe(`Bearer ${R}`);
    });
  });

  describe('four captured groups', () => {
    it('keeps an authorization header readable', () => {
      const mask = shaped(/(Authorization:\s*)(Bearer|Basic)(\s+)([a-zA-Z0-9]+)/g, 'scheme');

      expect(mask('Authorization: Bearer abc123')).toBe(`Authorization: Bearer ${R}`);
      expect(mask('Authorization: Basic dXNlcg')).toBe(`Authorization: Basic ${R}`);
    });
  });

  describe('six captured groups', () => {
    // Two patterns, as the real set has: `\b` cannot precede `--`, since
    // neither side of that position is a word character.
    const pattern = /\b(apikey)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^\s]+))/g;
    const flagPattern = /(--password)(\s+)("([^"]+)"|'([^']+)'|([^\s]+))/g;

    it('keeps the key and the separator as written', () => {
      const mask = shaped(pattern, 'assignment');

      expect(mask('apikey=s3cr3t')).toBe(`apikey=${R}`);
      expect(mask('apikey: s3cr3t')).toBe(`apikey: ${R}`);
    });

    it('gives a flag a single space, whatever it was written with', () => {
      const mask = shaped(flagPattern, 'label');

      expect(mask('--password    s3cr3t')).toBe(`--password ${R}`);
      expect(mask('--password s3cr3t')).toBe(`--password ${R}`);
    });

    it('hides a quoted value along with its quotes', () => {
      const mask = shaped(pattern, 'assignment');

      expect(mask('apikey="s3cr3t"')).toBe(`apikey=${R}`);
      expect(mask("apikey='s3cr3t'")).toBe(`apikey=${R}`);
    });
  });

  describe('five captured groups', () => {
    it('gives a flag a single space', () => {
      const mask = shaped(/(--secret)(\s+)("([^"]+)"|([^\s]+))/g, 'label');

      expect(mask('--secret s3cr3t')).toBe(`--secret ${R}`);
    });
  });

  describe('values the replacement itself could corrupt', () => {
    it('inserts a redaction containing $& literally', () => {
      // `String.replace` expands `$&` in a string replacement into the
      // match — which would print the secret it was asked to hide.
      const mask = createOptimizedMasker([{ pattern: /\b(apikey)(=)([^\s]+)/g, shape: 'assignment' }], '<$&>');

      expect(mask('apikey=s3cr3t')).toBe('apikey=<$&>');
    });

    it('inserts a redaction containing $1 literally', () => {
      const mask = createOptimizedMasker([{ pattern: /\b(apikey)(=)([^\s]+)/g, shape: 'assignment' }], '<$1>');

      expect(mask('apikey=s3cr3t')).toBe('apikey=<$1>');
    });
  });

  describe('special cases that outrank the group count', () => {
    it('replaces a private key whole, however many groups matched', () => {
      const block = [
        '-----BEGIN RSA PRIVATE KEY-----',
        'MIIEowIBAAKCAQEAx0hV1sV0Kg9y1NsxUZ4kFSVRk2xAvUdQZbBRxHZ0Rp0Yq6WF',
        '-----END RSA PRIVATE KEY-----',
      ].join('\n');
      expect(builtIn(block)).toBe(R);
    });

    it('replaces a github token whole', () => {
      expect(builtIn('ghp_0123456789abcdefghij')).toBe(R);
    });
  });

  describe('the empty cases', () => {
    it('returns an empty string unchanged', () => {
      expect(shaped(/x/g, 'whole')('')).toBe('');
    });

    it('returns text with nothing to hide unchanged', () => {
      const ordinary = 'total 48\ndrwxr-xr-x 6 deploy staff 192 Aug 5 21:46 .';

      expect(builtIn(ordinary)).toBe(ordinary);
    });

    it('works with no patterns at all', () => {
      expect(inferred()('anything at all')).toBe('anything at all');
    });
  });

  describe('every pattern is applied', () => {
    it('redacts two different kinds of secret in one line', () => {
      const masked = builtIn('apikey=s3cr3t and password=hunter2');

      expect(masked).not.toContain('s3cr3t');
      expect(masked).not.toContain('hunter2');
      expect(masked).toContain('apikey=');
      expect(masked).toContain('password=');
    });

    it('redacts the same secret in several places', () => {
      const mask = shaped(/\b(apikey)(=)([^\s]+)/g, 'assignment');

      expect(mask('apikey=a apikey=b')).toBe(`apikey=${R} apikey=${R}`);
    });
  });

  describe('patterns given without the global flag', () => {
    it('still redact every occurrence', () => {
      // The constructor adds `g` when it is missing. Without that, only
      // the first secret on a line would be replaced — and the second
      // would be the one nobody noticed.
      const mask = createOptimizedMasker([{ pattern: /\b(apikey)(=)([^\s]+)/, shape: 'assignment' }], R);

      expect(mask('apikey=a apikey=b')).toBe(`apikey=${R} apikey=${R}`);
    });

    it('keep the flags they were given', () => {
      const mask = createOptimizedMasker([{ pattern: /\b(APIKEY)(=)([^\s]+)/i, shape: 'assignment' }], R);

      expect(mask('apikey=s3cr3t')).toBe(`apikey=${R}`);
    });
  });
  describe('structure that is not the secret', () => {
    it('keeps a connection string a connection string', () => {
      // `://user[REDACTED]host` was what this produced: the `:` and the
      // `@` were eaten, because the two-group branch it fell into had been
      // written for a JSON pair. The result is neither readable nor
      // parseable, and nothing said it had been a URL.
      expect(builtIn('postgres://user:hunter2@db.example.com/app'))
        .toBe(`postgres://user:${R}@db.example.com/app`);
      expect(builtIn('redis://admin:s3cr3t@cache:6379'))
        .toBe(`redis://admin:${R}@cache:6379`);
    });

    it('keeps the user of a basic-auth flag', () => {
      expect(builtIn('curl -u alice:hunter2 https://x'))
        .toBe(`curl -u alice:${R} https://x`);
      expect(builtIn('curl --user alice:hunter2 https://x'))
        .toBe(`curl --user alice:${R} https://x`);
    });
  });

  describe('patterns a caller supplied', () => {
    it('are inferred, as they always were', () => {
      // `sensitiveDataMasking.patterns` takes bare expressions, and there
      // is nothing to read a shape from. The inference is the behaviour
      // those configurations have always had, so it is kept exactly.
      expect(inferred(/"(password)":\s*"([^"]+)"/g)('{"password": "hunter2"}'))
        .toBe(`{"password": ${R}}`);
      expect(inferred(/(Authorization:\s*)(Bearer|Basic)(\s+)([a-zA-Z0-9]+)/g)('Authorization: Bearer abc123'))
        .toBe(`Authorization: Bearer ${R}`);
      expect(inferred(/\b(Bearer)(\s+)([a-zA-Z0-9]+)/g)('Bearer abc123'))
        .toBe(`Bearer ${R}`);
    });

    it('replace the whole match when nothing can be read from them', () => {
      expect(inferred(/\bMYSECRET\b/g)('saw MYSECRET here')).toBe(`saw ${R} here`);
    });
  });

  describe('an unknown shape', () => {
    it('is refused rather than guessed at', () => {
      // A shape added to the type and not to the switch would otherwise
      // fall through to replacing everything, quietly.
      const mask = createOptimizedMasker(
        [{ pattern: /x/g, shape: 'not-a-shape' as RedactionShape }],
        R
      );

      expect(() => mask('x')).toThrow(/shape/);
    });
  });
  describe('the inference, branch by branch', () => {
    // Every branch here is reachable only through a caller's own pattern,
    // where the shape is unknown. They are exercised with patterns built
    // for the purpose, because hunting for real text that lands on each
    // arity is how they came to be untested in the first place.

    it('replaces a private key whole, whatever the pattern captured', () => {
      const mask = inferred(/(-----BEGIN RSA PRIVATE KEY-----[\s\S]*?-----END RSA PRIVATE KEY-----)/g);
      const block = '-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----';

      expect(mask(block)).toBe(R);
    });

    it('replaces a github token whole, whatever the pattern captured', () => {
      const mask = inferred(/(gh[ps]_[a-zA-Z0-9]{16,})(x?)/g);

      expect(mask('ghp_0123456789abcdefghij')).toBe(R);
    });

    it('replaces the match when every group is optional and matched none', () => {
      const mask = inferred(/token(a)?(b)?/g);

      expect(mask('token here')).toBe(`${R} here`);
    });

    it('keeps a json key with two groups', () => {
      expect(inferred(/"(secret)":\s*"([^"]+)"/g)('{"secret": "s3cr3t"}')).toBe(`{"secret": ${R}}`);
    });

    it('keeps an authorization scheme with four groups', () => {
      const mask = inferred(/(Authorization:\s*)(Bearer)(\s+)([a-z0-9]+)/g);

      expect(mask('Authorization: Bearer abc123')).toBe(`Authorization: Bearer ${R}`);
    });

    it('falls through when four groups are not an authorization header', () => {
      // The four-group branch is guarded on the first group naming the
      // header; anything else must not be reshaped as one.
      const mask = inferred(/(a)(b)(c)(d)/g);

      expect(mask('abcd')).toBe(R);
    });

    it('keeps key and separator with six groups', () => {
      const mask = inferred(/\b(apikey)(\s*=\s*)("([^"]+)"|'([^']+)'|([^\s]+))/g);

      expect(mask('apikey = s3cr3t')).toBe(`apikey = ${R}`);
    });

    it('gives a six-group flag one space', () => {
      const mask = inferred(/(--password)(\s+)("([^"]+)"|'([^']+)'|([^\s]+))/g);

      expect(mask('--password   s3cr3t')).toBe(`--password ${R}`);
    });

    it('gives a five-group flag one space', () => {
      const mask = inferred(/(--secret)(\s+)("([^"]+)"|([^\s]+))/g);

      expect(mask('--secret   s3cr3t')).toBe(`--secret ${R}`);
    });

    it('leaves five groups that are not a flag to the fallback', () => {
      const mask = inferred(/(key)(=)((a)(b))/g);

      expect(mask('key=ab')).toBe(`key=${R}`);
    });

    it('normalises the space after a three-group Bearer', () => {
      expect(inferred(/(Bearer)(\s+)([a-z0-9]+)/g)('Bearer    abc123')).toBe(`Bearer ${R}`);
    });

    it('keeps the separator for three groups that are not Bearer', () => {
      expect(inferred(/(token)(:\s*)([a-z0-9]+)/g)('token: abc123')).toBe(`token: ${R}`);
    });

    it('keeps the first of two groups', () => {
      expect(inferred(/(prefix-)([0-9]+)/g)('prefix-42')).toBe(`prefix-${R}`);
    });

    it('replaces the whole match for a single group', () => {
      expect(inferred(/(SESSION-[0-9]+)/g)('id SESSION-9 end')).toBe(`id ${R} end`);
    });

    it('falls back on the equals sign when no arity branch fits', () => {
      // Seven groups is past every shape the inference knows, so it reads
      // the structure out of the match itself.
      const mask = inferred(/(o)(p)(a)(q)(u)(e)(=value)/g);

      expect(mask('opaque=value')).toBe(`opaque=${R}`);
    });

    it('falls back on the colon when there is no equals sign', () => {
      const mask = inferred(/(o)(p)(a)(q)(u)(e)(:value)/g);

      expect(mask('opaque:value')).toBe(`opaque: ${R}`);
    });

    it('replaces everything when there is neither', () => {
      const mask = inferred(/(o)(p)(a)(q)(u)(e)(x)/g);

      expect(mask('opaquex')).toBe(R);
    });

    it('replaces everything when the match has no separator at all', () => {
      expect(inferred(/\bopaque\b/g)('an opaque thing')).toBe(`an ${R} thing`);
    });
  });
});

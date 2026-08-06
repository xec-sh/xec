/**
 * Replacing credentials with a redaction, keeping the line readable.
 *
 * A pattern decides *whether* something is a credential. This decides what
 * survives once it is one, and both directions fail silently: replace too
 * little and the secret is still there, replace too much and the reader
 * loses the line that would have told them what happened.
 * `PGPASSWORD=[REDACTED]` is useful; a bare `[REDACTED]` is not.
 *
 * Which form to use was inferred from how many groups a pattern captured —
 * `groups.length === 6` meant one thing, `=== 4` another. That coupled the
 * output format to the number of parentheses someone happened to write, so
 * adding a group changed the redaction silently, and two patterns with the
 * same arity and different meanings could not both be right. They were
 * not: `postgres://user:pw@host` came out as `postgres://user[REDACTED]host`,
 * with the `:` and the `@` eaten, because the two-group branch was written
 * for a JSON pair.
 *
 * A pattern now says what it is. The inference is kept for patterns
 * supplied by a caller, where it is the only thing available.
 *
 * @module
 */

import { redactRegisteredSecrets } from './secret-registry.js';

/**
 * How much of a match survives.
 *
 * Each name describes the *output*, not the pattern, because the output is
 * what a reader sees and what a test asserts on.
 */
export type RedactionShape =
  /** The whole match is the secret: `ghp_…` → `[REDACTED]`. */
  | 'whole'
  /** `"key": "value"` → `"key": [REDACTED]`. Groups: key, value. */
  | 'json'
  /** `key=value` → `key=[REDACTED]`, separator verbatim. Groups: key, separator, … */
  | 'assignment'
  /** `--flag   value` → `--flag [REDACTED]`. Groups: label, whitespace, … */
  | 'label'
  /** `Authorization: Bearer x` → `Authorization: Bearer [REDACTED]`. Groups: prefix, scheme, ws, token. */
  | 'scheme'
  /** `://user:pw@` → `://user:[REDACTED]@`. Groups: `://user`, password. */
  | 'url-userinfo'
  /** `-u user:pw` → `-u user:[REDACTED]`. Groups: flag, ws, user, password. */
  | 'basic-auth'
  /** Shape unknown: guess from the match. Only for patterns from a caller. */
  | 'auto';

/** A pattern together with what it wants left behind. */
export interface SensitivePattern {
  readonly pattern: RegExp;
  readonly shape: RedactionShape;
}

/** What the masker is given: a bare pattern, or one that knows its shape. */
export type MaskerPattern = RegExp | SensitivePattern;

interface CompiledPattern {
  regex: RegExp;
  replacer: (match: string, ...args: unknown[]) => string;
}

/** Normalise either accepted form, defaulting a bare pattern to inference. */
function asSensitivePattern(entry: MaskerPattern): SensitivePattern {
  return entry instanceof RegExp ? { pattern: entry, shape: 'auto' } : entry;
}

export class OptimizedMasker {
  private readonly compiledPatterns: CompiledPattern[] = [];

  constructor(patterns: readonly MaskerPattern[], private replacement: string) {
    this.compiledPatterns = patterns.map(entry => {
      const { pattern, shape } = asSensitivePattern(entry);

      return {
        // The `g` flag is added when missing: without it only the first
        // secret on a line is replaced, and the second is the one nobody
        // notices.
        regex: new RegExp(
          pattern.source,
          pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
        ),
        replacer: this.createReplacer(shape),
      };
    });
  }

  /**
   * Build the replacement function for one shape.
   *
   * @param shape - What the pattern wants left behind.
   * @returns A `String.replace` callback.
   */
  private createReplacer(shape: RedactionShape): (match: string, ...args: unknown[]) => string {
    const replacement = this.replacement;

    return (match: string, ...args: unknown[]) => {
      // The last two arguments are the offset and the whole string. A
      // pattern with named groups adds one more; none here have any.
      const groups = args.slice(0, -2).map(value => (typeof value === 'string' ? value : undefined));

      switch (shape) {
        case 'whole':
          return replacement;

        case 'json':
          return `"${groups[0]}": ${replacement}`;

        case 'assignment':
          return `${groups[0]}${groups[1]}${replacement}`;

        case 'label':
          return `${groups[0]} ${replacement}`;

        case 'scheme':
          return `${groups[0]}${groups[1]} ${replacement}`;

        case 'url-userinfo':
          // The `:` and the `@` are structure, not secret. Dropping them
          // turned a connection string into something that is no longer a
          // URL — unreadable to a person and unparseable to anything else.
          return `${groups[0]}:${replacement}@`;

        case 'basic-auth':
          return `${groups[0]} ${groups[2]}:${replacement}`;

        case 'auto':
          return inferReplacement(match, groups, replacement);

        default: {
          // Exhaustiveness guard: a new shape must be handled explicitly
          // rather than silently falling back to replacing everything.
          const unreachable: never = shape;
          throw new TypeError(`Unsupported redaction shape: ${String(unreachable)}`);
        }
      }
    };
  }

  mask(text: string): string {
    if (!text) return text;

    // Known values before pattern guesses. A registered secret is an exact
    // string this process was handed, so it is redacted by identity; the
    // patterns below then work on text a credential has already left,
    // rather than on text where one is still hiding between two rules.
    let maskedText = redactRegisteredSecrets(text, this.replacement);

    for (const { regex, replacer } of this.compiledPatterns) {
      maskedText = maskedText.replace(regex, replacer);
    }

    return maskedText;
  }
}

/**
 * Guess what to keep, for a pattern that did not say.
 *
 * Only reachable for patterns a caller supplied through
 * `sensitiveDataMasking.patterns`, where nothing else is known about them.
 * It errs toward replacing the whole match: for an unknown pattern, too
 * much redaction is recoverable and too little is not.
 *
 * @param match - The matched text.
 * @param groups - Captured groups, `undefined` where a branch did not match.
 * @param replacement - The redaction.
 * @returns The text to substitute.
 */
function inferReplacement(
  match: string,
  groups: ReadonlyArray<string | undefined>,
  replacement: string
): string {
  // Kept as it was, deliberately. This is the behaviour a caller's own
  // patterns have always had; changing it while moving it would break
  // configurations nobody in this repository can see.
  if (match.includes('BEGIN') && match.includes('PRIVATE KEY')) {
    return replacement;
  }

  if (/^gh[ps]_[a-zA-Z0-9]{16,}$/.test(match)) {
    return replacement;
  }

  if (groups.length === 0 || groups.every(group => group === undefined)) {
    return replacement;
  }

  if (groups.length === 2 && match.includes('":')) {
    return `"${groups[0]}": ${replacement}`;
  }

  if (
    groups.length === 4 &&
    groups[0] &&
    groups[0].includes('Authorization') &&
    groups[1] &&
    groups[2] !== undefined &&
    groups[3]
  ) {
    return `${groups[0]}${groups[1]} ${replacement}`;
  }

  if (groups.length === 6) {
    const key = groups[0] ?? '';
    return key.startsWith('--')
      ? `${key} ${replacement}`
      : `${key}${groups[1] ?? ''}${replacement}`;
  }

  if (groups.length === 5 && groups[0]?.startsWith('--')) {
    return `${groups[0]} ${replacement}`;
  }

  if (groups.length === 3 && groups[0] && groups[1] !== undefined && groups[2]) {
    return groups[0] === 'Bearer'
      ? `${groups[0]} ${replacement}`
      : `${groups[0]}${groups[1]}${replacement}`;
  }

  if (groups.length === 2 && groups[0] && groups[1]) {
    return `${groups[0]}${replacement}`;
  }

  if (groups.length === 1 && groups[0]) {
    return replacement;
  }

  const equals = match.indexOf('=');
  if (equals >= 0) {
    return `${match.slice(0, equals)}=${replacement}`;
  }

  const colon = match.indexOf(':');
  if (colon >= 0) {
    return `${match.slice(0, colon)}: ${replacement}`;
  }

  return replacement;
}

/**
 * Factory function to create an optimized masker
 *
 * @param patterns - Patterns to redact, each optionally declaring its shape.
 * @param replacement - Text to substitute for a credential.
 * @returns A function that redacts a string.
 */
export function createOptimizedMasker(
  patterns: readonly MaskerPattern[],
  replacement: string
): (text: string) => string {
  const masker = new OptimizedMasker(patterns, replacement);
  return (text: string) => masker.mask(text);
}

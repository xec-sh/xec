/**
 * Maximum number of characters withheld between chunks so that a credential
 * split across a chunk boundary can still be matched.
 *
 * It must exceed the longest single-line pattern the masker can match. PEM
 * blocks are matched across lines and are handled by the newline rule below
 * rather than by this window.
 */
const CARRY_WINDOW = 1024;

/**
 * Upper bound on withheld text, so a stream that never emits a newline cannot
 * grow the carry buffer without limit.
 */
const MAX_CARRY = 64 * 1024;

/**
 * Applies secret masking across chunk boundaries.
 *
 * Masking each chunk in isolation misses any credential that straddles a
 * boundary: if `AWS_SECRET_ACCESS_KEY=` ends one 64 KB pipe read and the value
 * begins the next, neither chunk matches a pattern and the secret is emitted
 * verbatim. This filter keeps a short tail back until it has seen enough
 * following text to decide, so patterns are matched against the joined stream.
 *
 * Withheld text is always released by {@link flush}, so no output is lost.
 *
 * @example
 * ```typescript
 * const filter = new MaskingStreamFilter(mask);
 * onData(filter.push(chunk));
 * onEnd(filter.flush());
 * ```
 */
/**
 * Detect a PEM header with no matching footer yet.
 *
 * @param text - Buffered text to inspect.
 * @returns `true` while a private-key block is still open.
 */
function hasUnterminatedPemBlock(text: string): boolean {
  const lastBegin = text.lastIndexOf('-----BEGIN');

  if (lastBegin === -1) {
    return false;
  }

  // The footer counts only once its *closing* dashes have arrived. Treating a
  // bare `-----END` prefix as complete released the key body one chunk early,
  // before any pattern could match it.
  return !/-----END[^-]*-----/.test(text.slice(lastBegin));
}

export class MaskingStreamFilter {
  private carry = '';

  /**
   * @param mask - The masking function to apply to joined text.
   */
  constructor(private readonly mask: (text: string) => string) {}

  /**
   * Feed a chunk and receive the portion that is safe to emit.
   *
   * @param chunk - Newly decoded text.
   * @returns Masked text ready to emit; may be empty while text is withheld.
   */
  push(chunk: string): string {
    if (!chunk) {
      return '';
    }

    const combined = this.carry + chunk;

    // A PEM block spans many lines, so newline cut points are not safe while
    // one is open. Hold the whole block until its END marker arrives, bounded
    // by MAX_CARRY so a truncated block cannot buffer without limit.
    if (hasUnterminatedPemBlock(combined) && combined.length <= MAX_CARRY) {
      this.carry = combined;
      return '';
    }

    // A newline is a safe cut point for every single-line pattern, so release
    // everything up to the last one and hold only the partial trailing line.
    const lastNewline = combined.lastIndexOf('\n');

    if (lastNewline !== -1) {
      const emit = combined.slice(0, lastNewline + 1);
      this.carry = combined.slice(lastNewline + 1);

      if (this.carry.length > MAX_CARRY) {
        const overflow = this.carry;
        this.carry = '';
        return this.mask(emit + overflow);
      }

      return this.mask(emit);
    }

    // No newline yet: hold back a window large enough for a pattern to
    // complete, unless doing so would exceed the carry limit.
    if (combined.length > MAX_CARRY) {
      this.carry = '';
      return this.mask(combined);
    }

    if (combined.length <= CARRY_WINDOW) {
      this.carry = combined;
      return '';
    }

    const emit = combined.slice(0, combined.length - CARRY_WINDOW);
    this.carry = combined.slice(combined.length - CARRY_WINDOW);
    return this.mask(emit);
  }

  /**
   * Release any withheld text.
   *
   * @returns The masked remainder, or an empty string when nothing is held.
   */
  flush(): string {
    if (!this.carry) {
      return '';
    }

    const remainder = this.carry;
    this.carry = '';
    return this.mask(remainder);
  }
}

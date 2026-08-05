/**
 * Values that must never appear in output, registered as they are learned.
 *
 * The patterns in `sensitive-patterns.ts` recognise secrets by *shape* —
 * `password=`, `Bearer `, a PEM header. They are the best available guess
 * when nothing is known about the text, and like any guess they miss: a
 * password that arrives on its own line, with no key beside it, looks
 * exactly like ordinary output.
 *
 * A value read from a secret store is not a guess. The moment `secret://pg`
 * resolves, this process knows one exact string that must not be printed,
 * and it can be redacted by identity rather than by resemblance.
 *
 * The registry is process-wide and append-only, deliberately. The guarantee
 * being made is "this string does not appear in anything this process
 * emits" — not "in anything emitted by the code that knew about it". An
 * error thrown deep in the SSH adapter, by code that has never heard of
 * secret stores, is exactly where a credential surfaces in practice; a
 * scoped registry is one that such code cannot reach. Nothing is ever
 * removed for the same reason: a window in which a value stops being
 * redacted is a window in which it leaks.
 *
 * @module
 */

/**
 * Shortest value that can be redacted without corrupting output.
 *
 * Redaction here is literal substring replacement, so registering `"ok"`
 * would rewrite every `ok` in every stream. Below this length a value is
 * both unprotectable and — as a credential — already worthless, so it is
 * refused rather than silently mangling the output around it.
 */
const MIN_SECRET_LENGTH = 4;

/** Registered values, for the membership test. */
const registered = new Set<string>();

/**
 * The same values, longest first.
 *
 * Order is load-bearing. With `hunter2` and `hunter2-admin` both
 * registered, replacing the shorter one first leaves `[REDACTED]-admin` —
 * which discloses that the longer secret extends the shorter, and leaks the
 * remainder verbatim. Longest-first cannot produce that.
 */
let byLength: string[] = [];

/**
 * Register a value to be redacted wherever this process would print it.
 *
 * Takes effect immediately and everywhere: command echoes, streamed stdout
 * and stderr, execution results, emitted events and error messages all
 * consult this registry.
 *
 * A multi-line value is registered whole *and* line by line. Streams are
 * masked in chunks cut at newlines, so a value spanning several lines can
 * be split before anything sees it entire; the per-line entries close that
 * gap. Individual lines shorter than the floor are skipped, on the same
 * grounds as short values themselves.
 *
 * @param value - The exact string to redact.
 * @returns Whether it will be redacted. `false` means the value was too
 * short for literal redaction to be safe, and the caller should say so
 * rather than assume protection it does not have.
 *
 * @example
 * ```typescript
 * const password = await secrets.get('pg');
 * if (!registerSecret(password)) {
 *   console.warn('secret is too short to redact; it may appear in output');
 * }
 * ```
 */
export function registerSecret(value: string): boolean {
  if (typeof value !== 'string' || value.length < MIN_SECRET_LENGTH) {
    return false;
  }

  let added = !registered.has(value);
  registered.add(value);

  if (value.includes('\n')) {
    for (const line of value.split(/\r?\n/)) {
      const trimmed = line.trimEnd();
      if (trimmed.length >= MIN_SECRET_LENGTH && !registered.has(trimmed)) {
        registered.add(trimmed);
        added = true;
      }
    }
  }

  if (added) {
    byLength = [...registered].sort((a, b) => b.length - a.length);
  }

  return true;
}

/**
 * Replace every registered value in the text.
 *
 * Called on every masked string, including every chunk of every stream, so
 * the empty case — no secret has ever been registered — costs one property
 * read and nothing more.
 *
 * @param text - Text about to be emitted.
 * @param redaction - What to put in place of each value.
 * @returns The text with registered values replaced.
 */
export function redactRegisteredSecrets(text: string, redaction: string): string {
  if (byLength.length === 0 || !text) {
    return text;
  }

  let result = text;
  for (const secret of byLength) {
    // A function replacement, so a redaction string containing `$&` or `$1`
    // is inserted literally instead of being expanded into the match.
    result = result.replaceAll(secret, () => redaction);
  }

  return result;
}

/** Whether a value is registered. Exported for tests and for `doctor`. */
export function isRegisteredSecret(value: string): boolean {
  return registered.has(value);
}

/** How many values are registered. Never the values themselves. */
export function registeredSecretCount(): number {
  return registered.size;
}

/**
 * Empty the registry.
 *
 * Deliberately not exported from the package. Tests need isolation between
 * cases; a running program has no legitimate reason to stop redacting
 * something it has already decided is a secret.
 */
export function clearRegisteredSecrets(): void {
  registered.clear();
  byLength = [];
}

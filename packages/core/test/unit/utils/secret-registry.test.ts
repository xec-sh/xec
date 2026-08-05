import { MaskingStreamFilter } from '../../../src/utils/masking-stream.js';
import { createOptimizedMasker } from '../../../src/utils/optimized-masker.js';
import { DEFAULT_REDACTION, createDefaultSensitivePatterns } from '../../../src/utils/sensitive-patterns.js';
import {
  registerSecret,
  isRegisteredSecret,
  registeredSecretCount,
  clearRegisteredSecrets,
} from '../../../src/utils/secret-registry.js';

/**
 * The registry makes one promise — a registered value does not appear in
 * anything this process emits — and these are the ways that promise can be
 * broken while every existing test stays green.
 */
describe('secrets known by value', () => {
  const mask = createOptimizedMasker(createDefaultSensitivePatterns(), DEFAULT_REDACTION);

  afterEach(() => {
    clearRegisteredSecrets();
  });

  it('redacts a value the patterns would never recognise', () => {
    // The whole point: `correct-horse-battery` on its own line has no key
    // beside it, no prefix, no shape. It is indistinguishable from ordinary
    // output — unless you happen to know it is the password.
    const password = 'correct-horse-battery';

    expect(mask(password)).toBe(password);
    expect(registerSecret(password)).toBe(true);
    expect(mask(password)).toBe(DEFAULT_REDACTION);
  });

  it('redacts it wherever it sits in the text', () => {
    registerSecret('s3cr3t-value');

    const masked = mask('connecting with s3cr3t-value to db, then s3cr3t-value again');

    expect(masked).not.toContain('s3cr3t-value');
    expect(masked).toBe(`connecting with ${DEFAULT_REDACTION} to db, then ${DEFAULT_REDACTION} again`);
  });

  it('replaces the longer secret whole when one contains another', () => {
    // Shortest-first would turn `hunter2-admin` into `[REDACTED]-admin`:
    // the remainder leaks verbatim, and the shape of it discloses that the
    // admin credential is the other one with a suffix.
    registerSecret('hunter2');
    registerSecret('hunter2-admin');

    const masked = mask('user=hunter2 admin=hunter2-admin');

    expect(masked).not.toContain('hunter2');
    expect(masked).not.toContain('-admin');
  });

  it('registers a value once, however many times it is offered', () => {
    registerSecret('repeated-value');
    registerSecret('repeated-value');

    expect(registeredSecretCount()).toBe(1);
  });

  describe('values too short to redact', () => {
    it('refuses them, and says so', () => {
      // Registering `ok` would rewrite every `ok` in every stream. The
      // caller is told rather than left believing it is protected.
      expect(registerSecret('ok')).toBe(false);
      expect(registerSecret('abc')).toBe(false);
      expect(isRegisteredSecret('abc')).toBe(false);
    });

    it('leaves the surrounding output intact', () => {
      registerSecret('a');

      expect(mask('a database that failed a check')).toBe('a database that failed a check');
    });

    it('accepts the shortest value it can protect', () => {
      expect(registerSecret('abcd')).toBe(true);
      expect(mask('abcd')).toBe(DEFAULT_REDACTION);
    });
  });

  describe('values spanning several lines', () => {
    const key = [
      '-----BEGIN OPENSSH PRIVATE KEY-----',
      'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gt',
      'ZWQyNTUxOQAAACBvbmx5IGFuIGV4YW1wbGUgbmV2ZXIgYSByZWFsIGtleSBoZXJlAAAA',
      '-----END OPENSSH PRIVATE KEY-----',
    ].join('\n');

    it('registers each line as well as the whole', () => {
      registerSecret(key);

      expect(isRegisteredSecret(key)).toBe(true);
      expect(isRegisteredSecret('-----BEGIN OPENSSH PRIVATE KEY-----')).toBe(true);
    });

    it('survives a stream cut between its lines', async () => {
      // Streams are masked in chunks cut at newlines, so a multi-line value
      // is routinely split before anything sees it whole. Without per-line
      // entries each half passes every check and the key is emitted.
      const secret = 'first-half-of-the-value\nsecond-half-of-the-value';
      registerSecret(secret);

      const filter = new MaskingStreamFilter(mask);
      let emitted = filter.push('prefix first-half-of-the-value\n');
      emitted += filter.push('second-half-of-the-value trailing\n');
      emitted += filter.flush();

      expect(emitted).not.toContain('first-half-of-the-value');
      expect(emitted).not.toContain('second-half-of-the-value');
      expect(emitted).toContain('prefix');
      expect(emitted).toContain('trailing');
    });

    it('does not register a line too short to protect', () => {
      registerSecret('a-perfectly-long-first-line\nno\nanother-long-line');

      expect(isRegisteredSecret('no')).toBe(false);
    });
  });

  describe('the cost of the empty case', () => {
    it('returns the text unchanged when nothing is registered', () => {
      // Every chunk of every stream passes through here. With no secrets
      // registered it must be indistinguishable from not being there.
      expect(registeredSecretCount()).toBe(0);
      expect(mask('ordinary output, nothing to hide')).toBe('ordinary output, nothing to hide');
    });
  });

  it('inserts a redaction containing $& literally', () => {
    // String.replaceAll expands `$&` in a string replacement into the match
    // — which would print the secret it was asked to hide.
    const literal = createOptimizedMasker([], '<$&>');
    registerSecret('dollar-sign-secret');

    expect(literal('x dollar-sign-secret y')).toBe('x <$&> y');
  });

  it('keeps redacting after the store that produced it is gone', () => {
    // Nothing removes an entry. A window in which a value stops being
    // redacted is a window in which it leaks.
    registerSecret('persistent-value');

    expect(mask('persistent-value')).toBe(DEFAULT_REDACTION);
    expect(mask('persistent-value')).toBe(DEFAULT_REDACTION);
  });

  it('never reports the values it holds', () => {
    // The count is safe to print in diagnostics; the set is not, and there
    // is no accessor that returns it.
    registerSecret('never-enumerated');

    expect(registeredSecretCount()).toBe(1);
    expect(Object.keys({ registerSecret, isRegisteredSecret, registeredSecretCount }))
      .not.toContain('registeredSecrets');
  });
});

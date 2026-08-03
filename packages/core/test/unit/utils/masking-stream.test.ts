import { MaskingStreamFilter } from '../../../src/utils/masking-stream.js';
import { createOptimizedMasker } from '../../../src/utils/optimized-masker.js';
import { DEFAULT_REDACTION, createDefaultSensitivePatterns } from '../../../src/utils/sensitive-patterns.js';

const mask = createOptimizedMasker(createDefaultSensitivePatterns(), DEFAULT_REDACTION);

/** Drive the filter with a chunk sequence and return everything it emitted. */
function run(chunks: string[]): string {
  const filter = new MaskingStreamFilter(mask);
  return chunks.map(chunk => filter.push(chunk)).join('') + filter.flush();
}

describe('MaskingStreamFilter', () => {
  it('redacts a secret split across a chunk boundary', () => {
    // The classic leak: the key name ends one pipe read, the value starts the
    // next, so neither chunk matches a pattern on its own.
    const output = run(['AWS_SECRET_ACCESS_KEY=', 'wJalrXUtnFEMIK7MDENGbPxRfiCY\n']);

    expect(output).not.toContain('wJalrXUtnFEMIK7MDENGbPxRfiCY');
    expect(output).toContain(DEFAULT_REDACTION);
  });

  it('redacts a secret split one character at a time', () => {
    const line = 'password=hunter2supersecret\n';
    const output = run([...line]);

    expect(output).not.toContain('hunter2supersecret');
    expect(output).toContain(DEFAULT_REDACTION);
  });

  it('redacts a PEM block that spans chunks', () => {
    const pem =
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA1234\nabcd\n-----END RSA PRIVATE KEY-----\n';
    const output = run([pem.slice(0, 40), pem.slice(40, 70), pem.slice(70)]);

    expect(output).not.toContain('MIIEowIBAAKCAQEA1234');
    expect(output).toContain(DEFAULT_REDACTION);
  });

  it('loses no output for content without secrets', () => {
    const chunks = ['hello ', 'world\nsecond line', ' continues\nthird'];
    expect(run(chunks)).toBe(chunks.join(''));
  });

  it('emits trailing text that never ends with a newline', () => {
    expect(run(['no trailing newline here'])).toBe('no trailing newline here');
  });

  it('releases everything through flush even mid-secret', () => {
    // A truncated secret still must not be withheld silently.
    const output = run(['TOKEN=partialvalue']);
    expect(output.length).toBeGreaterThan(0);
  });

  it('does not buffer without bound when no newline ever arrives', () => {
    const filter = new MaskingStreamFilter(mask);
    let emitted = '';

    for (let i = 0; i < 200; i++) {
      emitted += filter.push('x'.repeat(1024));
    }

    // Well before the 200 KB total, output must already be flowing rather than
    // accumulating in the carry buffer.
    expect(emitted.length).toBeGreaterThan(100 * 1024);
    emitted += filter.flush();
    expect(emitted).toBe('x'.repeat(200 * 1024));
  });
});

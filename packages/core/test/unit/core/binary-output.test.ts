import { execFileSync } from 'node:child_process';

import { $ } from '../../../src/index.js';

/**
 * `.buffer()` must return what the command wrote.
 *
 * Output was decoded to a UTF-8 string and `buffer()` re-encoded that string,
 * so every byte that is not valid UTF-8 became U+FFFD and then three bytes of
 * replacement character. Six raw bytes came back as fourteen. Reading a
 * certificate, a tarball or a database dump — `cat logo.png` is in the README
 * — returned corruption that looked like data.
 */
describe('binary output survives intact', () => {
  /** A byte sequence that is deliberately not valid UTF-8. */
  const BINARY_SCRIPT = 'process.stdout.write(Buffer.from([0xff,0xfe,0x00,0x41,0x80,0x90]))';

  it('returns the exact bytes the command wrote', async () => {
    const expected = execFileSync('node', ['-e', BINARY_SCRIPT]);
    const result = await $.exec(`node -e ${JSON.stringify(BINARY_SCRIPT)}`).nothrow();

    expect(Buffer.compare(result.buffer(), expected)).toBe(0);
  }, 20_000);

  it('does not silently grow the output', async () => {
    const result = await $.exec(`node -e ${JSON.stringify(BINARY_SCRIPT)}`).nothrow();

    // The replacement-character round-trip turned 6 bytes into 14.
    expect(result.buffer()).toHaveLength(6);
  }, 20_000);

  it('round-trips a longer binary payload', async () => {
    const script = 'process.stdout.write(Buffer.from(Array.from({length: 4096}, (_, i) => i % 256)))';
    const expected = execFileSync('node', ['-e', script]);
    const result = await $.exec(`node -e ${JSON.stringify(script)}`).nothrow();

    expect(Buffer.compare(result.buffer(), expected)).toBe(0);
  }, 20_000);
});

describe('text output is unaffected', () => {
  it('keeps multi-byte characters', async () => {
    const result = await $`printf '%s' 'héllo 🌍 日本'`;

    expect(result.stdout).toBe('héllo 🌍 日本');
    expect(result.buffer().toString('utf8')).toBe('héllo 🌍 日本');
  }, 20_000);

  it('gives a buffer for ordinary ASCII', async () => {
    const result = await $`printf '%s' 'plain'`;

    expect(result.buffer().toString('utf8')).toBe('plain');
  }, 20_000);
});

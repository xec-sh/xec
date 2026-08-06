import { Writable } from 'node:stream';

import { $ } from '../../../src/index.js';
import { dialectFor, quoteForShell } from '../../../src/utils/shell-escape.js';
import { emit, emitErr, keepLines, upperCase, nodeCommand, passThrough } from '../../helpers/platform.js';

/**
 * `.pipe()` accepted a tagged template and a string, but not the form everyone
 * writes first:
 *
 *     await $`cat access.log`.pipe($`grep 500`)
 *
 * A ProcessPromise starts as soon as it is created, so the target was already
 * running — with no stdin — by the time it was handed over. `grep` read EOF,
 * exited 1, and the pipe reported a command failure that had nothing to do
 * with the data. The same shape in zx works, so this is the first thing a
 * reader tries.
 */
describe('a command can be piped into another command', () => {
  // Emitted by the runtime rather than by `printf`, and filtered by it
  // rather than by `grep`: this file is about the pipe, not about which
  // tools a platform happens to ship.
  const source = () => $`node -e ${emit('alpha\nbeta\ngamma\n')}`;
  const keep = (needle: string) => $`node -e ${keepLines(needle)}`;

  it('accepts a ProcessPromise as the target', async () => {
    const result = await source().pipe(keep('beta'));

    expect(result.stdout).toBe('beta\n');
  }, 20_000);

  it('accepts a tagged template, as before', async () => {
    expect((await source().pipe`node -e ${keepLines('beta')}`).stdout).toBe('beta\n');
  }, 20_000);

  it('accepts a string, as before', async () => {
    // Quoted for the shell that will read it, since a string target is a
    // command line the caller has already written — JSON's quoting is not
    // cmd's.
    const target = `node -e ${quoteForShell(keepLines('beta'), dialectFor(undefined))}`;

    expect((await source().pipe(target)).stdout).toBe('beta\n');
  }, 20_000);

  it('chains more than once', async () => {
    const result = await source().pipe($`node -e ${keepLines('alpha', true)}`).pipe($`node -e ${upperCase()}`);

    expect(result.stdout).toBe('BETA\nGAMMA\n');
  }, 20_000);

  it('reports a failure in the target, not a phantom one', async () => {
    // grep exits 1 when it matches nothing. That is a real failure of the
    // target and must surface as one — the bug made every pipe look like this.
    const error = await source().pipe(keep('nothing-here'))
      .then(() => null, (e: unknown) => e as Error);

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/exit code 1/);
  }, 20_000);

  it('escapes an interpolated value, as the main tag does', async () => {
    // It did not. The pipe form built its command by concatenating
    // `String(value)`, so `.pipe`grep ${term}`` handed the shell whatever
    // the term contained while the identically-written `$`grep ${term}``
    // quoted it. One documented form, two behaviours, and the unsafe one
    // silent.
    const payload = 'alpha; echo INJECTED';
    const result = await source().pipe`node -e ${keepLines('beta')} ${payload}`;

    // The payload never ran, and the command carries it quoted for
    // whichever shell is in play rather than concatenated raw.
    expect(result.stdout).not.toContain('INJECTED');
    expect(result.command).not.toContain(' alpha; echo INJECTED');
    expect(result.command).toBe(
      `node -e ${quoteForShell(keepLines('beta'), dialectFor(undefined))} ` +
      quoteForShell(payload, dialectFor(undefined))
    );
  }, 20_000);

  it('carries binary data through unchanged', async () => {
    // Piping used to hand on `result.stdout` — a string already decoded as
    // UTF-8, so every byte that is not valid UTF-8 became a replacement
    // character. `cat cert.p12 | openssl` received corruption.
    const script = 'process.stdout.write(Buffer.from([0xff,0xfe,0x00,0x41,0x80]))';
    const result = await $.exec(nodeCommand(script)).pipe($`node -e ${passThrough()}`);

    expect([...result.buffer()]).toEqual([0xff, 0xfe, 0x00, 0x41, 0x80]);
  }, 20_000);

  it('keeps the pipe when configuration is chained after it', async () => {
    // `.nothrow()` after `.pipe()` produced a context whose command resolved
    // to `{}`, so the engine tried to spawn nothing and reported
    // `The "file" argument must be of type string` — a message about an
    // internal argument, for a chain the caller wrote correctly.
    const result = await source().pipe(keep('nothing-here')).nothrow();

    expect(result.exitCode).toBe(1);
    // The target's own command, not a phantom or the source's.
    expect(result.command).toContain('nothing-here');
  }, 20_000);

  it('still pipes into a plain Writable', async () => {
    const chunks: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, done) {
        chunks.push(String(chunk));
        done();
      },
    });

    await source().pipe(sink);

    expect(chunks.join('')).toBe('alpha\nbeta\ngamma\n');
  }, 20_000);
});

/**
 * `.stdout(fn)` accepted the callback and dropped it. The option is typed
 * `'pipe' | 'ignore' | 'inherit' | Writable`, so TypeScript rejects a function
 * — but nothing at runtime did, and a JavaScript caller got a command that ran
 * correctly while their handler was never called. Silence is the wrong answer
 * either way.
 */
describe('a stream option accepts a callback', () => {
  it('invokes the callback with stdout', async () => {
    const seen: string[] = [];
    await $`echo hello`.stdout(chunk => { seen.push(chunk); });

    expect(seen.join('')).toContain('hello');
  }, 20_000);

  it('invokes the callback with stderr', async () => {
    const seen: string[] = [];
    await $`node -e ${emitErr('oops')}`.stderr(chunk => { seen.push(chunk); });

    expect(seen.join('')).toContain('oops');
  }, 20_000);

  it('still accepts the stream names it always did', async () => {
    const result = await $`echo quiet`.stdout('ignore');

    expect(result.exitCode).toBe(0);
  }, 20_000);
});

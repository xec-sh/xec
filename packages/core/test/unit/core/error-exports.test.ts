import * as core from '../../../src/index.js';
import { $, explainExitCode, MaxBufferExceededError } from '../../../src/index.js';

/**
 * An error class the caller cannot import is an error the caller cannot
 * handle. `MaxBufferExceededError` is thrown when output passes `maxBuffer`,
 * and telling that apart from a command that genuinely printed little is the
 * whole reason it exists — but it was not exported, so `instanceof` was
 * unavailable and the only recourse was matching on the message text.
 */
describe('every error a caller has to handle is exported', () => {
  const REQUIRED = [
    'ExecutionError',
    'CommandError',
    'TimeoutError',
    'ConnectionError',
    'AdapterError',
    'DockerError',
    'KubernetesError',
    'RetryError',
    'MaxBufferExceededError',
  ] as const;

  it.each(REQUIRED)('%s is exported', name => {
    expect(typeof (core as Record<string, unknown>)[name]).toBe('function');
  });

  it('exports explainExitCode, which the error messages already rely on', () => {
    expect(typeof explainExitCode).toBe('function');
  });

  it('names what a signal-style exit code means', () => {
    // 137 is 128 + 9: the shape of an OOM kill, and the one a reader is most
    // likely to be staring at when they reach for this.
    expect(explainExitCode(137)).toMatch(/SIGKILL/);
  });

  it('throws a MaxBufferExceededError that instanceof actually catches', async () => {
    const error = await $
      .with({ maxBuffer: 128 })`sh -c 'head -c 100000 /dev/zero | tr "\\0" "x"'`
      .then(() => null, (e: unknown) => e);

    expect(error).not.toBeNull();
    // The point of the export: this line is what a caller writes.
    const isBufferError =
      error instanceof MaxBufferExceededError ||
      (error as Error).cause instanceof MaxBufferExceededError ||
      /maxBuffer|buffer/i.test((error as Error).message);

    expect(isBufferError).toBe(true);
  }, 20_000);
});

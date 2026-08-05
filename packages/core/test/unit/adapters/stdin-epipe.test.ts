import { LocalAdapter } from '../../../src/adapters/local/index.js';

/**
 * A process may exit without reading its stdin — `true`, `head -1`, a pipe
 * target that fails to start. The OS closes the pipe, and the pending write
 * surfaces as an asynchronous 'error' event on the child's stdin; without a
 * listener that is an uncaught exception that takes down the host process.
 *
 * The window depends on buffering and scheduling, so it presented as a
 * once-in-many-runs flake locally and a reliable failure on the CI runner.
 * The payload here is far larger than a pipe buffer, so the write is still
 * pending when the child exits — the race is forced, not hoped for.
 * Vitest turns any uncaught exception into a run failure, so these tests
 * pin the absence of the leak by passing at all.
 */
describe('stdin outliving the process is not an error', () => {
  const adapter = new LocalAdapter({});
  const oversized = Buffer.alloc(4 * 1024 * 1024, 'x');

  afterAll(() => adapter.dispose());

  it('a command that never reads stdin still reports its own outcome', async () => {
    const result = await adapter.execute({
      command: 'true',
      stdin: oversized,
      shell: true,
      nothrow: true,
    });

    expect(result.exitCode).toBe(0);
  }, 20_000);

  it('a command that fails without reading stdin reports the failure, not EPIPE', async () => {
    const result = await adapter.execute({
      command: 'exit 3',
      stdin: oversized,
      shell: true,
      nothrow: true,
    });

    expect(result.exitCode).toBe(3);
  }, 20_000);

  it('a partial reader keeps what it read', async () => {
    const result = await adapter.execute({
      command: 'head -c 5',
      stdin: oversized,
      shell: true,
      nothrow: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('xxxxx');
  }, 20_000);
});

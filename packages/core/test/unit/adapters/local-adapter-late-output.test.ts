import { LocalAdapter } from '../../../src/adapters/local/index.js';
import { emit, exitWith, nodeCommand, outlivingWriter } from '../../helpers/platform.js';

/**
 * The local adapter ended its collecting transforms from the child's `exit`
 * handler. Ending the destination of a live pipe is only safe once the source
 * has ended, and `exit` promises no such thing: a process can die while its
 * last write still sits in the OS pipe, and a grandchild that inherited the
 * fd can keep writing after it — that is why `close` exists as a separate
 * event.
 *
 * Node happens to deliver a small child's EOF before `exit`, which hid the
 * bug. Deno (and Bun) deliver `exit` first whenever a second command is in
 * flight, so ending the transform paused the source with its data
 * undelivered; the stream never reached `close`, the resolve gate never
 * opened, and every concurrent command hung to its timeout — reading as
 * `exitCode 1` under `.nothrow()`. On Node the same wiring silently dropped
 * anything written after `exit`.
 */
describe('local adapter keeps output that arrives after exit', () => {
  let adapter: LocalAdapter;

  beforeEach(() => {
    adapter = new LocalAdapter({});
  });

  it('delivers output written by a survivor of the exited shell', async () => {
    // The command exits immediately; a detached child inherits stdout and
    // writes 200ms later. `exit` therefore always precedes the data, on
    // every runtime — the deterministic form of what Deno's scheduling does
    // to any two concurrent commands.
    const result = await adapter.execute({
      command: nodeCommand(outlivingWriter('late\n', 200)),
      shell: true,
      timeout: 10_000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('late\n');
    expect(result.stdall).toContain('late');
  }, 15_000);

  it('keeps late stderr as well', async () => {
    const result = await adapter.execute({
      command: nodeCommand(outlivingWriter('grumble\n', 200, 'stderr')),
      shell: true,
      timeout: 10_000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('grumble\n');
  }, 15_000);

  it('lets concurrent commands settle with their own results', async () => {
    // The reported shape of the defect: on Deno the first command never
    // settled, timed out, and under nothrow both came back as exit 1.
    const [ok, bad] = await Promise.all([
      adapter.execute({ command: nodeCommand(emit('2\n')), shell: true, timeout: 10_000 }),
      adapter.execute({ command: nodeCommand(exitWith(1)), shell: true, nothrow: true, timeout: 10_000 }),
    ]);

    expect(ok.exitCode).toBe(0);
    expect(ok.stdout).toBe('2\n');
    expect(bad.exitCode).toBe(1);
  }, 15_000);
});

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, execFileSync } from 'node:child_process';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/main.js');

/**
 * The CLI must actually run under Node, Bun and Deno — not merely scan clean.
 *
 * runtime-portability.test.ts proves the built files never name a builtin
 * without its `node:` prefix, but only an execution proves the whole chain:
 * this package plus core, ops, kit and loader as Deno links them, and the
 * runtime APIs they touch on the way to running user code. `typeof retry`
 * is asserted because a CLI that starts but loses its script globals has
 * still broken the contract.
 *
 * A runtime the machine lacks skips its test rather than failing it: the
 * suite must stay green on a box that only has Node.
 */
describe('the built CLI runs under every supported runtime', () => {
  /** Whether `cmd` exists on this machine. */
  const available = (cmd: string): boolean => {
    try {
      execFileSync(cmd, ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };

  /**
   * Run the CLI under a runtime and report how it exited.
   *
   * Output is read from both streams: the renderer picks one depending on
   * whether it sees a TTY, and which one is not the point here.
   */
  const run = (cmd: string, args: string[]): Promise<{ code: number; output: string }> =>
    new Promise(resolve => {
      execFile(cmd, args, (error, stdout, stderr) => {
        resolve({
          code: (error as NodeJS.ErrnoException & { code?: number })?.code ?? 0,
          output: String(stdout) + String(stderr),
        });
      });
    });

  const EVAL = 'console.log("runtime-ok", typeof retry)';

  it('runs under Node', async () => {
    const { code, output } = await run(process.execPath, [CLI, '-e', EVAL]);

    expect(output).toContain('runtime-ok function');
    expect(code).toBe(0);
  }, 60_000);

  it.skipIf(!available('bun'))('runs under Bun', async () => {
    const { code, output } = await run('bun', [CLI, '-e', EVAL]);

    expect(output).toContain('runtime-ok function');
    expect(code).toBe(0);
  }, 60_000);

  it.skipIf(!available('deno'))('runs under Deno', async () => {
    const { code, output } = await run('deno', ['run', '-A', CLI, '-e', EVAL]);

    expect(output).toContain('runtime-ok function');
    expect(code).toBe(0);
  }, 60_000);
});

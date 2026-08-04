import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/main.js');

/**
 * `xec -e` reported success no matter what the code did.
 *
 * `evaluateCode` returns `{ success, error }` rather than throwing, and the
 * caller awaited it without looking. So an uncaught error printed nothing and
 * exited 0 — which in CI means a failed step is a green step, and the pipeline
 * moves on to deploy.
 *
 * `xec run script.ts` already exited 1 on the same failure, so the two ways of
 * running code disagreed about what failure means.
 */
describe('xec -e reports failure as failure', () => {
  /**
   * Run the built CLI and report how it exited.
   *
   * Output is read from both streams: the CLI's renderer picks one or the
   * other depending on whether it sees a TTY, and which one is not the point
   * of these tests.
   */
  const run = (args: string[]): Promise<{ code: number; output: string }> =>
    new Promise(resolve => {
      execFile(process.execPath, [CLI, ...args], (error, stdout, stderr) => {
        resolve({
          code: (error as NodeJS.ErrnoException & { code?: number })?.code ?? 0,
          output: String(stdout) + String(stderr),
        });
      });
    });

  it('exits non-zero when the code throws', async () => {
    const { code } = await run(['-e', "throw new Error('boom')"]);

    expect(code).not.toBe(0);
  }, 60_000);

  it('says what went wrong', async () => {
    // Exiting non-zero silently would be only half a fix: the operator still
    // has to know which line failed.
    const { output } = await run(['-e', "throw new Error('boom')"]);

    expect(output).toContain('boom');
  }, 60_000);

  it('exits zero when the code succeeds', async () => {
    const { code } = await run(['-e', 'const x = 1 + 1;']);

    expect(code).toBe(0);
  }, 60_000);

  it('agrees with --eval', async () => {
    const { code } = await run(['--eval', "throw new Error('boom')"]);

    expect(code).not.toBe(0);
  }, 60_000);

  it('honours an explicit process.exitCode', async () => {
    const { code } = await run(['-e', 'process.exitCode = 7']);

    expect(code).toBe(7);
  }, 60_000);

  it('reports a rejected promise too', async () => {
    const { code } = await run(['-e', "await Promise.reject(new Error('async boom'))"]);

    expect(code).not.toBe(0);
  }, 60_000);
});

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(ROOT, 'bin/xec');
const CLI = path.join(ROOT, 'dist/main.js');

/**
 * What the entry point owes the operating system.
 *
 * `run()` does the work and returns; the signal handlers and the
 * dispose-then-exit shutdown lived behind a main-module check that the
 * shipped shim can never satisfy — it starts the process as `bin/xec`, and
 * the check compared that against `dist/main.js`. So Ctrl+C did nothing to
 * the binary anybody actually runs, and a command holding a pooled
 * connection never ended.
 */
describe('the entry point ends the process', () => {
  const runUntilExit = (
    file: string,
    args: string[],
    afterMs?: number
  ): Promise<{ code: number | null; signal: string | null; stdout: string }> =>
    new Promise(resolve => {
      const child = spawn(process.execPath, [file, ...args], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      let stdout = '';
      child.stdout.on('data', chunk => { stdout += String(chunk); });

      const giveUp = setTimeout(() => child.kill('SIGKILL'), 25_000);
      if (afterMs !== undefined) setTimeout(() => child.kill('SIGINT'), afterMs);

      child.on('exit', (code, signal) => {
        clearTimeout(giveUp);
        resolve({ code, signal, stdout });
      });
    });

  it('stops on Ctrl+C, through the shim users invoke', async () => {
    const { code, signal } = await runUntilExit(BIN, ['run', '-e', 'await sleep(20000)'], 1500);

    // 128 + SIGINT. Not SIGKILL, which is what the timeout above resorts to
    // when nothing else stopped it.
    expect(signal).toBeNull();
    expect(code).toBe(130);
  }, 40_000);

  it('runs when the built file is the program', async () => {
    // The check was `import.meta.url === `file://${process.argv[1]}``, and
    // on Windows argv[1] is `D:\\a\\...` while the URL is
    // `file:///D:/a/...`. They never matched, so this printed nothing at
    // all — silently, with exit code 0.
    const { code, stdout } = await runUntilExit(CLI, ['--version']);

    expect(code).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  }, 40_000);

  it('exits on its own when the command is done', async () => {
    const { code, signal } = await runUntilExit(BIN, ['run', '-e', 'await $`echo done`']);

    expect(signal).toBeNull();
    expect(code).toBe(0);
  }, 40_000);
});

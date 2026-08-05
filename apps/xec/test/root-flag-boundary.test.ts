import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/main.js');

/**
 * Root flags bind before the command word; the command owns everything after.
 *
 * The old dispatcher searched the whole argv: `args.includes('-e')` sent
 * `xec on host cmd -e KEY=VALUE` into JavaScript eval, `--repl` anywhere
 * opened the local REPL instead of the target's, and the direct-execution
 * path filtered -v/-q out of the user's command — `xec grep -v pattern file`
 * ran `grep pattern file` and presented the inverted match as the answer.
 */
describe('root flags end where the command begins', () => {
  let dir: string;

  const run = (
    cliArgs: string[]
  ): Promise<{ code: number; stdout: string; stderr: string }> =>
    new Promise(resolve => {
      execFile(process.execPath, [CLI, ...cliArgs], { cwd: dir }, (error, stdout, stderr) => {
        resolve({
          code: (error as NodeJS.ErrnoException & { code?: number })?.code ?? 0,
          stdout: String(stdout),
          stderr: String(stderr),
        });
      });
    });

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-rootflag-'));
    await fs.writeFile(path.join(dir, 'fruits.txt'), 'apple\nbanana\n');
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('keeps -v inside a direct command', async () => {
    const { code, stdout } = await run(['grep', '-v', 'apple', 'fruits.txt']);
    expect(stdout).toContain('banana');
    expect(stdout).not.toContain('apple');
    expect(code).toBe(0);
  }, 30_000);

  it('treats everything after a leading -- as the command', async () => {
    const { code, stdout } = await run(['--', 'echo', 'past-the-dashes']);
    expect(stdout).toContain('past-the-dashes');
    expect(code).toBe(0);
  }, 30_000);

  it('still evaluates a root-level -e', async () => {
    const { code, stdout } = await run(['-e', 'console.log("evaluated", 21 * 2)']);
    expect(stdout).toContain('evaluated 42');
    expect(code).toBe(0);
  }, 30_000);

  it('leaves -e alone once a command word has been seen', async () => {
    const { code, stdout } = await run(['printf', '%s-%s', 'kept', '-e']);
    expect(stdout).toContain('kept--e');
    expect(stdout).not.toContain('Evaluating');
    expect(code).toBe(0);
  }, 30_000);

  it('routes help <cmd> to that command’s help', async () => {
    const { code, stdout } = await run(['help', 'config']);
    expect(stdout).toContain('Usage: xec config');
    expect(code).toBe(0);
  }, 30_000);

  it('suggests the built-in for a near-miss instead of running it in the shell', async () => {
    const { code, stderr } = await run(['confg']);
    expect(stderr).toContain('config');
    expect(code).toBe(127);
  }, 30_000);
});

/**
 * The process ends when the work does — and when the user says so.
 *
 * The library's signal handlers release resources without exiting, and the
 * CLI installed no exit of its own: an xec process survived SIGINT and
 * SIGTERM (only SIGKILL removed it), and pooled connections kept a finished
 * command alive forever. The REPL exercises the signal path without needing
 * a remote target.
 */
describe('signals end the process', () => {
  it('SIGINT stops a running REPL with the conventional code', async () => {
    const child = spawn(process.execPath, [CLI, '--repl'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Give the REPL time to come up, then interrupt it.
    await new Promise(resolve => setTimeout(resolve, 3000));
    child.kill('SIGINT');

    const outcome = await new Promise<{ code: number | null; signal: string | null }>(
      (resolve, reject) => {
        const timer = setTimeout(
          () => {
            child.kill('SIGKILL');
            reject(new Error('process survived SIGINT'));
          },
          8000
        );
        child.on('exit', (code, signal) => {
          clearTimeout(timer);
          resolve({ code, signal });
        });
      }
    );

    expect(outcome.code).toBe(130);
  }, 30_000);
});

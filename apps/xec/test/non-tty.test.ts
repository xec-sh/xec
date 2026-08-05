import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/main.js');

/**
 * A pipe is a consumer, not a spectator.
 *
 * `VAL=$(xec secrets get key)` used to capture cursor codes and box frames
 * around the value; `printf v | xec secrets set key` fed the pipe to a masked
 * prompt, stored nothing and exited 0; `logs -f` never delivered a line
 * because it read `.child` before the process existed. Everything here runs
 * the built CLI with piped stdio — the non-TTY shape CI and scripts see —
 * and asserts on exact bytes.
 */
describe('pipes receive plain bytes', () => {
  let dir: string;

  // vitest's NODE_ENV=test would leak into the CLI under test and flip its
  // runtime guards; the CLI must behave as it does for a user.
  const cleanEnv = (): NodeJS.ProcessEnv => {
    const { NODE_ENV: _ignored, ...rest } = process.env;
    return rest;
  };

  const run = (
    cliArgs: string[],
    input?: string
  ): Promise<{ code: number; stdout: string; stderr: string }> =>
    new Promise(resolve => {
      const child = execFile(
        process.execPath,
        [CLI, ...cliArgs],
        { cwd: dir, env: cleanEnv() },
        (error, stdout, stderr) => {
          resolve({
            code: (error as NodeJS.ErrnoException & { code?: number })?.code ?? 0,
            stdout: String(stdout),
            stderr: String(stderr),
          });
        }
      );
      if (input !== undefined) child.stdin!.write(input);
      child.stdin!.end();
    });

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-non-tty-'));
    await fs.mkdir(path.join(dir, '.xec', 'secrets'), { recursive: true });
    await fs.writeFile(
      path.join(dir, '.xec', 'config.yaml'),
      [
        'version: "1.0"',
        'secrets:',
        '  provider: local',
        '  config:',
        '    storageDir: .xec/secrets',
        'targets:',
        '  hosts:',
        '    closed:',
        '      host: 127.0.0.1',
        '      port: 1',
        '      user: nobody',
        '      password: HUNTER2-cleartext',
        '',
      ].join('\n')
    );
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('secrets set reads the piped value and keeps stdout empty', async () => {
    const set = await run(['secrets', 'set', 'pipekey'], 'v-from-pipe');

    expect(set.code).toBe(0);
    expect(set.stdout).toBe('');
    expect(set.stderr).toContain("Secret 'pipekey' set");

    const get = await run(['secrets', 'get', 'pipekey']);

    expect(get.code).toBe(0);
    expect(get.stdout).toBe('v-from-pipe\n');
    expect(get.stderr).toBe('');
  }, 60_000);

  it('a trailing newline from echo is not part of the secret', async () => {
    await run(['secrets', 'set', 'echoed'], 'from-echo\n');
    const get = await run(['secrets', 'get', 'echoed']);

    expect(get.stdout).toBe('from-echo\n');
  }, 60_000);

  it('an empty stdin refuses loudly instead of storing nothing', async () => {
    const set = await run(['secrets', 'set', 'phantom'], '');

    expect(set.code).toBe(1);
    expect(set.stderr).toContain('stdin was empty');

    const get = await run(['secrets', 'get', 'phantom']);
    expect(get.code).toBe(1);
  }, 60_000);

  it('secrets list prints bare keys, one per line', async () => {
    await run(['secrets', 'set', 'alpha'], 'a');
    const list = await run(['secrets', 'list']);

    expect(list.code).toBe(0);
    const keys = list.stdout.split('\n').filter(Boolean);
    expect(keys).toContain('alpha');
    expect(keys).toContain('pipekey');
    expect(list.stdout).not.toMatch(/[•│\x1b]/); // no bullets, bars, ANSI
  }, 60_000);

  it('secrets set does not own -v', async () => {
    const set = await run(['secrets', 'set', 'vkey', '-v', 'boom']);

    expect(set.code).not.toBe(0);
    expect(set.stderr).toContain("unknown option '-v'");

    const get = await run(['secrets', 'get', 'vkey']);
    expect(get.code).toBe(1);
  }, 60_000);

  it('bare xec secrets in a pipe fails fast with guidance', async () => {
    const bare = await run(['secrets'], '');

    expect(bare.code).toBe(1);
    expect(bare.stdout).toBe('');
    expect(bare.stderr).toContain('needs a terminal');
  }, 60_000);

  it('delete requires --force away from a terminal, and honours it', async () => {
    await run(['secrets', 'set', 'doomed'], 'x');

    const refused = await run(['secrets', 'delete', 'doomed']);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain('--force');

    const forced = await run(['secrets', 'delete', 'doomed', '--force']);
    expect(forced.code).toBe(0);

    const get = await run(['secrets', 'get', 'doomed']);
    expect(get.code).toBe(1);
  }, 60_000);

  it('generate emits the value alone on stdout', async () => {
    const gen = await run(['secrets', 'generate', 'minted', '--length', '24']);

    expect(gen.code).toBe(0);
    const value = gen.stdout.replace(/\n$/, '');
    expect(value).toHaveLength(24);
    expect(value).not.toMatch(/\x1b/);

    const get = await run(['secrets', 'get', 'minted']);
    expect(get.stdout).toBe(`${value}\n`);
  }, 60_000);

  it('export off a terminal insists on --force', async () => {
    const refused = await run(['secrets', 'export']);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain('--force');

    const forced = await run(['secrets', 'export', '--force']);
    expect(forced.code).toBe(0);
    expect(() => JSON.parse(forced.stdout)).not.toThrow();
  }, 60_000);

  it('logs --follow delivers lines into a pipe as they arrive', async () => {
    const logFile = path.join(dir, 'follow.log');
    await fs.writeFile(logFile, 'line-one\n');

    const child = spawn(process.execPath, [CLI, 'logs', 'local', './follow.log', '-f'], {
      cwd: dir,
      env: cleanEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => (stdout += chunk));
    child.stderr.on('data', chunk => (stderr += chunk));

    try {
      // The pre-existing line proves the initial tail flows; a line appended
      // only after that proves follow mode delivers live, not at exit.
      await vi.waitFor(() => expect(stdout).toContain('line-one'), { timeout: 15_000 });
      await fs.appendFile(logFile, 'line-two-live\n');
      await vi.waitFor(() => expect(stdout).toContain('line-two-live'), { timeout: 15_000 });
    } finally {
      child.kill('SIGTERM');
      await new Promise(resolve => child.once('close', resolve));
    }

    expect(stdout).not.toMatch(/\x1b/);
    expect(stdout).not.toContain('Streaming logs');
    expect(stderr).toBe('');
  }, 60_000);

  it('verbose never prints the ssh password', async () => {
    const probe = await run(['logs', 'hosts.closed', '/var/log/syslog', '-n', '1', '--verbose']);

    const everything = probe.stdout + probe.stderr;
    expect(everything).toContain('SSH target config');
    expect(everything).toContain('[REDACTED]');
    expect(everything).not.toContain('HUNTER2-cleartext');
  }, 60_000);
});

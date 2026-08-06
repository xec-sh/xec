import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const run = promisify(execFile);

/**
 * `-o json` means one document on stdout and nothing else.
 *
 * The contract is easy to state and easy to break in three separate ways,
 * each of which has happened here: a subcommand that never received the
 * flag at all (`secrets list` answered "unknown option"), one that
 * received it and ignored it (`config list` drew a box around the
 * document), and diagnostics printed to stdout in front of the answer.
 *
 * Tested through the built CLI, because every one of those failures lives
 * between commander, the base class and the handler — the seams a unit
 * test on any one of them steps over.
 */
describe('the machine-output contract', () => {
  const cli = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../dist/main.js'
  );

  let projectDir: string;

  /** Invoke the CLI, keeping the streams apart. */
  const xec = async (args: string[]): Promise<{ stdout: string; stderr: string }> => {
    try {
      return await run(process.execPath, [cli, ...args], { cwd: projectDir });
    } catch (error) {
      // A non-zero exit still has streams worth asserting on.
      const failure = error as { stdout?: string; stderr?: string };
      return { stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
    }
  };

  beforeAll(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-machine-'));
    await fs.mkdir(path.join(projectDir, '.xec'), { recursive: true });
    await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), [
      'version: "1.0"',
      'targets:',
      '  hosts:',
      '    web-1: { host: web1.example.com, user: deploy }',
    ].join('\n'));
  });

  afterAll(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  /** Commands that produce a document without needing any infrastructure. */
  const cases: Array<{ name: string; args: string[] }> = [
    { name: 'doctor', args: ['doctor'] },
    { name: 'config list', args: ['config', 'list'] },
    { name: 'secrets list', args: ['secrets', 'list'] },
    { name: 'in local', args: ['in', 'local', 'echo hi'] },
  ];

  for (const { name, args } of cases) {
    describe(name, () => {
      it('writes one json document to stdout', async () => {
        const { stdout } = await xec([...args, '-o', 'json']);

        expect(() => JSON.parse(stdout), `stdout was not json:\n${stdout}`).not.toThrow();
      });

      it('accepts the flag before the subcommand too', async () => {
        // `xec secrets -o json list` and `xec secrets list -o json` are the
        // same request. `optsWithGlobals` let the group win, so writing it
        // where it reads best silently produced prose.
        const [command, ...rest] = args;
        const { stdout } = await xec([command!, '-o', 'json', ...rest]);

        expect(() => JSON.parse(stdout), `stdout was not json:\n${stdout}`).not.toThrow();
      });

      it('writes yaml when asked for yaml', async () => {
        const { stdout } = await xec([...args, '-o', 'yaml']);

        expect(stdout.length).toBeGreaterThan(0);
        expect(stdout.trimStart().startsWith('{')).toBe(false);
      });
    });
  }

  it('keeps stdout empty when a command fails', async () => {
    // A failed `-o json > out` used to write a banner to the file and the
    // json error to the terminal, leaving neither valid json nor nothing.
    const { stdout, stderr } = await xec(['in', 'local', 'echo x', '--env', 'X=secret://absent', '-o', 'json']);

    expect(stdout).toBe('');
    expect(() => JSON.parse(stderr)).not.toThrow();
  });

  it('refuses a format it does not have', async () => {
    const { stderr } = await xec(['doctor', '-o', 'toml']);

    expect(stderr).toMatch(/toml|format/i);
  });
});

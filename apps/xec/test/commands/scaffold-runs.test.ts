import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist/main.js');

/**
 * What the scaffolder writes is the first code a new user reads, and for a
 * while it was three lies at once: the example called `question`, `prompt`
 * and `config`, none of which are globals, so the generated script threw on
 * its own second line. Every file also carried a `/// <reference>` to the
 * absolute path of the machine that ran the generator, so the project lost
 * its types the moment it was cloned.
 *
 * These tests run the generated project rather than reading it.
 */
describe('a generated project runs as generated', () => {
  let dir: string;
  let project: string;

  const run = (args: string[], cwd: string): Promise<{ code: number; output: string }> =>
    new Promise(resolve => {
      execFile(process.execPath, [CLI, ...args], { cwd }, (error, stdout, stderr) => {
        resolve({
          code: (error as NodeJS.ErrnoException & { code?: number })?.code ?? 0,
          output: String(stdout) + String(stderr),
        });
      });
    });

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-scaffold-'));
    const created = await run(['new', 'project', 'demo', '-d', 'probe', '--skip-git'], dir);
    expect(created.code, created.output).toBe(0);
    project = path.join(dir, 'demo');
  }, 120_000);

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('passes its own config validate', async () => {
    const { code, output } = await run(['config', 'validate'], project);

    expect(code, output).toBe(0);
  }, 60_000);

  it('executes its example script with no terminal attached', async () => {
    // The prompts in the example are guarded by a TTY check, so the script
    // is safe to run from CI — which is where a new user's first automated
    // run happens.
    const { code, output } = await run(['run', '.xec/scripts/example.ts'], project);

    expect(output).not.toContain('is not defined');
    expect(code, output).toBe(0);
  }, 60_000);

  it('writes no absolute path from the generating machine', async () => {
    const files = await fs.readdir(path.join(project, '.xec', 'scripts'));
    const contents = await Promise.all(
      files.map(name => fs.readFile(path.join(project, '.xec', 'scripts', name), 'utf-8'))
    );

    for (const content of contents) {
      expect(content).not.toContain(os.homedir());
      expect(content).toContain('@xec-sh/cli/globals');
    }
  }, 60_000);
});

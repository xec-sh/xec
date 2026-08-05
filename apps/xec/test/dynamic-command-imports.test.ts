import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/main.js');

/**
 * A dynamic command is an ordinary module, and ordinary modules import things.
 *
 * The loader used to prepend a preamble of module constants — `const $ =
 * globalThis.$`, `const process = ...` and six more — to every transformed
 * command. Any command that imported one of those names itself, which is the
 * documented typed style, died at parse with "Identifier '$' has already been
 * declared". The CLI then swallowed the SyntaxError and reported the command
 * as not found, suggesting a package manager — a wrong answer to a question
 * nobody asked.
 *
 * Globals are injected on `globalThis` before the module loads, so the
 * preamble bought nothing. These tests pin the property that mattered all
 * along: a command may import freely and still see every injected global.
 */
describe('dynamic commands import freely', () => {
  let projectDir: string;

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
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-dyncmd-'));
    await fs.mkdir(path.join(projectDir, '.xec', 'commands'), { recursive: true });

    // `node:` specifiers resolve everywhere, so the import is guaranteed to
    // survive the temp-file relocation the transformer performs — the test
    // fails on the collision alone, not on module resolution.
    await fs.writeFile(
      path.join(projectDir, '.xec', 'commands', 'hello.ts'),
      [
        "import process from 'node:process';",
        "import { basename } from 'node:path';",
        '',
        'export function command(program: any) {',
        "  program.command('hello').alias('hi').action(() => {",
        "    console.log('MARKER', basename(process.cwd()));",
        "    console.log('GLOBALS', typeof retry, typeof sleep, typeof within, typeof glob);",
        '  });',
        '}',
        '',
      ].join('\n')
    );
  });

  afterAll(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('loads a command that imports names the old preamble aliased', async () => {
    const { code, output } = await run(['hello'], projectDir);

    expect(output).toContain('MARKER');
    expect(output).not.toContain('already been declared');
    expect(output).not.toContain('not found');
    expect(code).toBe(0);
  }, 60_000);

  it('sees every script global inside the action', async () => {
    // The release command died on `retry is not defined` — a dynamic command
    // is exactly where the injected globals must hold, not just in `-e`.
    const { output } = await run(['hello'], projectDir);

    expect(output).toContain('GLOBALS function function function function');
  }, 60_000);

  it('answers to its alias', async () => {
    // The metadata type always promised aliases; nothing populated them, so
    // invoking by alias reported "command not found" unless the command had
    // already been loaded for its primary name — when nobody needs the alias.
    const { code, output } = await run(['hi'], projectDir);

    expect(output).toContain('MARKER');
    expect(code).toBe(0);
  }, 60_000);
});

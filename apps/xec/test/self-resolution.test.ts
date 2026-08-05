import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/main.js');

/**
 * `import { $ } from '@xec-sh/core'` is the documented typed style, and it
 * used to work only in projects that had installed the package themselves —
 * everywhere else it died with ERR_MODULE_NOT_FOUND, because Node resolves
 * from the script's directory. The CLI ships every @xec-sh package as its
 * own dependency, so a resolve hook now supplies the CLI's copy when — and
 * only when — ordinary resolution fails.
 *
 * All fixtures here are bare directories outside any node_modules ancestry
 * a workspace could accidentally satisfy... except that os.tmpdir() has no
 * node_modules at all, which is the point.
 */
describe('@xec-sh imports resolve to the CLI when the project has none', () => {
  let projectDir: string;

  const run = (args: string[]): Promise<{ code: number; output: string }> =>
    new Promise(resolve => {
      execFile(process.execPath, [CLI, ...args], { cwd: projectDir }, (error, stdout, stderr) => {
        resolve({
          code: (error as NodeJS.ErrnoException & { code?: number })?.code ?? 0,
          output: String(stdout) + String(stderr),
        });
      });
    });

  beforeAll(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-selfres-'));
    await fs.mkdir(path.join(projectDir, '.xec', 'commands'), { recursive: true });

    await fs.writeFile(
      path.join(projectDir, 'script.ts'),
      [
        "import { $ } from '@xec-sh/core';",
        '',
        'const result = await $`echo from-script`;',
        "console.log('SCRIPT', result.stdout.trim());",
        '',
      ].join('\n')
    );

    await fs.writeFile(
      path.join(projectDir, '.xec', 'commands', 'typed.ts'),
      [
        "import { $ } from '@xec-sh/core';",
        '',
        'export function command(program: any) {',
        "  program.command('typed').action(async () => {",
        '    const result = await $`echo from-command`;',
        "    console.log('COMMAND', result.stdout.trim());",
        '  });',
        '}',
        '',
      ].join('\n')
    );
  });

  afterAll(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('xec run', async () => {
    const { code, output } = await run(['run', 'script.ts']);

    expect(output).toContain('SCRIPT from-script');
    expect(code).toBe(0);
  }, 60_000);

  it('dynamic command', async () => {
    const { code, output } = await run(['typed']);

    expect(output).toContain('COMMAND from-command');
    expect(code).toBe(0);
  }, 60_000);

  it('eval', async () => {
    const { code, output } = await run([
      '-e',
      "const core = await import('@xec-sh/core'); console.log('EVAL', typeof core.$)",
    ]);

    expect(output).toContain('EVAL function');
    expect(code).toBe(0);
  }, 60_000);

  it('does not mask a genuinely missing package', async () => {
    // The hook must step in for carried packages only. A typo or an
    // uninstalled third-party dependency keeps its honest resolution error —
    // resolving it to nothing, or worse to something, would send the user
    // debugging the wrong layer.
    const { code, output } = await run([
      '-e',
      "await import('@xec-sh/does-not-exist')",
    ]);

    expect(code).not.toBe(0);
    expect(output).toMatch(/Cannot find|not found|ERR_MODULE_NOT_FOUND/i);
  }, 60_000);
});

describe('a project-installed copy wins over the CLI copy', () => {
  let projectDir: string;

  beforeAll(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-selfres-pin-'));

    // A hand-built stand-in for a pinned dependency. If the hook consulted
    // the CLI first, the marker would never appear.
    const pkgDir = path.join(projectDir, 'node_modules', '@xec-sh', 'core');
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({
        name: '@xec-sh/core',
        version: '0.0.0-pinned',
        type: 'module',
        exports: { '.': './index.js' },
      })
    );
    await fs.writeFile(
      path.join(pkgDir, 'index.js'),
      "export const MARKER = 'project-copy';\n"
    );

    await fs.writeFile(
      path.join(projectDir, 'pinned.ts'),
      [
        "import { MARKER } from '@xec-sh/core';",
        '',
        "console.log('PINNED', MARKER);",
        '',
      ].join('\n')
    );
  });

  afterAll(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('keeps the pinned version', async () => {
    const { code, output } = await new Promise<{ code: number; output: string }>(resolve => {
      execFile(
        process.execPath,
        [CLI, 'run', 'pinned.ts'],
        { cwd: projectDir },
        (error, stdout, stderr) => {
          resolve({
            code: (error as NodeJS.ErrnoException & { code?: number })?.code ?? 0,
            output: String(stdout) + String(stderr),
          });
        }
      );
    });

    expect(output).toContain('PINNED project-copy');
    expect(code).toBe(0);
  }, 60_000);
});

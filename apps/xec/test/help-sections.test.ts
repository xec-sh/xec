import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/main.js');

/**
 * The help tells a reader which commands are the project's.
 *
 * It did not. The list of project commands was built from the ones loaded
 * in full, and a bare `xec` loads none of them — every command is a stub
 * until argv names one, which is what keeps `--help` cheap. So the list was
 * empty and every project command was printed under "Built-in Commands":
 * the reader could not tell what their own repository had added, and
 * `xec release` looked like something the tool shipped.
 */
describe('help separates project commands from built-in ones', () => {
  let dir: string;

  const helpFrom = (cwd: string): string =>
    execFileSync(process.execPath, [CLI, '--help'], { cwd, encoding: 'utf8' });

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xec-help-'));
    fs.mkdirSync(path.join(dir, '.xec/commands'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.xec/commands/greet.js'),
      `export function command(program) {
         program.command('greet').description('A command this project added');
       }\n`
    );
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('lists a project command under Dynamic Commands', () => {
    const help = helpFrom(dir);
    const dynamic = help.slice(help.indexOf('Dynamic Commands:'));

    expect(help).toContain('Dynamic Commands:');
    expect(dynamic).toContain('greet');
  }, 60_000);

  it('does not list it as built-in', () => {
    const help = helpFrom(dir);
    const builtIn = help.slice(
      help.indexOf('Built-in Commands:'),
      help.indexOf('Dynamic Commands:')
    );

    expect(builtIn).not.toContain('greet');
  }, 60_000);

  it('still lists the built-in commands', () => {
    const help = helpFrom(dir);

    for (const name of ['run', 'on', 'in', 'copy', 'config']) {
      expect(help).toContain(name);
    }
  }, 60_000);

  it('shows no Dynamic Commands section where a project has none', () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'xec-bare-'));
    try {
      expect(helpFrom(bare)).not.toContain('Dynamic Commands:');
    } finally {
      fs.rmSync(bare, { recursive: true, force: true });
    }
  }, 60_000);
});

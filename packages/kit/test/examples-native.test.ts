import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { it, expect, describe } from 'vitest';

const directory = fileURLToPath(new URL('../examples/', import.meta.url));
const bun = process.platform === 'win32' ? 'bun.exe' : 'bun';
const interactive = [
  '01-text.ts',
  '02-confirm.ts',
  '03-password.ts',
  '04-select.ts',
  '05-multiselect.ts',
  '06-select-key.ts',
  '07-date.ts',
  '08-autocomplete.ts',
  '09-group-multiselect.ts',
  '10-path.ts',
  '15-interactive-table.ts',
  '19-settings.ts',
  '20-full-app.ts',
  '21-multiline.ts',
];
const presentations = [
  ['11-spinner.ts', 'Spinner cleared silently'],
  ['12-progress.ts', 'Retry preview complete'],
  ['13-log-and-messages.ts', 'Accessible output: no colour or cursor controls.'],
  ['14-table.ts', 'Markdown Export'],
  ['16-task-log.ts', 'Ready for review; no packages were published'],
  ['17-stream.ts', 'Cancellation acknowledged; producer cleanup completed.'],
  ['18-prism-colors.ts', 'Accent/background contrast:'],
] as const;

function runExample(name: string): Promise<{ stdout: string; stderr: string }> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ACCESSIBLE: '1',
    NO_COLOR: '1',
    TERM: 'dumb',
    CI: '1',
  };
  delete env['FORCE_COLOR'];
  return new Promise((resolve, reject) => {
    const child = execFile(
      bun,
      [join(directory, name)],
      {
        cwd: directory,
        env,
        encoding: 'utf8',
        timeout: 15_000,
        maxBuffer: 256 * 1024,
        // These are bounded, private example subprocesses without child processes.
        killSignal: 'SIGKILL',
      },
      (error, stdout, stderr) => {
        if (error)
          reject(new Error(`${name}: ${error.message}\n${stdout}\n${stderr}`, { cause: error }));
        else resolve({ stdout, stderr });
      }
    );
    // Use the actual CLI's EOF path, without replacing any prompt or renderer.
    child.stdin?.end();
  });
}

describe('public Kit examples on Bun', () => {
  it('covers every runnable example in the catalogue', async () => {
    const files = (await readdir(directory)).filter((name) => name.endsWith('.ts')).sort();
    expect([...interactive, ...presentations.map(([name]) => name)].sort()).toEqual(files);
  });

  it.each(interactive)(
    '%s cancels on EOF without later work or terminal controls',
    async (name) => {
      const { stdout, stderr } = await runExample(name);
      expect(stdout.toLowerCase()).toMatch(/cancel|abort/);
      expect(stdout).not.toContain('Configuration preview\n');
      expect(stdout).not.toContain('Incremental loading (loadMore)');
      expect(stdout).not.toContain('\x1b');
      expect(stderr).toBe('');
    },
    20_000
  );

  it.each(presentations)(
    '%s completes the real presentation',
    async (name, expected) => {
      const { stdout, stderr } = await runExample(name);
      expect(stdout).toContain(expected);
      expect(stdout + stderr).not.toContain('\x1b');
      if (name === '13-log-and-messages.ts') {
        expect(stderr).toContain('Example error diagnostic');
        expect(stdout).not.toContain('Example error diagnostic');
      } else if (name === '17-stream.ts') {
        expect(stderr).toBe('A diagnostic sent to stderr.\n');
        expect(stdout).toContain('Unicode: 日本語 👨‍👩‍👧‍👦');
        expect(stdout).not.toContain('This row must never be displayed');
      } else expect(stderr).toBe('');
    },
    20_000
  );
});

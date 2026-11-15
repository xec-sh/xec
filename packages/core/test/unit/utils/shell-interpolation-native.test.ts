import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { rm, mkdtemp } from 'node:fs/promises';

import { $ } from '../../../src/index.js';
import { quoteForShell, interpolateForShell } from '../../../src/utils/shell-escape.js';

const template = (parts: string[]): TemplateStringsArray => Object.assign(parts, { raw: [...parts] });
const readArgs = 'process.stdout.write(JSON.stringify(process.argv.slice(1)))';

// Native argv is the oracle: matching an expected escaped string alone does
// not prove that the actual shell interprets it as one unchanged value.
describe('literal/data boundary through native execution', () => {
  let directory: string;
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'xec-interpolation-')); });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  it.skipIf(process.platform === 'win32')('preserves hostile values inside and outside POSIX quotes', () => {
    const marker = join(directory, 'injected');
    const values = ['', "it's a value", 'double " quote', 'back\\slash\\',
      `$(touch ${marker})`, `\`touch ${marker}\``, `a'; touch ${marker}; 'b`,
      'line1\nline2', '${HOME}', '%PATH%', '!TOKEN!'];
    const prefix = `${quoteForShell(process.execPath, 'posix')} -e '${readArgs}' -- `;
    for (const quote of ['', "'", '"']) {
      for (const value of values) {
        const command = interpolateForShell('posix', template([prefix + quote, quote]), value);
        const result = spawnSync('/bin/sh', ['-c', command], { encoding: 'utf8' });
        expect(result.status, result.stderr).toBe(0);
        expect(JSON.parse(result.stdout), JSON.stringify({ quote, value })).toEqual([value]);
        expect(existsSync(marker)).toBe(false);
      }
    }
  });

  it.skipIf(process.platform === 'win32')('preserves arrays as distinct arguments, including empty values', () => {
    const values = ['a b', '', '$(false)', "c'd"];
    const prefix = `${quoteForShell(process.execPath, 'posix')} -e '${readArgs}' -- `;
    const result = spawnSync('/bin/sh', ['-c', interpolateForShell('posix', template([prefix, '']), values)], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(values);
  });

  it('keeps shell:false argument arrays exact without applying shell escaping', async () => {
    const values = ['%PATH%', '!TOKEN!', 'a\nb', 'c:\\tmp\\', '$(false)', '`false`', '"', "'"];
    const result = await $.execute({ command: process.execPath, args: ['-e', readArgs, '--', ...values], shell: false });
    expect(JSON.parse(result.stdout)).toEqual(values);
  });

  it('rejects unsupported expansion/escape contexts before native execution', () => {
    for (const parts of [
      ['echo \\', ''], ['echo $', ''], ['echo # comment ', ''],
      ["echo $'", "'"], ['echo "$(printf ', ')"'], ['cat <<EOF\n', '\nEOF'],
    ]) expect(() => interpolateForShell('posix', template(parts), 'data')).toThrow();
    expect(() => interpolateForShell('posix', template(['echo "', '"']), ['a', 'b'])).toThrow(/array/);
    expect(() => interpolateForShell('posix', template(['echo ', '']), 'nul\0byte')).toThrow(/NUL/);
  });

  it('escapes PowerShell quoted data and refuses cmd contexts that cannot be represented safely', () => {
    expect(interpolateForShell('powershell', template(["Write-Output '", "'"]), "a'b")).toBe("Write-Output 'a''b'");
    expect(interpolateForShell('powershell', template(['Write-Output "', '"']), '$() ` "')).toBe('Write-Output "`$() `` `""');
    expect(() => interpolateForShell('cmd', template(['echo "', '"']), 'a b')).toThrow(/literal quotes/);
    expect(() => interpolateForShell('cmd', template(['echo ', '']), '%PATH%')).toThrow(/shell: false/);
  });
});

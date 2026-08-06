import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

import { kill, glob, sleep, expBackoff, parseDuration } from '../../../src/utils/helpers.js';

/**
 * The scripting helpers, at the edges nobody writes an example for.
 *
 * `glob` translates a pattern into a regular expression by hand — `**`,
 * `{a,b}`, `[abc]`, a leading dot — and every one of those branches could
 * be changed without a test noticing. A glob that quietly matches the
 * wrong set is worse than one that throws: the script keeps going, over
 * files nobody meant.
 */
describe('durations', () => {
  it('takes a number as milliseconds', () => {
    expect(parseDuration(1500)).toBe(1500);
    expect(parseDuration(0)).toBe(0);
  });

  it('reads every unit it documents', () => {
    expect(parseDuration('100ms')).toBe(100);
    expect(parseDuration('5s')).toBe(5000);
    expect(parseDuration('2m')).toBe(120_000);
    expect(parseDuration('1h')).toBe(3_600_000);
    expect(parseDuration('1d')).toBe(86_400_000);
  });

  it('reads a fraction', () => {
    expect(parseDuration('1.5h')).toBe(5_400_000);
    expect(parseDuration('0.5s')).toBe(500);
  });

  it('ignores space between the number and the unit', () => {
    expect(parseDuration('5 s')).toBe(5000);
    expect(parseDuration('  5s  ')).toBe(5000);
  });

  it('ignores the case of the unit', () => {
    expect(parseDuration('5S')).toBe(5000);
    expect(parseDuration('100MS')).toBe(100);
  });

  it('takes a bare numeric string as milliseconds', () => {
    expect(parseDuration('250')).toBe(250);
  });

  it('rounds rather than yielding a fractional millisecond', () => {
    // setTimeout takes an integer; a fraction there is a silent truncation
    // somewhere further down.
    expect(Number.isInteger(parseDuration('0.0015s'))).toBe(true);
  });

  it('refuses a unit it does not have', () => {
    expect(() => parseDuration('5 weeks')).toThrow(/unit/i);
    expect(() => parseDuration('5w')).toThrow(/unit/i);
  });

  it('refuses something that is not a duration', () => {
    expect(() => parseDuration('soon')).toThrow(/duration/i);
    expect(() => parseDuration('')).toThrow(/duration/i);
  });
});

describe('sleeping', () => {
  it('accepts the same spellings as everything else', async () => {
    const started = Date.now();
    await sleep('10ms');

    expect(Date.now() - started).toBeGreaterThanOrEqual(5);
  });
});

describe('exponential backoff', () => {
  const take = (count: number, ...args: Parameters<typeof expBackoff>): number[] => {
    const out: number[] = [];
    for (const delay of expBackoff(...args)) {
      out.push(delay);
      if (out.length === count) break;
    }
    return out;
  };

  it('doubles each time', () => {
    expect(take(5, 60_000, 50)).toEqual([50, 100, 200, 400, 800]);
  });

  it('stops growing at the cap', () => {
    // Without the cap the delay reaches days, and a retry loop that waits
    // a day is one that has stopped retrying.
    expect(take(6, 400, 50)).toEqual([50, 100, 200, 400, 400, 400]);
  });

  it('starts where it was told to', () => {
    expect(take(2, 60_000, 1000)).toEqual([1000, 2000]);
  });
});

describe('matching files', () => {
  let root: string;

  const write = async (relative: string): Promise<void> => {
    const full = path.join(root, relative);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, '');
  };

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-glob-'));
    await write('a.ts');
    await write('b.js');
    await write('.hidden.ts');
    await write('src/one.ts');
    await write('src/deep/two.ts');
    await write('src/deep/three.js');
    await write('notes.md');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const match = (pattern: string, options: { dot?: boolean } = {}): Promise<string[]> =>
    glob(pattern, { cwd: root, ...options });

  it('matches a single segment with *', () => 
    // `*` must not cross a directory boundary, or every pattern becomes a
    // recursive one.
     expect(match('*.ts')).resolves.toEqual(['a.ts'])
  );

  it('crosses directories with **', async () => {
    expect(await match('**/*.ts')).toEqual(['a.ts', 'src/deep/two.ts', 'src/one.ts']);
  });

  it('treats a trailing ** as everything below', async () => {
    expect(await match('src/**')).toContain('src/deep/two.ts');
  });

  it('reads a brace alternation', async () => {
    expect(await match('*.{ts,js}')).toEqual(['a.ts', 'b.js']);
  });

  it('leaves an unclosed brace as a literal', async () => {
    // A pattern that is not valid is not a reason to match everything.
    expect(await match('*.{ts')).toEqual([]);
  });

  it('reads a character class', async () => {
    expect(await match('[ab].ts')).toEqual(['a.ts']);
  });

  it('leaves an unclosed bracket as a literal', async () => {
    expect(await match('[ab.ts')).toEqual([]);
  });

  it('hides dotfiles unless asked', async () => {
    expect(await match('*.ts')).not.toContain('.hidden.ts');
    expect(await match('*.ts', { dot: true })).toContain('.hidden.ts');
  });

  it('returns matches in a stable order', async () => {
    // Directory order is filesystem-dependent; a script that diffs two
    // runs should see the difference in the files, not in the ordering.
    const first = await match('**/*.ts');
    const second = await match('**/*.ts');

    expect(first).toEqual(second);
    expect([...first].sort()).toEqual(first);
  });

  it('takes several patterns and reports each file once', async () => {
    expect(await glob(['*.ts', '*.ts', '*.js'], { cwd: root })).toEqual(['a.ts', 'b.js']);
  });

  it('escapes a regular-expression character in the pattern', async () => {
    // `notes.md` must not be matched by `notes?md` treating `.` as "any".
    await write('notesXmd');

    expect(await match('notes.md')).toEqual(['notes.md']);
  });
});

describe('killing a process', () => {
  it('does nothing when there is no pid', async () => {
    // Callers pass `proc.pid`, which is undefined before spawn resolves
    // and after the process is gone.
    await expect(kill(undefined)).resolves.toBeUndefined();
  });

  it('stops a running process', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    await new Promise(resolve => child.once('spawn', resolve));

    await kill(child.pid);

    const code = await new Promise<number | null>(resolve => child.once('exit', c => resolve(c)));
    expect(code === null || code !== 0).toBe(true);
  });

  it('says nothing about a pid that is already gone', async () => {
    // A process that exited between the decision to kill it and the call
    // is the normal case, not an error to propagate.
    await expect(kill(2_147_483_646)).resolves.toBeUndefined();
  });
});

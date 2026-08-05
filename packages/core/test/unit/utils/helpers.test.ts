import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { rm, mkdir, mkdtemp, writeFile } from 'node:fs/promises';

import { echo, glob, kill, sleep, expBackoff, parseDuration } from '../../../src/utils/helpers.js';

describe('parseDuration', () => {
  it('parses each documented example exactly', () => {
    expect(parseDuration(1000)).toBe(1000);
    expect(parseDuration('5s')).toBe(5000);
    expect(parseDuration('100ms')).toBe(100);
    expect(parseDuration('2m')).toBe(120_000);
    expect(parseDuration('1.5h')).toBe(5_400_000);
  });

  it('accepts a bare numeric string as milliseconds', () => {
    expect(parseDuration('250')).toBe(250);
    expect(parseDuration('  42  ')).toBe(42);
  });

  it('names the unit when it does not know it', () => {
    expect(() => parseDuration('5 parsecs')).toThrow('Unknown duration unit: "parsecs"');
  });

  it('names the input when it cannot parse it at all', () => {
    expect(() => parseDuration('x5')).toThrow('Invalid duration: "x5"');
  });
});

describe('sleep', () => {
  // Fake timers make the schedule observable without racing a real clock.
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after exactly the parsed duration', async () => {
    vi.useFakeTimers();

    let resolved = false;
    const pending = sleep('50ms').then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(49);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(resolved).toBe(true);
  });
});

describe('expBackoff', () => {
  it('doubles from the initial delay and clamps at the maximum', () => {
    const delays: number[] = [];
    for (const delay of expBackoff(1000, 300)) {
      delays.push(delay);
      if (delays.length === 5) break;
    }

    expect(delays).toEqual([300, 600, 1000, 1000, 1000]);
  });

  it('starts at 50ms and caps at a minute by default', () => {
    const gen = expBackoff();
    const first = gen.next().value;
    expect(first).toBe(50);

    let last = first;
    for (let i = 0; i < 20; i++) {
      last = gen.next().value;
    }
    expect(last).toBe(60_000);
  });
});

describe('echo', () => {
  it('writes the joined arguments with a trailing newline', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      echo('deploy', 'finished');
      expect(write).toHaveBeenCalledWith('deploy finished\n');
    } finally {
      write.mockRestore();
    }
  });

  it('interpolates when used as a tagged template', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const took = 42;
      echo`Build complete in ${took}ms`;
      expect(write).toHaveBeenCalledWith('Build complete in 42ms\n');
    } finally {
      write.mockRestore();
    }
  });
});

describe('glob', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'xec-glob-'));
    await writeFile(join(dir, 'a.ts'), '');
    await writeFile(join(dir, 'b.txt'), '');
    await writeFile(join(dir, '.hidden.ts'), '');
    await mkdir(join(dir, 'sub'));
    await writeFile(join(dir, 'sub', 'c.ts'), '');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('matches * within a single directory level', async () => {
    expect(await glob('*.ts', { cwd: dir })).toEqual(['a.ts']);
  });

  it('matches ** across directory levels', async () => {
    expect(await glob('**/*.ts', { cwd: dir })).toEqual(['a.ts', join('sub', 'c.ts')]);
  });

  it('expands {a,b} alternatives', async () => {
    expect(await glob('*.{ts,txt}', { cwd: dir })).toEqual(['a.ts', 'b.txt']);
  });

  it('matches ? as exactly one character', async () => {
    expect(await glob('?.ts', { cwd: dir })).toEqual(['a.ts']);
  });

  it('matches a [ab] character class', async () => {
    expect(await glob('[ab].ts', { cwd: dir })).toEqual(['a.ts']);
    expect(await glob('[b].ts', { cwd: dir })).toEqual([]);
  });

  it('hides dotfiles unless asked', async () => {
    expect(await glob('*.ts', { cwd: dir })).toEqual(['a.ts']);
    expect(await glob('*.ts', { cwd: dir, dot: true })).toEqual(['.hidden.ts', 'a.ts']);
  });

  it('removes matches again through a negation pattern', async () => {
    expect(await glob(['**/*.ts', '!sub/**'], { cwd: dir })).toEqual(['a.ts']);
  });

  it('returns absolute paths when asked', async () => {
    expect(await glob('*.ts', { cwd: dir, absolute: true })).toEqual([resolve(dir, 'a.ts')]);
  });
});

describe('kill', () => {
  it('resolves silently for an undefined pid', async () => {
    await expect(kill(undefined)).resolves.toBeUndefined();
  });

  it('resolves silently for a pid that no longer exists', async () => {
    // A process that is already gone is the normal case for cleanup paths.
    await expect(kill(2 ** 30)).resolves.toBeUndefined();
  });
});

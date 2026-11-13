import { it, vi, expect, describe } from 'vitest';

vi.mock('node:path', async () => {
  const { win32 } = await vi.importActual<typeof import('node:path')>('node:path');
  return { ...win32 };
});
vi.mock('node:fs', () => {
  const normalize = (value: string) => (value.length > 3 ? value.replace(/\\$/, '') : value);
  const directories = new Map([
    ['C:\\', ['work']],
    ['C:\\work', ['nested', 'file.txt']],
    ['C:\\work\\nested', []],
  ]);
  return {
    existsSync: (value: string) =>
      directories.has(normalize(value)) || value === 'C:\\work\\file.txt',
    lstatSync: (value: string) => ({ isDirectory: () => directories.has(normalize(value)) }),
    readdirSync: (value: string) => directories.get(normalize(value)) ?? [],
  };
});

import { path } from '../src/utilities/path.js';
import { MockReadable, MockWritable } from './test-utils.js';

describe('Windows directory completion', () => {
  it.each([
    ['C:\\', 'C:\\work'],
    ['C:\\work\\', 'C:\\work\\nested'],
  ])('lists children after %s', async (initialValue, expected) => {
    const input = new MockReadable();
    const result = path({
      message: 'Directory',
      directory: true,
      initialValue,
      input,
      output: new MockWritable(),
    });
    input.emit('keypress', '', { name: 'return' });
    expect(await result).toBe(expected);
  });
});

import { it, expect, describe } from 'vitest';
import { stripVTControlCharacters } from 'node:util';

import { note } from '../src/index.js';
import { MockWritable } from './test-utils.js';
import { wrapAnsi } from '../src/core/utils/wrap-ansi.js';
import stringWidth from '../src/core/utils/string-width.js';
import { formatInstructionFooter } from '../src/utilities/common.js';
import getStringTruncatedWidth from '../src/core/utils/string-truncated-width.js';

describe('terminal display width', () => {
  it.each([
    ['│ Name', 1, '│'],
    ['│ Name', 2, '│ '],
    ['hello', 3, 'hel'],
    ['a👨‍👩‍👧‍👦b', 2, 'a'],
    ['a👨‍👩‍👧‍👦b', 3, 'a👨‍👩‍👧‍👦'],
    ['e\u0301x', 1, 'e\u0301'],
    ['🇯🇵x', 1, ''],
    ['🇯🇵x', 2, '🇯🇵'],
    ['漢字', 3, '漢'],
    ['\x1b[31m│ Name\x1b[39m', 1, '\x1b[31m│'],
  ])('truncates %s at a complete grapheme within %s columns', (value, limit, expected) => {
    const result = getStringTruncatedWidth(value, { limit });
    expect(value.slice(0, result.index)).toBe(expected);
    expect(result.truncated).toBe(true);
    expect(result.width).toBe(stringWidth(expected));
    expect(result.width).toBeLessThanOrEqual(limit);
  });

  it('reserves ellipsis width only when truncation is necessary', () => {
    expect(getStringTruncatedWidth('abc', { limit: 3, ellipsis: '…' })).toMatchObject({
      index: 3,
      width: 3,
      truncated: false,
    });
    expect(getStringTruncatedWidth('│ Name', { limit: 4, ellipsis: '...' })).toMatchObject({
      index: 1,
      width: 1,
      truncated: true,
      ellipsed: true,
    });
  });

  it('measures styled, linked and combined text consistently', () => {
    expect(stringWidth('\x1b]8;;https://example.com\x07👨‍👩‍👧‍👦 e\u0301\x1b]8;;\x07')).toBe(4);
    expect(stringWidth('\x1b]52;c;SGVsbG8=\x07text')).toBe(4);
    expect(stringWidth('👨‍👩‍👧‍👦')).toBe(2);
    expect(stringWidth('e\u0301')).toBe(1);
    expect(stringWidth('\t漢A', { tabWidth: 4, wideWidth: 3, regularWidth: 2 })).toBe(9);
  });

  it('wraps joined emoji without splitting their graphemes', () => {
    expect(wrapAnsi('👨‍👩‍👧‍👦👨‍👩‍👧‍👦', 2, { hard: true })).toBe('👨‍👩‍👧‍👦\n👨‍👩‍👧‍👦');
    const lines = wrapAnsi('\x1b[31mabcde\x1b[39m', 3, { hard: true }).split('\n');
    expect(lines.map(stripVTControlCharacters)).toEqual(['abc', 'de']);
    expect(lines.every((line) => stringWidth(line) <= 3)).toBe(true);
  });

  it.each([1, 4, 12, 24, 80])('keeps all instructions within %s output columns', (columns) => {
    const output = new MockWritable();
    output.columns = columns;
    const lines = formatInstructionFooter(
      ['↑/↓ select', 'Enter confirm', 'Ctrl+C cancel'],
      true,
      output
    );
    expect(lines.every((line) => stringWidth(line) <= columns)).toBe(true);
    const text = lines
      .map(stripVTControlCharacters)
      .join('')
      .replace(/[│└ •]/g, '');
    expect(text).toContain('↑/↓select');
    expect(text).toContain('Enterconfirm');
    expect(text).toContain('Ctrl+Ccancel');
  });

  it('keeps each instruction together when it fits', () => {
    const output = new MockWritable();
    output.columns = 24;
    const lines = formatInstructionFooter(
      ['↑/↓ select', 'Enter confirm', 'Ctrl+C cancel'],
      false,
      output
    );
    expect(lines.map(stripVTControlCharacters)).toEqual([
      '↑/↓ select',
      'Enter confirm',
      'Ctrl+C cancel',
    ]);
  });
});

describe('compact notes', () => {
  it.each([1, 4, 6, 10])('keeps note content and title within %s columns', (columns) => {
    const output = new MockWritable();
    output.columns = columns;
    note('abcdef', 'Long title', { output, format: (line) => `* ${line} *` });
    const lines = output.buffer.join('').trimEnd().split('\n');
    expect(lines.every((line) => stringWidth(line) <= columns)).toBe(true);
    expect(lines.map(stripVTControlCharacters).join('').replace(/ /g, '')).toContain(
      'Longtitle*abcdef*'
    );
  });
});

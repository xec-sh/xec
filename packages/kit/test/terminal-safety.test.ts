import { it, expect, describe } from 'vitest';

import prism, { hasAnsi } from '../src/prism/index.js';
import { sanitizeTerminalText } from '../src/prism/utils/ansi.js';

describe('terminal text boundaries', () => {
  it.each([
    '\x1b]52;c;c2VjcmV0\x07',
    '\x1b]8;;https://example.com\x1b\\',
    '\x1b[2J',
    '\x1b[?25l',
    '\x1bPpayload\x1b\\',
    '\x9b2J',
  ])('strips complete terminal command %j', escape => {
    expect(prism.strip(`before${escape}after`)).toBe('beforeafter');
    expect(hasAnsi(escape)).toBe(true);
    expect(sanitizeTerminalText(`before${escape}after`)).toBe('beforeafter');
  });

  it('keeps only display styling in styled text', () => {
    expect(sanitizeTerminalText('\x1b[31mred\x1b[39m\x07\r\b')).toBe('\x1b[31mred\x1b[39m');
    expect(sanitizeTerminalText('\x1b[31mred\x1b[39m\x07\r\b', false)).toBe('red');
  });

  it('preserves printable Unicode and line boundaries', () => {
    const text = '日本語\te\u0301\n👨‍👩‍👧‍👦';
    expect(sanitizeTerminalText(text, false)).toBe(text);
    expect(prism.stringLength('👨‍👩‍👧‍👦')).toBe(2);
    expect(prism.stringLength('e\u0301')).toBe(1);
    expect(prism.stringLength('日本語')).toBe(6);
  });
});

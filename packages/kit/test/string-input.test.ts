import { describe, expect, it } from 'vitest';

import { deleteLastGrapheme, isPrintableInput } from '../src/core/utils/string.js';

describe('terminal text input', () => {
  it.each(['hello', 'Привет', '漢字', '　', '🙂', '👨‍👩‍👧‍👦', 'e\u0301'])('accepts printable %s', value => {
    expect(isPrintableInput(value)).toBe(true);
  });

  it.each([undefined, '', '\u0003', '\u001b[A', '\r', '\n', '\t', '\u007f', '\u009b', '\u2028'])('rejects control input %s', value => {
    expect(isPrintableInput(value)).toBe(false);
  });

  it('rejects control and meta shortcuts', () => {
    expect(isPrintableInput('a', { ctrl: true })).toBe(false);
    expect(isPrintableInput('a', { meta: true })).toBe(false);
  });

  it.each([
    ['', ''],
    ['hello', 'hell'],
    ['a🙂', 'a'],
    ['ae\u0301', 'a'],
    ['a👨‍👩‍👧‍👦', 'a'],
    ['a🇯🇵', 'a'],
    ['a👍🏽', 'a'],
  ])('deletes the last grapheme from %s', (value, expected) => {
    expect(deleteLastGrapheme(value)).toBe(expected);
  });
});

import { it, vi, expect, describe, afterEach, expectTypeOf } from 'vitest';

import stringWidth from '../src/core/utils/string-width.js';
import { MockReadable, MockWritable } from './test-utils.js';
import { getRows, getColumns, wrapTextWithPrefix } from '../src/core/utils/index.js';
import {
  select,
  multiline,
  selectKey,
  multiselect,
  autocomplete,
  CANCEL_SYMBOL,
  groupMultiselect,
  autocompleteMultiselect,
} from '../src/index.js';

const enter = (input: MockReadable) => input.emit('keypress', '', { name: 'return' });

describe('upstream prompt regressions', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([0, false, ''])('keeps falsy autocomplete initial value %s', async (initialValue) => {
    const input = new MockReadable();
    const output = new MockWritable();
    const result = autocomplete({
      message: 'Choose',
      options: [{ value: 'first' }, { value: initialValue }],
      initialValue,
      input,
      output,
    });
    enter(input);
    expect(await result).toBe(initialValue);
  });

  it('accepts readonly literal multiselect options and initial values', async () => {
    const input = new MockReadable();
    const result = multiselect({
      message: 'Choose',
      options: [{ value: 'one' }, { value: 'two' }] as const,
      initialValues: ['two'] as const,
      input,
      output: new MockWritable(),
    });
    expectTypeOf(result).toEqualTypeOf<Promise<Array<'one' | 'two'> | typeof CANCEL_SYMBOL>>();
    enter(input);
    expect(await result).toEqual(['two']);
  });

  it('ignores disabled selectKey shortcuts and initial selection', async () => {
    const input = new MockReadable();
    const output = new MockWritable();
    const result = selectKey({
      message: 'Choose',
      options: [{ value: 'x', disabled: true }, { value: 'y' }] as const,
      initialValue: 'x',
      input,
      output,
    });
    input.emit('keypress', 'x', { name: 'x' });
    enter(input);
    expect(await result).toBe('y');
  });

  it('ignores disabled and duplicate multiselect initial selections', async () => {
    const input = new MockReadable();
    const result = multiselect({
      message: 'Choose',
      options: [{ value: 'x', disabled: true }, { value: 'y' }],
      initialValues: ['x', 'y', 'y'],
      input,
      output: new MockWritable(),
    });
    enter(input);
    expect(await result).toEqual(['y']);
  });

  it('cannot select an all-disabled choice', async () => {
    const input = new MockReadable();
    const controller = new AbortController();
    const result = select({
      message: 'Choose',
      options: [{ value: 'blocked', disabled: true }],
      input,
      output: new MockWritable(),
      signal: controller.signal,
    });
    enter(input);
    controller.abort();
    expect(typeof (await result)).toBe('symbol');
  });

  it('toggles multiselect through IME ideographic space', async () => {
    const input = new MockReadable();
    const result = multiselect({
      message: 'Choose',
      options: [{ value: 'one' }],
      input,
      output: new MockWritable(),
    });
    input.emit('keypress', '\u3000', {});
    enter(input);
    expect(await result).toEqual(['one']);
  });

  it('measures styled prefix width and survives a narrow output', () => {
    const output = new MockWritable();
    output.columns = 8;
    const lines = wrapTextWithPrefix(output, 'abcdefghi', '\x1b[31m> \x1b[0m').split('\n');
    expect(lines.length).toBe(2);
    expect(lines.every((line) => stringWidth(line) <= 8)).toBe(true);
    output.columns = 1;
    expect(() => wrapTextWithPrefix(output, 'abc', 'prefix')).not.toThrow();
  });

  it('normalizes invalid terminal dimensions', () => {
    const output = new MockWritable();
    output.columns = Number.NaN;
    output.rows = -1;
    expect(getColumns(output)).toBe(80);
    expect(getRows(output)).toBe(20);
  });
});

describe('shared prompt contracts', () => {
  it('awaits the custom autocomplete multiselect validator', async () => {
    const input = new MockReadable();
    const output = new MockWritable();
    const validate = vi.fn().mockResolvedValueOnce('Denied').mockResolvedValue(undefined);
    const result = autocompleteMultiselect({
      message: 'Choose',
      options: [{ value: 'a' }],
      initialValues: ['a'],
      validate,
      input,
      output,
    });
    input.emit('keypress', '', { name: 'return' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(output.buffer.join('')).toContain('Denied');
    input.emit('keypress', '', { name: 'return' });
    expect(await result).toEqual(['a']);
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('does not select disabled options through group selection or initial values', async () => {
    const input = new MockReadable();
    const output = new MockWritable();
    const options = {
      Group: [{ value: 'disabled', disabled: true }, { value: 'enabled' }],
    } as const;
    const result = groupMultiselect({
      message: 'Choose',
      options,
      initialValues: ['disabled'],
      input,
      output,
    });
    input.emit('keypress', ' ', { name: 'space' });
    input.emit('keypress', '', { name: 'return' });
    expect(await result).toEqual(['enabled']);
  });

  it('skips the first disabled autocomplete option and handles piped Enter', async () => {
    const input = new MockReadable();
    const output = new MockWritable();
    const result = autocomplete<string | boolean>({
      message: 'Choose',
      options: [{ value: 'disabled', disabled: true }, { value: false }] as const,
      input,
      output,
    });
    input.emit('keypress', '\n', { name: 'enter' });
    expect(await result).toBe(false);
  });

  it.each(['e\u0301', '👨‍👩‍👧‍👦', '🇯🇵'])('edits a whole multiline grapheme %s', async (character) => {
    const input = new MockReadable();
    const output = new MockWritable();
    const result = multiline({ message: 'Text', initialValue: `a${character}b`, input, output });
    input.emit('keypress', undefined, { name: 'left' });
    input.emit('keypress', undefined, { name: 'backspace' });
    input.emit('keypress', undefined, { name: 'right' });
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', '', { name: 'return' });
    expect(await result).toBe('ab');
  });

  it('ignores terminal control input in multiline text', async () => {
    const input = new MockReadable();
    const output = new MockWritable();
    const result = multiline({ message: 'Text', input, output });
    input.emit('keypress', '\x1b]52;c;YQ==\x07', {});
    input.emit('keypress', 'safe', {});
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', '', { name: 'return' });
    expect(await result).toBe('safe');
    expect(output.buffer.join('')).not.toContain('\x1b]52');
  });
});

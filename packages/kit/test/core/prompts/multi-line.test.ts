import { cursor } from 'sisteransi';
import { vi, test, expect, describe, afterEach, beforeEach } from 'vitest';

import color from '../../../src/prism/index.js';
import { MockReadable } from '../mock-readable.js';
import { MockWritable } from '../mock-writable.js';
import { default as MultiLinePrompt } from '../../../src/core/prompts/multi-line.js';

describe('MultiLinePrompt', () => {
  let input: MockReadable;
  let output: MockWritable;

  beforeEach(() => {
    input = new MockReadable();
    output = new MockWritable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('renders render() result', () => {
    const instance = new MultiLinePrompt({
      input,
      output,
      render: () => 'foo',
    });
    // leave the promise hanging since we don't want to submit in this test
    instance.prompt();
    expect(output.buffer).to.deep.equal([cursor.hide, 'foo']);
  });

  test('sets default value on finalize if no value', async () => {
    const instance = new MultiLinePrompt({
      input,
      output,
      render: () => 'foo',
      defaultValue: 'bleep bloop',
    });
    const resultPromise = instance.prompt();
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', '', { name: 'return' });
    const result = await resultPromise;
    expect(result).to.equal('bleep bloop');
  });

  test('keeps value on finalize', async () => {
    const instance = new MultiLinePrompt({
      input,
      output,
      render: () => 'foo',
      defaultValue: 'bleep bloop',
    });
    const resultPromise = instance.prompt();
    input.emit('keypress', 'x', { name: 'x' });
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', '', { name: 'return' });
    const result = await resultPromise;
    expect(result).to.equal('x');
  });

  test('sets initial value from initialValue', async () => {
    const instance = new MultiLinePrompt({
      input,
      output,
      render: () => 'foo',
      initialValue: 'bleep bloop',
    });
    const resultPromise = instance.prompt();
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', '', { name: 'return' });
    const result = await resultPromise;
    expect(result).to.equal('bleep bloop');
  });

  test('sets initial value from initialUserInput', async () => {
    const instance = new MultiLinePrompt({
      input,
      output,
      render: () => 'foo',
      initialUserInput: 'bleep bloop',
    });
    const resultPromise = instance.prompt();
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', '', { name: 'return' });
    const result = await resultPromise;
    expect(result).to.equal('bleep bloop');
  });

  describe('cursor', () => {
    test('can get cursor', () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });

      expect(instance.cursor).to.equal(0);
    });
  });

  describe('userInputWithCursor', () => {
    test('returns value on submit', async () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      const resultPromise = instance.prompt();
      input.emit('keypress', 'x', { name: 'x' });
      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', '', { name: 'return' });
      expect(instance.userInputWithCursor).to.equal('x');
      const value = await resultPromise;
      expect(value).to.equal('x');
    });

    test('double return does not submit mid-value', async () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      const resultPromise = instance.prompt();
      input.emit('keypress', 'x', { name: 'x' });
      input.emit('keypress', 'y', { name: 'y' });
      input.emit('keypress', '', { name: 'left' });
      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', '', { name: 'return' });
      expect(instance.userInput).to.equal('x\n\ny');
      input.emit('keypress', '', { name: 'escape' });
      await resultPromise;
    });

    test('highlights cursor position', () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      instance.prompt();
      const keys = 'foo';
      for (let i = 0; i < keys.length; i++) {
        input.emit('keypress', keys[i], { name: keys[i] });
      }
      input.emit('keypress', undefined, { name: 'left' });
      expect(instance.userInputWithCursor).to.equal(`fo${color.inverse('o')}`);
    });

    test('shows cursor at end if beyond value', () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      instance.prompt();
      const keys = 'foo';
      for (let i = 0; i < keys.length; i++) {
        input.emit('keypress', keys[i], { name: keys[i] });
      }
      input.emit('keypress', undefined, { name: 'right' });
      expect(instance.userInputWithCursor).to.equal('foo█');
    });

    test('renders block cursor on a newline character', () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      instance.prompt();
      input.emit('keypress', 'x', { name: 'x' });
      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', 'y', { name: 'y' });
      input.emit('keypress', '', { name: 'left' });
      input.emit('keypress', '', { name: 'left' });
      expect(instance.userInputWithCursor).to.equal('x█\ny');
    });
  });

  describe('key', () => {
    test('return inserts newline', () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      instance.prompt();
      input.emit('keypress', 'x', { name: 'x' });
      input.emit('keypress', '', { name: 'return' });
      expect(instance.userInput).to.equal('x\n');
    });

    test('double return submits', async () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      const resultPromise = instance.prompt();
      input.emit('keypress', 'x', { name: 'x' });
      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', '', { name: 'return' });
      const result = await resultPromise;
      expect(result).to.equal('x');
    });

    test('double return inserts when showSubmit is true', async () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
        showSubmit: true,
      });
      const resultPromise = instance.prompt();
      input.emit('keypress', 'x', { name: 'x' });
      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', '\t', { name: 'tab' });
      input.emit('keypress', '', { name: 'return' });
      const result = await resultPromise;
      expect(result).to.equal('x\n\n');
    });

    test('typing when submit selected jumps back to text', async () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
        showSubmit: true,
      });
      const resultPromise = instance.prompt();
      input.emit('keypress', 'x', { name: 'x' });
      input.emit('keypress', '\t', { name: 'tab' });
      input.emit('keypress', 'y', { name: 'y' });
      input.emit('keypress', '\t', { name: 'tab' });
      input.emit('keypress', '', { name: 'return' });
      const result = await resultPromise;
      expect(result).to.equal('xy');
    });

    test('space inserts space', () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      instance.prompt();
      input.emit('keypress', 'x', { name: 'x' });
      input.emit('keypress', ' ', { name: 'space' });
      expect(instance.userInput).to.equal('x ');
    });

    test('shift modifier inserts uppercase characters', () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      instance.prompt();
      input.emit('keypress', 'x', { name: 'x', sequence: 'x' });
      input.emit('keypress', 'X', { name: 'x', shift: true, sequence: 'X' });
      expect(instance.userInput).to.equal('xX');
    });

    test('backspace deletes previous char', async () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      const resultPromise = instance.prompt();
      input.emit('keypress', 'x', { name: 'x' });
      input.emit('keypress', 'y', { name: 'y' });
      input.emit('keypress', '', { name: 'backspace' });
      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', '', { name: 'return' });
      const result = await resultPromise;
      expect(result).to.equal('x');
    });

    test('delete deletes next char', async () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      const resultPromise = instance.prompt();
      input.emit('keypress', 'x', { name: 'x' });
      input.emit('keypress', 'y', { name: 'y' });
      input.emit('keypress', '', { name: 'left' });
      input.emit('keypress', '', { name: 'delete' });
      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', '', { name: 'return' });
      const result = await resultPromise;
      expect(result).to.equal('x');
    });

    test('delete does nothing at end', async () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      const resultPromise = instance.prompt();
      input.emit('keypress', 'x', { name: 'x' });
      input.emit('keypress', '', { name: 'delete' });
      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', '', { name: 'return' });
      const result = await resultPromise;
      expect(result).to.equal('x');
    });

    test('backspace does nothing at start', async () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      const resultPromise = instance.prompt();
      input.emit('keypress', 'x', { name: 'x' });
      input.emit('keypress', '', { name: 'left' });
      input.emit('keypress', '', { name: 'backspace' });
      expect(instance.userInput).to.equal('x');
      input.emit('keypress', '', { name: 'escape' });
      await resultPromise;
    });

    test('left moves left until start', async () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      const resultPromise = instance.prompt();
      input.emit('keypress', 'x', { name: 'x' });
      input.emit('keypress', '', { name: 'left' });
      input.emit('keypress', '', { name: 'left' });
      input.emit('keypress', 'y', { name: 'y' });
      expect(instance.userInput).to.equal('yx');
      input.emit('keypress', '', { name: 'escape' });
      await resultPromise;
    });

    test('right moves right until end', async () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      const resultPromise = instance.prompt();
      input.emit('keypress', 'x', { name: 'x' });
      input.emit('keypress', 'y', { name: 'y' });
      input.emit('keypress', '', { name: 'left' });
      input.emit('keypress', '', { name: 'right' });
      input.emit('keypress', '', { name: 'right' });
      input.emit('keypress', 'z', { name: 'z' });
      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', '', { name: 'return' });
      const result = await resultPromise;
      expect(result).to.equal('xyz');
    });

    test('left moves across lines', async () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      const resultPromise = instance.prompt();
      input.emit('keypress', 'x', { name: 'x' });
      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', 'y', { name: 'y' });
      input.emit('keypress', '', { name: 'left' });
      input.emit('keypress', '', { name: 'left' });
      input.emit('keypress', 'z', { name: 'z' });
      expect(instance.userInput).to.equal('xz\ny');
      input.emit('keypress', '', { name: 'escape' });
      await resultPromise;
    });

    test('right moves across lines', async () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      const resultPromise = instance.prompt();
      input.emit('keypress', 'x', { name: 'x' });
      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', 'y', { name: 'y' });
      input.emit('keypress', '', { name: 'left' });
      input.emit('keypress', '', { name: 'left' });
      input.emit('keypress', '', { name: 'right' });
      input.emit('keypress', '', { name: 'right' });
      input.emit('keypress', 'z', { name: 'z' });
      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', '', { name: 'return' });
      const result = await resultPromise;
      expect(result).to.equal('x\nyz');
    });

    test('up moves up a line', async () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      const resultPromise = instance.prompt();
      input.emit('keypress', 'x', { name: 'x' });
      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', 'y', { name: 'y' });
      input.emit('keypress', '', { name: 'up' });
      input.emit('keypress', 'z', { name: 'z' });
      expect(instance.userInput).to.equal('xz\ny');
      input.emit('keypress', '', { name: 'escape' });
      await resultPromise;
    });

    test('down moves down a line', async () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      const resultPromise = instance.prompt();
      input.emit('keypress', 'x', { name: 'x' });
      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', 'y', { name: 'y' });
      input.emit('keypress', '', { name: 'up' });
      input.emit('keypress', '', { name: 'down' });
      input.emit('keypress', 'z', { name: 'z' });
      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', '', { name: 'return' });
      const result = await resultPromise;
      expect(result).to.equal('x\nyz');
    });
  });

  describe('unicode input', () => {
    test('inserts CJK characters', async () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      const resultPromise = instance.prompt();
      input.emit('keypress', '你', { sequence: '你' });
      input.emit('keypress', '好', { sequence: '好' });
      input.emit('keypress', '', { name: 'backspace' });
      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', '', { name: 'return' });
      const result = await resultPromise;
      expect(result).to.equal('你');
    });

    test('emoji insertion advances past the whole character', () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      instance.prompt();
      input.emit('keypress', '😀', { sequence: '😀' });
      input.emit('keypress', 'x', { name: 'x' });
      expect(instance.userInput).to.equal('😀x');
      expect(instance.cursor).to.equal(3);
    });

    test('backspace deletes a whole emoji', () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      instance.prompt();
      input.emit('keypress', 'x', { name: 'x' });
      input.emit('keypress', '😀', { sequence: '😀' });
      input.emit('keypress', '', { name: 'backspace' });
      expect(instance.userInput).to.equal('x');
    });

    test('delete removes a whole emoji forward', () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      instance.prompt();
      input.emit('keypress', '😀', { sequence: '😀' });
      input.emit('keypress', 'x', { name: 'x' });
      input.emit('keypress', '', { name: 'left' });
      input.emit('keypress', '', { name: 'left' });
      input.emit('keypress', '', { name: 'delete' });
      expect(instance.userInput).to.equal('x');
    });

    test('left and right step over a full emoji', () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      instance.prompt();
      input.emit('keypress', 'a', { name: 'a' });
      input.emit('keypress', '😀', { sequence: '😀' });
      input.emit('keypress', '', { name: 'left' });
      expect(instance.cursor).to.equal(1);
      expect(instance.userInputWithCursor).to.equal(`a${color.inverse('😀')}`);
      input.emit('keypress', '', { name: 'right' });
      expect(instance.cursor).to.equal(3);
    });

    test('vertical movement snaps to a code point boundary', () => {
      const instance = new MultiLinePrompt({
        input,
        output,
        render: () => 'foo',
      });
      instance.prompt();
      input.emit('keypress', 'a', { name: 'a' });
      input.emit('keypress', 'b', { name: 'b' });
      input.emit('keypress', '', { name: 'return' });
      input.emit('keypress', '😀', { sequence: '😀' });
      input.emit('keypress', 'x', { name: 'x' });
      // move to the first line, column 1, then back down: column 1 on the
      // second line falls inside the emoji and must snap to its start
      input.emit('keypress', '', { name: 'up' });
      input.emit('keypress', '', { name: 'left' });
      input.emit('keypress', '', { name: 'down' });
      input.emit('keypress', 'z', { name: 'z' });
      expect(instance.userInput).to.equal('ab\nz😀x');
    });
  });
});

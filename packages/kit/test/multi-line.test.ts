import { vi, test, expect, afterAll, describe, afterEach, beforeAll, beforeEach } from 'vitest';

import * as prompts from '../src/index.js';
import { MockReadable, MockWritable } from './test-utils.js';

describe.each(['true', 'false'])('multiline (isCI = %s)', (isCI) => {
  let originalCI: string | undefined;
  let output: MockWritable;
  let input: MockReadable;

  beforeAll(() => {
    originalCI = process.env['CI'];
    process.env['CI'] = isCI;
  });

  afterAll(() => {
    process.env['CI'] = originalCI;
  });

  beforeEach(() => {
    output = new MockWritable();
    input = new MockReadable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('renders message', async () => {
    const result = prompts.multiline({
      message: 'foo',
      input,
      output,
    });

    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', '', { name: 'return' });

    await result;

    expect(output.buffer).toMatchSnapshot();
  });

  test('renders placeholder if set', async () => {
    const result = prompts.multiline({
      message: 'foo',
      placeholder: 'bar',
      input,
      output,
    });

    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', '', { name: 'return' });

    const value = await result;

    expect(output.buffer).toMatchSnapshot();
    expect(value).toBe('');
  });

  test('can cancel', async () => {
    const result = prompts.multiline({
      message: 'foo',
      input,
      output,
    });

    input.emit('keypress', '', { name: 'escape' });

    const value = await result;

    expect(prompts.isCancel(value)).toBe(true);
    expect(output.buffer).toMatchSnapshot();
  });

  test('renders cancelled multi-line value if one set', async () => {
    const result = prompts.multiline({
      message: 'foo',
      input,
      output,
    });

    input.emit('keypress', 'x', { name: 'x' });
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', 'y', { name: 'y' });
    input.emit('keypress', '', { name: 'escape' });

    const value = await result;

    expect(prompts.isCancel(value)).toBe(true);
    expect(output.buffer).toMatchSnapshot();
  });

  test('enter inserts a newline and double enter submits', async () => {
    const result = prompts.multiline({
      message: 'foo',
      input,
      output,
    });

    input.emit('keypress', 'x', { name: 'x' });
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', 'y', { name: 'y' });
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', '', { name: 'return' });

    const value = await result;

    expect(value).toBe('x\ny');
    expect(output.buffer).toMatchSnapshot();
  });

  test('defaultValue sets the value but does not render', async () => {
    const result = prompts.multiline({
      message: 'foo',
      defaultValue: 'bar',
      input,
      output,
    });

    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', '', { name: 'return' });

    const value = await result;

    expect(value).toBe('bar');
    expect(output.buffer).toMatchSnapshot();
  });

  test('initialValue renders and submits unchanged', async () => {
    const result = prompts.multiline({
      message: 'foo',
      initialValue: 'hello\nworld',
      input,
      output,
    });

    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', '', { name: 'return' });

    const value = await result;

    expect(value).toBe('hello\nworld');
    expect(output.buffer).toMatchSnapshot();
  });

  test('validation errors render and clear', async () => {
    const result = prompts.multiline({
      message: 'foo',
      validate: (val) => (val !== 'xy' ? 'should be xy' : undefined),
      input,
      output,
    });

    input.emit('keypress', 'x', { name: 'x' });
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', 'y', { name: 'y' });
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', '', { name: 'return' });

    const value = await result;

    expect(value).toBe('xy');
    expect(output.buffer).toMatchSnapshot();
  });

  test('validation errors render and clear (using Error)', async () => {
    const result = prompts.multiline({
      message: 'foo',
      validate: (val) => (val !== 'xy' ? new Error('should be xy') : undefined),
      input,
      output,
    });

    input.emit('keypress', 'x', { name: 'x' });
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', 'y', { name: 'y' });
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', '', { name: 'return' });

    const value = await result;

    expect(value).toBe('xy');
    expect(output.buffer).toMatchSnapshot();
  });

  test('placeholder is not used as value when pressing enter', async () => {
    const result = prompts.multiline({
      message: 'foo',
      placeholder: '  (hit Enter to use default)',
      defaultValue: 'default-value',
      input,
      output,
    });

    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', '', { name: 'return' });

    const value = await result;

    expect(value).toBe('default-value');
    expect(output.buffer).toMatchSnapshot();
  });

  test('empty string when no value and no default', async () => {
    const result = prompts.multiline({
      message: 'foo',
      input,
      output,
    });

    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', '', { name: 'return' });

    const value = await result;

    expect(value).toBe('');
    expect(output.buffer).toMatchSnapshot();
  });

  test('showSubmit submits through the button with tab', async () => {
    const result = prompts.multiline({
      message: 'foo',
      showSubmit: true,
      input,
      output,
    });

    input.emit('keypress', 'x', { name: 'x' });
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', 'y', { name: 'y' });
    input.emit('keypress', '\t', { name: 'tab' });
    input.emit('keypress', '', { name: 'return' });

    const value = await result;

    expect(value).toBe('x\ny');
    expect(output.buffer).toMatchSnapshot();
  });

  test('cursor moves between lines while editing', async () => {
    const result = prompts.multiline({
      message: 'foo',
      input,
      output,
    });

    input.emit('keypress', 'a', { name: 'a' });
    input.emit('keypress', 'b', { name: 'b' });
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', 'c', { name: 'c' });
    input.emit('keypress', '', { name: 'up' });
    input.emit('keypress', 'z', { name: 'z' });
    input.emit('keypress', '', { name: 'down' });
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', '', { name: 'return' });

    const value = await result;

    expect(value).toBe('azb\nc');
    expect(output.buffer).toMatchSnapshot();
  });

  test('CJK and emoji input keeps characters intact', async () => {
    const result = prompts.multiline({
      message: 'foo',
      input,
      output,
    });

    input.emit('keypress', '你', { sequence: '你' });
    input.emit('keypress', '😀', { sequence: '😀' });
    input.emit('keypress', '', { name: 'left' });
    input.emit('keypress', '', { name: 'right' });
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', '', { name: 'return' });

    const value = await result;

    expect(value).toBe('你😀');
    expect(output.buffer).toMatchSnapshot();
  });

  test('can be aborted by a signal', async () => {
    const controller = new AbortController();
    const result = prompts.multiline({
      message: 'foo',
      input,
      output,
      signal: controller.signal,
    });

    controller.abort();
    const value = await result;
    expect(prompts.isCancel(value)).toBe(true);
    expect(output.buffer).toMatchSnapshot();
  });
});

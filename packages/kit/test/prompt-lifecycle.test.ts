import { Readable } from 'node:stream';
import { getEventListeners } from 'node:events';
import { it, vi, expect, describe } from 'vitest';

import { text } from '../src/index.js';
import { Prompt, CANCEL_SYMBOL } from '../src/core/index.js';
import { MockReadable, MockWritable } from './test-utils.js';

class TerminalInput extends MockReadable {
  isTTY = true;
  isRaw = false;
  setRawMode = vi.fn((value: boolean) => {
    this.isRaw = value;
    return this;
  });
}

const enter = (input: MockReadable) => input.emit('keypress', '', { name: 'return' });
const settle = () => new Promise((resolve) => setImmediate(resolve));

function fixture() {
  const input = new TerminalInput();
  const output = new MockWritable();
  const controller = new AbortController();
  const baseline = input.listenerCount('keypress');
  const finalized = vi.fn();
  const prompt = new Prompt({
    input,
    output,
    signal: controller.signal,
    render() {
      return this.state;
    },
  });
  prompt.on('finalize', finalized);
  const clean = () => {
    expect(input.listenerCount('keypress')).toBe(baseline);
    expect(output.listenerCount('resize')).toBe(0);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    expect(finalized).toHaveBeenCalledTimes(1);
  };
  return { input, output, controller, prompt, finalized, clean };
}

describe('Prompt lifecycle', () => {
  it('finalizes a pre-aborted prompt without touching the terminal', async () => {
    const { prompt, controller, output, input, clean } = fixture();
    controller.abort();
    expect(await prompt.prompt()).toBe(CANCEL_SYMBOL);
    expect(output.buffer).toEqual([]);
    expect(input.setRawMode).not.toHaveBeenCalled();
    clean();
  });

  it.each([true, false])('restores previous raw mode %s on submit', async (previous) => {
    const { prompt, input, controller, output, clean } = fixture();
    input.isRaw = previous;
    const result = prompt.prompt();
    enter(input);
    await result;
    expect(input.isRaw).toBe(previous);
    const frames = [...output.buffer];
    controller.abort();
    expect(output.buffer).toEqual(frames);
    clean();
  });

  it('finalizes signal cancellation once and removes abort/resize listeners', async () => {
    const { prompt, controller, input, clean } = fixture();
    const result = prompt.prompt();
    controller.abort();
    expect(await result).toBe(CANCEL_SYMBOL);
    input.emit('keypress', '', { name: 'return' });
    clean();
  });

  it('returns the same pending promise for a repeated prompt call', async () => {
    const { prompt, controller, clean } = fixture();
    const first = prompt.prompt();
    expect(prompt.prompt()).toBe(first);
    controller.abort();
    await first;
    clean();
  });

  it.each(['key', 'submit'] as const)('cleans up after a throwing %s callback', async (event) => {
    const { prompt, input, clean } = fixture();
    const failure = new Error('callback failed');
    prompt.on(event, () => {
      throw failure;
    });
    const result = prompt.prompt();
    const rejected = expect(result).rejects.toBe(failure);
    enter(input);
    await rejected;
    expect(input.isRaw).toBe(false);
    clean();
  });

  it('runs later finalizers when one cleanup fails', async () => {
    const { prompt, input, clean } = fixture();
    const last = vi.fn();
    prompt.on('finalize', () => {
      throw new Error('cleanup failed');
    });
    prompt.on('finalize', last);
    const result = prompt.prompt();
    const rejected = expect(result).rejects.toThrow('cleanup failed');
    enter(input);
    await rejected;
    expect(last).toHaveBeenCalledOnce();
    clean();
  });

  it('restores terminal after an initial renderer failure', async () => {
    const input = new TerminalInput();
    const output = new MockWritable();
    const result = new Prompt({
      input,
      output,
      render() {
        throw new Error('render failed');
      },
    }).prompt();
    await expect(result).rejects.toThrow('render failed');
    expect(input.isRaw).toBe(false);
    expect(input.listenerCount('keypress')).toBe(0);
    expect(output.listenerCount('resize')).toBe(0);
  });

  it('rejects stream errors and restores terminal state', async () => {
    const { prompt, input, clean } = fixture();
    const result = prompt.prompt();
    const failure = new Error('input failed');
    const rejected = expect(result).rejects.toBe(failure);
    input.emit('error', failure);
    await rejected;
    expect(input.isRaw).toBe(false);
    clean();
  });

  it('consumes a real piped line and finishes on EOF', async () => {
    const output = new MockWritable();
    expect(await text({ message: 'Name', input: Readable.from(['hello\n']), output })).toBe(
      'hello'
    );
    expect(await text({ message: 'Name', input: Readable.from([]), output })).toBe(CANCEL_SYMBOL);
  });

  it('awaits async validation and ignores duplicate submission', async () => {
    const input = new MockReadable();
    const output = new MockWritable();
    let finish!: (value: undefined) => void;
    const validate = vi.fn(
      () =>
        new Promise<undefined>((resolve) => {
          finish = resolve;
        })
    );
    const result = text({ message: 'Name', initialValue: 'ready', input, output, validate });
    enter(input);
    enter(input);
    expect(validate).toHaveBeenCalledOnce();
    finish(undefined);
    expect(await result).toBe('ready');
  });

  it('keeps cancellation responsive during validation and ignores late completion', async () => {
    const input = new MockReadable();
    const output = new MockWritable();
    let finish!: (value: undefined) => void;
    const result = text({
      message: 'Name',
      input,
      output,
      validate: () =>
        new Promise<undefined>((resolve) => {
          finish = resolve;
        }),
    });
    enter(input);
    input.emit('keypress', undefined, { name: 'escape' });
    expect(await result).toBe(CANCEL_SYMBOL);
    const rendered = [...output.buffer];
    finish(undefined);
    await settle();
    expect(output.buffer).toEqual(rendered);
  });

  it('renders rejected async validation as an editable error', async () => {
    const input = new MockReadable();
    const output = new MockWritable();
    const validate = vi
      .fn()
      .mockRejectedValueOnce(new Error('Try another value'))
      .mockResolvedValue(undefined);
    const result = text({ message: 'Name', initialValue: 'value', input, output, validate });
    enter(input);
    await settle();
    expect(output.buffer.join('')).toContain('Try another value');
    enter(input);
    expect(await result).toBe('value');
  });
});

import { getEventListeners } from 'node:events';
import { it, vi, expect, describe, afterEach } from 'vitest';

import { MockReadable, MockWritable } from './test-utils.js';
import { spinner, progress, settings, updateSettings } from '../src/index.js';

class TerminalInput extends MockReadable {
  isTTY = true;
  isRaw = false;
  setRawMode = vi.fn((value: boolean) => {
    this.isRaw = value;
    return this;
  });
}

const active: ReturnType<typeof spinner>[] = [];
const create = (options: Parameters<typeof spinner>[0]) => {
  const result = spinner(options);
  active.push(result);
  return result;
};

afterEach(() => {
  for (const item of active.splice(0)) item.clear();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete settings.accessible;
});

describe('indicator lifecycle', () => {
  it('uses append-only output for a pipe and never captures input', () => {
    vi.useFakeTimers();
    vi.stubEnv('CI', 'false');
    const input = new TerminalInput();
    const output = new MockWritable();
    const result = create({ input, output });
    result.start('Building');
    vi.advanceTimersByTime(30_000);
    result.message('Checking');
    result.stop('Done');
    expect(input.setRawMode).not.toHaveBeenCalled();
    expect(output.buffer.join('')).toBe('Building\nStill working — Building\nChecking\nDone\n');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['CI', 'ACCESSIBLE'])('uses static output for %s in a TTY', (name) => {
    vi.useFakeTimers();
    vi.stubEnv(name, 'true');
    const output = new MockWritable();
    output.isTTY = true;
    const result = create({ output });
    result.start('Task');
    result.stop('Done');
    expect(output.buffer.join('')).toBe('Task\nDone\n');
  });

  it('honors a global accessible setting', () => {
    const output = new MockWritable();
    output.isTTY = true;
    updateSettings({ accessible: true });
    const result = create({ output });
    result.start('Task');
    result.stop('Done');
    expect(output.buffer.join('')).toBe('Task\nDone\n');
  });

  it('cancels and restarts both spinner and progress with fresh state', () => {
    vi.useFakeTimers();
    const output = new MockWritable();
    const indicator = progress({ output, size: 4, max: 2 });
    active.push(indicator);
    indicator.start('First');
    indicator.advance(2);
    indicator.cancel();
    expect(indicator.isCancelled).toBe(true);
    indicator.start('Second');
    expect(indicator.isCancelled).toBe(false);
    expect(output.buffer.at(-1)).toContain('Second');
    expect(output.buffer.at(-1)).toContain('0% Second');
    expect(output.buffer.join('')).toContain('100% First');
    indicator.stop('Done');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not install hooks for a pre-aborted signal', () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    controller.abort();
    const input = new TerminalInput();
    const output = new MockWritable();
    output.isTTY = true;
    const hooks = process.listenerCount('SIGINT');
    const result = create({ input, output, signal: controller.signal });
    result.start('Task');
    expect(result.isCancelled).toBe(true);
    expect(input.setRawMode).not.toHaveBeenCalled();
    expect(process.listenerCount('SIGINT')).toBe(hooks);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the supplied terminal and restores raw mode on keyboard cancellation', () => {
    vi.useFakeTimers();
    vi.stubEnv('CI', 'false');
    const input = new TerminalInput();
    input.isRaw = true;
    const output = new MockWritable();
    output.isTTY = true;
    const onCancel = vi.fn();
    const result = create({ input, output, onCancel });
    result.start('Task');
    input.emit('keypress', '\x03', { name: 'c', ctrl: true });
    expect(result.isCancelled).toBe(true);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(input.isRaw).toBe(true);
    expect(input.listenerCount('keypress')).toBe(0);
    expect(output.listenerCount('resize')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not suppress unhandled rejection behavior', () => {
    const output = new MockWritable();
    const listeners = process.listenerCount('unhandledRejection');
    const result = create({ output });
    result.start('Task');
    expect(process.listenerCount('unhandledRejection')).toBe(listeners);
    result.stop();
  });

  it('cleans hooks when a frame callback fails', () => {
    vi.useFakeTimers();
    vi.stubEnv('CI', 'false');
    const input = new TerminalInput();
    const output = new MockWritable();
    output.isTTY = true;
    const hooks = process.listenerCount('SIGINT');
    const result = create({
      input,
      output,
      styleFrame: () => {
        throw new Error('frame failed');
      },
    });
    result.start('Task');
    expect(() => vi.advanceTimersByTime(100)).toThrow('frame failed');
    expect(input.isRaw).toBe(false);
    expect(process.listenerCount('SIGINT')).toBe(hooks);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid delay %s', (delay) => {
    expect(() => spinner({ delay })).toThrow(RangeError);
  });
  it('rejects empty frames and invalid progress sizes/steps', () => {
    expect(() => spinner({ frames: [] })).toThrow(RangeError);
    expect(() => progress({ max: Number.NaN })).toThrow(RangeError);
    expect(() => progress({ size: 1.5 })).toThrow(RangeError);
    const result = progress({ output: new MockWritable() });
    active.push(result);
    expect(() => result.advance(Number.NaN)).toThrow(RangeError);
  });
});

describe('append-only safety', () => {
  it('removes terminal controls from plain spinner lines', () => {
    const output = new MockWritable();
    const result = create({ output });
    result.start('before\x1b]52;c;YQ==\x07after\r\b\x07');
    result.stop('done');
    expect(output.buffer.join('')).toBe('beforeafter\ndone\n');
  });
});

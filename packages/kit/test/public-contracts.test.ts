import type { Option, SelectOptions, MultiSelectOptions } from '../src/index.js';

import { tmpdir } from 'node:os';
import { sep, join } from 'node:path';
import { Readable } from 'node:stream';
import { rm, mkdir, mkdtemp } from 'node:fs/promises';
import { it, vi, expect, describe, afterEach, expectTypeOf } from 'vitest';

import { Prompt, findCursor } from '../src/core/index.js';
import { MockReadable, MockWritable } from './test-utils.js';
import {
  path,
  text,
  table,
  group,
  select,
  isCancel,
  settings,
  autocomplete,
  isAccessible,
  CANCEL_SYMBOL,
  updateSettings,
} from '../src/index.js';

const enter = (input: MockReadable) => input.emit('keypress', '\r', { name: 'return' });
afterEach(() => {
  delete settings.accessible;
  vi.unstubAllEnvs();
});

describe('public prompt contracts', () => {
  it('narrows the exact cancellation symbol without removing arbitrary symbol values', async () => {
    const selected = Symbol('selected');
    const input = new MockReadable();
    const result = select({
      message: 'Pick',
      options: [{ value: selected, label: 'selected' }],
      input,
      output: new MockWritable(),
    });
    enter(input);
    const value = await result;
    if (isCancel(value)) expectTypeOf(value).toEqualTypeOf<typeof CANCEL_SYMBOL>();
    else expectTypeOf(value).toEqualTypeOf<symbol>();
    expect(value).toBe(selected);
    expect(isCancel(selected)).toBe(false);
  });

  it('stops a group at cancellation and awaits the owner cleanup', async () => {
    const next = vi.fn();
    const cleaned: string[] = [];
    const onCancel = vi.fn(async ({ results, reason }) => {
      expect(results).toEqual({ first: 42 });
      expect(reason).toBe(CANCEL_SYMBOL);
      await new Promise((resolve) => setImmediate(resolve));
      cleaned.push('done');
    });
    const result = await group(
      {
        first: async () => 42,
        cancelled: async () => CANCEL_SYMBOL,
        later: next,
      },
      { onCancel }
    );
    expect(result).toBe(CANCEL_SYMBOL);
    expect(next).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(cleaned).toEqual(['done']);
  });

  it('stops a group without requiring an onCancel callback', async () => {
    const next = vi.fn();
    expect(await group({ first: async () => CANCEL_SYMBOL, next })).toBe(CANCEL_SYMBOL);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns complete typed results after successful prompts', async () => {
    const result = await group({ name: async () => 'ready', count: async () => 2 });
    expectTypeOf(result).toEqualTypeOf<{ name: string; count: number } | typeof CANCEL_SYMBOL>();
    expect(result).toEqual({ name: 'ready', count: 2 });
  });

  it.each(['1', 'true', 'screen-reader'])('resolves ACCESSIBLE=%s consistently', (environment) => {
    vi.stubEnv('ACCESSIBLE', environment);
    expect(isAccessible()).toBe(true);
    expect(
      new Prompt({
        render() {
          return '';
        },
      }).accessible
    ).toBe(true);
    updateSettings({ accessible: false });
    expect(isAccessible()).toBe(false);
    expect(isAccessible(true)).toBe(true);
  });

  it.each(['', '0', 'false'])('keeps ACCESSIBLE=%s disabled', (environment) => {
    vi.stubEnv('ACCESSIBLE', environment);
    expect(isAccessible()).toBe(false);
  });

  it('renders an accessible prompt without cursor controls or ANSI styles', async () => {
    const input = new MockReadable();
    const output = new MockWritable();
    output.isTTY = true;
    const result = text({
      message: 'Name',
      initialValue: 'Alice',
      input,
      output,
      accessible: true,
    });
    enter(input);
    expect(await result).toBe('Alice');
    expect(output.buffer.join('')).toContain('Name');
    expect(output.buffer.join('')).toContain('Alice');
    expect(output.buffer.join('')).not.toContain('\x1b');
  });

  it('completes a focused value with Tab and leaves ordinary autocomplete unchanged', async () => {
    const input = new MockReadable();
    const output = new MockWritable();
    const result = autocomplete({
      message: 'Choose',
      options: [{ value: 'hello-world' }],
      initialUserInput: 'hello',
      completeOnTab: true,
      input,
      output,
    });
    input.emit('keypress', '\t', { name: 'tab' });
    expect(output.buffer.join('')).toContain('Tab: complete');
    expect(output.buffer.join('')).toContain('hello-world');
    enter(input);
    expect(await result).toBe('hello-world');
  });

  it.each(['dumb', 'xterm-256color'])(
    'completes actual input bytes through a real filesystem with TERM=%s',
    async (terminal) => {
      vi.stubEnv('TERM', terminal);
      const directory = await mkdtemp(join(tmpdir(), 'kit-path-'));
      try {
        const expected = join(directory, 'project', 'nested');
        await mkdir(expected, { recursive: true });
        const value = await path({
          message: 'Directory',
          directory: true,
          root: directory + sep,
          input: Readable.from(['\t', sep, '\t', '\n']),
          output: new MockWritable(),
          accessible: true,
        });
        expect(value).toBe(expected);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  );

  it.each(['dumb', 'xterm-256color'])(
    'edits actual input bytes before submission with TERM=%s',
    async (terminal) => {
      vi.stubEnv('TERM', terminal);
      expect(
        await text({
          message: 'Name',
          input: Readable.from(['a', '\x7f', 'b', '\n']),
          output: new MockWritable(),
          accessible: true,
        })
      ).toBe('b');
    }
  );
});

describe('cursor bounds', () => {
  it('skips a long disabled run in one bounded traversal', () => {
    const options = Array.from({ length: 20_000 }, () => ({ disabled: true }));
    options.push({ disabled: false });
    expect(findCursor(0, 0, options)).toBe(20_000);
    expect(findCursor(0, -1, options)).toBe(20_000);
  });
  it('clamps empty and entirely disabled lists', () => {
    expect(findCursor(12, 1, [])).toBe(0);
    expect(findCursor(12, 1, [{ disabled: true }])).toBe(0);
  });
});

describe('accessible prompt safety', () => {
  it('removes cursor and clipboard controls from prompt metadata', async () => {
    const input = new MockReadable();
    const output = new MockWritable();
    const result = text({
      message: 'Name\r\b\x07\x1b]52;c;YQ==\x07',
      input,
      output,
      accessible: true,
    });
    enter(input);
    await result;
    expect(output.buffer.join('')).toContain('Name');
    expect(output.buffer.join('')).not.toMatch(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/);
  });
});


describe('typed choice construction', () => {
  it('accepts ordinary generic mapped options with an explicit label', () => {
    function choices<T>(items: readonly T[]): Option<T>[] {
      return items.map(value => ({ value, label: String(value) }));
    }
    function single<T>(items: readonly T[]): SelectOptions<T> {
      return { message: 'Choose', options: choices(items) };
    }
    function multiple<T>(items: readonly T[]): MultiSelectOptions<T> {
      return { message: 'Choose', options: choices(items) };
    }
    const values = ['one', 'two'] as const;
    expectTypeOf(single(values)).toEqualTypeOf<SelectOptions<'one' | 'two'>>();
    expectTypeOf(multiple(values)).toEqualTypeOf<MultiSelectOptions<'one' | 'two'>>();
    const object = { id: 'one' };
    expect(single([object]).options[0]?.value).toBe(object);
  });

  it('requires labels for object options even in a union with primitive values', () => {
    type Choice = 'automatic' | { id: string };
    const primitive: Option<Choice> = { value: 'automatic' };
    const object: Option<Choice> = { value: { id: 'one' }, label: 'One' };
    // @ts-expect-error object values require a visible label.
    const missing: Option<Choice> = { value: { id: 'one' } };
    expect(primitive.value).toBe('automatic');
    expect(object.label).toBe('One');
    expect(missing.label).toBeUndefined();
  });
});


describe('static table accessibility uses the shared output policy', () => {
  it.each(['call', 'settings', 'environment'] as const)('preserves table text and strips terminal controls through %s', (source) => {
    if (source === 'settings') updateSettings({ accessible: true });
    if (source === 'environment') vi.stubEnv('ACCESSIBLE', '1');
    const output = new MockWritable();
    table({
      data: [{ name: '界👩🏽‍💻', status: 'ready' }],
      columns: [{ key: 'name', header: 'Name' }, { key: 'status', header: 'Status' }],
      headerStyle: text => `\x1b[31m${text}\x1b[0m\x1b]52;c;clipboard\x07`,
      accessible: source === 'call' ? true : undefined,
      output,
    });
    const rendered = output.buffer.join('');
    expect(rendered).toContain('Name');
    expect(rendered).toContain('界👩🏽‍💻');
    expect(rendered).toContain('ready');
    expect(rendered).not.toContain('\x1b');
    expect(rendered).not.toContain('\x07');
    expect(rendered).not.toContain('clipboard');
  });

  it('honors an explicit false override for trusted header styles', () => {
    vi.stubEnv('ACCESSIBLE', '1');
    const output = new MockWritable();
    table({
      data: [{ value: 0 }],
      columns: [{ key: 'value', header: 'Value' }],
      headerStyle: text => `\x1b[31m${text}\x1b[0m`,
      accessible: false,
      output,
    });
    expect(output.buffer.join('')).toContain('\x1b[31m');
  });
});

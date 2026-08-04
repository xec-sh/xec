import { test, expect, describe, afterEach } from 'vitest';

import * as prompts from '../src/index.js';
import { updateSettings } from '../src/core/utils/index.js';
import { MockReadable, MockWritable } from './test-utils.js';
import { S_BAR, S_BAR_END, type CommonOptions } from '../src/utilities/common.js';

const MESSAGE = 'message';
const OPTIONS = [{ value: 'a' }, { value: 'b' }];

const factories = {
  text: (opts: CommonOptions) => prompts.text({ message: MESSAGE, ...opts }),
  password: (opts: CommonOptions) => prompts.password({ message: MESSAGE, ...opts }),
  confirm: (opts: CommonOptions) => prompts.confirm({ message: MESSAGE, ...opts }),
  multiline: (opts: CommonOptions) => prompts.multiline({ message: MESSAGE, ...opts }),
  date: (opts: CommonOptions) => prompts.date({ message: MESSAGE, ...opts }),
  select: (opts: CommonOptions) => prompts.select({ message: MESSAGE, options: OPTIONS, ...opts }),
  selectKey: (opts: CommonOptions) =>
    prompts.selectKey({ message: MESSAGE, options: OPTIONS, ...opts }),
  multiselect: (opts: CommonOptions) =>
    prompts.multiselect({ message: MESSAGE, options: OPTIONS, ...opts }),
  groupMultiselect: (opts: CommonOptions) =>
    prompts.groupMultiselect({ message: MESSAGE, options: { group: OPTIONS }, ...opts }),
  autocomplete: (opts: CommonOptions) =>
    prompts.autocomplete({ message: MESSAGE, options: OPTIONS, ...opts }),
  autocompleteMultiselect: (opts: CommonOptions) =>
    prompts.autocompleteMultiselect({ message: MESSAGE, options: OPTIONS, ...opts }),
} satisfies Record<string, (opts: CommonOptions) => Promise<unknown>>;

type PromptName = keyof typeof factories;

const promptNames = Object.keys(factories) as PromptName[];

/**
 * The guide, when present, is always the first line of the first frame:
 * a coloured bar character. Returns `'<sgr-code> <char>'` or `'none'`.
 */
function firstLineGuide(frame: string): string {
  const line = frame.split('\n')[0] ?? '';
   
  const match = /^\x1b\[(\d+)m(.)/.exec(line);

  if (match && (match[2] === S_BAR || match[2] === S_BAR_END)) {
    return `${match[1]} ${match[2]}`;
  }

  return 'none';
}

async function renderGuide(
  name: PromptName,
  opts: Omit<CommonOptions, 'input' | 'output'> = {}
): Promise<string> {
  const input = new MockReadable();
  const output = new MockWritable();
  const result = factories[name]({ input, output, ...opts });

  input.emit('keypress', 'escape', { name: 'escape' });
  await result;

  return firstLineGuide(output.buffer[1] ?? '');
}

describe('guide', () => {
  afterEach(() => {
    updateSettings({ withGuide: true });
  });

  test('every prompt renders the same guide', async () => {
    const guides: Record<string, string> = {};

    for (const name of promptNames) {
      guides[name] = await renderGuide(name);
    }

    expect(guides).toEqual(Object.fromEntries(promptNames.map((name) => [name, `90 ${S_BAR}`])));
  });

  test('no prompt renders a guide when withGuide is false', async () => {
    for (const name of promptNames) {
      expect(await renderGuide(name, { withGuide: false }), name).toBe('none');
    }
  });

  test('no prompt renders a guide when withGuide is globally false', async () => {
    updateSettings({ withGuide: false });

    for (const name of promptNames) {
      expect(await renderGuide(name), name).toBe('none');
    }
  });
});

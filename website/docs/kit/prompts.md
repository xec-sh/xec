---
title: Prompts
description: Text, selection, confirmation and date prompts with validation and cancellation
---

# Prompts

Every prompt returns a promise. Ctrl-C, Escape, and an aborted `signal` resolve with `CANCEL_SYMBOL`. Check with `isCancel` before using the value. Errors from rendering, callbacks, or streams reject the promise after terminal cleanup.

```typescript
import { text, isCancel } from '@xec-sh/kit';

const name = await text({ message: 'What is your name?' });
if (isCancel(name)) process.exit(0);
```

## text

Single-line input.

```typescript
import { text } from '@xec-sh/kit';

const name = await text({
  message: 'Project name?',
  placeholder: 'my-app',        // shown dimmed while empty
  initialValue: 'demo',         // pre-filled, editable
  defaultValue: 'fallback',     // used when submitted empty
});
```

Options: `message` (required), `placeholder`, `initialValue`, `defaultValue`, `validate`.

## multiline

Multi-line input. `Enter` inserts a newline; pressing `Enter` twice at the end of the input submits.

```typescript
import { multiline } from '@xec-sh/kit';

const description = await multiline({
  message: 'Describe the change',
  placeholder: 'What, and why',
});
```

With `showSubmit: true`, a `[ submit ]` button renders below the editor: `Tab` focuses it, `Enter` on the button submits, and `Enter` inside the editor always inserts a newline.

Options: everything `text` takes, plus `showSubmit` (default `false`).

## confirm

Yes/no toggle, arrow keys or `y`/`n`.

```typescript
import { confirm } from '@xec-sh/kit';

const ok = await confirm({ message: 'Continue?' });          // boolean
const del = await confirm({
  message: 'Delete everything?',
  active: 'Delete',      // label for true (default "Yes")
  inactive: 'Keep',      // label for false (default "No")
  initialValue: false,
});
```

## password

Masked input.

```typescript
import { password } from '@xec-sh/kit';

const secret = await password({ message: 'Enter token:', mask: '*' });
```

## select

Single choice from a list.

```typescript
import { select } from '@xec-sh/kit';

const color = await select({
  message: 'Pick a color',
  options: [
    { value: 'red', label: 'Red' },
    { value: 'blue', label: 'Blue', hint: 'recommended' },
    { value: 'green', label: 'Green', disabled: true },
  ],
});
```

Options accept readonly arrays and preserve literal value types. A string, number, or boolean can use its value as the label. Objects require an explicit `label`. Generic helpers can always supply `{ value, label }`. Disabled choices are excluded from submission and cursor movement. `maxItems` caps the visible window. `initialValue` pre-selects an enabled option. `showInstructions: false` hides the keyboard hint footer.

## multiselect

Multiple choice; `Space` toggles, `Enter` submits.

```typescript
import { multiselect } from '@xec-sh/kit';

const tools = await multiselect({
  message: 'Select tools',
  options: [{ value: 'git' }, { value: 'docker' }, { value: 'k8s' }],
  required: false,        // allow empty selection
  initialValues: ['git'],
});
```

## groupMultiselect

Multi-select with options under group headings; selecting a heading selects the group.

```typescript
import { groupMultiselect } from '@xec-sh/kit';

const features = await groupMultiselect({
  message: 'Enable features',
  options: {
    Frontend: [{ value: 'react' }, { value: 'vue' }],
    Backend: [{ value: 'express' }, { value: 'fastify' }],
  },
});
```

## autocomplete

Type-to-filter selection over a fixed option list.

```typescript
import { autocomplete } from '@xec-sh/kit';

const pkg = await autocomplete({
  message: 'Search packages',
  options: [{ value: 'react' }, { value: 'vue' }, { value: 'svelte' }],
  filter: (search, option) => option.value.includes(search),  // optional; label/hint/value by default
});
```

`autocompleteMultiselect` provides the same search with multiple selection. `autocomplete({ completeOnTab: true, ... })` copies the focused choice into the search field on Tab. The public `path` prompt enables completion by default. Zero, false, and empty-string choices remain valid option values.

## path

```typescript
import { path, isCancel } from '@xec-sh/kit';

const directory = await path({
  message: 'Select a directory',
  root: process.cwd(),
  directory: true,
});
if (!isCancel(directory)) console.log(directory);
```

Type a path to narrow the choices, use Tab to complete the focused entry, and Enter to submit.

## selectKey

Answer with a single keypress — the option's `value` is the key.

```typescript
import { selectKey } from '@xec-sh/kit';

const action = await selectKey({
  message: 'Action?',
  options: [
    { value: 'd', label: 'Deploy' },
    { value: 'r', label: 'Rollback' },
  ],
});
```

## date

Date picker; arrow keys move between day, month and year.

```typescript
import { date } from '@xec-sh/kit';

const when = await date({
  message: 'Pick a date',
  minDate: new Date(),
});
```

Options: `format`, `initialValue`, `defaultValue`, `minDate`, `maxDate`, `validate`. Month names and range messages localize through `updateSettings({ date: { ... } })`.

## group

Run several prompts in sequence and collect the answers into one object. Each entry receives the earlier `results`.

```typescript
import { group, text, select, cancel, isCancel } from '@xec-sh/kit';

const answers = await group(
  {
    name: () => text({ message: 'Name?' }),
    kind: () => select({ message: 'Kind?', options: [{ value: 'lib' }, { value: 'app' }] }),
    entry: ({ results }) => text({ message: `Entry point for ${results.name}?` }),
  },
  {
    onCancel: ({ results }) => {
      cancel(`Cancelled after ${Object.keys(results).length} answers`);
    },
  }
);
if (!isCancel(answers)) console.log(answers.name, answers.kind, answers.entry);
```

Cancellation stops the group before subsequent prompts. `onCancel` receives partial completed `results` and the exact cancellation symbol as `reason`. The group awaits an asynchronous callback, then returns `CANCEL_SYMBOL`. The caller owns any process termination.

## Validation

`text`, `multiline`, `password` and `date` take a `validate` option: either a function returning an error `string`/`Error` (or `undefined` to accept), or a [Standard Schema](https://standardschema.dev) validator such as Zod, Valibot, or ArkType.

```typescript
import { text } from '@xec-sh/kit';
import { z } from 'zod';

// A function
const age = await text({
  message: 'Enter your age:',
  validate(value) {
    if (!value) return 'Please enter a value';
    if (Number.isNaN(Number.parseInt(value, 10))) return 'Please enter a number';
    return undefined;
  },
});

// A schema — the first issue's message is shown
const name = await text({
  message: 'Enter your name (letters only)',
  validate: z.string().regex(/^[a-z]+$/i, 'Name can only contain letters'),
});
```

Validation runs on submission and accepts asynchronous callbacks and schemas. The prompt displays `settings.messages.validating` while awaiting a result. Cancellation remains available, and a late result cannot reopen a completed prompt.

```typescript
import { text } from '@xec-sh/kit';
import { stat } from 'node:fs/promises';

const file = await text({
  message: 'Existing file',
  async validate(value) {
    try {
      return (await stat(value)).isFile() ? undefined : 'Select a file';
    } catch {
      return 'File is unavailable';
    }
  },
});
```

## Cancellation

Every prompt resolves with the exported `CANCEL_SYMBOL` when the user cancels. `isCancel` is the type guard:

```typescript
import { text, isCancel } from '@xec-sh/kit';

const value = await text({ message: 'Name?' });
if (isCancel(value)) {
  // value has the exact type typeof CANCEL_SYMBOL
  process.exit(0);
}
// value is string here
```

Prompts accept an `AbortSignal` through `signal` and custom `input`/`output` streams. Terminal mode, cursor visibility, and owned listeners are restored on every completion path. A signal already aborted before invocation returns cancellation without taking terminal ownership.

## Accessible output

`accessible: true` renders append-only prompt updates. It removes terminal-control sequences and preserves ordinary text for terminal readers and transcripts. The same resolver is used by prompts, indicators, logs, and streams.

```typescript
import { text, isAccessible, updateSettings } from '@xec-sh/kit';

updateSettings({ accessible: true });
const name = await text({ message: 'Name?', accessible: isAccessible() });
```

The per-call option takes precedence over global settings, followed by the `ACCESSIBLE` environment variable. Explicit `false` disables that preference. Empty, `0`, and `false` environment values are treated as disabled. Interactive prompts still need input. Command-line applications should select an explicit non-interactive path for CI and pipes.

## Keyboard

Arrow keys navigate; `h`/`j`/`k`/`l` work everywhere as vim aliases, `Escape` cancels. Extra aliases register through `updateSettings({ aliases: { w: 'up' } })` — see [Colors & Theming](./theming.md#global-settings).

## See Also

- [Components](./components.md) - Spinners, progress, notes
- [Tables](./table.md) - Static and interactive tables
- [Colors & Theming](./theming.md) - Restyling every prompt at once

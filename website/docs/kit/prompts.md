---
title: Prompts
description: Text, selection, confirmation and date prompts with validation and cancellation
---

# Prompts

Every prompt returns a promise. On Ctrl-C or Escape it resolves with a cancel symbol instead of throwing — always check with `isCancel` before using the value.

```typescript
import { text, isCancel } from '@xec-sh/kit';

const name = await text({ message: 'What is your name?' });
if (isCancel(name)) process.exit(0);
```

## text

Single-line input.

```typescript
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
const secret = await password({ message: 'Enter token:', mask: '*' });
```

## select

Single choice from a list.

```typescript
const color = await select({
  message: 'Pick a color',
  options: [
    { value: 'red', label: 'Red' },
    { value: 'blue', label: 'Blue', hint: 'recommended' },
    { value: 'green', label: 'Green', disabled: true },
  ],
});
```

An option is `{ value, label?, hint?, disabled? }`; without `label` the value is shown. `maxItems` caps the visible window; longer lists scroll. `initialValue` pre-selects. `showInstructions: false` hides the keyboard hint footer.

## multiselect

Multiple choice; `Space` toggles, `Enter` submits.

```typescript
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
const pkg = await autocomplete({
  message: 'Search packages',
  options: [{ value: 'react' }, { value: 'vue' }, { value: 'svelte' }],
  filter: (search, option) => option.value.includes(search),  // optional; label/hint/value by default
});
```

`autocompleteMultiselect` is the same with multiple selection.

## selectKey

Answer with a single keypress — the option's `value` is the key.

```typescript
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
const when = await date({
  message: 'Pick a date',
  minDate: new Date(),
});
```

Options: `format`, `initialValue`, `defaultValue`, `minDate`, `maxDate`, `validate`. Month names and range messages localize through `updateSettings({ date: { ... } })`.

## group

Run several prompts in sequence and collect the answers into one object. Each entry receives the earlier `results`.

```typescript
import { group, text, select, cancel } from '@xec-sh/kit';

const answers = await group(
  {
    name: () => text({ message: 'Name?' }),
    kind: () => select({ message: 'Kind?', options: [{ value: 'lib' }, { value: 'app' }] }),
    entry: ({ results }) => text({ message: `Entry point for ${results.name}?` }),
  },
  {
    onCancel: () => {
      cancel('Cancelled.');
      process.exit(0);
    },
  }
);
// answers: { name: string, kind: 'lib' | 'app', entry: string }
```

## Validation

`text`, `multiline`, `password` and `date` take a `validate` option: either a function returning an error `string`/`Error` (or `undefined` to accept), or any synchronous [Standard Schema](https://standardschema.dev) validator — zod, valibot, arktype:

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

Async schemas are rejected with a `TypeError` — validation runs on submit, synchronously.

## Cancellation

Every prompt resolves with the exported `CANCEL_SYMBOL` when the user cancels. `isCancel` is the type guard:

```typescript
import { text, isCancel } from '@xec-sh/kit';

const value = await text({ message: 'Name?' });
if (isCancel(value)) {
  // value is symbol here; the prompt rendered its cancelled state already
  process.exit(0);
}
// value is string here
```

Prompts also accept an `AbortSignal` (`signal` option) for programmatic cancellation, and `input`/`output` streams for testing.

## Keyboard

Arrow keys navigate; `h`/`j`/`k`/`l` work everywhere as vim aliases, `Escape` cancels. Extra aliases register through `updateSettings({ aliases: { w: 'up' } })` — see [Colors & Theming](./theming.md#global-settings).

## See Also

- [Components](./components.md) - Spinners, progress, notes
- [Tables](./table.md) - Static and interactive tables
- [Colors & Theming](./theming.md) - Restyling every prompt at once

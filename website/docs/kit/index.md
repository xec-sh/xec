---
title: Kit Library
description: Terminal prompts, spinners, tables and colors for command-line applications
---

# Kit Library

`@xec-sh/kit` provides the terminal UI for Xec's CLI and works as a standalone library for prompts, spinners, progress bars, tables, and colors. It supports Node.js 20+ and Bun 1.2+, with one runtime dependency, `sisteransi`.

```bash
npm install @xec-sh/kit
```

The prompt core is adapted from [Clack](https://github.com/bombshell-dev/clack) (MIT).

## A Complete Prompt Flow

```typescript
import { intro, outro, text, select, confirm, isCancel } from '@xec-sh/kit';

async function configure() {
  intro('create-app');
  const name = await text({ message: 'Project name?' });
  if (isCancel(name)) return;

  const template = await select({
    message: 'Pick a template',
    options: [
      { value: 'ts', label: 'TypeScript' },
      { value: 'js', label: 'JavaScript' },
    ],
  });
  if (isCancel(template)) return;

  const approved = await confirm({ message: 'Use these settings?' });
  if (approved !== true) return;
  outro(`${name} uses ${template}`);
}

await configure();
```

## What Is Where

| Area | Exports | Page |
|------|---------|------|
| Input prompts | `text`, `multiline`, `confirm`, `password`, `select`, `multiselect`, `groupMultiselect`, `autocomplete`, `autocompleteMultiselect`, `selectKey`, `date`, `path`, `group`, `isCancel`, `CANCEL_SYMBOL` | [Prompts](./prompts.md) |
| Output components | `log`, `note`, `box`, `spinner`, `progress`, `tasks`, `taskLog`, `intro`, `outro`, `cancel`, `stream` | [Components](./components.md) |
| Tables | `table`, `interactiveTable`, `exportToCSV` and other exporters | [Tables](./table.md) |
| Colors and theme | `prism`, `settings`, `updateSettings`, `DEFAULT_THEME`, `isAccessible` | [Colors & Theming](./theming.md) |

## Design Rules

- **Every prompt is cancellable.** Ctrl-C, Escape, and an aborted signal return `CANCEL_SYMBOL`. `isCancel` narrows the result before use. A cancelled group stops its remaining prompts.
- **One theme, seven roles.** Components never hardcode colors — they draw from a theme (`accent`, `activity`, `success`, `warning`, `error`, `info`, `muted`) that one `updateSettings` call restyles. See [Colors & Theming](./theming.md).
- **Unicode with ASCII fallback.** Symbols, spinner frames and borders degrade automatically on terminals without Unicode support.
- **Accessible output is shared.** Per-call options, global settings, and `ACCESSIBLE` select append-only rendering for prompts and indicators.
- **Validation is pluggable.** Prompts accept a plain function or any [Standard Schema](https://standardschema.dev) validator with synchronous or asynchronous results. See [Prompts](./prompts.md#validation).

## Use in Xec Scripts

Xec scripts get the kit without installing it — it is available as the `kit` global and via `prism` for colors:

```typescript
// deploy.ts — run with: xec deploy.ts
const env = await kit.select({
  message: 'Deploy where?',
  options: [{ value: 'staging' }, { value: 'production' }],
});
```

## See Also

- [Prompts](./prompts.md)
- [Components](./components.md)
- [Tables](./table.md)
- [Colors & Theming](./theming.md)

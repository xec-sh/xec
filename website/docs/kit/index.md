---
title: Kit Library
description: Terminal prompts, spinners, tables and colors for command-line applications
---

# Kit Library

`@xec-sh/kit` provides the terminal UI for Xec's own CLI and works as a standalone library: prompts, spinners, progress bars, tables and a color builder. One runtime dependency (`sisteransi`). Node.js 18+ and Bun.

```bash
npm install @xec-sh/kit
```

The prompt core is adapted from [Clack](https://github.com/bombshell-dev/clack) (MIT).

## A Complete Prompt Flow

```typescript
import { intro, outro, text, select, confirm, isCancel, spinner } from '@xec-sh/kit';

intro('create-app');

const name = await text({ message: 'Project name?' });
if (isCancel(name)) process.exit(0);   // every prompt returns a cancel symbol on Ctrl-C

const template = await select({
  message: 'Pick a template',
  options: [
    { value: 'ts', label: 'TypeScript' },
    { value: 'js', label: 'JavaScript', hint: 'no build step' },
  ],
});

const ok = await confirm({ message: 'Continue?' });

const s = spinner();
s.start('Installing');
// ... work ...
s.stop('Installed');

outro('Done');
```

## What Is Where

| Area | Exports | Page |
|------|---------|------|
| Input prompts | `text`, `multiline`, `confirm`, `password`, `select`, `multiselect`, `groupMultiselect`, `autocomplete`, `autocompleteMultiselect`, `selectKey`, `date`, `group`, `isCancel` | [Prompts](./prompts.md) |
| Output components | `log`, `note`, `box`, `spinner`, `progress`, `tasks`, `taskLog`, `intro`, `outro`, `cancel`, `stream` | [Components](./components.md) |
| Tables | `table`, `interactiveTable`, `exportToCSV` and other exporters | [Tables](./table.md) |
| Colors and theme | `prism`, `settings`, `updateSettings`, `DEFAULT_THEME` | [Colors & Theming](./theming.md) |

## Design Rules

- **Every prompt is cancellable.** Ctrl-C (or Escape) resolves the promise with a cancel symbol instead of throwing; check it with `isCancel`.
- **One theme, seven roles.** Components never hardcode colors — they draw from a theme (`accent`, `activity`, `success`, `warning`, `error`, `info`, `muted`) that one `updateSettings` call restyles. See [Colors & Theming](./theming.md).
- **Unicode with ASCII fallback.** Symbols, spinner frames and borders degrade automatically on terminals without Unicode support.
- **Validation is pluggable.** Prompts accept a plain function or any [Standard Schema](https://standardschema.dev) validator (zod, valibot, arktype). See [Prompts](./prompts.md#validation).

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

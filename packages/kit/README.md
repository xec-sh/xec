# @xec-sh/kit

Terminal UI components for TypeScript command-line applications: prompts, tables, progress, streaming output, and colors.

```sh
npm install @xec-sh/kit
```

Requires Node.js 20 or later, or Bun 1.2 or later. Runtime checks also cover Deno. The package has one runtime dependency: `sisteransi`.

## Prompt with cancellation

```typescript
import { text, isCancel, log } from '@xec-sh/kit';

async function main() {
  const name = await text({
    message: 'Project name',
    validate: value => value?.trim() ? undefined : 'Enter a project name',
  });
  if (isCancel(name)) return;
  log.success(`Selected ${name}`);
}

await main();
```

Handle `isCancel` before using a prompt result. Prompt groups propagate cancellation; validation can be asynchronous or use Standard Schema. Input editing accounts for grapheme boundaries and terminal display width.

## Components

| Area | Exports |
| --- | --- |
| Input | `text`, `password`, `confirm`, `multiline`, `date`, `path` |
| Selection | `select`, `selectKey`, `multiselect`, `groupMultiselect`, `autocomplete`, `autocompleteMultiselect` |
| Tables | `table`, `interactiveTable`, CSV/TSV/JSON/HTML/Markdown/text export |
| Progress | `spinner`, `progress`, `taskLog`, `tasks` |
| Output | `log`, `note`, `box`, `stream`, `intro`, `outro`, `cancel` |
| Composition | `group`, `isCancel`, `settings`, `updateSettings`, `prism` |

Components share theme roles, output settings, and cancellation behavior. `NO_COLOR` disables color; `ACCESSIBLE=1` selects plain presentation. Explicit component settings take precedence over environment defaults. Use a selected output stream to keep machine-readable stdout clean; `spinner({ enabled: false })` creates no terminal output or timer.

## Explore

All [21 examples](examples/README.md) run with Bun from the repository without building Kit first:

```sh
pnpm install --frozen-lockfile
bun packages/kit/examples/01-text.ts
bun packages/kit/examples/20-full-app.ts
ACCESSIBLE=1 NO_COLOR=1 bun packages/kit/examples/20-full-app.ts
```

Examples cover validation, themes, interactive tables, streaming, and complete prompt flows. They do not deploy services or persist configuration.

[Documentation](https://xec.sh/docs/kit) · [Examples](examples/README.md) · [MIT license](../../LICENSE)

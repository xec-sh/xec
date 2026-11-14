# Kit examples

Small, runnable TypeScript programs using Kit's public exports. Each example is independent; the final application combines the prompts into a configuration preview.

From the Xec repository root, install the workspace dependencies once, then run any example with Bun:

```sh
pnpm install --frozen-lockfile
bun packages/kit/examples/01-text.ts
bun packages/kit/examples/20-full-app.ts
```

Bun 1.2 or later is required by the package. These workspace examples import `../src/index.js`, which Bun resolves to the public TypeScript entry point; a package build is unnecessary. An installed application should import from `@xec-sh/kit` instead. Example 01 also uses the workspace's Zod dependency to demonstrate Standard Schema validation.

The examples do not deploy, install packages, change access, or write files. Path selection reads directory entries; table edits and configuration choices stay in memory. Use synthetic values for password prompts. Illustrative errors in examples 11, 13, and 16 demonstrate presentation, not failed external operations.

| Example | What to explore |
| --- | --- |
| [01 · Text](./01-text.ts) | Placeholders, default values, awaited validation, Zod / Standard Schema |
| [02 · Confirm](./02-confirm.ts) | Horizontal and vertical choices, custom labels, cautious defaults |
| [03 · Password](./03-password.ts) | Masked input, validation, clearing rejected input; no secret output |
| [04 · Select](./04-select.ts) | Hints, disabled choices, initial selection, visible-item limits |
| [05 · Multiselect](./05-multiselect.ts) | Initial values, required and optional choices, disabled items |
| [06 · Select key](./06-select-key.ts) | Immediate single-key choices and case-sensitive shortcuts |
| [07 · Date](./07-date.ts) | UTC calendar dates, three formats, bounds, weekday validation |
| [08 · Autocomplete](./08-autocomplete.ts) | Search, custom filters, optional multiple selection |
| [09 · Group multiselect](./09-group-multiselect.ts) | Group toggles, individual choices, visual spacing |
| [10 · Path](./10-path.ts) | Real filesystem completion, directory selection, async file validation |
| [11 · Spinner](./11-spinner.ts) | Built-in styles, elapsed time, changing messages, stop/cancel/error/clear, silent mode |
| [12 · Progress](./12-progress.ts) | Three styles, bounded progress, messages, cancellation and reuse |
| [13 · Logs and messages](./13-log-and-messages.ts) | Log levels, stderr routing, plain output, notes and boxes |
| [14 · Static tables](./14-table.ts) | Formatting, footers, wrapping, responsive columns, six export formats |
| [15 · Interactive tables](./15-interactive-table.ts) | Sorting, filtering, editing with validation, selection, cancellation-aware incremental loading |
| [16 · Task logs](./16-task-log.ts) | Grouped output, raw fragments, retained failure details, sequential `tasks` with disabled work |
| [17 · Streaming](./17-stream.ts) | Fragmented Unicode, output destination, plain mode, shared cancellation signal and producer cleanup |
| [18 · Prism](./18-prism-colors.ts) | Styles, RGB/HSL/hex/256 colours, colour blending, contrast and display width |
| [19 · Settings](./19-settings.ts) | Theme roles, key aliases, messages, date localisation, guides and accessible output |
| [20 · Complete flow](./20-full-app.ts) | Conditional prompt groups, cancellation, progress and a secret-free configuration summary |
| [21 · Multiline](./21-multiline.ts) | Multiple lines, double-Enter submission and an explicit submit button |

Use the instructions displayed by each prompt. Arrow keys navigate, Enter submits, and Ctrl+C cancels the active prompt. Multiselect uses Space to toggle; autocomplete uses Tab while typing and also Space after switching to navigation. In an interactive table, use the displayed sort/filter/edit controls. Multiline uses double Enter at the end, or Tab followed by Enter when its submit button is enabled.

For a screen-reader-friendly transcript or a terminal without cursor controls:

```sh
ACCESSIBLE=1 NO_COLOR=1 bun packages/kit/examples/20-full-app.ts
ACCESSIBLE=1 NO_COLOR=1 bun packages/kit/examples/17-stream.ts
```

`NO_COLOR` removes colour; `ACCESSIBLE=1` also selects the plain prompt presentation. Logging and streaming accept per-call `accessible`, `output`, `withGuide`, and `spacing` options. Pass the same `AbortSignal` to a stream and its I/O-producing source so cancellation can interrupt a pending read.

Prompt cancellation is handled with `isCancel` and returns normally after cleanup. Unexpected errors remain rejected and produce a nonzero process exit. The native smoke suite runs every example through Bun with bounded output and execution time, including EOF cancellation of prompts:

```sh
pnpm --filter @xec-sh/kit typecheck
pnpm --filter @xec-sh/kit exec vitest run test/examples-native.test.ts
```

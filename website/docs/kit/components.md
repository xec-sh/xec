---
title: Components
description: Log output, notes, boxes, spinners, progress bars and task runners
---

# Components {#components}

Output components share the prompt aesthetic: a guide bar on the left, themed symbols, Unicode with ASCII fallback.

## log {#log}

Leveled one-line output.

```typescript
import { log } from '@xec-sh/kit';

log.info('Processing...');
log.success('Complete');
log.warn('Caution');
log.error('Failed');
log.step('Step 1');
log.message('Plain line');
```

Each level draws its symbol from the theme (`info`, `success`, `warning`, `error` roles).

## intro / outro / cancel {#intro--outro--cancel}

Open and close a prompt flow:

```typescript
import { intro, outro, cancel } from '@xec-sh/kit';

intro('create-app');       // title at the top of the flow
// ... prompts ...
outro('Done');             // closing line
// or, on cancellation:
cancel('Operation cancelled.');
```

## note / box {#note--box}

Bordered message blocks. Both take `(message, title?, opts?)`:

```typescript
import { note, box } from '@xec-sh/kit';

note('Remember to commit', 'Reminder');   // rounded, fits content
box('Boxed content', 'Title');            // full-width box
```

## spinner {#spinner}

```typescript
import { spinner } from '@xec-sh/kit';

const s = spinner();
s.start('Loading...');
// ... work ...
s.stop('Done');
```

The result object: `start(msg)`, `stop(msg)`, `error(msg)`, `cancel(msg)`, `message(msg)` to update the text mid-run, `clear()`, and `isCancelled`.

Options:

```typescript
import { spinner } from '@xec-sh/kit';

const controller = new AbortController();
spinner({
  signal: controller.signal,
  enabled: !process.argv.includes('--json'),
  output: process.stderr,
  style: 'circle',        // braille (default) | circle | dots | line | arrow | binary | moon
  indicator: 'timer',     // 'dots' (default) animates dots; 'timer' shows elapsed time
  cancelMessage: 'Stopped',
  errorMessage: 'Failed',
  onCancel: () => controller.abort(),
});
```

`enabled: false` disables rendering, timers, input and process listeners while preserving the indicator methods. Use it for quiet and machine-output commands.

Custom animations pass `frames: string[]` and `delay: number` directly. Pipe and CI output uses append-only progress with a periodic heartbeat. `accessible: true` also selects plain append-only text for a terminal. Pass `input`, `output` and `signal` to connect the indicator to its owning operation. `stop` reports success, `error` reports failure, and `cancel` reports cancellation. Each completion restores the terminal and removes its listeners.

## progress {#progress}

A progress bar with the spinner's lifecycle plus `advance`:

```typescript
import { progress } from '@xec-sh/kit';

const bar = progress({ max: 100, size: 40, style: 'heavy' });  // light | heavy | block
bar.start('Downloading');
bar.advance(30);                  // +30 of max
bar.advance(20, 'Still going');   // step and new message
bar.stop('Downloaded');
```

## tasks {#tasks}

Run a list of functions, each behind its own spinner:

```typescript
import { tasks } from '@xec-sh/kit';

await tasks([
  {
    title: 'Installing dependencies',
    task: async (message) => {
      // message('...') updates the spinner line
      await $`pnpm install --frozen-lockfile`.quiet();
      return 'Installed';          // becomes the completion message
    },
  },
  {
    title: 'Optional verification',
    enabled: false,
    task: async () => { await $`pnpm typecheck`.quiet(); },
  },
]);
```

## taskLog {#tasklog}

A live log block under a title that collapses when the task finishes — output shown while it runs, summary kept when it is done:

```typescript
import { taskLog } from '@xec-sh/kit';

const t = taskLog({ title: 'Running tests', limit: 10 });  // show last 10 lines
t.message('test one passed');
t.message('test two passed');
t.success('Tests passed');       // collapses the log; pass { showLog: true } to keep it
// t.error('Tests failed');      // failure keeps the log visible by default
```

In CI, a pipe, or accessible mode, each message is emitted immediately and completion adds its result once. `limit` bounds the live terminal viewport. `retainLog` retains older viewport lines for the final terminal report.

```typescript
import { taskLog } from '@xec-sh/kit';

const task = taskLog({ title: 'Build', output: process.stderr });
const compile = task.group('TypeScript');
compile.message('Compil', { raw: true });
compile.message('ed 12 modules\n', { raw: true });
compile.success('Types checked');
task.success('Build complete');
```

Raw fragments are joined within their group. Terminal commands in titles and data are removed while display styling is retained. Accessible output strips styling as well.

## stream {#stream}

Write an async iterable to the terminal as prompt-styled output — useful for piping process output through the kit's look:

```typescript
import { stream } from '@xec-sh/kit';

async function* lines() {
  yield 'Build started\n';
  yield 'Build finished\n';
}

await stream.info(lines(), { output: process.stderr, withGuide: false, spacing: 0 });
```

`stream.message`, `info`, `success`, `step`, `warn`/`warning` and `error` accept the same output, guide, spacing and accessibility options as `log`. Each chunk is text, so include newline characters where a new line is intended. Output also wraps to the destination's width while preserving Unicode graphemes and styling split across chunks.

The returned promise waits for destination writes and rejects source or destination errors. An early exit closes the source iterator. Cancellation is checked between input chunks, so pass the same `AbortSignal` to producers that can wait on I/O. Control-string payloads are discarded incrementally using bounded memory.

## See Also {#see-also}

- [Prompts](./prompts.md)
- [Tables](./table.md)
- [Colors & Theming](./theming.md)

---
title: Components
description: Log output, notes, boxes, spinners, progress bars and task runners
---

# Components

Output components share the prompt aesthetic: a guide bar on the left, themed symbols, Unicode with ASCII fallback.

## log

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

## intro / outro / cancel

Open and close a prompt flow:

```typescript
import { intro, outro, cancel } from '@xec-sh/kit';

intro('create-app');       // title at the top of the flow
// ... prompts ...
outro('Done');             // closing line
// or, on cancellation:
cancel('Operation cancelled.');
```

## note / box

Bordered message blocks. Both take `(message, title?, opts?)`:

```typescript
import { note, box } from '@xec-sh/kit';

note('Remember to commit', 'Reminder');   // rounded, fits content
box('Boxed content', 'Title');            // full-width box
```

## spinner

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
spinner({
  style: 'circle',        // braille (default) | circle | dots | line | arrow | binary | moon
  indicator: 'timer',     // 'dots' (default) animates dots; 'timer' shows elapsed time
  cancelMessage: 'Stopped',
  errorMessage: 'Failed',
  onCancel: () => process.exit(1),
});
```

Custom animations pass `frames: string[]` and `delay: number` directly.

## progress

A progress bar with the spinner's lifecycle plus `advance`:

```typescript
import { progress } from '@xec-sh/kit';

const bar = progress({ max: 100, size: 40, style: 'heavy' });  // light | heavy | block
bar.start('Downloading');
bar.advance(30);                  // +30 of max
bar.advance(20, 'Still going');   // step and new message
bar.stop('Downloaded');
```

## tasks

Run a list of functions, each behind its own spinner:

```typescript
import { tasks } from '@xec-sh/kit';

await tasks([
  {
    title: 'Installing dependencies',
    task: async (message) => {
      // message('...') updates the spinner line
      await install();
      return 'Installed';          // becomes the completion message
    },
  },
  {
    title: 'Skipped step',
    enabled: false,
  },
]);
```

## taskLog

A live log block under a title that collapses when the task finishes — output shown while it runs, summary kept when it is done:

```typescript
import { taskLog } from '@xec-sh/kit';

const t = taskLog({ title: 'Running tests', limit: 10 });  // show last 10 lines
t.message('test one passed');
t.message('test two passed');
t.success('Tests passed');       // collapses the log; pass { showLog: true } to keep it
// t.error('Tests failed');      // failure keeps the log visible by default
```

## stream

Write an async iterable to the terminal as prompt-styled output — useful for piping process output through the kit's look:

```typescript
import { stream } from '@xec-sh/kit';

await stream.info(streamOfLines);      // also: stream.message / step / warn / error / success
```

## See Also

- [Prompts](./prompts.md)
- [Tables](./table.md)
- [Colors & Theming](./theming.md)

# @xec-sh/kit

TUI components for building interactive command-line applications.

## Install

```bash
pnpm add @xec-sh/kit
```

## Quick Start

```typescript
import { text, select, confirm, spinner, log, table } from '@xec-sh/kit';

// Text input
const name = await text({ message: 'What is your name?' });

// Select with options
const color = await select({
  message: 'Pick a color',
  options: [
    { value: 'red', label: 'Red' },
    { value: 'blue', label: 'Blue', hint: 'recommended' },
    { value: 'green', label: 'Green', disabled: true },
  ],
});

// Confirmation
const ok = await confirm({ message: 'Continue?' });

// Spinner
const s = spinner();
s.start('Loading...');
await doWork();
s.stop('Done!');
```

```typescript
import { multiselect, password, autocomplete, selectKey, groupMultiselect, date } from '@xec-sh/kit';

// Multi-select
const tools = await multiselect({
  message: 'Select tools',
  options: [{ value: 'git' }, { value: 'docker' }, { value: 'k8s' }],
});

// Password input
const secret = await password({ message: 'Enter token:' });

// Autocomplete with async search
const pkg = await autocomplete({
  message: 'Search packages',
  source: async (input) => searchNpm(input),
});

// Date picker
const when = await date({ message: 'Pick a date' });

// Key-based select
const action = await selectKey({
  message: 'Action?',
  options: [
    { key: 'd', label: 'Deploy' },
    { key: 'r', label: 'Rollback' },
  ],
});

// Grouped multi-select
const features = await groupMultiselect({
  message: 'Enable features',
  options: {
    Frontend: [{ value: 'react' }, { value: 'vue' }],
    Backend: [{ value: 'express' }, { value: 'fastify' }],
  },
});
```

```typescript
import { note, box, progress, table, interactiveTable, log, isCancel } from '@xec-sh/kit';
import { prism } from '@xec-sh/kit';

// Logging
log.info('Processing...');
log.success('Complete!');
log.warn('Caution');
log.error('Failed');
log.step('Step 1');

// Note and box
note('Remember to commit', 'Reminder');
box('Boxed content');

// Static table
table({ columns: ['Name', 'Status'], rows: [['api', 'running'], ['web', 'stopped']] });

// Interactive table with sort, filter, and selection
await interactiveTable({ columns: [...], rows: [...], selectionMode: 'multi' });

// Progress bar
const bar = progress({ total: 100 });
bar.update(50);

// Prism color system (16/256/truecolor)
const styled = prism.hex('#ff0000').bold('Error!');
const rgb = prism.rgb(0, 255, 0)('Green text');
const hsl = prism.hsl(200, 100, 50)('Blue text');

// Cancel detection
const input = await text({ message: 'Name?' });
if (isCancel(input)) process.exit(0);
```

## API

| Export | Description |
|--------|-------------|
| `text` | Text input prompt |
| `select` | Single-select prompt |
| `multiselect` | Multi-select prompt |
| `confirm` | Yes/no confirmation |
| `password` | Masked password input |
| `date` | Date picker prompt |
| `autocomplete` | Autocomplete search prompt |
| `selectKey` | Key-based selection |
| `groupMultiselect` | Grouped multi-select |
| `spinner` | Animated spinner (5 styles, cancel/error/clear/styleFrame) |
| `progress` | Progress bar component |
| `note` | Styled note box |
| `box` | Box drawing component |
| `table` / `interactiveTable` | Static and interactive tables (sort/filter/selection) |
| `log` | Logging (info/success/warn/error/step) |
| `stream` | Stream output utilities |
| `prism` | Color system (16/256/truecolor, hex/rgb/hsl/css) |
| `isCancel` | Check if prompt was cancelled |
| `block` / `settings` / `updateSettings` | Core prompt primitives |

## Features

- Prompts: text, select, multiselect, confirm, password, date, autocomplete, selectKey, groupMultiselect
- `withGuide` option and `computeLabel` for multiline labels on prompts
- Disabled options support across all select prompts
- Spinner with 5 animation styles and cancel/error/clear/styleFrame methods
- Progress bar with customizable format
- Note and box display components
- Static table and interactive table with sort, filter, row selection, and cell editing
- Table export to CSV, TSV, JSON, HTML, Markdown, and text
- Log utilities: info, success, warn, error, step
- Stream output handling
- Path autocomplete utility
- Prism color system supporting 16-color, 256-color, and truecolor terminals
- Prism supports hex, rgb, hsl, and CSS named colors

## License

MIT

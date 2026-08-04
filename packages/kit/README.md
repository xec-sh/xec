# @xec-sh/kit

Terminal prompts, spinners, tables and colors for command-line applications.
One runtime dependency (`sisteransi`). Node.js 18+ and Bun.

```bash
npm install @xec-sh/kit
```

## Prompts

```typescript
import { text, select, confirm, password, isCancel } from '@xec-sh/kit';

const name = await text({ message: 'What is your name?' });
if (isCancel(name)) process.exit(0);   // every prompt returns a cancel symbol on Ctrl-C

const color = await select({
  message: 'Pick a color',
  options: [
    { value: 'red', label: 'Red' },
    { value: 'blue', label: 'Blue', hint: 'recommended' },
    { value: 'green', label: 'Green', disabled: true },
  ],
});

const ok = await confirm({ message: 'Continue?' });
const secret = await password({ message: 'Enter token:' });
```

```typescript
import { multiline } from '@xec-sh/kit';

// Enter inserts a newline; Enter twice at the end submits.
const description = await multiline({
  message: 'Describe the change',
  placeholder: 'What, and why',
});
```

```typescript
import { multiselect, autocomplete, selectKey, groupMultiselect, date } from '@xec-sh/kit';

const tools = await multiselect({
  message: 'Select tools',
  options: [{ value: 'git' }, { value: 'docker' }, { value: 'k8s' }],
});

// Autocomplete filters a fixed option list as the user types
const pkg = await autocomplete({
  message: 'Search packages',
  options: [{ value: 'react' }, { value: 'vue' }, { value: 'svelte' }],
  filter: (search, option) => option.value.includes(search),   // optional; label/hint/value by default
});

const when = await date({ message: 'Pick a date' });

// Answer with a single keypress: the value is the key
const action = await selectKey({
  message: 'Action?',
  options: [
    { value: 'd', label: 'Deploy' },
    { value: 'r', label: 'Rollback' },
  ],
});

const features = await groupMultiselect({
  message: 'Enable features',
  options: {
    Frontend: [{ value: 'react' }, { value: 'vue' }],
    Backend: [{ value: 'express' }, { value: 'fastify' }],
  },
});
```

## Output

```typescript
import { log, note, box, spinner, progress, table, interactiveTable, prism } from '@xec-sh/kit';

log.info('Processing...');
log.success('Complete');
log.warn('Caution');
log.error('Failed');
log.step('Step 1');

note('Remember to commit', 'Reminder');
box('Boxed content');

const s = spinner();
s.start('Loading...');
await doWork();
s.stop('Done');

const bar = progress({ max: 100 });
bar.start('Downloading');
bar.advance(30);
bar.stop('Downloaded');

// Tables take row objects plus column definitions
table({
  data: [
    { name: 'api', status: 'running' },
    { name: 'web', status: 'stopped' },
  ],
  columns: [
    { key: 'name', header: 'Name' },
    { key: 'status', header: 'Status' },
  ],
});

// Interactive: navigation, sorting, row selection
const picked = await interactiveTable({
  data: rows,
  columns,
  selectable: 'multiple',   // 'none' | 'single' | 'multiple'
  sortable: true,
});

// Colors: 16/256/truecolor with automatic terminal detection
const styled = prism.hex('#ff0000').bold('Error!');
const green  = prism.rgb(0, 255, 0)('Green text');
const blue   = prism.hsl(200, 100, 50)('Blue text');
```

## Exports

| Export | Description |
|--------|-------------|
| `text` / `confirm` / `password` | Basic input prompts |
| `select` / `multiselect` / `groupMultiselect` | List selection; options support `label`, `hint`, `disabled` |
| `autocomplete` / `autocompleteMultiselect` | Type-to-filter selection over an option list |
| `selectKey` | Single-keypress selection |
| `date` | Date picker |
| `spinner` | Spinner with styles: braille, circle, dots, line, arrow, binary, moon |
| `progress` | Progress bar (`max`, `advance(step)`, spinner-style start/stop) |
| `note` / `box` | Bordered message blocks |
| `table` / `interactiveTable` | Static render and interactive navigation/sort/selection |
| `exportToCSV` / `exportToTSV` / `exportToJSON` / `exportToHTML` / `exportToMarkdown` / `exportToText` | Table data export |
| `log` | Leveled output: info, success, warn, error, step |
| `taskLog` / `tasks` / `group` / `intro` / `outro` / `cancel` | Flow helpers for multi-step CLIs |
| `prism` | Color builder: hex/rgb/hsl/css names, 16/256/truecolor |
| `isCancel` | Detect Ctrl-C cancellation of any prompt |
| `stream` | Streamed output helpers |
| `settings` / `updateSettings` | Global prompt appearance settings (e.g. `withGuide`) |

## License

MIT

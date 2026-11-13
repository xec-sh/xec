/**
 * 15 - Interactive Table
 *
 * Full-featured interactive table with keyboard navigation,
 * sorting, filtering, single/multi selection, and cell editing.
 */
import { setTimeout } from 'node:timers/promises';

import { log, isCancel, interactiveTable } from '../src/index.js';

interface Task {
  id: number;
  title: string;
  priority: string;
  status: string;
  assignee: string;
}

const tasks: Task[] = [
  { id: 1, title: 'Fix login bug', priority: 'High', status: 'In Progress', assignee: 'Alice' },
  { id: 2, title: 'Add dark mode', priority: 'Medium', status: 'Todo', assignee: 'Bob' },
  { id: 3, title: 'Write API docs', priority: 'Low', status: 'Done', assignee: 'Charlie' },
  { id: 4, title: 'Optimize queries', priority: 'High', status: 'In Progress', assignee: 'Diana' },
  { id: 5, title: 'Setup CI/CD', priority: 'Medium', status: 'Todo', assignee: 'Eve' },
  { id: 6, title: 'Update deps', priority: 'Low', status: 'Todo', assignee: 'Alice' },
  { id: 7, title: 'Add tests', priority: 'High', status: 'In Progress', assignee: 'Bob' },
  { id: 8, title: 'Code review', priority: 'Medium', status: 'Done', assignee: 'Charlie' },
];

async function main() {
  const edits: string[] = [];
  log.info('Edits affect only the in-memory demo rows; nothing is persisted.');
  console.log('\n--- Navigation + Sorting + Filtering + Editing ---');
  const result = await interactiveTable<Task>({
    data: tasks,
    columns: [
      { key: 'id', header: 'ID', width: 4, sortable: true },
      { key: 'title', header: 'Task', width: 20, sortable: true },
      { key: 'priority', header: 'Priority', width: 10, sortable: true },
      { key: 'status', header: 'Status', width: 14, sortable: true },
      { key: 'assignee', header: 'Assignee', width: 10, sortable: true },
    ],
    selectable: 'multiple',
    sortable: true,
    initialSort: { key: 'id', direction: 'asc' },
    filterable: true,
    filterColumns: ['title', 'assignee'],
    editable: true,
    editableColumns: ['title', 'priority', 'status', 'assignee'],
    validateEdit: (_task, column, newValue) => {
      if (column === 'priority' && !['High', 'Medium', 'Low'].includes(String(newValue))) {
        return 'Priority must be High, Medium or Low';
      }
      return undefined;
    },
    onEdit: (task, column, oldValue, newValue) => {
      // Defer log output until the interactive renderer has finished.
      edits.push(`#${task.id} ${column}: ${String(oldValue)} → ${String(newValue)}`);
    },
    message: 'Task Board',
  });

  if (isCancel(result)) {
    log.warn('Selection cancelled');
    return;
  } else {
    const selected = result;
    if (selected.length > 0) {
      log.success(`Selected ${selected.length} task(s):`);
      for (const task of selected) {
        log.step(`  #${task.id} ${task.title} [${task.priority}]`);
      }
    } else {
      log.info('No tasks selected');
    }
  }

  for (const edit of edits) log.step(edit);

  // Incremental loading: rows are fetched as navigation nears the end.
  console.log('\n--- Incremental loading (loadMore) ---');
  let nextId = tasks.length + 1;
  const page = await interactiveTable<Task>({
    data: tasks.slice(0, 3),
    columns: [
      { key: 'id', header: 'ID', width: 4 },
      { key: 'title', header: 'Task', width: 24 },
      { key: 'assignee', header: 'Assignee', width: 10 },
    ],
    selectable: 'single',
    pageSize: 3,
    hasMore: true,
    loadMore: async (signal) => {
      // Simulate a paginated API: two more pages, then done
      await setTimeout(150, undefined, { signal });
      if (nextId > 14) return [];
      const batch = Array.from({ length: 3 }, (_, i) => ({
        id: nextId + i,
        title: `Generated task ${nextId + i}`,
        priority: 'Low',
        status: 'Todo',
        assignee: 'Bot',
      }));
      nextId += batch.length;
      return batch;
    },
    message: 'Scroll down — more rows load as you approach the end',
  });

  if (isCancel(page)) {
    log.warn('Cancelled');
  } else {
    log.info(`Picked ${page.length} row(s)`);
  }
}

await main();

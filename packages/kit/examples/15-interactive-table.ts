/**
 * 15 - Interactive Table
 *
 * Full-featured interactive table with keyboard navigation,
 * sorting, filtering, single/multi selection, and cell editing.
 */
import { interactiveTable, isCancel, log } from '../src/index.js';

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
  console.log('\n--- Navigation + Sorting + Filtering ---');
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
    filterable: true,
    message: 'Task Board - Use arrows to navigate, Space to select, / to filter, s to sort',
  });

  if (isCancel(result)) {
    log.warn('Selection cancelled');
  } else {
    const selected = result as Task[];
    if (selected.length > 0) {
      log.success(`Selected ${selected.length} task(s):`);
      for (const task of selected) {
        log.step(`  #${task.id} ${task.title} [${task.priority}]`);
      }
    } else {
      log.info('No tasks selected');
    }
  }
}

main().catch(console.error);

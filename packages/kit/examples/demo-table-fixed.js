#!/usr/bin/env tsx
import { TablePrompt } from '../src/components/advanced/table.js';
const tasks = [
    { id: 1, title: 'Setup development environment', status: 'completed', assignee: 'Alice', priority: 'high', created: new Date('2024-01-01') },
    { id: 2, title: 'Implement user authentication', status: 'in-progress', assignee: 'Bob', priority: 'high', created: new Date('2024-01-02') },
    { id: 3, title: 'Design database schema', status: 'completed', assignee: 'Charlie', priority: 'medium', created: new Date('2024-01-03') },
    { id: 4, title: 'Write API documentation', status: 'pending', assignee: 'Diana', priority: 'low', created: new Date('2024-01-04') },
    { id: 5, title: 'Add unit tests', status: 'in-progress', assignee: 'Eve', priority: 'medium', created: new Date('2024-01-05') },
    { id: 6, title: 'Deploy to staging', status: 'pending', assignee: 'Frank', priority: 'high', created: new Date('2024-01-06') },
];
function formatStatus(status) {
    const statusIcons = {
        'pending': '⏳',
        'in-progress': '🔄',
        'completed': '✅'
    };
    return `${statusIcons[status]} ${status}`;
}
function formatPriority(priority) {
    const priorityIcons = {
        'low': '🟢',
        'medium': '🟡',
        'high': '🔴'
    };
    return `${priorityIcons[priority]} ${priority}`;
}
const prompt = new TablePrompt({
    message: '📋 Task Management Dashboard',
    data: tasks,
    columns: [
        { key: 'id', label: 'ID', width: 5, align: 'center' },
        { key: 'title', label: 'Title', width: 30 },
        {
            key: 'status',
            label: 'Status',
            width: 15,
            format: (value) => formatStatus(value)
        },
        { key: 'assignee', label: 'Assignee', width: 12 },
        {
            key: 'priority',
            label: 'Priority',
            width: 12,
            format: (value) => formatPriority(value)
        },
        {
            key: 'created',
            label: 'Created',
            width: 12,
            format: (value) => value.toLocaleDateString()
        }
    ],
    selectable: 'single',
    interactive: true,
    search: true,
    sort: true,
    pageSize: 5,
});
console.log('='.repeat(120));
console.log('FIXED TABLE RENDERING - Column alignment is now correct:');
console.log('='.repeat(120));
console.log();
console.log(prompt.render());
console.log();
console.log('='.repeat(120));
console.log('Notes:');
console.log('- All columns are properly aligned with consistent separators');
console.log('- Emojis are correctly calculated as 2-character width');
console.log('- CJK characters are properly handled');
console.log('- Long text is truncated with ellipsis (…)');
console.log('- Column headers support center/left/right alignment');
console.log('='.repeat(120));
//# sourceMappingURL=demo-table-fixed.js.map
/**
 * 14 - Static Table
 *
 * Render tabular data with column formatting, alignment, compact mode,
 * row numbers, footers, word wrap, capped height and border styles.
 */
import {
  table,
  prism,
  exportToCSV,
  exportToTSV,
  exportToJSON,
  exportToHTML,
  exportToText,
  exportToMarkdown,
  type TableColumn,
} from '../src/index.js';

const employees = [
  { id: 1, name: 'Alice Johnson', role: 'Senior Engineer', salary: 145000, active: true },
  { id: 2, name: 'Bob Smith', role: 'Designer', salary: 98000, active: true },
  { id: 3, name: 'Charlie Brown', role: 'Manager', salary: 125000, active: false },
  { id: 4, name: 'Diana Prince', role: 'DevOps Engineer', salary: 135000, active: true },
  { id: 5, name: '林 美咲', role: 'Junior Developer', salary: 72000, active: true },
];

console.log('\n--- Basic Table ---');
table({
  data: employees,
  columns: [
    { key: 'id', header: 'ID', width: 4 },
    { key: 'name', header: 'Name', width: 18 },
    { key: 'role', header: 'Role', width: 18 },
    { key: 'salary', header: 'Salary', width: 10, align: 'right' },
  ],
});

console.log('\n--- Formatted Table ---');
table({
  data: employees,
  columns: [
    { key: 'id', header: '#', width: 3 },
    { key: 'name', header: 'Employee', width: 20 },
    {
      key: 'salary',
      header: 'Salary',
      width: 12,
      align: 'right',
      format: (val: number) => `$${val.toLocaleString()}`,
    },
    {
      key: 'active',
      header: 'Status',
      width: 10,
      format: (val: boolean) => (val ? prism.green('Active') : prism.red('Inactive')),
    },
  ],
});

console.log('\n--- Compact Table ---');
table({
  data: employees.slice(0, 3),
  columns: [
    { key: 'name', header: 'Name' },
    { key: 'role', header: 'Role' },
  ],
  compact: true,
});

console.log('\n--- Row Numbers + Footer ---');
table({
  data: employees,
  columns: [
    { key: 'name', header: 'Name', width: 18 },
    {
      key: 'salary',
      header: 'Salary',
      width: 12,
      align: 'right',
      format: (val: number) => `$${val.toLocaleString()}`,
    },
  ],
  showRowNumbers: true,
  footer: {
    columns: {
      salary: (data) => `$${data.reduce((sum, e) => sum + e.salary, 0).toLocaleString()}`,
    },
    text: (data) => `${data.length} employees`,
  },
});

console.log('\n--- Word Wrap (multi-line cells) ---');
table({
  data: [
    {
      name: 'Alice Johnson',
      bio: 'Leads the platform team and owns the deployment pipeline end to end',
    },
    { name: 'Bob Smith', bio: 'Designs the component library' },
  ],
  columns: [
    { key: 'name', header: 'Name', width: 14 },
    { key: 'bio', header: 'Bio', width: 28 },
  ],
  wordWrap: 'wrap',
});

console.log('\n--- Capped Height (maxHeight) ---');
table({
  data: employees,
  columns: [
    { key: 'name', header: 'Name', width: 18 },
    { key: 'role', header: 'Role', width: 18 },
  ],
  maxHeight: 4,
});

// One typed column definition also drives portable export formats.
// All exports are strings; this example never writes a file.
const columns: TableColumn<(typeof employees)[number]>[] = [
  { key: 'id', header: 'ID', priority: 1 },
  { key: 'name', header: 'Name', priority: 1 },
  { key: 'role', header: 'Role', priority: 2 },
];
console.log('\n--- Responsive Table ---');
table({ data: employees, columns, width: 'full', borders: 'rounded' });
console.log('\n--- Markdown Export ---');
console.log(exportToMarkdown(employees, columns));
console.log('\n--- CSV Export ---');
console.log(exportToCSV(employees, columns, { escapeFormulas: true }));
console.log('\n--- Other In-Memory Exports ---');
for (const [format, content] of [
  ['TSV', exportToTSV(employees, columns, { escapeFormulas: true })],
  ['JSON', exportToJSON(employees, columns)],
  ['HTML', exportToHTML(employees, columns)],
  ['Text', exportToText(employees, columns)],
]) {
  console.log(`${format}: ${Buffer.byteLength(content ?? '', 'utf8')} bytes`);
}

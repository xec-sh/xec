/**
 * 14 - Static Table
 *
 * Render tabular data with column formatting, alignment,
 * compact mode, and border styles.
 */
import { table, prism } from '../src/index.js';

const employees = [
  { id: 1, name: 'Alice Johnson', role: 'Senior Engineer', salary: 145000, active: true },
  { id: 2, name: 'Bob Smith', role: 'Designer', salary: 98000, active: true },
  { id: 3, name: 'Charlie Brown', role: 'Manager', salary: 125000, active: false },
  { id: 4, name: 'Diana Prince', role: 'DevOps Engineer', salary: 135000, active: true },
  { id: 5, name: 'Eve Wilson', role: 'Junior Developer', salary: 72000, active: true },
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
      format: (val: boolean) => val ? prism.green('Active') : prism.red('Inactive'),
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

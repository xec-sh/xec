import { table, prism } from '../../src/index.js';

console.log('\n📊 Basic Table Example\n');

// Sample data
const users = [
  { id: 1, name: 'Alice Johnson', age: 30, role: 'Developer', status: 'active' },
  { id: 2, name: 'Bob Smith', age: 25, role: 'Designer', status: 'active' },
  { id: 3, name: 'Charlie Brown', age: 35, role: 'Manager', status: 'inactive' },
  { id: 4, name: 'Diana Prince', age: 28, role: 'Developer', status: 'active' },
  { id: 5, name: 'Eve Adams', age: 32, role: 'QA Engineer', status: 'active' },
];

// Example 1: Basic table with rounded borders
console.log('Example 1: Basic Table');
table({
  data: users,
  columns: [
    { key: 'id', header: 'ID', width: 5, align: 'right' },
    { key: 'name', header: 'Name', width: 20 },
    { key: 'age', header: 'Age', width: 5, align: 'right' },
    { key: 'role', header: 'Role', width: 15 },
  ],
  borders: 'rounded',
});

// Example 2: Table with custom formatters and styles
console.log('\nExample 2: With Formatters & Styles');
table({
  data: users,
  columns: [
    { key: 'name', header: 'Employee', width: 20 },
    {
      key: 'age',
      header: 'Age',
      width: 8,
      align: 'right',
      format: (v) => `${v} yrs`,
    },
    {
      key: 'status',
      header: 'Status',
      width: 10,
      format: (v: string) => (v === 'active' ? '✓ Active' : '✗ Inactive'),
      style: (text: string, value: any) => (value === 'active' ? prism.green(text) : prism.red(text)),
    },
  ],
  borders: 'single',
  headerStyle: prism.cyan,
});

// Example 3: Compact table with no borders
console.log('\nExample 3: Compact (No Borders)');
table({
  data: users.slice(0, 3),
  columns: [
    { key: 'id', header: '#', width: 3, align: 'right' },
    { key: 'name', header: 'Name', width: 20 },
    { key: 'role', header: 'Role', width: 15 },
  ],
  borders: 'none',
  alignment: 'left',
});

// Example 4: Table with different alignments
console.log('\nExample 4: Text Alignment');
table({
  data: [
    { left: 'Left aligned text', center: 'Centered text', right: 'Right aligned text' },
    { left: 'Short', center: 'Med', right: 'Longer text here' },
  ],
  columns: [
    { key: 'left', header: 'Left', width: 20, align: 'left' },
    { key: 'center', header: 'Center', width: 20, align: 'center' },
    { key: 'right', header: 'Right', width: 20, align: 'right' },
  ],
  borders: 'double',
});

// Example 5: Table with auto width
console.log('\nExample 5: Auto Width');
table({
  data: [
    { code: 'US', country: 'United States', population: 331900000 },
    { code: 'CN', country: 'China', population: 1412000000 },
    { code: 'IN', country: 'India', population: 1393000000 },
  ],
  columns: [
    { key: 'code', header: 'Code', width: 'content' },
    { key: 'country', header: 'Country', width: 'content' },
    {
      key: 'population',
      header: 'Population',
      width: 'content',
      align: 'right',
      format: (v: number) => v.toLocaleString(),
    },
  ],
  borders: 'ascii',
  width: 'auto',
});

// Example 6: Empty table
console.log('\nExample 6: Empty Table');
table({
  data: [],
  columns: [
    { key: 'name', header: 'Name', width: 20 },
    { key: 'value', header: 'Value', width: 20 },
  ],
  borders: 'rounded',
});

console.log('\n✨ Examples completed!\n');

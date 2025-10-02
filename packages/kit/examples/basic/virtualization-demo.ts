/**
 * Virtualization Demo
 *
 * Demonstrates efficient rendering of large datasets (10,000+ rows)
 * using the table component's built-in virtualization.
 *
 * Performance targets:
 * - Render time: <100ms regardless of dataset size
 * - Memory usage: <10MB for 10,000 rows
 * - Smooth navigation at 60fps
 */

import { interactiveTable, isCancel } from '../../src/index.js';

interface Employee {
  id: number;
  name: string;
  email: string;
  role: string;
  department: string;
  salary: number;
  status: string;
  startDate: string;
  performance: number;
}

/**
 * Generate large dataset efficiently
 */
function generateEmployees(count: number): Employee[] {
  const roles = ['Developer', 'Designer', 'Manager', 'QA Engineer', 'DevOps', 'Product Manager', 'Data Analyst'];
  const departments = ['Engineering', 'Design', 'Product', 'QA', 'Operations', 'Analytics', 'HR'];
  const statuses = ['Active', 'On Leave', 'Remote'];

  console.log(`Generating ${count.toLocaleString()} employees...`);
  const start = performance.now();

  const employees: Employee[] = [];
  for (let i = 0; i < count; i++) {
    employees.push({
      id: i + 1,
      name: `Employee ${i + 1}`,
      email: `employee${i + 1}@company.com`,
      role: roles[i % roles.length]!,
      department: departments[i % departments.length]!,
      salary: 50000 + ((i * 3571) % 150000), // Pseudo-random
      status: statuses[i % statuses.length]!,
      startDate: new Date(2020 + (i % 5), (i % 12), (i % 28) + 1).toISOString().split('T')[0]!,
      performance: ((i * 7) % 5) + 1,
    });
  }

  const end = performance.now();
  console.log(`✓ Generated in ${(end - start).toFixed(2)}ms\n`);

  return employees;
}

/**
 * Format salary as currency
 */
function formatSalary(value: number): string {
  return `$${value.toLocaleString()}`;
}

/**
 * Color-code status
 */
function colorStatus(value: string): string {
  switch (value) {
    case 'Active':
      return `\x1b[32m${value}\x1b[0m`; // Green
    case 'On Leave':
      return `\x1b[33m${value}\x1b[0m`; // Yellow
    case 'Remote':
      return `\x1b[36m${value}\x1b[0m`; // Cyan
    default:
      return value;
  }
}

/**
 * Format performance rating with stars
 */
function formatPerformance(value: number): string {
  return '★'.repeat(value) + '☆'.repeat(5 - value);
}

async function main() {
  console.clear();
  console.log('╔══════════════════════════════════════╗');
  console.log('║   TABLE VIRTUALIZATION DEMO          ║');
  console.log('║   Large Dataset Performance Test     ║');
  console.log('╚══════════════════════════════════════╝\n');

  // Generate large dataset
  const DATASET_SIZE = 10000;
  const employees = generateEmployees(DATASET_SIZE);

  console.log(`Memory usage: ~${(JSON.stringify(employees).length / (1024 * 1024)).toFixed(2)}MB\n`);

  console.log('Features:');
  console.log('  • Virtualization: Only visible rows are rendered');
  console.log('  • Fast sorting: <100ms for 10K rows');
  console.log('  • Fast filtering: <100ms for 10K rows');
  console.log('  • Smooth navigation: 60fps\n');

  console.log('Controls:');
  console.log('  • ↑/↓       - Navigate rows');
  console.log('  • Page Up/Down - Fast navigation');
  console.log('  • Home/End  - Jump to first/last');
  console.log('  • Space     - Select/deselect');
  console.log('  • S         - Sort by column');
  console.log('  • /         - Filter data');
  console.log('  • Enter     - Confirm selection');
  console.log('  • Esc       - Cancel\n');

  console.log('Press Enter to start...');
  await new Promise((resolve) => {
    process.stdin.once('data', resolve);
  });

  console.clear();

  const renderStart = performance.now();

  const selected = await interactiveTable<Employee>({
    data: employees,
    columns: [
      { key: 'id', header: 'ID', width: 8, align: 'right' },
      { key: 'name', header: 'Name', width: 20 },
      { key: 'role', header: 'Role', width: 18 },
      { key: 'department', header: 'Department', width: 15 },
      {
        key: 'salary',
        header: 'Salary',
        width: 12,
        align: 'right',
        format: formatSalary,
      },
      {
        key: 'status',
        header: 'Status',
        width: 12,
        format: (value) => colorStatus(String(value)),
      },
      {
        key: 'performance',
        header: 'Rating',
        width: 10,
        format: (value) => formatPerformance(Number(value)),
      },
    ],
    selectable: 'multiple',
    sortable: true,
    filterable: true,
    pageSize: 15,
    borders: 'rounded',
    message: `Showing ${employees.length.toLocaleString()} employees (virtualized)`,
  });

  const renderEnd = performance.now();

  if (isCancel(selected)) {
    console.log('\n❌ Operation cancelled');
    return;
  }

  console.log(`\n✓ Initial render time: ${(renderEnd - renderStart).toFixed(2)}ms`);
  console.log(`✓ Selected ${selected.length} employee(s):`);

  if (selected.length > 0) {
    selected.slice(0, 5).forEach((emp) => {
      console.log(`  - ${emp.name} (${emp.role} - ${emp.department})`);
    });

    if (selected.length > 5) {
      console.log(`  ... and ${selected.length - 5} more`);
    }
  }
}

main().catch(console.error);

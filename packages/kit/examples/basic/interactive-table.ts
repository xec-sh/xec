/**
 * Interactive Table Examples
 *
 * Run this file to see the interactive table in action:
 * npx tsx examples/basic/interactive-table.ts
 */

import { isCancel, interactiveTable } from '../../src/index.js';

// Sample data
interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  joinedDate: Date;
}

const users: User[] = [
  {
    id: 1,
    name: 'Alice Johnson',
    email: 'alice@example.com',
    role: 'Developer',
    status: 'Active',
    joinedDate: new Date('2023-01-15'),
  },
  {
    id: 2,
    name: 'Bob Smith',
    email: 'bob@example.com',
    role: 'Designer',
    status: 'Active',
    joinedDate: new Date('2023-02-20'),
  },
  {
    id: 3,
    name: 'Charlie Brown',
    email: 'charlie@example.com',
    role: 'Manager',
    status: 'Active',
    joinedDate: new Date('2023-03-10'),
  },
  {
    id: 4,
    name: 'Diana Prince',
    email: 'diana@example.com',
    role: 'Developer',
    status: 'Active',
    joinedDate: new Date('2023-04-05'),
  },
  {
    id: 5,
    name: 'Eve Davis',
    email: 'eve@example.com',
    role: 'Designer',
    status: 'Inactive',
    joinedDate: new Date('2023-05-12'),
  },
  {
    id: 6,
    name: 'Frank Miller',
    email: 'frank@example.com',
    role: 'Developer',
    status: 'Active',
    joinedDate: new Date('2023-06-18'),
  },
  {
    id: 7,
    name: 'Grace Lee',
    email: 'grace@example.com',
    role: 'Manager',
    status: 'Active',
    joinedDate: new Date('2023-07-22'),
  },
  {
    id: 8,
    name: 'Henry Wilson',
    email: 'henry@example.com',
    role: 'Developer',
    status: 'Active',
    joinedDate: new Date('2023-08-30'),
  },
  {
    id: 9,
    name: 'Iris Martinez',
    email: 'iris@example.com',
    role: 'Designer',
    status: 'Active',
    joinedDate: new Date('2023-09-14'),
  },
  {
    id: 10,
    name: 'Jack Taylor',
    email: 'jack@example.com',
    role: 'Developer',
    status: 'Inactive',
    joinedDate: new Date('2023-10-01'),
  },
];

async function example1_navigation() {
  console.log('\n📋 Example 1: Basic Navigation');
  console.log('Use arrow keys to navigate, Enter to submit\n');

  const selected = await interactiveTable({
    data: users,
    columns: [
      { key: 'id', header: 'ID', width: 5 },
      { key: 'name', header: 'Name', width: 20 },
      { key: 'role', header: 'Role', width: 15 },
      { key: 'status', header: 'Status', width: 10 },
    ],
    selectable: 'none',
    borders: 'rounded',
  });

  if (isCancel(selected)) {
    console.log('❌ Selection cancelled');
  } else {
    console.log('\n✅ Table displayed successfully');
  }
}

async function example2_singleSelection() {
  console.log('\n📋 Example 2: Single Selection');
  console.log('Use Space to select, Enter to submit\n');

  const selected = await interactiveTable({
    data: users,
    columns: [
      { key: 'id', header: 'ID', width: 5 },
      { key: 'name', header: 'Name', width: 20 },
      { key: 'email', header: 'Email', width: 25 },
      { key: 'role', header: 'Role', width: 15 },
    ],
    selectable: 'single',
    borders: 'single',
  });

  if (isCancel(selected)) {
    console.log('❌ Selection cancelled');
  } else {
    console.log(`\n✅ Selected: ${selected[0]?.name || 'None'}`);
  }
}

async function example3_multipleSelection() {
  console.log('\n📋 Example 3: Multiple Selection');
  console.log('Use Space to toggle selection, Ctrl+A to select all, Enter to submit\n');

  const selected = await interactiveTable({
    data: users,
    columns: [
      { key: 'id', header: 'ID', width: 5 },
      { key: 'name', header: 'Name', width: 20 },
      { key: 'role', header: 'Role', width: 15 },
      { key: 'status', header: 'Status', width: 10 },
    ],
    selectable: 'multiple',
    borders: 'double',
    alternateRows: true,
  });

  if (isCancel(selected)) {
    console.log('❌ Selection cancelled');
  } else {
    console.log(`\n✅ Selected ${selected.length} users:`);
    selected.forEach((user) => console.log(`  - ${user.name} (${user.role})`));
  }
}

async function example4_sorting() {
  console.log('\n📋 Example 4: Sorting');
  console.log('Press "s" to sort by current column\n');

  const selected = await interactiveTable({
    data: users,
    columns: [
      { key: 'id', header: 'ID', width: 5, sortable: true },
      { key: 'name', header: 'Name', width: 20, sortable: true },
      { key: 'role', header: 'Role', width: 15, sortable: true },
      { key: 'joinedDate', header: 'Joined', width: 12, sortable: true, format: (d) => d.toLocaleDateString() },
    ],
    selectable: 'none',
    sortable: true,
    borders: 'rounded',
  });

  if (!isCancel(selected)) {
    console.log('\n✅ Sorting example completed');
  }
}

async function example5_filtering() {
  console.log('\n📋 Example 5: Filtering');
  console.log('Press Ctrl+F or "/" to filter, Escape to exit filter mode\n');

  const selected = await interactiveTable({
    data: users,
    columns: [
      { key: 'id', header: 'ID', width: 5 },
      { key: 'name', header: 'Name', width: 20 },
      { key: 'role', header: 'Role', width: 15 },
      { key: 'status', header: 'Status', width: 10 },
    ],
    selectable: 'multiple',
    filterable: true,
    borders: 'rounded',
  });

  if (isCancel(selected)) {
    console.log('❌ Selection cancelled');
  } else {
    console.log(`\n✅ Selected ${selected.length} users after filtering`);
  }
}

async function example6_fullFeatures() {
  console.log('\n📋 Example 6: All Features Combined');
  console.log('Navigate, sort (s), filter (Ctrl+F), select (Space), select all (Ctrl+A)\n');

  const selected = await interactiveTable({
    data: users,
    columns: [
      { key: 'id', header: 'ID', width: 5, sortable: true, align: 'right' },
      { key: 'name', header: 'Name', width: 20, sortable: true },
      { key: 'email', header: 'Email', width: 25, sortable: true },
      { key: 'role', header: 'Role', width: 12, sortable: true },
      { key: 'status', header: 'Status', width: 8, sortable: true },
    ],
    selectable: 'multiple',
    sortable: true,
    filterable: true,
    borders: 'rounded',
    alternateRows: true,
    pageSize: 8,
  });

  if (isCancel(selected)) {
    console.log('❌ Selection cancelled');
  } else {
    console.log(`\n✅ Selected ${selected.length} users:`);
    selected.forEach((user) => {
      console.log(`  ${user.id}. ${user.name} - ${user.role} (${user.status})`);
    });
  }
}

// Main menu
async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  Interactive Table Examples            ║');
  console.log('╚════════════════════════════════════════╝\n');

  console.log('Choose an example to run:\n');
  console.log('1. Basic Navigation');
  console.log('2. Single Selection');
  console.log('3. Multiple Selection');
  console.log('4. Sorting');
  console.log('5. Filtering');
  console.log('6. All Features Combined\n');

  const example = process.argv[2];

  switch (example) {
    case '1':
      await example1_navigation();
      break;
    case '2':
      await example2_singleSelection();
      break;
    case '3':
      await example3_multipleSelection();
      break;
    case '4':
      await example4_sorting();
      break;
    case '5':
      await example5_filtering();
      break;
    case '6':
      await example6_fullFeatures();
      break;
    default:
      console.log('Usage: npx tsx examples/basic/interactive-table.ts [1-6]');
      console.log('\nRunning all features example by default...\n');
      await example6_fullFeatures();
  }
}

main().catch(console.error);

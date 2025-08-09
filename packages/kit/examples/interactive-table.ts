#!/usr/bin/env tsx
// Interactive Table Example - demonstrates onSelect and data refresh features

import { table } from '../src/index.js';

interface Task {
  id: number;
  title: string;
  status: 'pending' | 'in-progress' | 'completed';
  assignee: string;
  priority: 'low' | 'medium' | 'high';
  created: Date;
}

// Sample data
const tasks: Task[] = [
  { id: 1, title: 'Setup development environment', status: 'completed', assignee: 'Alice', priority: 'high', created: new Date('2024-01-01') },
  { id: 2, title: 'Implement user authentication', status: 'in-progress', assignee: 'Bob', priority: 'high', created: new Date('2024-01-02') },
  { id: 3, title: 'Design database schema', status: 'completed', assignee: 'Charlie', priority: 'medium', created: new Date('2024-01-03') },
  { id: 4, title: 'Write API documentation', status: 'pending', assignee: 'Diana', priority: 'low', created: new Date('2024-01-04') },
  { id: 5, title: 'Add unit tests', status: 'in-progress', assignee: 'Eve', priority: 'medium', created: new Date('2024-01-05') },
  { id: 6, title: 'Deploy to staging', status: 'pending', assignee: 'Frank', priority: 'high', created: new Date('2024-01-06') },
];

// Helper function to format status with color
function formatStatus(status: Task['status']): string {
  const statusIcons: Record<Task['status'], string> = {
    'pending': '⏳',
    'in-progress': '🔄',
    'completed': '✅'
  };
  return `${statusIcons[status]} ${status}`;
}

// Helper function to format priority with color
function formatPriority(priority: Task['priority']): string {
  const priorityIcons: Record<Task['priority'], string> = {
    'low': '🟢',
    'medium': '🟡',
    'high': '🔴'
  };
  return `${priorityIcons[priority]} ${priority}`;
}

async function runExample() {
  console.log('\n🎯 Interactive Table Example\n');
  console.log('This example demonstrates:');
  console.log('- Interactive tables with onSelect callback');
  console.log('- Data refresh capability');
  console.log('- Custom formatting for columns');
  console.log('- Search and sort functionality\n');

  try {
    await table({
      message: '📋 Task Management Dashboard',
      data: tasks,
      columns: [
        { key: 'id', label: 'ID', width: 5, align: 'center' },
        { key: 'title', label: 'Title', width: 30 },
        { 
          key: 'status', 
          label: 'Status', 
          width: 15,
          format: (value: Task['status']) => formatStatus(value)
        },
        { key: 'assignee', label: 'Assignee', width: 12 },
        { 
          key: 'priority', 
          label: 'Priority', 
          width: 12,
          format: (value: Task['priority']) => formatPriority(value)
        },
        {
          key: 'created',
          label: 'Created',
          width: 12,
          format: (value: Date) => value.toLocaleDateString()
        }
      ],
      selectable: 'single',
      interactive: true,
      search: true,
      sort: true,
      pageSize: 5,
      
      // Handle row selection
      onSelect: async (task: Task) => {
        console.log(`\n➡️  Selected task #${task.id}: ${task.title}`);
        
        // Simulate an action menu (in real app, you'd show another prompt)
        console.log('   Available actions:');
        console.log('   1. Change status');
        console.log('   2. Reassign');
        console.log('   3. Change priority');
        console.log('   4. Delete task');
        
        // Simulate changing task status
        if (task.status === 'pending') {
          task.status = 'in-progress';
          console.log(`   ✅ Status changed to: ${task.status}`);
        } else if (task.status === 'in-progress') {
          task.status = 'completed';
          console.log(`   ✅ Status changed to: ${task.status}`);
        }
        
        // Simulate a delay for the action
        await new Promise(resolve => setTimeout(resolve, 1000));
      },
      
      // Provide fresh data when refresh is triggered (r key)
      refreshData: async () => {
        console.log('\n🔄 Refreshing data...');
        
        // Simulate fetching fresh data from a server
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Add a new task to demonstrate refresh
        const newTaskId = Math.max(...tasks.map(t => t.id)) + 1;
        if (tasks.length < 10) {
          tasks.push({
            id: newTaskId,
            title: `New task #${newTaskId}`,
            status: 'pending',
            assignee: 'New User',
            priority: 'low',
            created: new Date()
          });
          console.log(`   ✨ Added new task #${newTaskId}`);
        }
        
        return tasks;
      }
    });

    console.log('\n✅ Interactive table session ended');
    
  } catch (error) {
    if (error instanceof Error && error.message === 'Cancelled') {
      console.log('\n❌ Table interaction cancelled');
    } else {
      console.error('\n❌ Error:', error);
    }
  }
}

// Run the example
runExample().catch(console.error);
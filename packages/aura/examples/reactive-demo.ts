#!/usr/bin/env tsx
/**
 * Reactive System Demo
 * Demonstrates Aura's fine-grained reactivity
 */

import { 
  batch, 
  signal, 
  effect, 
  computed, 
  createRoot 
} from '../src/core/reactive/index.js';

console.log('🎯 Aura Reactive System Demo\n');

// Create a root scope for our reactive computations
createRoot(dispose => {
  console.log('1️⃣  Basic Signals');
  console.log('─'.repeat(40));
  
  // Create reactive signals
  const firstName = signal('John');
  const lastName = signal('Doe');
  
  console.log(`firstName: ${firstName()}`);
  console.log(`lastName: ${lastName()}`);
  
  // Update signals
  firstName.set('Jane');
  console.log(`firstName after update: ${firstName()}\n`);
  
  console.log('2️⃣  Computed Values');
  console.log('─'.repeat(40));
  
  // Create computed signal that derives from other signals
  const fullName = computed(() => `${firstName()} ${lastName()}`);
  console.log(`fullName: ${fullName()}`);
  
  // Computed updates automatically when dependencies change
  lastName.set('Smith');
  console.log(`fullName after lastName change: ${fullName()}\n`);
  
  console.log('3️⃣  Effects (Side Effects)');
  console.log('─'.repeat(40));
  
  // Create counter signal
  const counter = signal(0);
  
  // Effect runs whenever dependencies change
  let effectRuns = 0;
  const dispose1 = effect(() => {
    effectRuns++;
    console.log(`Effect run #${effectRuns}: counter = ${counter()}`);
  });
  
  // Update counter
  counter.set(1);
  counter.set(2);
  counter.set(3);
  
  console.log('\n4️⃣  Batching Updates');
  console.log('─'.repeat(40));
  
  const a = signal(1);
  const b = signal(2);
  const sum = computed(() => {
    console.log('  Computing sum...');
    return a() + b();
  });
  
  // Effect to watch the sum
  const dispose2 = effect(() => {
    console.log(`  Sum changed to: ${sum()}`);
  });
  
  console.log('Without batching (2 computations):');
  a.set(10);
  b.set(20);
  
  console.log('\nWith batching (1 computation):');
  batch(() => {
    a.set(100);
    b.set(200);
  });
  
  console.log('\n5️⃣  Complex Example: Todo Counter');
  console.log('─'.repeat(40));
  
  // Todo list state
  const todos = signal([
    { id: 1, text: 'Learn Aura', done: false },
    { id: 2, text: 'Build TUI app', done: false },
    { id: 3, text: 'Ship to production', done: false }
  ]);
  
  // Computed values
  const totalCount = computed(() => todos().length);
  const doneCount = computed(() => todos().filter(t => t.done).length);
  const remainingCount = computed(() => totalCount() - doneCount());
  const progress = computed(() => {
    const total = totalCount();
    return total > 0 ? Math.round((doneCount() / total) * 100) : 0;
  });
  
  // Effect to display stats
  const dispose3 = effect(() => {
    console.log(`
  📊 Todo Stats:
  • Total: ${totalCount()}
  • Done: ${doneCount()}
  • Remaining: ${remainingCount()}
  • Progress: ${progress()}%
  `);
  });
  
  // Complete a todo
  console.log('Completing first todo...');
  todos.mutate(list => {
    list[0].done = true;
  });
  
  // Add a new todo
  console.log('Adding new todo...');
  todos.update(list => [
    ...list,
    { id: 4, text: 'Write documentation', done: false }
  ]);
  
  // Complete all todos
  console.log('Completing all todos...');
  todos.update(list => list.map(t => ({ ...t, done: true })));
  
  console.log('\n6️⃣  Cleanup');
  console.log('─'.repeat(40));
  
  // Dispose individual effects
  dispose1.dispose();
  dispose2.dispose();
  dispose3.dispose();
  
  console.log('Individual effects disposed');
  
  // Clean up everything in this root
  dispose();
  console.log('Root disposed - all computations cleaned up');
});

console.log('\n✅ Demo complete!');
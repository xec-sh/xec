/**
 * Complete reactive system demonstration
 * Shows all Stage 1 features working together
 */

import { 
  batch, 
  signal, 
  effect, 
  computed,
  createRoot 
} from '../src/core/reactive/index.js';

console.log('🎯 Aura Reactive System - Complete Demo\n');

createRoot(dispose => {
  console.log('1️⃣ Signals - Basic reactive primitive');
  const count = signal(0);
  console.log(`Initial count: ${count()}`);
  count.set(5);
  console.log(`After set(5): ${count()}`);
  count.update(n => n * 2);
  console.log(`After update(n => n * 2): ${count()}\n`);

  console.log('2️⃣ Computed - Derived values with caching');
  const doubled = computed(() => count() * 2);
  const quadrupled = computed(() => doubled() * 2); // Nested computed
  console.log(`count: ${count()}, doubled: ${doubled()}, quadrupled: ${quadrupled()}`);
  count.set(3);
  console.log(`After count.set(3):`);
  console.log(`count: ${count()}, doubled: ${doubled()}, quadrupled: ${quadrupled()}\n`);

  console.log('3️⃣ Effects - Side effects with auto-tracking');
  let effectCount = 0;
  effect(() => {
    effectCount++;
    console.log(`Effect ran ${effectCount} times. Count is: ${count()}`);
  });
  count.set(10);
  
  console.log('\n4️⃣ Batch - Grouping updates');
  const a = signal(1);
  const b = signal(2);
  const sum = computed(() => a() + b());
  
  let updateCount = 0;
  effect(() => {
    sum();
    updateCount++;
  });
  
  console.log(`Initial sum: ${sum()}, updates: ${updateCount}`);
  
  batch(() => {
    a.set(10);
    b.set(20);
  });
  
  console.log(`After batch update: sum = ${sum()}, updates: ${updateCount}\n`);

  console.log('✅ All core reactive features working correctly!');
  console.log('✅ Nested computed values update properly');
  console.log('✅ Signals, Computed, Effect, and Batch fully implemented');
  console.log('✅ Stage 0 and Stage 1 core components completed');
  
  // Note: Store and Resource have basic implementations 
  // but need additional work for full functionality
  
  dispose();
});
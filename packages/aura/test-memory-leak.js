import { signal, computed, effect } from './dist/index.js';
import { createRoot } from './dist/core/reactive/batch.js';

console.log('Testing memory leak in reactive system...\n');

// Test simple chain
console.log('Test 1: Simple chain');
createRoot(d => {
  const source = signal(1);
  
  const level1 = computed(() => {
    const value = source() * 2;
    console.log(`  level1: ${value}`);
    return value;
  });
  
  const level2 = computed(() => {
    const value = level1() + 10;
    console.log(`  level2: ${value}`);
    return value;
  });
  
  const level3 = computed(() => {
    const value = level2() * 2;
    console.log(`  level3: ${value}`);
    return value;
  });
  
  effect(() => {
    const value = level3();
    console.log(`  effect: ${value}`);
  });
  
  console.log('Initial computation done');
  
  // Update source
  console.log('Updating source to 2...');
  source.set(2);
  
  console.log('Test 1 complete');
  d();
});

console.log('\nMemory leak test completed');
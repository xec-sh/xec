import { signal, computed, effect } from './dist/index.js';
import { createRoot } from './dist/core/reactive/batch.js';

console.log('Testing diamond pattern memory leak...\n');

createRoot(d => {
  const source = signal(1);
  
  // Diamond pattern:
  //     source
  //     /    \
  //   left   right
  //     \    /
  //     result
  
  const left = computed(() => {
    const value = source() * 2;
    console.log(`  left: ${value}`);
    return value;
  });
  
  const right = computed(() => {
    const value = source() * 3;
    console.log(`  right: ${value}`);
    return value;
  });
  
  const result = computed(() => {
    const value = left() + right();
    console.log(`  result: ${value}`);
    return value;
  });
  
  effect(() => {
    const value = result();
    console.log(`  effect: ${value}`);
  });
  
  console.log('Initial computation done');
  
  // Update source
  console.log('Updating source to 2...');
  source.set(2);
  
  console.log('Test complete');
  d();
});

console.log('\nDiamond pattern test completed');
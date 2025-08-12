import { signal, computed, effect, createRoot } from './dist/index.js';

console.log('=== Testing Dependencies ===\n');

createRoot(d => {
  const b = signal(2);
  
  const bc = computed(() => {
    const result = b() * 2;
    console.log(`bc computing: ${b()} * 2 = ${result}`);
    return result;
  });
  
  console.log('Initial bc():', bc());
  
  console.log('\nUpdating b to 3...');
  b.set(3);
  
  console.log('After update bc():', bc());
  
  console.log('\n=== Now with effect ===');
  
  const b2 = signal(2);
  
  const bc2 = computed(() => {
    const result = b2() * 2;
    console.log(`bc2 computing: ${b2()} * 2 = ${result}`);
    return result;
  });
  
  effect(() => {
    console.log('Effect: bc2() =', bc2());
  });
  
  console.log('\nUpdating b2 to 3...');
  b2.set(3);
  
  console.log('\n=== Now with nested computed ===');
  
  const b3 = signal(2);
  
  const bc3 = computed(() => {
    const result = b3() * 2;
    console.log(`bc3 computing: ${b3()} * 2 = ${result}`);
    return result;
  });
  
  const wrapper = computed(() => {
    console.log('wrapper computing...');
    const val = bc3();
    console.log(`  bc3() returned: ${val}`);
    return val;
  });
  
  effect(() => {
    console.log('Effect: wrapper() =', wrapper());
  });
  
  console.log('\nUpdating b3 to 3...');
  b3.set(3);
  
  d();
});
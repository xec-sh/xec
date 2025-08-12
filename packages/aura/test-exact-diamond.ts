import { signal, computed, effect, createRoot } from './dist/index.js';

console.log('=== Exact Diamond Problem ===\n');

createRoot(d => {
  const b = signal(2);
  
  let ab_calls = 0;
  let bc_calls = 0;
  let sum_calls = 0;
  
  const ab = computed(() => {
    ab_calls++;
    const result = 1 + b();
    console.log(`[${ab_calls}] ab: 1 + ${b()} = ${result}`);
    return result;
  });
  
  const bc = computed(() => {
    bc_calls++;
    const result = b() * 2;
    console.log(`[${bc_calls}] bc: ${b()} * 2 = ${result}`);
    return result;
  });
  
  const sum = computed(() => {
    sum_calls++;
    console.log(`[${sum_calls}] sum computing...`);
    
    // Key: call ab FIRST, then bc
    const ab_val = ab();
    console.log(`  ab() = ${ab_val}`);
    
    const bc_val = bc();
    console.log(`  bc() = ${bc_val}`);
    
    const result = ab_val + bc_val;
    console.log(`  result = ${result}`);
    return result;
  });
  
  // First access through effect
  effect(() => {
    console.log('Effect: sum() =', sum());
  });
  
  console.log('\n=== Update b to 3 ===');
  b.set(3);
  
  console.log('\nCalls after update:');
  console.log('  ab:', ab_calls);
  console.log('  bc:', bc_calls);
  console.log('  sum:', sum_calls);
  
  console.log('\n=== Try reversing order: bc first, then ab ===');
  
  const b2 = signal(2);
  
  let ab2_calls = 0;
  let bc2_calls = 0;
  let sum2_calls = 0;
  
  const ab2 = computed(() => {
    ab2_calls++;
    const result = 1 + b2();
    console.log(`[${ab2_calls}] ab2: 1 + ${b2()} = ${result}`);
    return result;
  });
  
  const bc2 = computed(() => {
    bc2_calls++;
    const result = b2() * 2;
    console.log(`[${bc2_calls}] bc2: ${b2()} * 2 = ${result}`);
    return result;
  });
  
  const sum2 = computed(() => {
    sum2_calls++;
    console.log(`[${sum2_calls}] sum2 computing...`);
    
    // Key: call bc FIRST, then ab
    const bc_val = bc2();
    console.log(`  bc2() = ${bc_val}`);
    
    const ab_val = ab2();
    console.log(`  ab2() = ${ab_val}`);
    
    const result = ab_val + bc_val;
    console.log(`  result = ${result}`);
    return result;
  });
  
  // First access through effect
  effect(() => {
    console.log('Effect: sum2() =', sum2());
  });
  
  console.log('\n=== Update b2 to 3 ===');
  b2.set(3);
  
  console.log('\nCalls after update:');
  console.log('  ab2:', ab2_calls);
  console.log('  bc2:', bc2_calls);
  console.log('  sum2:', sum2_calls);
  
  d();
});
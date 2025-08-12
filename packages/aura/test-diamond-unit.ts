import { signal, computed, effect, createRoot } from './dist/index.js';

console.log('=== Diamond Pattern Test ===\n');

// Unit test for diamond pattern
createRoot(d => {
  const a = signal(1);
  const b = signal(2);
  
  const ab = computed(() => {
    const result = a() + b();
    console.log(`ab computed: a=${a()}, b=${b()}, result=${result}`);
    return result;
  });
  
  const bc = computed(() => {
    const result = b() * 2;
    console.log(`bc computed: b=${b()}, result=${result}`);
    return result;
  });
  
  const sum = computed(() => {
    const abVal = ab();
    const bcVal = bc();
    const result = abVal + bcVal;
    console.log(`sum computed: ab=${abVal}, bc=${bcVal}, result=${result}`);
    return result;
  });
  
  console.log('Direct call - sum():', sum());
  console.log('Expected: 7 (3 + 4)\n');
  
  console.log('Updating b to 3...');
  b.set(3);
  
  console.log('Direct call after update - sum():', sum());
  console.log('Expected: 10 (4 + 6)\n');
  
  d();
});

// Now test with effect
console.log('\n=== Diamond Pattern with Effect ===\n');

createRoot(d => {
  const log: string[] = [];
  const a = signal(1);
  const b = signal(2);
  
  const ab = computed(() => {
    const result = a() + b();
    log.push(`ab:${result}`);
    return result;
  });
  
  const bc = computed(() => {
    const result = b() * 2;
    log.push(`bc:${result}`);
    return result;
  });
  
  const sum = computed(() => {
    const result = ab() + bc();
    log.push(`sum:${result}`);
    return result;
  });
  
  effect(() => {
    const value = sum();
    log.push(`effect:${value}`);
  });
  
  console.log('Initial log:', log);
  log.length = 0;
  
  console.log('\nUpdating b to 3...');
  b.set(3);
  
  console.log('After update log:', log);
  console.log('Expected: ab:4, bc:6, sum:10, effect:10');
  console.log('Actual values:');
  console.log('  ab():', ab());
  console.log('  bc():', bc());
  console.log('  sum():', sum());
  
  d();
});
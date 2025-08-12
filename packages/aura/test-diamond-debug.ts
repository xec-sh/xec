import { signal, computed, effect, createRoot } from './dist/index.js';

console.log('=== Debug Diamond Pattern ===\n');

createRoot(d => {
  const log: string[] = [];
  const b = signal(2);
  
  let bcComputeCount = 0;
  let abComputeCount = 0;
  let sumComputeCount = 0;
  
  const ab = computed(() => {
    abComputeCount++;
    const result = 1 + b();
    console.log(`[${abComputeCount}] ab computing: 1 + ${b()} = ${result}`);
    log.push(`ab:${result}`);
    return result;
  });
  
  const bc = computed(() => {
    bcComputeCount++;
    const result = b() * 2;
    console.log(`[${bcComputeCount}] bc computing: ${b()} * 2 = ${result}`);
    log.push(`bc:${result}`);
    return result;
  });
  
  const sum = computed(() => {
    sumComputeCount++;
    console.log(`[${sumComputeCount}] sum computing...`);
    const abVal = ab();
    console.log(`  ab() returned: ${abVal}`);
    const bcVal = bc();
    console.log(`  bc() returned: ${bcVal}`);
    const result = abVal + bcVal;
    console.log(`  sum result: ${abVal} + ${bcVal} = ${result}`);
    log.push(`sum:${result}`);
    return result;
  });
  
  let effectCount = 0;
  effect(() => {
    effectCount++;
    console.log(`[${effectCount}] Effect running...`);
    const value = sum();
    console.log(`  sum() returned: ${value}`);
    log.push(`effect:${value}`);
  });
  
  console.log('\nInitial computation done. Log:', log);
  log.length = 0;
  
  console.log('\n=== Updating b to 3 ===');
  b.set(3);
  
  console.log('\nAfter update log:', log);
  console.log('\nCompute counts:');
  console.log('  ab:', abComputeCount);
  console.log('  bc:', bcComputeCount);
  console.log('  sum:', sumComputeCount);
  console.log('  effect:', effectCount);
  
  console.log('\nDirect calls after update:');
  console.log('  ab():', ab());
  console.log('  bc():', bc());
  console.log('  sum():', sum());
  
  d();
});
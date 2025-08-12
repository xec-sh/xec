import { signal, computed, effect, createRoot } from './dist/index.js';

const log: string[] = [];

createRoot(d => {
  const source = signal(1);
  
  const left = computed(() => {
    const value = source() * 2;
    console.log(`Computing left: source=${source()}, value=${value}`);
    log.push(`left: ${value}`);
    return value;
  });
  
  const right = computed(() => {
    const value = source() * 3;
    console.log(`Computing right: source=${source()}, value=${value}`);
    log.push(`right: ${value}`);
    return value;
  });
  
  const result = computed(() => {
    const l = left();
    const r = right();
    const value = l + r;
    console.log(`Computing result: left=${l}, right=${r}, value=${value}`);
    log.push(`result: ${value}`);
    return value;
  });
  
  effect(() => {
    const value = result();
    console.log(`Effect: result=${value}`);
    log.push(`effect: ${value}`);
  });
  
  console.log('\n=== Initial computation ===');
  console.log('Log:', log);
  
  log.length = 0;
  
  console.log('\n=== Setting source to 2 ===');
  source.set(2);
  
  console.log('\nAfter update log:', log);
  console.log('\nValues after update:');
  console.log('  source:', source());
  console.log('  left:', left());
  console.log('  right:', right());
  console.log('  result:', result());
  
  d();
});
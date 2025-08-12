import { signal, computed, effect, createRoot } from './dist/index.js';

const log: string[] = [];

createRoot(d => {
  const source = signal(1);
  
  const left = computed(() => {
    const value = source() * 2;
    log.push(`left: ${value}`);
    return value;
  });
  
  const right = computed(() => {
    const value = source() * 3;
    log.push(`right: ${value}`);
    return value;
  });
  
  const result = computed(() => {
    const value = left() + right();
    log.push(`result: ${value}`);
    return value;
  });
  
  effect(() => {
    const value = result();
    log.push(`effect: ${value}`);
  });
  
  console.log('Initial logs:', log);
  log.length = 0;
  
  console.log('Setting source to 2...');
  source.set(2);
  
  console.log('After update logs:', log);
  
  console.log('Expected:');
  console.log('  left: 4');
  console.log('  right: 6');
  console.log('  result: 10');
  console.log('  effect: 10');
  
  d();
});
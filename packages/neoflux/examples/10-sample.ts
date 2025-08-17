import { signal, computed } from '../src/index.js';

const base = signal(10);

const squared = computed(() => {
  console.log('Calculating square...');
  return base() ** 2;
});

console.log(squared()); // "Calculating square..." then 100
console.log(squared()); // 100 (no recalculation)
console.log(squared()); // 100 (no recalculation)

base.set(5);
console.log(squared()); // "Calculating square..." then 25
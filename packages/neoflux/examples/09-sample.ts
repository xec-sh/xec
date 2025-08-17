import { signal, computed } from '../src/index.js';

const a = signal(1);
const b = signal(2);
const c = signal(3);

const result = computed(() => {
  console.log('Computing...');
  if (a() > 0) {
    return a() + b(); // Depends on a and b
  }
  return c(); // Would depend on a and c
});

console.log(result()); // "Computing..." then 3

b.set(5);
console.log(result()); // "Computing..." then 6

c.set(10);
console.log(result()); // No recomputation! c is not a dependency
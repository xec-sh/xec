import { signal, computed } from '../src/index.js';

const numerator = signal(10);
const denominator = signal(2);

const division = computed(() => {
  const denom = denominator();
  if (denom === 0) {
    throw new Error('Division by zero!');
  }
  return numerator() / denom;
});

console.log(division()); // 5

denominator.set(0);
try {
  console.log(division()); // Throws error
} catch (e: any) {
  console.error(e.message); // "Division by zero!"
}
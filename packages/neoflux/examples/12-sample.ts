import { signal, computed } from '../src/index.js';

const useMetric = signal(true);
const celsius = signal(20);
const fahrenheit = signal(68);

const temperature = computed(() => {
  if (useMetric()) {
    return `${celsius()}°C`; // Depends on useMetric and celsius
  } else {
    return `${fahrenheit()}°F`; // Would depend on useMetric and fahrenheit
  }
});

console.log(temperature()); // "20°C"

// Changing fahrenheit doesn't trigger recomputation
fahrenheit.set(72);
console.log(temperature()); // Still "20°C" (no recomputation)

// Switching the condition changes dependencies
useMetric.set(false);
console.log(temperature()); // "72°F" (now depends on fahrenheit)

// Now celsius changes don't matter
celsius.set(25);
console.log(temperature()); // Still "72°F"
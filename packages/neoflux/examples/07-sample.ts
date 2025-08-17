import { signal, effect } from '../src/index.js';

const debugMode = signal(false);
const counter = signal(0);

effect(() => {
  // Always runs when counter changes
  console.log('Counter:', counter());

  // Only check debugMode, don't depend on it
  if (debugMode.peek()) {
    console.log('Debug: Counter changed');
  }
});

counter.set(1); // Effect runs
debugMode.set(true); // Effect does NOT run (we used peek)
counter.set(2); // Effect runs and now shows debug message
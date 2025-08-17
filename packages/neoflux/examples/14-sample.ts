import { signal, effect } from '../src/index.js';

const interval = signal(1000);

effect(() => {
  const ms = interval();
  const id = setInterval(() => {
    console.log('Tick!');
  }, ms);

  // Cleanup: clear the interval
  return () => {
    clearInterval(id);
    console.log('Interval cleared');
  };
});

// Change interval - old one is cleaned up, new one starts
interval.set(500);
// Logs: "Interval cleared"
// New interval starts at 500ms
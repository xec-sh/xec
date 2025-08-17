import { signal, effect } from '../src/index.js';

// Default behavior - uses Object.is()
const num = signal(1);

effect(() => {
  console.log('num', num());
});
num.set(1); // No update, same value
num.set(2); // Updates

// Custom equality for objects
const config = signal(
  { theme: 'dark', fontSize: 14 },
  {
    equals: (a, b) => {
      // Only consider theme changes
      return a.theme === b.theme;
    }
  }
);

effect(() => {
  console.log('config', config());
});


config.set({ theme: 'dark', fontSize: 16 }); // No update (theme unchanged)
config.set({ theme: 'light', fontSize: 16 }); // Updates (theme changed)
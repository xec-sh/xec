import { store, effect } from '../src/index.js';

const user = store({
  name: 'John',
  settings: {
    theme: 'dark',
    notifications: true
  }
});

// Every property is reactive
effect(() => {
  console.log('Theme:', user.settings.theme);
});

user.settings.theme = 'light'; // Triggers the effect
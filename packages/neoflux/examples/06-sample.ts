import { signal, effect } from '../src/index.js';

const counter = signal(0);

effect(() => {
  console.log('Counter:', counter());
});

counter.set(1);
counter.set(2);
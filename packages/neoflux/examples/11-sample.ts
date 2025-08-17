import { signal, computed } from '../src/index.js';

const firstName = signal('John');
const lastName = signal('Doe');

// Level 1 computed
const fullName = computed(() => `${firstName()} ${lastName()}`);

// Level 2 computed (depends on another computed)
const displayName = computed(() => fullName().toUpperCase());

// Level 3 computed
const greeting = computed(() => `Hello, ${displayName()}!`);

console.log(greeting()); // "Hello, JOHN DOE!"

firstName.set('Jane');
console.log(greeting()); // "Hello, JANE DOE!"
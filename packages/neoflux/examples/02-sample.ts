import { signal, computed } from '../src/index.js';

// Create reactive values
const firstName = signal('John');
const lastName = signal('Doe');

// fullName automatically updates when dependencies change
const fullName = computed(() => firstName() + ' ' + lastName());

console.log(fullName()); // "John Doe"

firstName.set('Jane');
console.log(fullName()); // "Jane Doe" - automatically updated!
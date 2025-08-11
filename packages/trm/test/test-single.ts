// Simple test to debug the store issue
import { createStore } from '../src/advanced/state.js';

console.log('Starting test...');

try {
  const store = createStore({ count: 0, name: 'test' });
  console.log('Store created');
  console.log('Initial count:', store.state.count);
  console.log('Initial name:', store.state.name);
  
  store.set('count', 5);
  console.log('After set, count:', store.state.count);
  
  console.log('Test passed!');
} catch (error) {
  console.error('Test failed:', error);
  console.error('Stack:', (error as Error).stack);
}
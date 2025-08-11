// Test nested store updates
import { createStore } from '../src/advanced/state.js';

console.log('Starting nested test...');

try {
  const store = createStore({
    user: {
      name: 'John',
      age: 30
    }
  });
  
  console.log('Store created');
  console.log('Initial user.name:', store.state.user.name);
  console.log('Initial user.age:', store.state.user.age);
  console.log('User object:', store.state.user);
  
  store.setIn(['user', 'name'], 'Jane');
  console.log('After setIn, user.name:', store.state.user.name);
  console.log('User object after setIn:', store.state.user);
  
  store.updateIn(['user', 'age'], age => age + 1);
  console.log('After updateIn, user.age:', store.state.user.age);
  
  console.log('Test passed!');
} catch (error) {
  console.error('Test failed:', error);
  console.error('Stack:', (error as Error).stack);
}
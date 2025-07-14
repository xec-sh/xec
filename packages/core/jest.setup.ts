// Common test setup
import { afterAll, beforeAll } from 'vitest';

// Configure test timeout
beforeAll(() => {
  // Setup code here if needed
});

afterAll(() => 
  // Give a small delay for cleanup
   new Promise(resolve => setTimeout(resolve, 100))
);
import { jest } from '@jest/globals';

// Common test setup
jest.setTimeout(30000);

// Force exit after tests
// afterAll(() => 
//   // Give a small delay for cleanup
//    new Promise(resolve => setTimeout(resolve, 100))
// );
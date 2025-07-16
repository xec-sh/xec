import { jest } from '@jest/globals';

// Mock console methods to prevent noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};

// Mock process.exit to prevent tests from exiting
jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
  throw new Error(`process.exit called with code ${code}`);
});

// Set up environment variables for tests
process.env.NODE_ENV = 'test';
process.env.XEC_TEST_MODE = 'true';

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

// Clean up after all tests
afterAll(() => {
  jest.restoreAllMocks();
});
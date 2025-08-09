/**
 * Vitest setup file for Terex tests
 * Handles memory leaks, event listeners, and test environment setup
 */

import { EventEmitter } from 'events';
import { afterEach, beforeEach } from 'vitest';

// Increase max listeners globally to prevent memory leak warnings
EventEmitter.defaultMaxListeners = 50;

// Store original process settings
const originalMaxListeners = process.stdout.getMaxListeners();
const originalStderrListeners = process.stderr.getMaxListeners();

beforeEach(() => {
  // Set higher limits for test environment
  process.stdout.setMaxListeners(50);
  process.stderr.setMaxListeners(50);
  
  // Clear any remaining timers (vitest doesn't need explicit clearing)
});

afterEach(() => {
  // Restore original limits
  process.stdout.setMaxListeners(originalMaxListeners);
  process.stderr.setMaxListeners(originalStderrListeners);
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  // Clear any remaining timers (vitest doesn't need explicit clearing)
});

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.warn('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions in tests  
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});
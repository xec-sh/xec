/**
 * Test setup file
 * Configures the test environment for Aura tests
 */

import { vi, beforeAll, afterEach } from 'vitest';

// Polyfill requestAnimationFrame for Node environment
beforeAll(() => {
  if (typeof global.requestAnimationFrame === 'undefined') {
    global.requestAnimationFrame = (callback: FrameRequestCallback) =>
      setTimeout(callback, 16) as unknown as number // ~60fps
      ;
  }

  if (typeof global.cancelAnimationFrame === 'undefined') {
    global.cancelAnimationFrame = (id: number) => {
      clearTimeout(id);
    };
  }
});

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
  vi.clearAllTimers();
});
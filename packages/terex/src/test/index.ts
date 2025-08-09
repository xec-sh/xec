/**
 * Test infrastructure for Terex
 * Exports all testing utilities for component testing
 */

// Re-export stripAnsi from utils
export { stripAnsi } from '../utils/index.js';
export { TestHarness, createTestHarness } from './test-harness.js';
export { MockTerminal, createMockTerminal } from './mock-terminal.js';

export {
  Keys,
  Mouse,
  Timing,
  TestData,
  formatDiff,
  extractText,
  StyleMatchers,
  OutputAssertions,
  compareSnapshots,
  serializeSnapshot
} from './test-utils.js';

// TTY test wrapper utilities
export {
  withTTY,
  MockTTYStream,
  setupGlobalTTY,
  createMockProcess,
  MockTTYInputStream,
  TTYTestEnvironment,
  createMockTTYStream,
  createTTYTestEnvironment,
  createMockTTYInputStream
} from './tty-wrapper.js';

// Re-export types needed for testing
export type {
  Key,
  Style,
  Color,
  Position,
  Component,
  MouseEvent,
  TerminalSize,
  TestHarness as ITestHarness,
  MockTerminal as IMockTerminal
} from '../core/types.js';
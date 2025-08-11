/**
 * Terminal E2E Testing Framework
 * Complete solution for testing terminal UI applications
 */

// Core exports
export * from './core/types.js';
export * from './core/utils.js';

// Main tester
import { TmuxTester } from './tmux-tester.js';

// Adapters
export * from './adapters/index.js';

// High-level helpers
export * from './helpers/test-runner.js';
export * from './helpers/interactions.js';
export { TmuxTester } from './tmux-tester.js';
export { BunAdapter } from './adapters/bun.js';

export { NodeAdapter } from './adapters/node.js';
export { DenoAdapter } from './adapters/deno.js';

// Re-export commonly used functions
export { TmuxTester as default } from './tmux-tester.js';

// Test framework integrations
// Note: Only import vitest integration when running under vitest
// export { setupVitestMatchers } from './integrations/vitest.js';
// Snapshot management
export { SnapshotManager, getSnapshotManager, resetSnapshotManager } from './snapshot/snapshot-manager.js';

export type { SnapshotOptions } from './snapshot/snapshot-manager.js';

/**
 * Quick start function to create a tester
 */
export function createTester(command: string | string[], options?: {
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  cwd?: string;
  debug?: boolean;
  shell?: string;
  sessionName?: string;
  recordingEnabled?: boolean;
  snapshotDir?: string;
}) {
  const commandArray = typeof command === 'string' ? command.split(' ') : command;
  
  return new TmuxTester({
    command: commandArray,
    size: { cols: options?.cols ?? 80, rows: options?.rows ?? 24 },
    env: options?.env,
    cwd: options?.cwd,
    debug: options?.debug,
    shell: options?.shell,
    sessionName: options?.sessionName,
    recordingEnabled: options?.recordingEnabled,
    snapshotDir: options?.snapshotDir
  });
}
import { createExecutionEngine } from './index.js';

import type { CallableExecutionEngine } from './types.js';

// Create and export a global enhanced $ with all features
export const $ = createExecutionEngine() as CallableExecutionEngine & {
  // Add type definitions for all enhanced features
  withRetry: (options: any) => any;
  pipe: (command: any) => any;
  parallel: any;
  template: (template: string, options?: any) => any;
  templates: any;
  stream: (command: any, options?: any) => any;
  tempFile: (options?: any) => any;
  tempDir: (options?: any) => any;
  withTempFile: (fn: any, options?: any) => Promise<any>;
  withTempDir: (fn: any, options?: any) => Promise<any>;
  question: (prompt: string, options?: any) => Promise<string>;
  confirm: (prompt: string, defaultValue?: boolean) => Promise<boolean>;
  select: (prompt: string, choices: string[]) => Promise<string>;
  interactive: () => any;
  spinner: (text?: string) => any;
  withSpinner: (text: string, fn: any) => Promise<any>;
};

export * from './utils/pipe.js';
export * from './utils/temp.js';
// Re-export all utilities for convenience
export * from './utils/retry.js';
export * from './utils/within.js';
export * from './utils/stream.js';
export * from './utils/parallel.js';
export * from './utils/templates.js';
export * from './utils/interactive.js';

// Export execution engine creator
export { createExecutionEngine } from './index.js';
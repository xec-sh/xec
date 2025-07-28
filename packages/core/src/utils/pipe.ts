/**
 * Pipe utilities and helpers for ProcessPromise
 * 
 * The pipe functionality is now built into ProcessPromise.
 * Use the .pipe() method on ProcessPromise for piping operations.
 * 
 * @example
 * // Template literal piping
 * await $`echo "hello"`.pipe`tr a-z A-Z`;
 * 
 * // Stream piping
 * await $`echo "data"`.pipe(transformStream);
 * 
 * // Using pipe utilities
 * await $`echo "hello"`.pipe(pipeUtils.toUpperCase());
 */

// Re-export pipe utilities from the core implementation
export { pipeUtils } from '../core/pipe-implementation.js';

// Export types used by pipe functionality
export type { PipeTarget, PipeOptions as ProcessPipeOptions } from '../core/pipe-implementation.js';
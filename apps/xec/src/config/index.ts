/**
 * Configuration system exports
 */

export * from './types.js';
export * from './utils.js';
export * from './task-parser.js';
export * from './task-manager.js';
export * from './task-executor.js';
export * from './target-resolver.js';
export * from './config-validator.js';
export * from './configuration-manager.js';
export * from './variable-interpolator.js';

export { TaskParser } from './task-parser.js';
export { TaskManager } from './task-manager.js';
export { TaskExecutor } from './task-executor.js';
export { TargetResolver } from './target-resolver.js';
export { ConfigValidator } from './config-validator.js';
// Re-export main classes for convenience
export { ConfigurationManager } from './configuration-manager.js';
export { VariableInterpolator } from './variable-interpolator.js';
/**
 * Xec Programmatic API
 * 
 * This module exports the public API for programmatic usage of xec functionality.
 * Enables integration with scripts, automation tools, and external applications.
 */

export { tasks, TaskAPI } from './task-api.js';
// Export individual APIs
export { config, ConfigAPI } from './config-api.js';
export { ScriptContext } from './script-context.js';
export { targets, TargetAPI } from './target-api.js';

export type {
  TaskResult,
  TaskOptions,
  TaskDefinition,
  TaskExecutionOptions
} from './types.js';

export type {
  Target,
  TargetInfo,
  CopyOptions,
  ForwardOptions,
  ExecutionResult
} from './types.js';

// Export types
export type {
  ConfigValue,
  ProfileOptions,
  ConfigurationOptions,
  InterpolationContext
} from './types.js';
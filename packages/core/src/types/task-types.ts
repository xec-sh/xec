/**
 * Task-related types for Xec
 * This file contains all task-related type definitions
 */

import type { CallableExecutionEngine } from '@xec/ush';

import type { EnvironmentInfo } from './environment-types.js';
import type { 
  Logger, 
  Metadata, 
  Variables, 
  Condition,
  TaskResult,
  RetryConfig,
  TaskHandler,
  HostSelector,
  EnvironmentType
} from './base-types.js';

// Re-export TaskHandler from base-types
export type { TaskHandler } from './base-types.js';

/**
 * Core Task definition
 * This is the unified task interface used throughout the system
 */
export interface Task {
  id: string;
  name: string;
  description?: string;
  handler: TaskHandler;
  options: TaskOptions;
  dependencies: string[];
  tags: string[];
  metadata?: Metadata;
  // Environment hints for optimization
  hints?: {
    preferredEnvironments?: EnvironmentType[];
    unsupportedEnvironments?: EnvironmentType[];
  };
}

/**
 * Task options configuration
 */
export interface TaskOptions {
  retry?: RetryConfig;
  timeout?: number;
  continueOnError?: boolean;
  when?: Condition;
  unless?: Condition;
  hosts?: HostSelector;
  vars?: Variables;
  register?: string;
  loop?: string | string[] | number;
  delegate?: string;
  become?: boolean;
  becomeUser?: string;
  tags?: string[];
  parallel?: boolean;
}

/**
 * Task execution context
 * This is the context available to task handlers during execution
 */
export interface TaskContext {
  // Identification
  taskId: string;
  recipeId?: string;
  runId?: string;
  
  // Variables and state
  vars: Variables;
  secrets?: Record<string, any>;
  state?: Map<string, any>;
  
  // Execution environment
  $?: CallableExecutionEngine;  // Universal command execution
  env?: EnvironmentInfo;        // Environment info
  host?: string;                // Target host for execution
  phase?: string;               // Current execution phase
  attempt?: number;             // Retry attempt number
  
  // Utilities
  logger: Logger;               // Task-scoped logger
  
  // Task parameters (for environment-aware tasks)
  params?: Record<string, any>;
  
  // Helper methods (provided by context globals)
  getVar?: (name: string) => any;
  setVar?: (name: string, value: any) => void;
  template?: (template: string) => string;
}

/**
 * Extended task context with standard library
 * This is the full context available when standard library is loaded
 */
export interface ExtendedTaskContext extends TaskContext {
  // Standard library modules
  fs: any;       // FileSystem interface
  http: any;     // HttpClient interface
  os: any;       // OSInfo interface
  proc: any;     // Process interface
  pkg: any;      // Package interface
  svc: any;      // Service interface
  net: any;      // Network interface
  crypto: any;   // Crypto interface
  time: any;     // Time interface
  json: any;     // JSON utilities
  yaml: any;     // YAML utilities
  env_vars: any; // Environment variables (renamed from env to avoid conflict)
  
  // Note: template is already in base TaskContext as a helper method
}

/**
 * Task builder configuration
 */
export interface TaskBuilderOptions {
  name?: string;
  description?: string;
  timeout?: number;
  retry?: RetryConfig;
  tags?: string[];
  when?: string | ((context: TaskContext) => boolean);
  unless?: string | ((context: TaskContext) => boolean);
  vars?: Variables;
}

/**
 * Task execution result - extends base TaskResult
 * (TaskResult already contains duration, attempts, skipped, skipReason)
 */
export interface TaskExecutionResult extends TaskResult {
  taskId: string;
}

/**
 * Task registry entry
 */
export interface TaskRegistryEntry {
  task: Task;
  module?: string;
  overrides?: string[];
  priority?: number;
}

/**
 * Task definition for module exports
 */
export interface TaskDefinition {
  name: string;
  description?: string;
  handler: TaskHandler;
  options?: TaskOptions;
  parameters?: any; // Schema for parameters
  returns?: any; // Schema for return value
}

/**
 * Skip task error - thrown to skip task execution
 */
export class SkipTaskError extends Error {
  constructor(public reason: string) {
    super(`Task skipped: ${reason}`);
    this.name = 'SkipTaskError';
  }
}
/**
 * Core base types for Xec
 * This file contains the fundamental types used throughout the system
 */

/**
 * Common type aliases
 */
export type Variables = Record<string, any>;
export type Helper = (...args: any[]) => any;
export type JSONSchema = Record<string, any>;
export type Condition = string | boolean | (() => boolean | Promise<boolean>);
export type HostSelector = string | string[] | ((context: any) => string[]);

/**
 * Logger interface used throughout the system
 */
export interface Logger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  child(options: { name?: string; [key: string]: any }): Logger;
}

/**
 * Base Task Handler function signature
 * TaskHandler can accept TaskContext and return TaskResult or any value
 */
export type TaskHandler = (context: any) => Promise<any> | any;

/**
 * Core Task Result structure
 */
export interface TaskResult {
  success?: boolean;
  changed?: boolean;
  output?: string;
  data?: any;
  error?: Error;
  duration?: number;
  attempts?: number;
  skipped?: boolean;
  skipReason?: string;
  dryRun?: boolean;
  hosts?: Record<string, TaskResult>;
  errors?: Error[];
}

/**
 * Retry configuration for tasks
 */
export interface RetryConfig {
  maxAttempts: number;
  delay?: number;
  backoffMultiplier?: number;
  initialDelay?: number;
  maxDelay?: number;
  jitter?: boolean;
  retryableErrors?: string[];
}

/**
 * Hook type for various lifecycle events
 */
export type Hook = () => Promise<void> | void;
export type ErrorHook = (error: Error, context: any) => Promise<void> | void;

/**
 * Common metadata structure
 */
export interface Metadata {
  createdAt?: Date;
  updatedAt?: Date;
  version?: string;
  author?: string;
  tags?: string[];
  [key: string]: any;
}

/**
 * Phase definition for recipe execution
 */
export interface Phase {
  name: string;
  description?: string;
  tasks: string[];              // Task names to execute
  parallel?: boolean;           // Execute tasks in parallel
  continueOnError?: boolean;    // Continue on task failure
  dependsOn?: string[];         // Phase dependencies
  optional?: boolean;           // Phase is optional
}

/**
 * Event structure for event-driven components
 */
export interface BaseEvent<T = any> {
  id: string;
  type: string;
  timestamp: Date;
  payload: T;
  metadata?: Record<string, any>;
  aggregateId?: string;
  version?: number;
}

/**
 * Validation result structure
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings?: ValidationWarning[];
}

export interface ValidationError {
  path?: string;
  message: string;
  code?: string;
}

export interface ValidationWarning {
  path?: string;
  message: string;
  code?: string;
}


/**
 * Platform types
 */
export type OSPlatform = 'darwin' | 'linux' | 'win32' | 'windows' | 'freebsd' | 'openbsd' | 'sunos' | 'android';
export type Architecture = 'x64' | 'arm64' | 'arm' | 'ppc64' | 's390x';

/**
 * Environment type definitions
 */
export type EnvironmentType = 'local' | 'remote' | 'container' | 'kubernetes' | 'lambda' | 'edge' | 'ssh' | 'docker' | 'aws' | 'azure' | 'gcp';

/**
 * Common options interfaces
 */
export interface TimeoutOptions {
  timeout?: number;
  signal?: AbortSignal;
}

export interface ExecutionOptions extends TimeoutOptions {
  dryRun?: boolean;
  parallel?: boolean;
  maxConcurrency?: number;
}
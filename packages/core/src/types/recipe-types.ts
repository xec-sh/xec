/**
 * Recipe-related types for Xec
 * This file contains all recipe system type definitions
 */

import type { Task } from './task-types.js';
import type { Hook, Phase, Metadata, Variables, ErrorHook } from './base-types.js';

/**
 * Core Recipe interface
 * This is the unified recipe interface used throughout the system
 */
export interface Recipe {
  // Identification
  id: string;
  name: string;
  version?: string;
  description?: string;
  
  // Structure
  tasks: Map<string, Task>;
  phases?: Map<string, Phase>;
  
  // Configuration
  vars?: Variables;
  hosts?: string[];
  tags?: string[];
  
  // Lifecycle hooks
  hooks?: RecipeHooks;
  
  // Error handling
  errorHandler?: (error: Error) => Promise<void> | void;
  
  // Metadata
  metadata?: RecipeMetadata;
}

/**
 * Recipe lifecycle hooks
 */
export interface RecipeHooks {
  // Recipe-level hooks
  before?: Hook[];
  after?: Hook[];
  
  // Task-level hooks (simplified names)
  beforeEach?: (task: Task) => Promise<void> | void;
  afterEach?: (task: Task, result: any) => Promise<void> | void;
  
  // Phase hooks
  beforePhase?: (context: PhaseContext) => Promise<void> | void;
  afterPhase?: (context: PhaseContext) => Promise<void> | void;
  
  // Error handling
  onError?: ErrorHook[];
  onSkip?: (context: SkipContext) => Promise<void> | void;
  
  // Finally hooks (always run)
  finally?: Hook[];
}

/**
 * Recipe metadata
 */
export interface RecipeMetadata extends Metadata {
  category?: string;
  keywords?: string[];
  requirements?: string[];
  outputs?: RecipeOutput[];
  examples?: RecipeExample[];
  requiredVars?: string[];
  varsSchema?: any; // JSONSchema
  modules?: string[];
}

/**
 * Recipe output definition
 */
export interface RecipeOutput {
  name: string;
  description?: string;
  type?: string;
  optional?: boolean;
}

/**
 * Recipe usage example
 */
export interface RecipeExample {
  name: string;
  description?: string;
  vars?: Variables;
  hosts?: string[];
}

/**
 * Recipe execution context
 */
export interface RecipeContext {
  recipeId: string;
  recipeName: string;
  runId: string;
  vars: Variables;
  startTime: Date;
  phase?: string;
  dryRun?: boolean;
}

/**
 * Phase execution context
 */
export interface PhaseContext extends RecipeContext {
  phaseName: string;
  tasks: string[];
  parallel?: boolean;
}

/**
 * Task hook context (extends RecipeContext, not TaskContext to avoid conflicts)
 */
export interface TaskHookContext extends RecipeContext {
  taskId: string;
  taskName: string;
  attempt?: number;
  // Full TaskContext is available through the task execution itself
}

/**
 * Error context for error hooks
 */
export interface ErrorContext extends RecipeContext {
  error: Error;
  taskId?: string;
  phase?: string;
  canRetry?: boolean;
}

/**
 * Skip context for skip hooks
 */
export interface SkipContext extends RecipeContext {
  taskId: string;
  reason: string;
}

/**
 * Recipe builder options
 */
export interface RecipeBuilderOptions {
  name?: string;
  version?: string;
  description?: string;
  vars?: Variables;
  hosts?: string[];
  tags?: string[];
  strict?: boolean;
}

/**
 * Recipe execution options
 */
export interface RecipeExecutionOptions {
  vars?: Variables;
  hosts?: string[];
  tags?: string[];
  dryRun?: boolean;
  parallel?: boolean;
  maxConcurrency?: number;
  continueOnError?: boolean;
  timeout?: number;
  skipTags?: string[];
  onlyTags?: string[];
}

/**
 * Recipe execution result
 */
export interface RecipeExecutionResult {
  recipeId: string;
  runId: string;
  success: boolean;
  duration: number;
  tasksRun: number;
  tasksSkipped: number;
  tasksFailed: number;
  outputs?: Variables;
  error?: Error;
  taskResults?: Map<string, any>; // Individual task results
}

/**
 * Recipe validation result
 */
export interface RecipeValidationResult {
  valid: boolean;
  errors: RecipeValidationError[];
  warnings: RecipeValidationWarning[];
}

/**
 * Recipe validation error
 */
export interface RecipeValidationError {
  type: 'structure' | 'task' | 'phase' | 'dependency' | 'variable';
  message: string;
  details?: any;
}

/**
 * Recipe validation warning
 */
export interface RecipeValidationWarning {
  type: string;
  message: string;
  details?: any;
}

/**
 * Recipe import/export format
 */
export interface RecipeExport {
  version: string;
  recipe: {
    name: string;
    version?: string;
    description?: string;
    vars?: Variables;
    tasks: Array<{
      id: string;
      task: any; // Serialized task
    }>;
    phases?: Array<{
      name: string;
      phase: Phase;
    }>;
    hooks?: RecipeHooks;
    metadata?: RecipeMetadata;
  };
}
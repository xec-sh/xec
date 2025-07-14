/**
 * Legacy adapters for backward compatibility with old API tests
 */

import type { Task, Recipe, Module, Variables, JSONSchema } from '../core/types.js';

/**
 * Legacy Task interface expected by tests
 */
export interface LegacyTask {
  id: string;
  name?: string;
  description?: string;
  handler: any;
  depends?: string[];
  hosts?: string[];
  phase?: string;
  tags?: string[];
  vars?: Variables;
  requiredVars?: string[];
  varsSchema?: JSONSchema;
  when?: any;
  unless?: any;
  timeout?: number;
  retry?: any;
  parallel?: boolean;
  continueOnError?: boolean;
  rollback?: any;
  meta?: Record<string, any>;
}

/**
 * Legacy Recipe interface expected by tests
 */
export interface LegacyRecipe {
  id: string;
  name: string;
  version: string;
  description?: string;
  tasks: LegacyTask[];
  modules: Module[];
  vars: Variables;
  author?: string;
  tags?: string[];
  requiredVars?: string[];
  varsSchema?: JSONSchema;
  meta: Record<string, any>;
  hooks: Record<string, any>;
}

/**
 * Convert new Task to legacy format
 */
export function taskToLegacy(task: Task): LegacyTask {
  return {
    id: task.id,
    name: task.name,
    description: task.description,
    handler: task.handler,
    depends: task.dependencies,
    hosts: Array.isArray(task.options.hosts) ? task.options.hosts : undefined,
    phase: task.metadata?.phase,
    tags: task.tags,
    vars: task.options.vars,
    requiredVars: task.metadata?.requiredVars,
    varsSchema: task.metadata?.varsSchema,
    when: task.options.when,
    unless: task.metadata?.unless,
    timeout: task.options.timeout,
    retry: task.options.retry,
    parallel: task.options.parallel,
    continueOnError: task.options.continueOnError,
    rollback: task.metadata?.rollback,
    meta: task.metadata
  };
}

/**
 * Convert new Recipe to legacy format
 */
export function recipeToLegacy(recipe: Recipe): LegacyRecipe {
  const tasks = Array.from(recipe.tasks.values()).map(taskToLegacy);
  
  return {
    id: recipe.id,
    name: recipe.name,
    version: recipe.version || '1.0.0',
    description: recipe.description,
    tasks,
    modules: recipe.metadata?.modules || [],
    vars: recipe.vars || {},
    author: recipe.metadata?.author,
    tags: recipe.metadata?.tags || [],
    requiredVars: recipe.metadata?.requiredVars || [],
    varsSchema: recipe.metadata?.varsSchema,
    meta: recipe.metadata || {},
    hooks: recipe.hooks || {}
  };
}
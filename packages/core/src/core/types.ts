/**
 * Core type definitions for Xec framework
 * 
 * This file re-exports consolidated types from the types directory
 * and defines additional core-specific types.
 */

// Re-export all base types
export * from '../types/base-types.js';

// Re-export all task types
export * from '../types/task-types.js';

// Re-export all recipe types
export * from '../types/recipe-types.js';

// Re-export all module types
export * from '../types/module-types.js';

// Re-export all pattern types
export * from '../types/pattern-types.js';

// Don't re-export errors here as they are exported from types

import type { Variables } from '../types/base-types.js';
// ExecutionContext extends TaskContext with additional fields for recipe execution
import type { TaskContext } from '../types/task-types.js';

export interface ExecutionContext extends TaskContext {
  recipeId: string;              // Recipe ID (required for execution)
  runId: string;                 // Run ID (required for execution)
  globalVars: Variables;         // Global variables
  dryRun: boolean;               // Dry-run mode
  startTime: Date;               // Start time
  parallel?: boolean;            // Parallel execution
  maxRetries?: number;           // Max retries
  timeout?: number;              // Timeout
  hosts?: string[];              // Host list
}

// Execution result specific to the engine
export interface ExecutionResult {
  success: boolean;
  results: Map<string, any>;
  errors: Map<string, Error>;
  skipped: Set<string>;
  duration: number;
  status: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
  };
  // Legacy aliases for compatibility
  taskResults?: Map<string, any>;
  error?: Error;
}

// State management interfaces - these are core-specific
export interface StateStore {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  list(prefix?: string): Promise<string[]>;
  clear(): Promise<void>;
}

export interface LockManager {
  acquire(key: string, ttl?: number): Promise<Lock>;
  release(lock: Lock): Promise<void>;
  extend(lock: Lock, ttl: number): Promise<void>;
  isLocked(key: string): Promise<boolean>;
}

export interface Lock {
  key: string;
  token: string;
  acquired: Date;
  ttl?: number;
}

export interface EventStore {
  append(event: Event): Promise<void>;
  getEvents(filter?: EventFilter): Promise<Event[]>;
  getEventsByAggregate(aggregateId: string): Promise<Event[]>;
  getLastEvent(aggregateId: string): Promise<Event | null>;
  subscribe(handler: EventHandler): () => void;
}

export interface Event {
  id: string;
  aggregateId: string;
  type: string;
  data: any;
  metadata?: any;
  timestamp: Date;
  version: number;
}

export interface EventFilter {
  aggregateId?: string;
  type?: string;
  fromVersion?: number;
  toVersion?: number;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
}

export type EventHandler = (event: Event) => void | Promise<void>;
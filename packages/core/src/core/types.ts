/**
 * Core type definitions for Xec framework
 */

// Logger interface
export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  child(context: any): Logger;
}

// Variables and JSON Schema
export type Variables = Record<string, any>;
export type JSONSchema = Record<string, any>;
export type Condition = string | boolean | (() => boolean | Promise<boolean>);
export type HostSelector = string | string[] | ((context: TaskContext) => string[]);

// Task interfaces
export interface TaskOptions {
  retry?: RetryConfig;
  timeout?: number;
  when?: Condition;
  unless?: Condition;
  hosts?: HostSelector;
  parallel?: boolean;
  continueOnError?: boolean;
  vars?: Variables;
}

export interface Task {
  id: string;                    // Unique identifier
  name: string;                  // Human-readable name
  description?: string;          // Task description
  handler: TaskHandler;          // Execution function
  options: TaskOptions;          // Execution options
  dependencies: string[];        // Dependencies on other tasks
  tags: string[];               // Tags for grouping
  metadata?: Record<string, any>; // Arbitrary metadata
}

export interface RetryConfig {
  maxAttempts: number;
  delay?: number;
  backoffMultiplier?: number;
  maxDelay?: number;
  jitter?: boolean;
}

// Task execution
export type TaskHandler = (context: TaskContext) => Promise<TaskResult> | TaskResult;
export type TaskResult = any;

export interface TaskContext {
  taskId: string;
  vars: Variables;
  host?: string;
  phase?: string;
  attempt?: number;
  logger: Logger;
}

export interface ExecutionContext extends TaskContext {
  recipeId: string;              // ID рецепта
  runId: string;                 // ID запуска
  globalVars: Record<string, any>; // Глобальные переменные
  secrets: Record<string, any>;  // Секреты
  state: Map<string, any>;       // Состояние
  dryRun: boolean;               // Режим dry-run
  verbose: boolean;              // Подробный вывод
  startTime: Date;               // Время начала
  parallel?: boolean;            // Параллельное выполнение
  maxRetries?: number;           // Максимальное количество повторов
  timeout?: number;              // Таймаут
  hosts?: string[];              // Список хостов
  tags?: string[];               // Теги
  helpers?: Record<string, any>; // Хелперы
}

// Recipe interfaces
export interface RecipeMetadata {
  name: string;
  version?: string;
  description?: string;
  author?: string;
  tags?: string[];
  requiredVars?: string[];
  varsSchema?: JSONSchema;
  modules?: Module[];
  [key: string]: any;
}

export type Hook = () => Promise<void> | void;
export type ErrorHook = (error: Error, context: any) => Promise<void> | void;

export interface RecipeHooks {
  before?: Hook[];              // Run before all tasks
  after?: Hook[];               // Run after all tasks
  beforeEach?: (task: Task) => Promise<void> | void; // Run before each task
  afterEach?: (task: Task, result: TaskResult) => Promise<void> | void; // Run after each task
  onError?: ErrorHook[];        // Run on any error
  finally?: Hook[];             // Always run at the end
}

export interface Recipe {
  id: string;                   // Unique identifier
  name: string;                 // Human-readable name
  version?: string;             // Semantic version
  description?: string;         // Recipe description
  tasks: Map<string, Task>;     // Tasks indexed by name
  phases?: Map<string, Phase>;  // Execution phases
  vars?: Variables;             // Default variables
  hooks?: RecipeHooks;          // Lifecycle hooks
  metadata?: RecipeMetadata;    // Additional metadata
  errorHandler?: (error: Error) => Promise<void> | void; // Error handler
}

// Phase interfaces
export interface Phase {
  name: string;
  description?: string;         // Phase description
  tasks: string[];              // Task names to execute
  parallel?: boolean;           // Execute tasks in parallel
  continueOnError?: boolean;    // Continue on task failure
  dependsOn?: string[];         // Phase dependencies
  optional?: boolean;           // Phase is optional
}

// Module interfaces
export interface Module {
  name: string;
  version: string;
  description?: string;
  exports: ModuleExports;
  dependencies?: string[];
  metadata?: Record<string, any>;
}

export interface ModuleExports {
  tasks?: Record<string, Task>;
  recipes?: Record<string, Recipe>;
  helpers?: Record<string, (...args: any[]) => any>;
  patterns?: Record<string, any>;
  integrations?: Record<string, any>;
}

export interface ExecutionResult {
  success: boolean;
  results: Map<string, TaskResult>;
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
  taskResults?: Map<string, TaskResult>;
  error?: Error;
}

// Integration interfaces
export interface IntegrationAdapter {
  name: string;
  version: string;
  initialize(config: any): Promise<void>;
  getTasks(): Record<string, Task>;
  getHelpers(): Record<string, (...args: any[]) => any>;
  cleanup?(): Promise<void>;
}

// State management interfaces
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

// Pattern interfaces
export interface Pattern {
  name: string;
  description?: string;
  apply(context: PatternContext): Promise<PatternResult>;
}

export interface PatternContext {
  recipe: Recipe;
  vars: Variables;
  options?: any;
}

export interface PatternResult {
  success: boolean;
  message?: string;
  data?: any;
}

// Helper type
export type Helper = (...args: any[]) => any;

// Export all types
export * from './errors.js';
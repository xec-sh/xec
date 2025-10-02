/**
 * Type definitions for @xec-sh/loader
 * @module @xec-sh/loader/types
 */

// Cache types
export type {
  Cache,
  CacheEntry,
  CacheStats,
  MemoryCacheOptions,
  HybridCacheOptions,
  FileSystemCacheOptions,
} from './cache.js';

// Execution types
export type {
  TargetInfo,
  ScriptContext,
  ExecutionResult,
  ExecutionOptions,
  EvaluationOptions,
  ScriptLoaderOptions,
  ExecutionContextOptions,
} from './execution.js';

// Runtime types
export type {
  ProcessInfo,
  REPLOptions,
  REPLCommand,
  RetryOptions,
  InjectOptions,
  RuntimeOptions,
  SpinnerOptions,
  InjectorOptions,
  RuntimeUtilities,
} from './runtime.js';

// Module types
export type {
  ModuleType,
  CDNProvider,
  ModuleResolver,
  ModuleSpecifier,
  ModuleResolution,
  TransformedModule,
  ModuleFetchOptions,
  ModuleLoaderOptions,
  ModuleExecutionOptions,
} from './module.js';

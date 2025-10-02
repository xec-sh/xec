/**
 * Type definitions for @xec-sh/loader
 * @module @xec-sh/loader/types
 */

// Execution types
export type {
  TargetInfo,
  ScriptContext,
  ExecutionContextOptions,
  ExecutionOptions,
  ExecutionResult,
  ScriptLoaderOptions,
  EvaluationOptions,
} from './execution.js';

// Module types
export type {
  ModuleType,
  CDNProvider,
  ModuleSpecifier,
  ModuleLoaderOptions,
  ModuleResolution,
  ModuleResolver,
  ModuleFetchOptions,
  ModuleExecutionOptions,
  TransformedModule,
} from './module.js';

// Cache types
export type {
  CacheEntry,
  Cache,
  CacheStats,
  MemoryCacheOptions,
  FileSystemCacheOptions,
  HybridCacheOptions,
} from './cache.js';

// Runtime types
export type {
  RuntimeOptions,
  RuntimeUtilities,
  SpinnerOptions,
  RetryOptions,
  ProcessInfo,
  REPLOptions,
  REPLCommand,
  InjectorOptions,
  InjectOptions,
} from './runtime.js';

/**
 * @xec-sh/loader - Universal script loader and module system
 * @module @xec-sh/loader
 */

// Export types
export type * from './types/index.js';

// Export core modules
export {
  ExecutionContext,
  ScriptExecutor,
  CodeEvaluator,
} from './core/index.js';

// Export module system
export {
  ModuleLoader,
  ModuleFetcher,
  ModuleExecutor,
  MemoryCache,
  FileSystemCache,
  HybridCache,
  LocalModuleResolver,
  CDNModuleResolver,
  NodeModuleResolver,
  CompositeModuleResolver,
} from './module/index.js';

// Re-export for convenience
export type {
  ExecutionOptions,
  ExecutionResult,
  ScriptLoaderOptions,
  EvaluationOptions,
  TargetInfo,
  ScriptContext,
} from './types/index.js';

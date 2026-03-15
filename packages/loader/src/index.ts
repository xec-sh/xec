/**
 * @xec-sh/loader - Universal script loader and module system
 * @module @xec-sh/loader
 */

// Export core modules
export {
  CodeEvaluator,
  ScriptExecutor,
  ExecutionContext,
} from './core/index.js';

// Export streaming execution
export {
  streamExecute,
  streamLines,
  type StreamEvent,
  type StreamingResult,
  type StreamingExecutionOptions,
} from './core/streaming-executor.js';

// Export watch system
export {
  FileWatcher,
  watchFiles,
  type FileChangeEvent,
  type WatchOptions,
} from './watch/index.js';

// Export plugin system
export {
  PluginManager,
  type LoaderPlugin,
} from './plugin/index.js';

// Export runtime utilities
export {
  ScriptRuntime,
  createRuntime,
  GlobalInjector,
  createInjector,
} from './runtime/index.js';

// Export REPL utilities
export {
  startREPL,
  REPLServer,
  REPLCommands,
  createCommands,
  createREPLServer,
  createBuiltinCommands,
} from './repl/index.js';

// Export transformation utilities
export {
  transformImports,
  createTransformer,
  ImportTransformer,
  TypeScriptTransformer,
  createImportTransformer,
} from './transform/index.js';

// Export module system
export {
  MemoryCache,
  HybridCache,
  ModuleLoader,
  ModuleFetcher,
  ModuleExecutor,
  FileSystemCache,
  CDNModuleResolver,
  NodeModuleResolver,
  LocalModuleResolver,
  CompositeModuleResolver,
} from './module/index.js';

// Export constants
export {
  NODE_BUILTIN_MODULES,
  NODE_BUILTIN_MODULES_SET,
  isNodeBuiltinModule,
  RESERVED_GLOBALS,
  RESERVED_GLOBALS_SET,
} from './constants.js';

// Export types
export type * from './types/index.js';

// Re-export for convenience
export type {
  TargetInfo,
  ScriptContext,
  ExecutionResult,
  ExecutionOptions,
  EvaluationOptions,
  ScriptLoaderOptions,
  ExecutionEngine,
  ExecutionEngineResult,
  ModuleExports,
  TargetConfig,
} from './types/index.js';

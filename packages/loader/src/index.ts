/**
 * @xec-sh/loader - Universal script loader and module system
 * @module @xec-sh/loader
 */

// Export types
export type * from './types/index.js';

// Export plugin system
export {
  PluginManager,
  type LoaderPlugin,
} from './plugin/index.js';

// Export core modules
export {
  CodeEvaluator,
  ScriptExecutor,
  ExecutionContext,
} from './core/index.js';

// Export runtime utilities
export {
  ScriptRuntime,
  createRuntime,
  GlobalInjector,
  createInjector,
} from './runtime/index.js';

// Export watch system
export {
  watchFiles,
  FileWatcher,
  type WatchOptions,
  type FileChangeEvent,
} from './watch/index.js';

// Export REPL utilities
export {
  startREPL,
  REPLServer,
  REPLCommands,
  createCommands,
  createREPLServer,
  createBuiltinCommands,
} from './repl/index.js';

// Export constants
export {
  RESERVED_GLOBALS,
  isNodeBuiltinModule,
  NODE_BUILTIN_MODULES,
  RESERVED_GLOBALS_SET,
  NODE_BUILTIN_MODULES_SET,
} from './constants.js';

// Export transformation utilities
export {
  transformImports,
  createTransformer,
  ImportTransformer,
  TypeScriptTransformer,
  createImportTransformer,
} from './transform/index.js';

// Export streaming execution
export {
  streamLines,
  streamExecute,
  type StreamEvent,
  type StreamingResult,
  type StreamingExecutionOptions,
} from './core/streaming-executor.js';

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

// Re-export for convenience
export type {
  TargetInfo,
  TargetConfig,
  ScriptContext,
  ModuleExports,
  ExecutionResult,
  ExecutionEngine,
  ExecutionOptions,
  EvaluationOptions,
  ScriptLoaderOptions,
  ExecutionEngineResult,
} from './types/index.js';

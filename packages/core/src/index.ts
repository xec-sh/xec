// Core type exports
export * from './types/index.js';

// Script system
export * from './script/index.js';
// Security
export * from './security/index.js';

// Resource Management
export * from './resources/index.js';

// Executor
export * from './engine/executor.js';

// Context builder
export * from './context/builder.js';

// Monitoring and Progress Tracking
export * from './monitoring/index.js';

// Engine
export * from './engine/scheduler.js';

// Integration Framework (External APIs, Databases, Message Queues, Webhooks)
export * from './integration/index.js';

// Integrations
export * from './integrations/index.js';

export * from './script/script-task.js';
// Phase builder
export * from './engine/phase-builder.js';

// Core validation
export { Validator } from './core/validation.js';
export { executeRecipe } from './engine/executor.js';

// Context management
export { ContextProvider } from './context/provider.js';

// Utils
export { Logger, createLogger } from './utils/logger.js';

export { createExecutionContext } from './context/builder.js';

// Built-in modules
export { builtinModules, getBuiltinModule, loadBuiltinModules } from './modules/builtin/index.js';

// State Management  
export { EventStore, StateManager, OptimizedEventStore, MemoryStorageAdapter } from './state/index.js';

export { recipe, Recipe, phaseRecipe, simpleRecipe, moduleRecipe, RecipeBuilder } from './dsl/recipe.js';

// DSL
export { log, task, noop, fail, wait, shell, group, script, parallel, sequence, TaskBuilder } from './dsl/task.js';
// Standard Library
export { 
  enhanceContext,
  StandardLibrary,
  createPartialStdlib,
  createStandardLibrary
} from './stdlib/index.js';

// Core engine types and functionality
export {
  Lock,
  Event,
  LockManager,
  EventFilter,
  EventHandler,
  ExecutionResult,
  ExecutionContext
} from './core/types.js';

// Module System
export { 
  TaskRunner,
  ModuleLoader,
  TaskRegistry,
  ModuleRegistry,
  HelperRegistry,
  PatternRegistry,
  EnvironmentManager,
  IntegrationRegistry
} from './modules/index.js';

// Global context functions
export { 
  env, 
  info, 
  warn, 
  skip, 
  when, 
  debug, 
  error, 
  retry, 
  getVar, 
  setVar, 
  secret, 
  unless, 
  getVars, 
  getHost, 
  getTags, 
  isDryRun, 
  getRunId, 
  getPhase, 
  getState, 
  setState, 
  hasState, 
  getHosts, 
  template, 
  getTaskId, 
  getHelper, 
  getAttempt, 
  clearState, 
  getRecipeId, 
  deleteState, 
  matchesHost, 
  matchesTags, 
  registerHelper 
} from './context/globals.js';

// Platform conversion helpers
export function toPlatform(platform: NodeJS.Platform): import('./types/base-types.js').OSPlatform {
  type OSPlatform = import('./types/base-types.js').OSPlatform;
  const mapping: Record<NodeJS.Platform, OSPlatform | undefined> = {
    'darwin': 'darwin',
    'linux': 'linux',
    'win32': 'win32',
    'freebsd': 'freebsd',
    'openbsd': 'openbsd',
    'sunos': 'sunos',
    'android': 'android',
    'aix': 'linux', // Map AIX to Linux
    'cygwin': 'win32', // Map Cygwin to Windows
    'netbsd': 'freebsd', // Map NetBSD to FreeBSD
    'haiku': 'linux' // Map Haiku to Linux
  };
  return mapping[platform] || 'linux';
}

export function toArchitecture(arch: NodeJS.Architecture): import('./types/base-types.js').Architecture {
  type Architecture = import('./types/base-types.js').Architecture;
  const mapping: Record<NodeJS.Architecture, Architecture | undefined> = {
    'x64': 'x64',
    'arm64': 'arm64',
    'arm': 'arm',
    'ppc64': 'ppc64',
    's390x': 's390x',
    'ia32': 'x64', // Map ia32 to x64
    'mips': 'arm', // Map mips to arm
    'mipsel': 'arm', // Map mipsel to arm
    'loong64': 'arm64', // Map loong64 to arm64
    'riscv64': 'arm64' // Map riscv64 to arm64
  };
  return mapping[arch] || 'x64';
}
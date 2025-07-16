// State Management
export * from './state/index.js';

// Standard Library
export * from './stdlib/index.js';

// Module System
export * from './modules/index.js';

// Security
export * from './security/index.js';

// Integrations
export * from './integrations/index.js';

// Monitoring and Progress Tracking
export * from './monitoring/index.js';

// Resource Management
export * from './resources/index.js';

// Core validation - export all except ValidationResult which conflicts with modules/interfaces
export {
  Validator,
  ValidationResult as CoreValidationResult
} from './core/validation.js';

export {
  executeRecipe,
  RecipeExecutor,
  ExecutorOptions,
  ExecutionResult
} from './engine/executor.js';

// Pattern types
export {
  CanaryOptions,
  BlueGreenOptions,
  DeploymentPattern,
  RollingUpdateOptions
} from './patterns/types.js';

// Context management
export {
  contextProvider,
  ContextProvider,
  ExecutionContext as ProviderExecutionContext
} from './context/provider.js';

// Engine
export {
  TaskScheduler,
  ScheduledTask,
  ExecutionPhase,
  createScheduler,
  SchedulerOptions
} from './engine/scheduler.js';

export {
  recipe,
  phaseRecipe,
  simpleRecipe,
  moduleRecipe,
  RecipeBuilder,
  RecipeBuilderOptions
} from './dsl/recipe.js';

export {
  buildPhases,
  PhaseBuilder,
  optimizePhases,
  PhaseDefinition,
  PhaseExecutionPlan
} from './engine/phase-builder.js';

export {
  scriptTask,
  loadScriptTasks,
  scriptTaskModule,
  dynamicScriptTask,
  ScriptTaskBuilder,
  ScriptTaskOptions
} from './script/script-task.js';

export {
  mergeContexts,
  ContextBuilder,
  createTaskContext,
  createRecipeContext,
  ContextBuilderOptions,
  createExecutionContext
} from './context/builder.js';

// DSL
export {
  task,
  noop,
  wait,
  shell,
  group,
  script,
  sequence,
  TaskBuilder,
  log as logTask,
  fail as failTask,
  TaskBuilderOptions,
  parallel as parallelTask
} from './dsl/task.js';

// Script system
export {
  ScriptHooks,
  $ as $script,
  defineScript,
  ScriptRunner,
  ScriptExports,
  ScriptContext,
  CommandOption,
  ScriptMetadata,
  CommandDefinition,
  createScriptContext,
  utils as scriptUtils
} from './script/index.js';

// Utils
export {
  createLogger,
  LoggerOptions,
  logWithPrefix,
  createTaskLogger,
  getDefaultLogger,
  setDefaultLogger,
  createRecipeLogger,
  createModuleLogger,
  Logger as LoggerImpl,
  createProgressLogger
} from './utils/logger.js';

// Core types - export all except Module which conflicts with modules/types
export {
  Task,
  Hook,
  Recipe,
  Logger,
  Variables,
  TaskError,
  JSONSchema,
  TaskResult,
  TaskHandler,
  TaskContext,
  RecipeHooks,
  RetryConfig,
  ModuleExports,
  ExecutionContext,
  Module as CoreModule
} from './core/types.js';

// Core errors - export all except TaskError which conflicts with types
export {
  XecError,
  LockError,
  StateError,
  isXecError,
  ModuleError,
  isTaskError,
  ContextError,
  TimeoutError,
  PatternError,
  NetworkError,
  ExecutionError,
  InventoryError,
  ValidationError,
  DependencyError,
  isExecutionError,
  NotificationError,
  isValidationError,
  ConfigurationError,
  TaskError as TaskExecutionError
} from './core/errors.js';

export {
  log,
  env,
  info,
  warn,
  fail,
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
  parallel,
  isVerbose,
  getTaskId,
  getHelper,
  getAttempt,
  clearState,
  getRecipeId,
  deleteState,
  matchesHost,
  matchesTags,
  SkipTaskError,
  registerHelper
} from './context/globals.js';


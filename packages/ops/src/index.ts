/**
 * @xec-sh/ops — DevOps operations library
 *
 * Complete DevOps automation toolkit usable as a standalone library.
 * The xec CLI is a thin wrapper over this package.
 *
 * @module @xec-sh/ops
 */

// ─── DevOps Automation ──────────────────────────────────────────────

export { Deployer, type DeployConfig, type DeployResult, type DeployStrategy, type DeployHooks, type DeployContext, type DeployTargetResult, type DeployHealthCheck } from './deploy/index.js';

export { HealthChecker, type HealthReport, type CheckResult, type HttpCheckOptions, type TcpCheckOptions, type CommandCheckOptions } from './health/index.js';

export { Pipeline, type PipelineResult, type PipelineContext, type StepConfig, type StepResult } from './pipeline/index.js';

export { Workflow, type WorkflowResult, type WorkflowContext, type TaskOptions as WorkflowTaskOptions, type TaskResult as WorkflowTaskResult } from './workflow/index.js';

export { Discovery, type DiscoveredTarget, type DockerDiscoveryOptions, type K8sDiscoveryOptions, type SshDiscoveryOptions } from './discovery/index.js';

export { retry, RetryPolicy, type RetryConfig, type BackoffStrategy } from './retry/index.js';

export { generateCompletion, type CompletionConfig, type Shell } from './completion/index.js';

// ─── Configuration ──────────────────────────────────────────────────

export { ConfigurationManager } from './config/configuration-manager.js';
export { ConfigValidator } from './config/config-validator.js';
export { VariableInterpolator } from './config/variable-interpolator.js';
export { TaskManager } from './config/task-manager.js';
export { TaskExecutor } from './config/task-executor.js';
export { TargetResolver } from './config/target-resolver.js';
export { getDefaultConfig, mergeWithDefaults, sortConfigKeys } from './config/defaults.js';
export type { Configuration, ResolvedTarget, TargetConfig, TargetType, TaskDefinition, CommandConfig, DockerDefaults, ContainerConfig, PodConfig, HostConfig, ConfigManagerOptions } from './config/types.js';

// ─── Secrets ────────────────────────────────────────────────────────

export { SecretManager } from './secrets/manager.js';
export { generateSecret, encrypt, decrypt } from './secrets/crypto.js';
export * from './secrets/types.js';

// ─── Scripting API ──────────────────────────────────────────────────

export * from './api/index.js';

// ─── Script Loader ──────────────────────────────────────────────────

import { getScriptLoader as _getScriptLoader } from './adapters/loader-adapter.js';
export { getScriptLoader, ScriptLoader } from './adapters/loader-adapter.js';
export type { ExecutionOptions } from './adapters/loader-adapter.js';

/** Execute a script file — convenience wrapper */
export async function executeScript(path: string, options?: Record<string, unknown>): Promise<unknown> {
  return _getScriptLoader().executeScript(path, options as any);
}

/** Evaluate inline code — convenience wrapper */
export async function evaluateCode(code: string, options?: Record<string, unknown>): Promise<unknown> {
  return _getScriptLoader().evaluateCode(code, options as any);
}

/** Start interactive REPL — convenience wrapper */
export async function startRepl(options?: Record<string, unknown>): Promise<void> {
  return _getScriptLoader().startRepl(options as any);
}

// ─── Utilities ──────────────────────────────────────────────────────

export { parseTimeout, parseInterval } from './utils/time.js';
export { validateOptions } from './utils/validation.js';
export { FileHelpers, selectFiles, selectDirectory, findFiles } from './utils/file-helpers.js';
export { handleError } from './utils/error-handler.js';
export { enhanceError, EnhancedExecutionError } from './utils/enhanced-error.js';
export { OutputFormatter } from './utils/output-formatter.js';
export { formatDuration, formatBytes } from './utils/formatters.js';
export { createTargetEngine, isDirectCommand, executeDirectCommand } from './utils/direct-execution.js';
export { getModuleCacheDir } from './config/utils.js';

// Re-export script utilities (cd, pwd, env, echo, sleep, etc.)
export {
  $, cd, pwd, env, setEnv, exit, kill, sleep, echo, quote,
  within, template, csv, diff, parseArgs, loadEnv, ps,
  which, fetch, tmpdir, tmpfile, glob, fs, os, path, yaml,
  kit, log, prism, spinner, retry as scriptRetry,
} from './utils/script-utils.js';

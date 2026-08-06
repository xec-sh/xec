/**
 * @xec-sh/ops — DevOps operations library
 *
 * Complete DevOps automation toolkit usable as a standalone library.
 * The xec CLI is a thin wrapper over this package.
 *
 * @module @xec-sh/ops
 */

// ─── Operations ─────────────────────────────────────────────────────

export * from './api/index.js';

export { retry, RetryPolicy, type RetryConfig, type BackoffStrategy } from './retry/index.js';
export { Pipeline, type StepConfig, type StepResult, type PipelineResult, type PipelineContext } from './pipeline/index.js';
export { Discovery, type DiscoveredTarget, type K8sDiscoveryOptions, type SshDiscoveryOptions, type DockerDiscoveryOptions } from './discovery/index.js';
export { HealthChecker, type CheckResult, type HealthReport, type TcpCheckOptions, type HttpCheckOptions, type CommandCheckOptions } from './health/index.js';
export { Workflow, type WorkflowResult, type WorkflowContext, type TaskResult as WorkflowTaskResult, type TaskOptions as WorkflowTaskOptions } from './workflow/index.js';

export { Deployer, type DeployHooks, type DeployConfig, type DeployResult, type DeployContext, type DeployStrategy, type DeployHealthCheck, type DeployTargetResult } from './deploy/index.js';

// ─── Configuration ──────────────────────────────────────────────────

export { TaskManager } from './config/task-manager.js';
export { TaskExecutor } from './config/task-executor.js';
export { TargetResolver } from './config/target-resolver.js';
export { ConfigValidator } from './config/config-validator.js';
export { ConfigurationManager } from './config/configuration-manager.js';
export { VariableInterpolator } from './config/variable-interpolator.js';
export { sortConfigKeys, getDefaultConfig, mergeWithDefaults } from './config/defaults.js';
export { getSecretsDir, findProjectRoot, getModuleCacheDir, getGlobalSecretsDir } from './config/utils.js';
export type { PodConfig, TargetType, HostConfig, TargetConfig, Configuration, CommandConfig, ResolvedTarget, TaskDefinition, DockerDefaults, ContainerConfig, ConfigManagerOptions } from './config/types.js';

// ─── Secrets ────────────────────────────────────────────────────────

export * from './secrets/types.js';

export { SecretManager } from './secrets/manager.js';
export type { ExecutionOptions } from './adapters/loader-adapter.js';

// ─── Scripts ────────────────────────────────────────────────────────

import { getScriptLoader as _getScriptLoader } from './adapters/loader-adapter.js';

export { encrypt, decrypt, generateSecret } from './secrets/crypto.js';
export { ScriptLoader, getScriptLoader } from './adapters/loader-adapter.js';
export { isDirectCommand, createTargetEngine, executeDirectCommand } from './utils/direct-execution.js';

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

// Script globals: cd, pwd, env, echo, sleep and the rest of what a script
// gets in scope, exported so the same names are importable outside one.
export {
  $, cd, ps, fs, os, pwd, env, csv, kit, log,
  exit, kill, echo, diff, glob, path, yaml,
  sleep, quote, which, fetch, prism, setEnv, within, tmpdir, loadEnv,
  tmpfile, spinner, template, parseArgs, retry as scriptRetry,
} from './utils/script-utils.js';

// ─── Errors ─────────────────────────────────────────────────────────

export { UserError, isUserError, handleError } from './utils/error-handler.js';
export { enhanceError, EnhancedExecutionError } from './utils/enhanced-error.js';
export {
  isXecErrorCode,
  XEC_ERROR_CODES,
  type XecErrorCode,
  XEC_ERROR_MEANINGS,
} from './utils/error-codes.js';

// ─── Utilities ──────────────────────────────────────────────────────

export { validateOptions } from './utils/validation.js';
export { parseTimeout, parseInterval } from './utils/time.js';
export { OutputFormatter } from './utils/output-formatter.js';
export { formatBytes, formatDuration } from './utils/formatters.js';
export { type Shell, generateCompletion, type CompletionConfig } from './completion/index.js';
export { findFiles, FileHelpers, selectFiles, selectDirectory } from './utils/file-helpers.js';

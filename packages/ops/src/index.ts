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
export type { Configuration, ResolvedTarget, TargetConfig, TargetType, TaskDefinition, CommandConfig } from './config/types.js';

// ─── Secrets ────────────────────────────────────────────────────────

export { SecretManager } from './secrets/manager.js';
export type { SecretProvider, SecretProviderConfig, SecretMetadata, EncryptedSecret } from './secrets/types.js';
export { SecretError } from './secrets/types.js';

// ─── Scripting API ──────────────────────────────────────────────────

export { ScriptContext } from './api/script-context.js';
export { TargetAPI } from './api/target-api.js';
export { TaskAPI } from './api/task-api.js';
export { ConfigAPI } from './api/config-api.js';

// ─── Script Loader ──────────────────────────────────────────────────

export { getScriptLoader, ScriptLoader } from './adapters/loader-adapter.js';

// ─── Utilities ──────────────────────────────────────────────────────

export { parseTimeout, formatDuration, parseInterval } from './utils/time.js';
export { createTargetEngine } from './utils/direct-execution.js';

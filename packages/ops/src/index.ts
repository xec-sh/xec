/**
 * @xec-sh/ops — DevOps operations library
 *
 * A comprehensive, zero-CLI-dependency library for building DevOps
 * automation tools. Use it standalone in any TypeScript/JavaScript
 * project or as the foundation for CLI applications.
 *
 * @example
 * ```typescript
 * import { Deployer, HealthChecker, Pipeline, Workflow, Discovery } from '@xec-sh/ops';
 *
 * // Deploy with health checks
 * const deployer = Deployer.create({ ... });
 * const result = await deployer.deploy('v1.2.3');
 *
 * // Run CI pipeline
 * const pipeline = Pipeline.create('ci')
 *   .step('test', { run: 'pnpm test' })
 *   .step('build', { run: 'pnpm build', dependsOn: ['test'] });
 * await pipeline.run();
 *
 * // Discover infrastructure
 * const targets = await Discovery.create()
 *   .docker({ label: 'env=prod' })
 *   .kubernetes({ namespace: 'prod' })
 *   .scan();
 * ```
 *
 * @module @xec-sh/ops
 */

// Deploy
export { Deployer, type DeployConfig, type DeployResult, type DeployStrategy, type DeployHooks, type DeployContext, type DeployTargetResult, type DeployHealthCheck } from './deploy/index.js';

// Health
export { HealthChecker, type HealthReport, type CheckResult, type HttpCheckOptions, type TcpCheckOptions, type CommandCheckOptions } from './health/index.js';

// Pipeline
export { Pipeline, type PipelineResult, type PipelineContext, type StepConfig, type StepResult } from './pipeline/index.js';

// Workflow
export { Workflow, type WorkflowResult, type WorkflowContext, type TaskOptions, type TaskResult } from './workflow/index.js';

// Discovery
export { Discovery, type DiscoveredTarget, type DockerDiscoveryOptions, type K8sDiscoveryOptions, type SshDiscoveryOptions } from './discovery/index.js';

// Retry
export { retry, RetryPolicy, type RetryConfig, type BackoffStrategy } from './retry/index.js';

// Completion
export { generateCompletion, type CompletionConfig, type Shell } from './completion/index.js';

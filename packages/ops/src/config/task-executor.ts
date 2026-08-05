import type { ExecutionResult } from '@xec-sh/core';
import type {
  TaskStep,
  TaskResult,
  StepResult,
  TaskDefinition,
  ResolvedTarget,
  VariableContext,
  TaskErrorHandler,
} from './types.js';

import { $ } from '@xec-sh/core';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';

import { TargetResolver } from './target-resolver.js';
import { getScriptLoader } from '../adapters/loader-adapter.js';
import { VariableInterpolator } from './variable-interpolator.js';
import { ConditionEvaluator, ConditionEvaluationError } from './condition-evaluator.js';

export interface TaskExecutorOptions {
  /** Variable interpolator instance */
  interpolator: VariableInterpolator;

  /** Target resolver instance */
  targetResolver: TargetResolver;

  /** Global timeout for tasks (ms) */
  defaultTimeout?: number;

  /** Enable debug output */
  debug?: boolean;

  /** Dry run mode - don't execute commands */
  dryRun?: boolean;

  /**
   * Lookup for nested task definitions used by `step.task`.
   * Steps that invoke other tasks fail loudly when no registry is provided —
   * the executor never pretends a nested task ran.
   */
  taskRegistry?: (name: string) => TaskDefinition | undefined;
}

export interface TaskExecutionOptions {
  /** Parameters passed to the task */
  params?: Record<string, any>;

  /** Variables for interpolation */
  vars?: Record<string, any>;

  /** Override target */
  target?: string;

  /** Additional environment variables */
  env?: Record<string, string>;

  /** Working directory */
  cwd?: string;

  /** Timeout override */
  timeout?: number;

  /** Suppress output */
  quiet?: boolean;
}

export class TaskExecutor extends EventEmitter {
  private static readonly MAX_TASK_DEPTH = 10;

  private conditionEvaluator: ConditionEvaluator;

  constructor(private options: TaskExecutorOptions) {
    super();
    this.conditionEvaluator = new ConditionEvaluator(options.interpolator);
  }

  /**
   * Execute a task
   */
  async execute(
    taskName: string,
    task: TaskDefinition,
    options: TaskExecutionOptions = {}
  ): Promise<TaskResult> {
    return this.executeInternal(taskName, task, options, [taskName]);
  }

  private async executeInternal(
    taskName: string,
    task: TaskDefinition,
    options: TaskExecutionOptions,
    chain: readonly string[]
  ): Promise<TaskResult> {
    const startTime = Date.now();
    const result: TaskResult = {
      task: taskName,
      success: false,
      duration: 0,
      steps: [],
    };

    // Create variable context. The full local environment is visible for
    // ${env.X} interpolation (which happens locally), but is NOT forwarded to
    // execution targets — see buildExecutionEnv().
    const context: VariableContext = {
      params: options.params || {},
      vars: options.vars || {},
      env: Object.fromEntries(
        Object.entries({ ...process.env, ...options.env })
          .filter(([_, v]) => v !== undefined)
          .map(([k, v]) => [k, v as string])
      ),
    };

    try {
      this.emit('task:start', { task: taskName, definition: task });

      // Execute based on task type
      if (task.command) {
        // Simple command execution
        const execResult = await this.executeCommand(task, context, options);
        result.output = execResult.stdout;
        result.success = true;
      } else if (task.steps) {
        // Pipeline execution
        const stepResults = await this.executePipeline(task, context, options, chain);
        result.steps = stepResults;

        // Pipeline is successful if:
        // 1. It completed all steps (no early exit due to failFast)
        // 2. Failed steps only had 'continue' or 'ignore' handlers
        const hasUnhandledFailure = stepResults.some(step => {
          if (step.success) return false;

          const taskStep = task.steps?.find(s => s.name === step.name);
          const handler = taskStep?.onFailure;

          // No handler or handler that doesn't allow continuation = unhandled failure
          return !handler || (handler !== 'continue' && handler !== 'ignore');
        });

        // Check if pipeline was aborted (fewer results than steps means early exit)
        const wasAborted = stepResults.length < task.steps.length;

        result.success = !wasAborted && !hasUnhandledFailure;
      } else if (task.script) {
        // Script execution
        const execResult = await this.executeScript(task, context, options);
        result.output = execResult.stdout;
        result.success = true;
      }

      result.duration = Date.now() - startTime;
      this.emit('task:complete', { task: taskName, result });

      return result;
    } catch (error) {
      result.duration = Date.now() - startTime;
      result.error = error as Error;

      this.emit('task:error', { task: taskName, error, result });

      // Handle task-level error handlers
      if (task.onError) {
        await this.handleTaskError(task.onError, error as Error, context);
      }

      return result;
    }
  }

  /**
   * Build the environment forwarded to the execution target.
   *
   * Only explicitly configured environment is forwarded: task-level env,
   * step-level env, then caller-provided env (highest precedence). The local
   * process.env is deliberately NOT included — forwarding it to SSH/Docker/K8s
   * targets would leak local credentials (AWS_*, tokens, etc.) to remote hosts.
   * Local targets still inherit process.env inside the local adapter itself.
   */
  private async buildExecutionEnv(
    context: VariableContext,
    ...sources: Array<Record<string, string> | undefined>
  ): Promise<Record<string, string>> {
    const merged: Record<string, string> = {};
    for (const source of sources) {
      if (source) {
        Object.assign(merged, source);
      }
    }

    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(merged)) {
      resolved[key] = await this.options.interpolator.interpolateAsync(String(value), context);
    }

    return resolved;
  }

  /**
   * Execute a simple command
   */
  private async executeCommand(
    task: TaskDefinition,
    context: VariableContext,
    options: TaskExecutionOptions
  ): Promise<ExecutionResult> {
    // Interpolate command
    const command = await this.options.interpolator.interpolateAsync(task.command!, context);

    if (this.options.dryRun) {
      console.log(`[DRY RUN] Would execute: ${command}`);
      return { stdout: '', stderr: '', exitCode: 0, ok: true } as ExecutionResult;
    }

    // Resolve target
    const targetRef = options.target || task.target;
    const target = targetRef ? await this.resolveTarget(targetRef, context) : null;

    // Create execution engine
    const engine = target ? await this.createTargetEngine(target) : $;

    const execEnv = await this.buildExecutionEnv(context, task.env, options.env);
    // Only a directory someone actually asked for. Defaulting to
    // `process.cwd()` stamped the operator's local path onto every target:
    // harmless while adapters ignored cwd for containers and pods, and an
    // immediate `docker exec -w /Users/...` failure once they honoured it.
    // Local execution already inherits this process's directory without
    // being told.
    const cwd = options.cwd || task.workdir;
    const timeout = this.getTimeout(task.timeout, options.timeout) || 60000;

    // Execute command
    let proc = engine.raw`${command}`;
    if (Object.keys(execEnv).length > 0) {
      proc = proc.env(execEnv);
    }
    if (cwd) {
      proc = proc.cwd(cwd);
    }
    const result = await proc.timeout(timeout).nothrow();

    if (!options.quiet) {
      if (result.stdout) console.log(result.stdout);
      if (result.stderr) console.error(result.stderr);
    }

    if (!result.ok) {
      throw new Error(`Command failed with exit code ${result.exitCode}`);
    }

    return result;
  }

  /**
   * Execute a pipeline of steps
   */
  private async executePipeline(
    task: TaskDefinition,
    context: VariableContext,
    options: TaskExecutionOptions,
    chain: readonly string[]
  ): Promise<StepResult[]> {
    const steps = task.steps!;

    // Determine execution mode
    const parallel = task.parallel || false;
    const maxConcurrent = task.maxConcurrent || steps.length;
    const failFast = task.failFast !== false;

    if (parallel) {
      // Parallel execution
      return this.executeStepsParallel(steps, context, options, maxConcurrent, failFast, task.env, chain);
    } else {
      // Sequential execution
      return this.executeStepsSequential(steps, context, options, failFast, task.env, chain);
    }
  }

  /**
   * Execute steps sequentially
   */
  private async executeStepsSequential(
    steps: TaskStep[],
    context: VariableContext,
    options: TaskExecutionOptions,
    failFast: boolean,
    taskEnv: Record<string, string> | undefined,
    chain: readonly string[]
  ): Promise<StepResult[]> {
    const results: StepResult[] = [];
    const stepContext = { ...context };

    for (const step of steps) {
      const stepResult = await this.executeStep(step, stepContext, options, taskEnv, chain);
      results.push(stepResult);

      // Register step output for use in subsequent steps
      if (step.register && stepResult.output) {
        stepContext.vars = {
          ...stepContext.vars,
          [step.register]: stepResult.output.trim(),
        };
      }

      // Handle failure
      if (!stepResult.success && !step.alwaysRun) {
        // Check if step has onFailure handler that allows continuation
        const shouldContinue = step.onFailure === 'continue' || step.onFailure === 'ignore';

        if (failFast && !shouldContinue) {
          break;
        }
      }
    }

    return results;
  }

  /**
   * Execute steps in parallel
   */
  private async executeStepsParallel(
    steps: TaskStep[],
    context: VariableContext,
    options: TaskExecutionOptions,
    maxConcurrent: number,
    failFast: boolean,
    taskEnv: Record<string, string> | undefined,
    chain: readonly string[]
  ): Promise<StepResult[]> {
    const results: StepResult[] = [];
    const queue = [...steps];
    const executing = new Set<Promise<StepResult>>();

    while (queue.length > 0 || executing.size > 0) {
      // Start new executions up to maxConcurrent
      while (queue.length > 0 && executing.size < maxConcurrent) {
        const step = queue.shift()!;
        const promise = this.executeStep(step, context, options, taskEnv, chain);

        executing.add(promise);

        // Handle completion
        promise.then(result => {
          results.push(result);
          executing.delete(promise);

          // Check for fail-fast
          if (!result.success && failFast) {
            queue.length = 0; // Clear queue
          }
        }).catch(() => {
          executing.delete(promise);
          if (failFast) {
            queue.length = 0;
          }
        });
      }

      // Wait for at least one to complete
      if (executing.size > 0) {
        await Promise.race(executing);
      }
    }

    // Wait for all remaining
    await Promise.all(executing);

    return results;
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: TaskStep,
    context: VariableContext,
    options: TaskExecutionOptions,
    taskEnv: Record<string, string> | undefined,
    chain: readonly string[]
  ): Promise<StepResult> {
    const startTime = Date.now();
    const result: StepResult = {
      name: step.name,
      success: false,
      duration: 0,
    };

    try {
      // Check conditional execution. An unevaluable condition throws — a step
      // is only skipped when its condition genuinely evaluates to false.
      if (step.when !== undefined && !this.evaluateCondition(step.when, context)) {
        result.success = true;
        result.skipped = true;
        result.duration = Date.now() - startTime;
        return result;
      }

      // Execute based on step type
      if (step.command) {
        const output = await this.executeStepCommand(step, context, options, taskEnv);
        result.output = output.stdout;
        if (!output.ok) {
          throw new Error(`Step command failed with exit code ${output.exitCode}`);
        }
        result.success = true;
      } else if (step.task) {
        // Execute nested task for real; throws when the nested task fails or
        // cannot be resolved — never fabricates success.
        const nestedResult = await this.executeNestedTask(step, context, options, chain);
        result.output = nestedResult.output ?? this.combineStepOutputs(nestedResult.steps);
        result.success = true;
      } else if (step.script) {
        const output = await this.executeStepScript(step, context, options);
        result.output = output.stdout;
        if (!output.ok) {
          throw new Error(`Step script failed with exit code ${output.exitCode}`);
        }
        result.success = true;
      }

      result.duration = Date.now() - startTime;
      return result;
    } catch (error) {
      result.error = error as Error;
      result.duration = Date.now() - startTime;

      // Handle step error - handleStepError returns the retry result if successful.
      // Condition evaluation errors are configuration errors: retrying would
      // bypass the (unevaluable) condition, so they are never retried.
      if (step.onFailure && !(error instanceof ConditionEvaluationError)) {
        const retryResult = await this.handleStepError(step, context, options, result, taskEnv);
        if (retryResult) {
          return retryResult;
        }
      }

      // Step failed and was not handled
      result.success = false;

      return result;
    }
  }

  /**
   * Execute a nested task referenced by `step.task`
   */
  private async executeNestedTask(
    step: TaskStep,
    context: VariableContext,
    options: TaskExecutionOptions,
    chain: readonly string[]
  ): Promise<TaskResult> {
    const taskName = step.task!;
    const registry = this.options.taskRegistry;

    if (!registry) {
      throw new Error(
        `Step '${step.name ?? taskName}' invokes task '${taskName}', but this TaskExecutor was created without a task registry (TaskExecutorOptions.taskRegistry). Nested task execution is unavailable.`
      );
    }

    const nestedTask = registry(taskName);
    if (!nestedTask) {
      throw new Error(`Nested task '${taskName}' not found`);
    }

    if (chain.includes(taskName)) {
      throw new Error(`Circular task invocation detected: ${[...chain, taskName].join(' -> ')}`);
    }

    if (chain.length >= TaskExecutor.MAX_TASK_DEPTH) {
      throw new Error(
        `Maximum nested task depth (${TaskExecutor.MAX_TASK_DEPTH}) exceeded: ${chain.join(' -> ')}`
      );
    }

    // Inherit the parent's params, then apply the nested task's own defaults
    // and check its required parameters.
    const params: Record<string, any> = { ...context.params };
    if (nestedTask.params) {
      const missing: string[] = [];
      for (const param of nestedTask.params) {
        if (params[param.name] === undefined) {
          if (param.default !== undefined) {
            params[param.name] = param.default;
          } else if (param.required) {
            missing.push(param.name);
          }
        }
      }
      if (missing.length > 0) {
        throw new Error(`Nested task '${taskName}' is missing required parameter(s): ${missing.join(', ')}`);
      }
    }

    const nestedResult = await this.executeInternal(
      taskName,
      nestedTask,
      {
        ...options,
        target: step.target ?? options.target,
        params,
        vars: context.vars,
      },
      [...chain, taskName]
    );

    if (!nestedResult.success) {
      const reason = nestedResult.error ? `: ${nestedResult.error.message}` : '';
      throw new Error(`Nested task '${taskName}' failed${reason}`);
    }

    return nestedResult;
  }

  private combineStepOutputs(steps: StepResult[] | undefined): string | undefined {
    if (!steps || steps.length === 0) {
      return undefined;
    }

    const outputs = steps.map(s => s.output).filter((o): o is string => Boolean(o));
    return outputs.length > 0 ? outputs.join('\n') : undefined;
  }

  /**
   * Execute step command
   */
  private async executeStepCommand(
    step: TaskStep,
    context: VariableContext,
    options: TaskExecutionOptions,
    taskEnv: Record<string, string> | undefined
  ): Promise<ExecutionResult> {
    const command = await this.options.interpolator.interpolateAsync(step.command!, context);

    if (this.options.dryRun) {
      console.log(`[DRY RUN] Step: ${step.name || 'unnamed'} - Would execute: ${command}`);
      return { stdout: '', stderr: '', exitCode: 0, ok: true } as ExecutionResult;
    }

    const execEnv = await this.buildExecutionEnv(context, taskEnv, step.env, options.env);

    // Handle multiple targets
    if (step.targets && step.targets.length > 0) {
      // Execute on multiple targets
      const results = await Promise.all(
        step.targets.map(targetRef =>
          this.executeOnTarget(command, targetRef, context, options, execEnv)
        )
      );

      // Combine outputs
      return {
        stdout: results.map(r => r.stdout).join('\n'),
        stderr: results.map(r => r.stderr).join('\n'),
        exitCode: results.every(r => r.ok) ? 0 : 1,
        ok: results.every(r => r.ok),
      } as ExecutionResult;
    }

    // Single target execution
    const targetRef = step.target || options.target;
    return this.executeOnTarget(command, targetRef, context, options, execEnv);
  }

  /**
   * Execute command on a specific target
   */
  private async executeOnTarget(
    command: string,
    targetRef: string | undefined,
    context: VariableContext,
    options: TaskExecutionOptions,
    execEnv: Record<string, string>
  ): Promise<ExecutionResult> {
    const target = targetRef ? await this.resolveTarget(targetRef, context) : null;
    const engine = target ? await this.createTargetEngine(target) : $;

    let proc = engine.raw`${command}`;
    if (Object.keys(execEnv).length > 0) {
      proc = proc.env(execEnv);
    }
    // Same rule: a cwd only when one was asked for. See executeStepCommand.
    if (options.cwd) {
      proc = proc.cwd(options.cwd);
    }
    return proc.timeout(options.timeout || 60000).nothrow();
  }

  /**
   * Execute step script
   */
  private async executeStepScript(
    step: TaskStep,
    context: VariableContext,
    options: TaskExecutionOptions
  ): Promise<ExecutionResult> {
    const scriptPath = await this.options.interpolator.interpolateAsync(step.script!, context);

    // Check if script file exists
    try {
      await fs.access(scriptPath);
    } catch {
      throw new Error(`Script file not found: ${scriptPath}`);
    }

    // Resolve target for script execution
    const targetRef = step.target || options.target;
    const target = targetRef ? await this.resolveTarget(targetRef, context) : null;
    const targetEngine = target ? await this.createTargetEngine(target) : null;

    // Use ScriptLoader for proper module resolution
    const scriptLoader = getScriptLoader({
      verbose: this.options.debug,
      quiet: options.quiet,
    });

    const result = await scriptLoader.executeScript(scriptPath, {
      target: target || undefined,
      targetEngine: targetEngine || undefined,
      context: {
        args: [],
        argv: [process.argv[0] || 'node', scriptPath],
        __filename: scriptPath,
        __dirname: path.dirname(scriptPath),
      },
      quiet: options.quiet,
    });

    if (!result.success) {
      const errorMessage = result.error?.message || 'Script execution failed';
      throw new Error(errorMessage);
    }

    return {
      stdout: result.output || '',
      stderr: '',
      exitCode: 0,
      ok: true,
    } as ExecutionResult;
  }

  /**
   * Execute task script
   */
  private async executeScript(
    task: TaskDefinition,
    context: VariableContext,
    options: TaskExecutionOptions
  ): Promise<ExecutionResult> {
    const scriptPath = await this.options.interpolator.interpolateAsync(task.script!, context);

    // Check if script file exists
    try {
      await fs.access(scriptPath);
    } catch {
      throw new Error(`Script file not found: ${scriptPath}`);
    }

    // Resolve target for script execution
    const targetRef = options.target || task.target;
    const target = targetRef ? await this.resolveTarget(targetRef, context) : null;
    const targetEngine = target ? await this.createTargetEngine(target) : null;

    // Use ScriptLoader for proper module resolution and CDN loading
    const scriptLoader = getScriptLoader({
      verbose: this.options.debug,
      quiet: options.quiet,
    });

    const result = await scriptLoader.executeScript(scriptPath, {
      target: target || undefined,
      targetEngine: targetEngine || undefined,
      context: {
        args: [],
        argv: [process.argv[0] || 'node', scriptPath],
        __filename: scriptPath,
        __dirname: path.dirname(scriptPath),
      },
      quiet: options.quiet,
    });

    if (!result.success) {
      const errorMessage = result.error?.message || 'Script execution failed';
      throw new Error(errorMessage);
    }

    return {
      stdout: result.output || '',
      stderr: '',
      exitCode: 0,
      ok: true,
    } as ExecutionResult;
  }

  /**
   * Handle step error
   */
  private async handleStepError(
    step: TaskStep,
    context: VariableContext,
    options: TaskExecutionOptions,
    originalResult: StepResult,
    taskEnv: Record<string, string> | undefined
  ): Promise<StepResult | null> {
    const handler = step.onFailure;

    if (!handler) {
      return null;
    }

    if (handler === 'continue' || handler === 'ignore') {
      // Keep the step marked as failed, but allow pipeline to continue
      return null;
    }

    if (handler === 'abort') {
      return null;
    }

    // Handle retry — only command steps can be retried here
    if (typeof handler === 'object' && handler.retry && step.command) {
      const retryHandler = handler as TaskErrorHandler;
      const retries = retryHandler.retry || 0;
      const delay = this.parseDelay(retryHandler.delay || '1s');

      for (let i = 0; i < retries; i++) {
        this.emit('step:retry', { step, attempt: i + 1, maxAttempts: retries });

        await new Promise(resolve => setTimeout(resolve, delay));

        try {
          const result = await this.executeStepCommand(step, context, options, taskEnv);
          if (result.ok) {
            // Return successful result
            return {
              name: step.name,
              success: true,
              output: result.stdout,
              duration: originalResult.duration,
            };
          }
          // Command failed, continue retry loop
        } catch {
          // Continue to next retry
        }
      }
    }

    return null;
  }

  /**
   * Handle task-level error
   */
  private async handleTaskError(
    handler: { emit?: string; command?: string },
    error: Error,
    context: VariableContext
  ): Promise<void> {
    if (handler.emit) {
      this.emit('event', { name: handler.emit, data: { error: error.message } });
    }

    if (handler.command) {
      try {
        const command = await this.options.interpolator.interpolateAsync(handler.command, context);
        await $.raw`${command}`.shell(true).nothrow();
      } catch (handlerError) {
        // The handler must not mask the original task error — report and move on.
        console.error(
          `Task onError handler failed: ${handlerError instanceof Error ? handlerError.message : String(handlerError)}`
        );
      }
    }
  }

  /**
   * Evaluate a conditional expression.
   *
   * @throws {ConditionEvaluationError} when the expression is malformed or
   *   references unresolvable variables — a broken condition never silently
   *   skips a step.
   */
  private evaluateCondition(condition: unknown, context: VariableContext): boolean {
    // YAML may deliver booleans/numbers despite the string typing
    if (typeof condition === 'boolean') {
      return condition;
    }
    if (typeof condition === 'number') {
      return condition !== 0;
    }
    if (typeof condition !== 'string') {
      throw new ConditionEvaluationError(
        `unsupported condition type '${typeof condition}'`,
        String(condition)
      );
    }

    return this.conditionEvaluator.evaluate(condition, context);
  }

  /**
   * Resolve target reference
   */
  private async resolveTarget(
    targetRef: string,
    context: VariableContext
  ): Promise<ResolvedTarget> {
    const interpolated = await this.options.interpolator.interpolateAsync(targetRef, context);
    return this.options.targetResolver.resolve(interpolated);
  }

  /**
   * Create execution engine for target
   */
  private async createTargetEngine(target: ResolvedTarget): Promise<any> {
    const config = target.config as any;

    switch (target.type) {
      case 'ssh':
        {
          const sshEngine = $.ssh({
            host: config.host,
            username: config.user,
            port: config.port,
            privateKey: config.privateKey,
            password: config.password,
            passphrase: config.passphrase,
            ...config
          });

          // Apply environment variables from config
          if (config.env && Object.keys(config.env).length > 0) {
            return sshEngine.env(config.env);
          }

          return sshEngine;
        }

      case 'docker':
        {
          const dockerOptions: any = {
            container: config.container,
            image: config.image,
            user: config.user,
            workingDir: config.workdir,
            ...config
          };

          // Remove undefined values
          Object.keys(dockerOptions).forEach(key => {
            if (dockerOptions[key] === undefined) {
              delete dockerOptions[key];
            }
          });

          const dockerEngine = $.docker(dockerOptions);

          // Apply environment variables from config
          if (config.env && Object.keys(config.env).length > 0) {
            return (dockerEngine as any).env(config.env);
          }

          return dockerEngine;
        }

      case 'kubernetes':
        {
          const k8sOptions: any = {
            pod: config.pod,
            namespace: config.namespace || 'default',
            container: config.container,
            context: config.context,
            kubeconfig: config.kubeconfig,
            ...config
          };

          // Remove undefined values
          Object.keys(k8sOptions).forEach(key => {
            if (k8sOptions[key] === undefined) {
              delete k8sOptions[key];
            }
          });

          return $.k8s(k8sOptions);
        }

      case 'local':
      default:
        return $.local();
    }
  }

  /**
   * Get timeout value
   */
  private getTimeout(taskTimeout?: string | number, optionTimeout?: number): number | undefined {
    if (optionTimeout !== undefined) {
      return optionTimeout;
    }

    if (taskTimeout !== undefined) {
      return typeof taskTimeout === 'number' ? taskTimeout : this.parseTimeout(taskTimeout);
    }

    return this.options.defaultTimeout;
  }

  /**
   * Parse timeout string to milliseconds
   */
  private parseTimeout(timeout: string): number {
    const match = timeout.match(/^(\d+)(ms|s|m|h)?$/);
    if (!match) {
      return 0;
    }

    const value = parseInt(match[1] || '0', 10);
    const unit = match[2] || 'ms';

    switch (unit) {
      case 'ms':
        return value;
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      default:
        return 0;
    }
  }

  /**
   * Parse delay string to milliseconds
   */
  private parseDelay(delay: string): number {
    return this.parseTimeout(delay);
  }
}

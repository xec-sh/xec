import type { ExecutionResult } from '@xec-sh/core';
import type {
  TaskStep,
  TaskResult,
  StepResult,
  TaskDefinition,
  VariableContext,
} from './types.js';

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';

import { TargetResolver } from './target-resolver.js';
import { TaskParser, TaskParseError } from './task-parser.js';
import { getScriptLoader } from '../adapters/loader-adapter.js';
import { createTargetEngine } from '../utils/direct-execution.js';
import { VariableInterpolator } from './variable-interpolator.js';
import { ConditionEvaluator, ConditionEvaluationError } from './condition-evaluator.js';

export interface TaskExecutorOptions {
  interpolator: VariableInterpolator;
  targetResolver: TargetResolver;
  /** Default command timeout in milliseconds. Zero disables the timeout. */
  defaultTimeout?: number;
  debug?: boolean;
  /** Preview authored operations without loading scripts or evaluating values. */
  dryRun?: boolean;
  taskRegistry?: (name: string) => TaskDefinition | undefined;
}

export interface TaskExecutionOptions {
  params?: Record<string, unknown>;
  vars?: Record<string, unknown>;
  /** Explicit caller overrides are data, never configuration templates. */
  target?: string;
  env?: Record<string, string>;
  cwd?: string;
  timeout?: number;
  quiet?: boolean;
}

/** A completed command failure is the only outcome eligible for automatic retry. */
class TaskCommandError extends Error {
  constructor(readonly exitCode: number) {
    super(`Command failed with exit code ${exitCode}`);
    this.name = 'TaskCommandError';
  }
}

type CommandOutput = Pick<ExecutionResult, 'stdout' | 'stderr' | 'exitCode' | 'ok'>;

const emptyResult = (): CommandOutput => ({ stdout: '', stderr: '', exitCode: 0, ok: true });

export class TaskExecutor extends EventEmitter {
  private static readonly MAX_TASK_DEPTH = 10;
  private readonly conditionEvaluator: ConditionEvaluator;

  constructor(private readonly options: TaskExecutorOptions) {
    super();
    this.conditionEvaluator = new ConditionEvaluator(options.interpolator);
  }

  async execute(taskName: string, task: TaskDefinition, options: TaskExecutionOptions = {}): Promise<TaskResult> {
    return this.executeInternal(taskName, task, options, [taskName]);
  }

  private async executeInternal(
    taskName: string,
    task: TaskDefinition,
    options: TaskExecutionOptions,
    chain: readonly string[]
  ): Promise<TaskResult> {
    const started = Date.now();
    const result: TaskResult = { task: taskName, success: false, duration: 0, steps: [] };
    const context: VariableContext = {
      params: options.params ?? {},
      vars: options.vars ?? {},
      varsAreTemplates: false,
      // Visible to interpolation locally; never forwarded implicitly to a target.
      env: Object.fromEntries(Object.entries({ ...process.env, ...options.env })
        .filter((entry): entry is [string, string] => entry[1] !== undefined)),
    };
    let effective = options;
    let validated = false;
    try {
      const parser = new TaskParser();
      if (!parser.parseTask(taskName, task)) throw new TaskParseError(`Invalid task '${taskName}': ${parser.getErrors().map(error => `${error.path}: ${error.message}`).join('; ')}`, parser.getErrors());
      if (task.parallel && this.containsScript(task, new Set())) {
        throw new Error('Parallel tasks cannot invoke in-process scripts; use command tasks for process isolation');
      }
      validated = true;
      this.emit('task:start', { task: taskName, definition: task });
      if (this.options.dryRun) {
        result.dryRun = true;
        result.success = true;
        // A preview must not resolve command/secret providers, target discovery,
        // conditions or script imports. Show the template, not a fabricated value.
        if (task.steps) {
          result.steps = await Promise.all(task.steps.map(async (step, index) => {
            if (step.task) await this.executeNestedTask(step, context, options, task.env, chain);
            if (!options.quiet) console.log(`[DRY RUN; values not evaluated] ${step.command ?? step.script ?? step.task}`);
            return { name: step.name, index, success: true, duration: 0, dryRun: true };
          }));
        } else if (!options.quiet) {
          console.log(`[DRY RUN; values not evaluated] ${task.command ?? task.script}`);
        }
      } else {
        effective = {
          ...options,
          target: options.target ?? (task.target ? await this.interpolate(task.target, context) : undefined),
          cwd: options.cwd ?? (task.workdir ? await this.interpolate(task.workdir, context) : undefined),
          timeout: this.getTimeout(task.timeout, options.timeout),
        };
        if (task.command) {
          const output = await this.executeCommand(task, context, effective, task.env);
          this.print(output, options);
          this.checkResult(output);
          result.output = output.stdout;
          result.success = true;
        } else if (task.steps) {
          result.steps = await this.executePipeline(task, context, effective, chain);
          result.success = result.steps.every((step, index) => step.success ||
            (!step.skipped && this.allowsFailure(task.steps![index]!, step)));
          if (!result.success) {
            result.error = result.steps.find(step => !step.success && !step.skipped)?.error ??
              new Error('Task pipeline did not complete');
          }
        } else if (task.script) {
          result.output = (await this.executeScript(task.script, [], context, effective, task.env)).stdout;
          result.success = true;
        }
        if (result.success && task.onSuccess) {
          await this.executeTaskHandler(task.onSuccess, context, effective, task.env);
        }
      }
    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error : new Error(String(error));
    }
    if (!result.success) {
      this.emit('task:error', { task: taskName, error: result.error, result });
      if (validated && task.onError && !this.options.dryRun) {
        try {
          await this.executeTaskHandler(task.onError, context, effective, task.env, result.error);
        } catch (error) {
          // Preserve both failures, including machine-readable failure details.
          result.error = new AggregateError([result.error, error], 'Task and its error handler failed');
        }
      }
    }
    result.duration = Date.now() - started;
    this.emit('task:complete', { task: taskName, result });
    return result;
  }

  private containsScript(task: TaskDefinition, seen: Set<string>): boolean {
    if (task.script) return true;
    return task.steps?.some(step => {
      if (step.script) return true;
      if (!step.task || seen.has(step.task)) return false;
      seen.add(step.task);
      const nested = this.options.taskRegistry?.(step.task);
      return nested ? this.containsScript(nested, seen) : false;
    }) ?? false;
  }

  private interpolate(value: string, context: VariableContext): Promise<string> {
    return this.options.interpolator.interpolateAsync(value, context);
  }

  private async buildExecutionEnv(
    context: VariableContext,
    authored: Array<Record<string, string> | undefined>,
    runtime: Record<string, string> | undefined
  ): Promise<Record<string, string>> {
    const merged = Object.assign({}, ...authored) as Record<string, string>;
    const resolved: Record<string, string> = {};
    for (const [name, value] of Object.entries(merged)) resolved[name] = await this.interpolate(value, context);
    // Caller data and already resolved inherited values are terminal.
    return { ...resolved, ...runtime };
  }

  private allowsFailure(step: TaskStep, result?: StepResult): boolean {
    if (result?.error instanceof ConditionEvaluationError || result?.recovery?.success === false) return false;
    return step.onFailure === 'continue' || step.onFailure === 'ignore';
  }

  private stopsQueue(step: TaskStep, result: StepResult, failFast: boolean): boolean {
    return result.success ? step.onSuccess === 'abort' :
      step.onFailure === 'abort' || (failFast && !this.allowsFailure(step, result));
  }

  private skipped(step: TaskStep, index: number, aborted: boolean): StepResult {
    return {
      name: step.name, index, success: !aborted, skipped: true,
      skipReason: aborted ? 'failure' : 'onSuccess', duration: 0,
    };
  }

  private async executePipeline(
    task: TaskDefinition, context: VariableContext, options: TaskExecutionOptions, chain: readonly string[]
  ): Promise<StepResult[]> {
    const steps = task.steps!;
    const results: StepResult[] = new Array(steps.length);
    const failFast = task.failFast !== false;
    let stopped = false;
    let aborted = false;
    const run = async (index: number, stepContext: VariableContext): Promise<void> => {
      const step = steps[index]!;
      const result = await this.executeStep(step, stepContext, options, task.env, chain);
      result.index = index;
      results[index] = result;
      if (this.stopsQueue(step, result, failFast)) {
        stopped = true;
        aborted ||= !result.success;
      }
    };
    if (!task.parallel) {
      const stepContext = { ...context };
      for (const [index, step] of steps.entries()) {
        if (stopped && !step.alwaysRun) {
          results[index] = this.skipped(step, index, aborted);
          continue;
        }
        await run(index, stepContext);
        if (step.register && results[index]!.success && results[index]!.output !== undefined) {
          stepContext.vars = { ...stepContext.vars, [step.register]: results[index]!.output!.trim() };
        }
      }
    } else {
      // Cleanup is a separate ordered phase after all started operations settle.
      // It must never remove resources while a parallel worker still uses them.
      const ordinary = steps.map((step, index) => ({ step, index })).filter(({ step }) => !step.alwaysRun);
      let cursor = 0;
      const worker = async (): Promise<void> => {
        while (cursor < ordinary.length) {
          const { step, index } = ordinary[cursor++]!;
          if (stopped) results[index] = this.skipped(step, index, aborted);
          else await run(index, context);
        }
      };
      await Promise.all(Array.from({ length: Math.min(task.maxConcurrent ?? 8, ordinary.length) }, worker));
      for (const [index, step] of steps.entries()) if (step.alwaysRun) await run(index, context);
    }
    return results;
  }

  private async executeStep(
    step: TaskStep,
    context: VariableContext,
    options: TaskExecutionOptions,
    taskEnv: Record<string, string> | undefined,
    chain: readonly string[]
  ): Promise<StepResult> {
    const started = Date.now();
    let result: StepResult = { name: step.name, success: false, duration: 0 };
    try {
      if (step.when !== undefined && !this.evaluateCondition(step.when, context)) {
        return { ...result, success: true, skipped: true, skipReason: 'condition' };
      }
      result = await this.executeStepAction(step, context, options, taskEnv, chain);
    } catch (error) {
      result.error = error instanceof Error ? error : new Error(String(error));
      const handler = step.onFailure;
      if (typeof handler === 'object' && !(error instanceof ConditionEvaluationError)) {
        // A timeout or transport rejection is not evidence of a completed effect.
        // Retry only a command whose exit status is known, never an unknown outcome.
        if (error instanceof TaskCommandError) {
          for (let attempt = 0; attempt < (handler.retry ?? 0); attempt++) {
            this.emit('step:retry', { step, attempt: attempt + 1, maxAttempts: handler.retry });
            await new Promise(resolve => setTimeout(resolve, this.parseTimeout(handler.delay ?? '1s')));
            try {
              result = await this.executeStepAction(step, context, options, taskEnv, chain);
              break;
            } catch (retryError) {
              result.error = retryError instanceof Error ? retryError : new Error(String(retryError));
              if (!(retryError instanceof TaskCommandError)) break;
            }
          }
        }
        if (!result.success && (handler.command || handler.task)) {
          const recovery: TaskStep = { name: `${step.name ?? 'step'} recovery`,
            command: handler.command, task: handler.task, target: step.target, env: step.env };
          // Recovery has its own recorded result; a successful cleanup must not
          // relabel the original failed operation as successful.
          result.recovery = await this.executeStep(recovery, context, options, taskEnv, chain);
          if (!result.recovery.success) {
            result.error = new AggregateError([result.error, result.recovery.error], 'Step and its recovery failed');
          }
        }
      }
    }
    result.duration = Date.now() - started;
    return result;
  }

  private async executeStepAction(
    step: TaskStep,
    context: VariableContext,
    options: TaskExecutionOptions,
    taskEnv: Record<string, string> | undefined,
    chain: readonly string[]
  ): Promise<StepResult> {
    let output: string | undefined;
    if (step.command) {
      const result = await this.executeCommand(step, context, options, taskEnv, true);
      this.print(result, options);
      this.checkResult(result);
      output = result.stdout;
    } else if (step.task) {
      const result = await this.executeNestedTask(step, context, options, taskEnv, chain);
      output = result.output ?? result.steps?.map(item => item.output).filter(Boolean).join('\n');
    } else if (step.script) {
      const target = step.target ? await this.interpolate(step.target, context) : options.target;
      output = (await this.executeScript(step.script, step.args ?? [], context,
        { ...options, target }, taskEnv, step.env)).stdout;
    }
    return { name: step.name, success: true, duration: 0, output };
  }

  private async executeNestedTask(
    step: TaskStep,
    context: VariableContext,
    options: TaskExecutionOptions,
    taskEnv: Record<string, string> | undefined,
    chain: readonly string[]
  ): Promise<TaskResult> {
    const name = step.task!;
    if (!this.options.taskRegistry) {
      throw new Error(`Step '${step.name ?? name}' invokes task '${name}', but this TaskExecutor was created without a task registry`);
    }
    const task = this.options.taskRegistry(name);
    if (!task) throw new Error(`Nested task '${name}' not found`);
    if (chain.includes(name)) throw new Error(`Circular task invocation detected: ${[...chain, name].join(' -> ')}`);
    if (chain.length >= TaskExecutor.MAX_TASK_DEPTH) {
      throw new Error(`Maximum nested task depth (${TaskExecutor.MAX_TASK_DEPTH}) exceeded: ${chain.join(' -> ')}`);
    }
    const params = { ...context.params };
    const missing: string[] = [];
    for (const param of task.params ?? []) {
      if (params[param.name] === undefined) {
        if (param.default !== undefined) params[param.name] = param.default;
        else if (param.required) missing.push(param.name);
      }
    }
    if (missing.length) throw new Error(`Nested task '${name}' is missing required parameter(s): ${missing.join(', ')}`);
    const result = await this.executeInternal(name, task, {
      ...options, params, vars: context.vars,
      target: this.options.dryRun ? options.target :
        step.target ? await this.interpolate(step.target, context) : options.target,
      env: this.options.dryRun ? options.env : await this.buildExecutionEnv(context, [taskEnv, step.env], options.env),
    }, [...chain, name]);
    if (!result.success) throw new Error(`Nested task '${name}' failed${result.error ? `: ${result.error.message}` : ''}`, { cause: result.error });
    return result;
  }

  private async executeCommand(
    definition: Pick<TaskDefinition, 'command' | 'target' | 'targets' | 'env' | 'maxConcurrent'>,
    context: VariableContext,
    options: TaskExecutionOptions,
    taskEnv: Record<string, string> | undefined,
    step = false
  ): Promise<CommandOutput> {
    const template = await this.options.interpolator.commandTemplate(definition.command!, context);
    const override = step && definition.target ? await this.interpolate(definition.target, context) : options.target;
    const refs = definition.targets && (step || options.target === undefined)
      ? await Promise.all(definition.targets.map(ref => this.interpolate(ref, context))) : [override ?? 'local'];
    const env = await this.buildExecutionEnv(context, [taskEnv, step ? definition.env : undefined], options.env);
    // Resolve every target before any command starts. A typo must not produce a
    // partial fan-out. Queue width is bounded; every started command is awaited.
    const engines = await Promise.all(refs.map(ref => this.executionEngine(ref, { ...options, env })));
    const outcomes: Array<PromiseSettledResult<ExecutionResult>> = new Array(engines.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(definition.maxConcurrent ?? 8, engines.length) }, async () => {
      while (cursor < engines.length) {
        const index = cursor++;
        try {
          const value = await engines[index]!(template.strings, ...template.values).nothrow();
          outcomes[index] = { status: 'fulfilled', value };
        } catch (reason) {
          outcomes[index] = { status: 'rejected', reason };
        }
      }
    }));
    const rejected = outcomes.filter((entry): entry is PromiseRejectedResult => entry.status === 'rejected');
    if (rejected.length) throw new AggregateError(rejected.map(entry => entry.reason), 'Target execution failed; no automatic fan-out retry is safe');
    const results = outcomes.map(entry => (entry as PromiseFulfilledResult<ExecutionResult>).value);
    if (results.length === 1) return results[0]!;
    const failure = results.find(item => !item.ok);
    return { ...emptyResult(), stdout: results.map(item => item.stdout).join('\n'),
      stderr: results.map(item => item.stderr).join('\n'), exitCode: failure?.exitCode ?? 0, ok: !failure };
  }

  private async executionEngine(targetRef: string, options: TaskExecutionOptions) {
    const target = await this.options.targetResolver.resolve(targetRef);
    const config = target.config;
    let engine = await createTargetEngine(target);
    const env = { ...config.env, ...options.env };
    if (Object.keys(env).length) engine = engine.env(env);
    const cwd = options.cwd ?? config.workdir ?? config.cwd;
    if (cwd !== undefined) engine = engine.cd(cwd);
    engine = engine.timeout(options.timeout ?? config.timeout ?? this.options.defaultTimeout ?? 60000);
    if (config.shell !== undefined) engine = engine.shell(config.shell);
    if (config.maxBuffer !== undefined) engine = engine.defaults({ maxBuffer: config.maxBuffer });
    return engine;
  }

  private async executeScript(
    source: string,
    args: string[],
    context: VariableContext,
    options: TaskExecutionOptions,
    taskEnv?: Record<string, string>,
    stepEnv?: Record<string, string>
  ): Promise<CommandOutput> {
    const scriptPath = path.resolve(await this.interpolate(source, context));
    await fs.access(scriptPath).catch(() => { throw new Error(`Script file not found: ${scriptPath}`); });
    const targetRef = options.target ?? 'local';
    const target = await this.options.targetResolver.resolve(targetRef);
    const env = await this.buildExecutionEnv(context, [taskEnv, stepEnv], options.env);
    const targetEngine = await this.executionEngine(targetRef, { ...options, env });
    const scriptArgs = await Promise.all(args.map(arg => this.interpolate(arg, context)));
    // Scripts are local trusted programs. These defaults belong to $target;
    // never mutate process.env/cwd or pretend an in-process script is killable.
    const result = await getScriptLoader({ verbose: this.options.debug, quiet: options.quiet }).executeScript(scriptPath, {
      target, targetEngine,
      context: { args: scriptArgs, argv: [process.argv[0] ?? 'node', scriptPath, ...scriptArgs],
        __filename: scriptPath, __dirname: path.dirname(scriptPath) }, quiet: options.quiet,
    });
    if (!result.success) throw new Error(result.error?.message ?? 'Script execution failed', { cause: result.error });
    return { ...emptyResult(), stdout: result.output ?? '' };
  }

  private async executeTaskHandler(
    handler: { emit?: string; command?: string }, context: VariableContext,
    options: TaskExecutionOptions, env?: Record<string, string>, error?: Error
  ): Promise<void> {
    if (handler.emit) this.emit('event', { name: handler.emit, data: error ? { error: error.message } : {} });
    if (handler.command) {
      const result = await this.executeCommand({ command: handler.command }, context, options, env);
      this.print(result, options);
      this.checkResult(result);
    }
  }

  private checkResult(result: CommandOutput): void {
    if (!result.ok) throw new TaskCommandError(result.exitCode);
  }

  private print(result: CommandOutput, options: TaskExecutionOptions): void {
    if (!options.quiet) {
      if (result.stdout) console.log(result.stdout);
      if (result.stderr) console.error(result.stderr);
    }
  }

  private evaluateCondition(condition: unknown, context: VariableContext): boolean {
    if (typeof condition === 'boolean') return condition;
    if (typeof condition === 'number') return condition !== 0;
    if (typeof condition !== 'string') throw new ConditionEvaluationError(`unsupported condition type '${typeof condition}'`, String(condition));
    return this.conditionEvaluator.evaluate(condition, context);
  }

  private getTimeout(taskTimeout?: string | number, override?: number): number | undefined {
    const timeout = override ?? (taskTimeout === undefined ? undefined : this.parseTimeout(taskTimeout));
    if (timeout !== undefined && (!Number.isSafeInteger(timeout) || timeout < 0)) throw new Error('Task timeout must be a non-negative integer in milliseconds');
    return timeout;
  }

  private parseTimeout(value: string | number): number {
    if (typeof value === 'number') return value;
    const match = /^(\d+)(ms|s|m|h)?$/.exec(value);
    if (!match) throw new Error(`Invalid task duration: ${value}`);
    return Number(match[1]) * ({ ms: 1, s: 1000, m: 60000, h: 3600000 }[match[2] ?? 'ms'] ?? 1);
  }
}

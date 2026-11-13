/** Data-passing workflows with validated dependencies and owned asynchronous commands. */
import { getExecutionSignal, withoutCancellation } from '@xec-sh/core';

import { retry } from '../retry/index.js';
import { runOperation, type OperationExec } from '../utils/operation-scope.js';

export interface TaskOptions {
  dependsOn?: string[];
  when?: (ctx: WorkflowContext) => boolean;
  /** Commands are cancelled at the deadline; callbacks must cooperate with signal. */
  timeout?: number;
  /** Maximum attempts, including the first. */
  retry?: number;
  parallel?: boolean;
  continueOnError?: boolean;
}
export interface TaskResult {
  name: string;
  status: 'success' | 'failed' | 'skipped';
  duration: number;
  output?: unknown;
  error?: string;
  continued?: boolean;
  cancelled?: boolean;
}
export interface WorkflowContext {
  env: Record<string, string>;
  vars: Record<string, unknown>;
  signal: AbortSignal;
  taskOutput: (name: string) => unknown;
  exec: OperationExec;
  log: (message: string) => void;
}
export interface WorkflowResult {
  name: string;
  success: boolean;
  duration: number;
  tasks: TaskResult[];
  failureHandlerError?: string;
  summary: { total: number; succeeded: number; failed: number; skipped: number };
}
interface InternalTask {
  name: string;
  fn: (ctx: WorkflowContext) => Promise<unknown>;
  options: TaskOptions;
}
type SharedContext = Pick<WorkflowContext, 'env' | 'vars' | 'taskOutput' | 'log'>;

export class Workflow {
  private tasks: InternalTask[] = [];
  private failureHandler?: (ctx: WorkflowContext, error: Error) => Promise<void>;
  private constructor(private readonly workflowName: string) {}
  static create(name: string): Workflow { return new Workflow(name); }
  task(name: string, fn: (ctx: WorkflowContext) => Promise<unknown>, options: TaskOptions = {}): this {
    this.tasks.push({ name, fn, options });
    return this;
  }
  onFailure(handler: (ctx: WorkflowContext, error: Error) => Promise<void>): this {
    this.failureHandler = handler;
    return this;
  }

  private validate(): void {
    const names = new Set<string>();
    for (const task of this.tasks) {
      if (!task.name.trim() || names.has(task.name)) throw new Error(`Invalid or duplicate workflow task: ${task.name}`);
      names.add(task.name);
      if (task.options.timeout !== undefined && (!Number.isFinite(task.options.timeout) || task.options.timeout <= 0))
        throw new Error(`Invalid timeout for task ${task.name}`);
      if (task.options.retry !== undefined && (!Number.isSafeInteger(task.options.retry) || task.options.retry < 1))
        throw new Error(`Invalid retry policy for task ${task.name}`);
    }
    for (const task of this.tasks)
      for (const dependency of task.options.dependsOn ?? [])
        if (!names.has(dependency)) throw new Error(`Task ${task.name} depends on unknown task ${dependency}`);
    const remaining = new Set(names);
    while (remaining.size) {
      const ready = this.tasks.filter(task => remaining.has(task.name) &&
        (task.options.dependsOn ?? []).every(name => !remaining.has(name)));
      if (!ready.length) throw new Error(`Circular workflow dependency: ${[...remaining].join(', ')}`);
      for (const task of ready) remaining.delete(task.name);
    }
  }

  async run(opts: { env?: Record<string, string>; vars?: Record<string, unknown>; signal?: AbortSignal } = {}): Promise<WorkflowResult> {
    this.validate();
    const start = Date.now();
    const signal = getExecutionSignal(opts.signal);
    const outputs = new Map<string, unknown>();
    const results = new Map<string, TaskResult>();
    const context: SharedContext = {
      env: { ...process.env as Record<string, string>, ...opts.env }, vars: { ...opts.vars },
      taskOutput: name => outputs.get(name), log: message => console.log(`[${this.workflowName}] ${message}`),
    };
    const execute = async (task: InternalTask) => {
      const blocked = (task.options.dependsOn ?? []).some(name => {
        const dependency = results.get(name)!;
        return (dependency.status === 'failed' && !dependency.continued) ||
          (dependency.status === 'skipped' && dependency.error !== undefined);
      });
      const result = blocked ? { name: task.name, status: 'skipped' as const, duration: 0, error: 'Dependency failed' }
        : await this.executeTask(task, context, opts.env, signal);
      results.set(task.name, result);
      if (result.status === 'success') outputs.set(task.name, result.output);
    };
    while (results.size < this.tasks.length) {
      const ready = this.tasks.filter(task => !results.has(task.name) &&
        (task.options.dependsOn ?? []).every(name => results.has(name)));
      await Promise.all(ready.filter(task => task.options.parallel).map(execute));
      for (const task of ready.filter(candidate => !candidate.options.parallel)) await execute(task);
    }
    const tasks = this.tasks.map(task => results.get(task.name)!);
    let failureHandlerError: string | undefined;
    const failed = tasks.find(task => task.status === 'failed' || task.cancelled);
    if (failed && this.failureHandler) {
      // A registered failure handler is explicit cleanup, with a fresh bounded
      // scope. It cannot return while its own commands remain outstanding.
      try {
        await withoutCancellation(() => runOperation({ env: opts.env }, scope =>
          this.failureHandler!({ ...context, ...scope }, new Error(failed.error ?? 'Workflow failed'))));
      } catch (error) { failureHandlerError = error instanceof Error ? error.message : String(error); }
    }
    return {
      name: this.workflowName,
      success: !signal?.aborted && !failureHandlerError && tasks.every(task => task.status !== 'failed' || task.continued),
      duration: Date.now() - start, tasks, ...(failureHandlerError ? { failureHandlerError } : {}),
      summary: { total: tasks.length, succeeded: tasks.filter(task => task.status === 'success').length,
        failed: tasks.filter(task => task.status === 'failed').length, skipped: tasks.filter(task => task.status === 'skipped').length },
    };
  }

  private async executeTask(task: InternalTask, shared: SharedContext, env?: Record<string, string>, signal?: AbortSignal): Promise<TaskResult> {
    const start = Date.now();
    try {
      signal?.throwIfAborted();
      const outcome = await retry(() => runOperation({ env, signal, timeout: task.options.timeout }, async scope => {
        const context = { ...shared, ...scope };
        if (task.options.when && !task.options.when(context)) return { skipped: true, output: undefined };
        return { skipped: false, output: await task.fn(context) };
      }), { maxAttempts: task.options.retry ?? 1, backoff: 'linear', initialDelay: 1000, jitter: 0, abortSignal: signal });
      return { name: task.name, status: outcome.skipped ? 'skipped' : 'success', duration: Date.now() - start, output: outcome.output };
    } catch (error) {
      return { name: task.name, status: signal?.aborted ? 'skipped' : 'failed', duration: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
        ...(signal?.aborted ? { cancelled: true } : task.options.continueOnError ? { continued: true } : {}) };
    }
  }
}

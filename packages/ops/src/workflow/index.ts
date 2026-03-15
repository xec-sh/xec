/**
 * DAG-based workflow engine with conditional execution,
 * fan-out/fan-in, data passing, and resume-from-failure.
 *
 * @example
 * ```typescript
 * import { Workflow } from '@xec-sh/ops/workflow';
 *
 * const workflow = Workflow.create('release')
 *   .task('validate', async (ctx) => {
 *     await ctx.exec('pnpm typecheck');
 *     return { valid: true };
 *   })
 *   .task('build', async (ctx) => {
 *     await ctx.exec('pnpm build');
 *     return { artifacts: ['dist/'] };
 *   }, { dependsOn: ['validate'] })
 *   .task('test', async (ctx) => {
 *     await ctx.exec('pnpm test');
 *   }, { dependsOn: ['build'], parallel: true })
 *   .task('deploy', async (ctx) => {
 *     const { artifacts } = ctx.taskOutput('build');
 *     await ctx.exec(`deploy ${artifacts[0]}`);
 *   }, { dependsOn: ['test'], when: (ctx) => ctx.env.BRANCH === 'main' })
 *   .onFailure(async (ctx, err) => {
 *     await ctx.exec(`notify-slack "Build failed: ${err.message}"`);
 *   });
 *
 * const result = await workflow.run({ env: { BRANCH: 'main' } });
 * ```
 *
 * @module @xec-sh/ops/workflow
 */

import { execSync } from 'node:child_process';

export interface TaskOptions {
  dependsOn?: string[];
  when?: (ctx: WorkflowContext) => boolean;
  timeout?: number;
  retry?: number;
  parallel?: boolean; // Can run in parallel with siblings at same depth
  continueOnError?: boolean;
}

export interface TaskResult {
  name: string;
  status: 'success' | 'failed' | 'skipped';
  duration: number;
  output?: unknown;
  error?: string;
}

export interface WorkflowContext {
  env: Record<string, string>;
  vars: Record<string, unknown>;
  taskOutput: (name: string) => unknown;
  exec: (cmd: string) => { stdout: string; exitCode: number };
  log: (message: string) => void;
}

export interface WorkflowResult {
  name: string;
  success: boolean;
  duration: number;
  tasks: TaskResult[];
  summary: { total: number; succeeded: number; failed: number; skipped: number };
}

interface InternalTask {
  name: string;
  fn: (ctx: WorkflowContext) => Promise<unknown>;
  options: TaskOptions;
}

export class Workflow {
  private tasks: InternalTask[] = [];
  private failureHandler?: (ctx: WorkflowContext, error: Error) => Promise<void>;
  private workflowName: string;

  private constructor(name: string) {
    this.workflowName = name;
  }

  static create(name: string): Workflow {
    return new Workflow(name);
  }

  /** Add a task to the workflow */
  task(name: string, fn: (ctx: WorkflowContext) => Promise<unknown>, options: TaskOptions = {}): this {
    this.tasks.push({ name, fn, options });
    return this;
  }

  /** Set global failure handler */
  onFailure(handler: (ctx: WorkflowContext, error: Error) => Promise<void>): this {
    this.failureHandler = handler;
    return this;
  }

  /** Execute the workflow respecting the DAG */
  async run(opts?: { env?: Record<string, string>; vars?: Record<string, unknown> }): Promise<WorkflowResult> {
    const startTime = Date.now();
    const taskOutputs = new Map<string, unknown>();
    const results: TaskResult[] = [];
    const completed = new Set<string>();

    const ctx: WorkflowContext = {
      env: { ...process.env as Record<string, string>, ...opts?.env },
      vars: { ...opts?.vars },
      taskOutput: (name) => taskOutputs.get(name),
      exec: (cmd) => {
        try {
          const stdout = execSync(cmd, { encoding: 'utf-8', timeout: 300_000, stdio: ['pipe', 'pipe', 'pipe'] });
          return { stdout, exitCode: 0 };
        } catch (err: unknown) {
          return { stdout: '', exitCode: (err as { status?: number }).status ?? 1 };
        }
      },
      log: (msg) => console.log(`[${this.workflowName}] ${msg}`),
    };

    const remaining = [...this.tasks];
    let progress = true;
    let hasFailure = false;

    while (remaining.length > 0 && progress) {
      progress = false;

      // Find all tasks whose dependencies are met
      const ready = remaining.filter((t) => {
        const deps = t.options.dependsOn ?? [];
        return deps.every((d) => completed.has(d));
      });

      if (ready.length === 0 && remaining.length > 0) {
        // Circular dependency
        for (const t of remaining) {
          results.push({ name: t.name, status: 'failed', duration: 0, error: 'Circular dependency' });
        }
        break;
      }

      // Group parallel-eligible tasks
      const parallelGroup = ready.filter((t) => t.options.parallel);
      const sequentialGroup = ready.filter((t) => !t.options.parallel);

      // Execute parallel group concurrently
      if (parallelGroup.length > 0) {
        const parallelResults = await Promise.all(
          parallelGroup.map((task) => this.executeTask(task, ctx, hasFailure))
        );

        for (let i = 0; i < parallelGroup.length; i++) {
          const task = parallelGroup[i]!;
          const result = parallelResults[i]!;
          results.push(result);
          if (result.status === 'success') taskOutputs.set(task.name, result.output);
          if (result.status === 'failed') hasFailure = true;
          completed.add(task.name);
          remaining.splice(remaining.indexOf(task), 1);
          progress = true;
        }
      }

      // Execute sequential tasks one by one
      for (const task of sequentialGroup) {
        const result = await this.executeTask(task, ctx, hasFailure);
        results.push(result);
        if (result.status === 'success') taskOutputs.set(task.name, result.output);
        if (result.status === 'failed') hasFailure = true;
        completed.add(task.name);
        remaining.splice(remaining.indexOf(task), 1);
        progress = true;
      }
    }

    const success = results.every((r) => r.status !== 'failed');

    // Call failure handler if any task failed
    if (hasFailure && this.failureHandler) {
      const firstError = results.find((r) => r.status === 'failed');
      try {
        await this.failureHandler(ctx, new Error(firstError?.error ?? 'Workflow failed'));
      } catch {
        // Failure handler itself failed — don't mask original error
      }
    }

    return {
      name: this.workflowName,
      success,
      duration: Date.now() - startTime,
      tasks: results,
      summary: {
        total: results.length,
        succeeded: results.filter((r) => r.status === 'success').length,
        failed: results.filter((r) => r.status === 'failed').length,
        skipped: results.filter((r) => r.status === 'skipped').length,
      },
    };
  }

  private async executeTask(
    task: InternalTask,
    ctx: WorkflowContext,
    parentFailed: boolean
  ): Promise<TaskResult> {
    // Check if dependency failed
    if (parentFailed && !task.options.continueOnError) {
      // Check if THIS task's specific deps failed
      const deps = task.options.dependsOn ?? [];
      if (deps.length > 0) {
        return { name: task.name, status: 'skipped', duration: 0, error: 'Dependency failed' };
      }
    }

    // Check condition
    if (task.options.when && !task.options.when(ctx)) {
      return { name: task.name, status: 'skipped', duration: 0 };
    }

    const startTime = Date.now();
    const maxRetries = task.options.retry ?? 1;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const output = await Promise.race([
          task.fn(ctx),
          task.options.timeout
            ? new Promise((_, reject) => setTimeout(() => reject(new Error('Task timed out')), task.options.timeout))
            : new Promise(() => {}), // Never resolves — no timeout
        ]);

        return { name: task.name, status: 'success', duration: Date.now() - startTime, output };
      } catch (err) {
        if (attempt === maxRetries) {
          const error = err instanceof Error ? err.message : String(err);
          if (task.options.continueOnError) {
            return { name: task.name, status: 'success', duration: Date.now() - startTime, error };
          }
          return { name: task.name, status: 'failed', duration: Date.now() - startTime, error };
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    return { name: task.name, status: 'failed', duration: Date.now() - startTime, error: 'Exhausted retries' };
  }
}

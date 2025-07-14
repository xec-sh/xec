import PQueue from 'p-queue';

import { Validator } from '../core/validation.js';
import { SkipTaskError } from '../context/globals.js';
import { TaskScheduler, ScheduledTask } from './scheduler.js';
import { ContextBuilder, createTaskContext } from '../context/builder.js';
import { contextProvider, ExecutionContext } from '../context/provider.js';
import { 
  TaskError, 
  isTaskError, 
  TimeoutError,
  ValidationError 
} from '../core/errors.js';

import type { Task, Recipe, Variables, TaskResult, TaskContext, TaskHandler } from '../core/types.js';

export interface ExecutorOptions {
  dryRun?: boolean;
  verbose?: boolean;
  parallel?: boolean;
  maxConcurrency?: number;
  continueOnError?: boolean;
  timeout?: number;
  globalVars?: Variables;
  vars?: Variables; // Alias for globalVars
  secrets?: Variables;
  hosts?: string[];
  tags?: string[];
  hooks?: {
    before?: () => Promise<void>;
    after?: () => Promise<void>;
    beforeTask?: (task: Task) => Promise<void>;
    afterTask?: (task: Task, result: TaskResult) => Promise<void>;
    onError?: (task: Task, error: Error) => Promise<void>;
  };
}

export interface ExecutionResult {
  success: boolean;
  results: Map<string, TaskResult>;
  errors: Map<string, Error>;
  skipped: Set<string>;
  duration: number;
  status: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
  };
}

export class RecipeExecutor {
  private scheduler: TaskScheduler;
  private queue: PQueue;
  private results: Map<string, TaskResult> = new Map();
  private errors: Map<string, Error> = new Map();
  private skipped: Set<string> = new Set();
  private startTime: number = 0;
  private context: ExecutionContext;

  constructor(
    private recipe: Recipe,
    private options: ExecutorOptions = {}
  ) {
    this.scheduler = new TaskScheduler(recipe, {
      respectPhases: true,
      continueOnError: options.continueOnError ?? false
    });

    const concurrency = this.options.maxConcurrency || 
      (this.options.parallel === false ? 1 : Infinity);

    this.queue = new PQueue({ concurrency });

    this.context = new ContextBuilder({
      recipeId: recipe.id,
      dryRun: options.dryRun,
      verbose: options.verbose,
      parallel: options.parallel ?? true,
      timeout: options.timeout,
      globalVars: { ...recipe.vars, ...(options.globalVars || options.vars || {}) },
      secrets: options.secrets || {},
      hosts: options.hosts,
      tags: options.tags
    }).build();
  }

  async execute(): Promise<ExecutionResult> {
    this.startTime = Date.now();
    
    try {
      await this.runHook('before');
      
      if (this.recipe.hooks?.before) {
        for (const hook of this.recipe.hooks.before) {
          await contextProvider.run(this.context, () => hook());
        }
      }

      const phases = this.scheduler.getPhases();
      
      for (const phase of phases) {
        await this.executePhase(phase.tasks);
        
        if (!this.options.continueOnError && this.errors.size > 0) {
          break;
        }
      }

      if (this.recipe.hooks?.after) {
        for (const hook of this.recipe.hooks.after) {
          await contextProvider.run(this.context, () => hook());
        }
      }
      
      await this.runHook('after');
    } catch (error) {
      this.context.logger.error(`Recipe execution failed: ${error}`);
      throw error;
    }

    const duration = Date.now() - this.startTime;
    const status = this.scheduler.getStatus();

    const result: ExecutionResult = {
      success: this.errors.size === 0,
      results: this.results,
      errors: this.errors,
      skipped: this.skipped,
      duration,
      status
    };

    // Add legacy aliases for compatibility
    (result as any).taskResults = result.results;
    if (this.errors.size > 0) {
      (result as any).error = Array.from(this.errors.values())[0];
    }

    return result;
  }

  private async executePhase(scheduledTasks: ScheduledTask[]): Promise<void> {
    const promises = scheduledTasks.map(scheduled => 
      this.queue.add(() => this.executeTask(scheduled))
    );

    await Promise.all(promises);
  }

  private async executeTask(scheduled: ScheduledTask): Promise<void> {
    const task = scheduled.task;
    
    try {
      if (!this.shouldExecuteTask(task)) {
        this.scheduler.markTaskSkipped(task.id);
        this.skipped.add(task.id);
        this.context.logger.info(`Skipping task ${task.id}: conditions not met`);
        return;
      }

      await this.runHook('beforeTask', task);
      
      if (this.recipe.hooks?.beforeEach) {
        await contextProvider.run(this.context, () => 
          this.recipe.hooks!.beforeEach!(task)
        );
      }

      this.scheduler.markTaskStarted(task.id);
      this.context.logger.info(`Starting task ${task.id}: ${task.description || ''}`);

      const result = await this.runTask(task);
      
      this.results.set(task.id, result);
      this.scheduler.markTaskCompleted(task.id);
      this.context.logger.info(`Completed task ${task.id}`);

      if (this.recipe.hooks?.afterEach) {
        await contextProvider.run(this.context, () => 
          this.recipe.hooks!.afterEach!(task, result)
        );
      }
      
      await this.runHook('afterTask', task, result);
    } catch (error) {
      await this.handleTaskError(task, error as Error);
    }
  }

  private async runTask(task: Task): Promise<TaskResult> {
    const hosts = this.getTaskHosts(task);
    
    if (hosts.length === 0) {
      return this.runTaskOnce(task);
    }

    const results: TaskResult[] = [];
    const errors: Error[] = [];

    for (const host of hosts) {
      try {
        const result = await this.runTaskOnce(task, host);
        results.push(result);
      } catch (error) {
        errors.push(error as Error);
        if (!task.options?.continueOnError) {
          throw error;
        }
      }
    }

    if (errors.length > 0 && errors.length === hosts.length) {
      throw errors[0];
    }

    return {
      hosts: results,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  private async runTaskOnce(task: Task, host?: string): Promise<TaskResult> {
    const taskContext = createTaskContext(task, this.context, { host });
    
    this.validateTaskVariables(task, taskContext);

    if (this.options.dryRun) {
      this.context.logger.info(`[DRY RUN] Would execute task ${task.id}${host ? ` on ${host}` : ''}`);
      return { dryRun: true };
    }

    const timeout = task.options?.timeout || this.context.timeout;
    let result: TaskResult;

    try {
      result = await contextProvider.run(taskContext, async () => {
        if (task.options?.retry && task.options.retry.maxAttempts && task.options.retry.maxAttempts > 1) {
          return await this.executeWithRetry(task, taskContext);
        } else {
          return await this.executeHandler(task, taskContext);
        }
      });
    } catch (error) {
      if (error instanceof SkipTaskError) {
        throw error;
      }
      
      const taskError = isTaskError(error) ? error : new TaskError(
        `Task ${task.id} failed: ${error}`,
        task.id,
        task.metadata?.phase,
        { originalError: error }
      );
      throw taskError;
    }

    return result;
  }

  private async executeHandler(task: Task, context: TaskContext): Promise<TaskResult> {
    const timeout = task.options?.timeout || this.context.timeout;
    
    if (timeout) {
      return await this.executeWithTimeout(task.handler, context, timeout, task.id);
    }
    
    return await task.handler(context);
  }

  private async executeWithTimeout(
    handler: TaskHandler,
    context: TaskContext,
    timeout: number,
    taskId: string
  ): Promise<TaskResult> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout;
      
      const timeoutPromise = new Promise<never>((_, rej) => {
        timeoutId = setTimeout(() => {
          rej(new TimeoutError(
            `Task ${taskId} timed out after ${timeout}ms`,
            taskId,
            timeout
          ));
        }, timeout);
      });

      Promise.race([Promise.resolve(handler(context)), timeoutPromise])
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timeoutId));
    });
  }

  private async executeWithRetry(task: Task, context: TaskContext): Promise<TaskResult> {
    const { maxAttempts = 3, delay = 1000, backoffMultiplier = 2 } = task.options!.retry!;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const attemptContext = { ...context, attempt };
        const result = await this.executeHandler(task, attemptContext);
        
        if (attempt > 1) {
          this.context.logger.info(`Task ${task.id} succeeded on attempt ${attempt}`);
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxAttempts) {
          const waitTime = delay * Math.pow(backoffMultiplier, attempt - 1);
          this.context.logger.warn(
            `Task ${task.id} failed on attempt ${attempt}/${maxAttempts}, retrying in ${waitTime}ms`
          );
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    throw lastError;
  }

  private validateTaskVariables(task: Task, context: TaskContext): void {
    if (task.metadata?.requiredVars || task.metadata?.varsSchema) {
      try {
        Validator.validateTaskVariables(
          task.id,
          context.vars,
          task.metadata?.requiredVars,
          task.metadata?.varsSchema
        );
      } catch (error) {
        if (error instanceof ValidationError) {
          throw new TaskError(
            error.message,
            task.id,
            (task as any).phase || task.metadata?.phase,
            { validationError: error }
          );
        }
        throw error;
      }
    }
  }

  private shouldExecuteTask(task: Task): boolean {
    if (!this.matchesHostFilter(task)) {
      return false;
    }

    if (!this.matchesTagFilter(task)) {
      return false;
    }

    const result = contextProvider.run(this.context, () => {
      if (task.options?.when !== undefined) {
        const result = this.evaluateCondition(task.options.when);
        if (!result) return false;
      }

      if (task.options?.unless !== undefined) {
        const result = this.evaluateCondition(task.options.unless);
        if (result) return false;
      }

      return true;
    });

    return result instanceof Promise ? false : result;
  }

  private evaluateCondition(condition: string | boolean | (() => boolean | Promise<boolean>)): boolean {
    if (typeof condition === 'boolean') {
      return condition;
    }

    if (typeof condition === 'function') {
      const result = condition();
      return result instanceof Promise ? false : result;
    }

    if (typeof condition === 'string') {
      return this.evaluateStringCondition(condition);
    }

    return false;
  }

  private evaluateStringCondition(condition: string): boolean {
    const vars = contextProvider.getAllVariables();
    
    try {
      return new Function('vars', `return ${condition}`)(vars);
    } catch {
      return false;
    }
  }

  private matchesHostFilter(task: Task): boolean {
    if (!this.context.hosts || this.context.hosts.length === 0) {
      return true;
    }

    if (!task.options?.hosts) {
      return true;
    }

    const hosts = typeof task.options.hosts === 'function'
      ? task.options.hosts(this.context as any)
      : Array.isArray(task.options.hosts)
        ? task.options.hosts
        : [task.options.hosts];

    return hosts.some(host => this.context.hosts!.includes(host));
  }

  private matchesTagFilter(task: Task): boolean {
    if (!this.context.tags || this.context.tags.length === 0) {
      return true;
    }

    if (!task.tags || task.tags.length === 0) {
      return false;
    }

    return task.tags.some(tag => this.context.tags!.includes(tag));
  }

  private getTaskHosts(task: Task): string[] {
    if (task.options?.hosts) {
      const hosts = typeof task.options.hosts === 'function' 
        ? task.options.hosts(this.context as any)
        : Array.isArray(task.options.hosts) 
          ? task.options.hosts 
          : [task.options.hosts];
      return hosts;
    }

    if (this.context.hosts && this.context.hosts.length > 0) {
      return this.context.hosts;
    }

    return [];
  }

  private async handleTaskError(task: Task, error: Error): Promise<void> {
    this.scheduler.markTaskFailed(task.id);
    this.errors.set(task.id, error);
    
    if (error instanceof SkipTaskError) {
      this.scheduler.markTaskSkipped(task.id);
      this.skipped.add(task.id);
      this.context.logger.info(`Task ${task.id} skipped: ${error.message}`);
      return;
    }

    this.context.logger.error(`Task ${task.id} failed: ${error.message}`);
    
    if (this.recipe.hooks?.onError) {
      for (const hook of this.recipe.hooks.onError) {
        await contextProvider.run(this.context, () => hook(error, this.context));
      }
    }
    
    await this.runHook('onError', task, error);

    if (task.metadata?.rollback) {
      try {
        this.context.logger.info(`Running rollback for task ${task.id}`);
        const taskContext = createTaskContext(task, this.context);
        await contextProvider.run(taskContext, () => task.metadata!.rollback(taskContext));
      } catch (rollbackError) {
        this.context.logger.error(`Rollback failed for task ${task.id}: ${rollbackError}`);
      }
    }

    if (!task.options?.continueOnError && !this.options.continueOnError) {
      throw error;
    }
  }

  private async runHook(name: string, ...args: any[]): Promise<void> {
    const hook = this.options.hooks?.[name as keyof typeof this.options.hooks];
    if (hook && typeof hook === 'function') {
      await (hook as Function)(...args);
    }
  }

  async stop(): Promise<void> {
    this.queue.pause();
    this.queue.clear();
    await this.queue.onIdle();
  }

  getProgress(): {
    completed: number;
    total: number;
    percentage: number;
    running: string[];
    failed: string[];
  } {
    const status = this.scheduler.getStatus();
    const running = Array.from(this.scheduler['running']);
    const failed = Array.from(this.errors.keys());

    return {
      completed: status.completed,
      total: status.total,
      percentage: Math.round((status.completed / status.total) * 100),
      running,
      failed
    };
  }
}

export async function executeRecipe(
  recipe: Recipe,
  options?: ExecutorOptions
): Promise<ExecutionResult> {
  const executor = new RecipeExecutor(recipe, options);
  return executor.execute();
}
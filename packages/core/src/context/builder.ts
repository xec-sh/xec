import { merge } from 'lodash-es';
import { randomUUID } from 'crypto';

import { createLogger, createTaskLogger, createRecipeLogger } from '../utils/logger.js';

import type { ExecutionContext } from './provider.js';
import type { Task, Logger, Recipe, Variables, TaskContext } from '../core/types.js';

export interface ContextBuilderOptions {
  recipeId?: string;
  runId?: string;
  taskId?: string;
  vars?: Variables;
  host?: string;
  phase?: string;
  attempt?: number;
  dryRun?: boolean;
  parallel?: boolean;
  maxRetries?: number;
  timeout?: number;
  logger?: Logger;
  globalVars?: Variables;
  secrets?: Variables;
  hosts?: string[];
  tags?: string[];
  state?: Map<string, any>;
}

export class ContextBuilder {
  private options: ContextBuilderOptions;

  constructor(options: ContextBuilderOptions = {}) {
    this.options = {
      runId: randomUUID(),
      dryRun: false,
      parallel: false,
      maxRetries: 3,
      timeout: 300000,
      globalVars: {},
      secrets: {},
      ...options
    };
  }

  static forRecipe(recipe: Recipe, options?: ContextBuilderOptions): ContextBuilder {
    return new ContextBuilder({
      recipeId: recipe.id,
      globalVars: recipe.vars || {},
      ...options
    });
  }

  static forTask(task: Task, parentContext?: ExecutionContext, options?: ContextBuilderOptions): ContextBuilder {
    const builder = new ContextBuilder(options);
    
    if (parentContext) {
      builder.inheritFrom(parentContext);
    }
    
    return builder
      .withTaskId(task.id)
      .withVars(task.options?.vars || {})
      .withPhase(parentContext?.phase)
      .withTimeout(task.options?.timeout);
  }

  withRecipeId(recipeId: string): ContextBuilder {
    this.options.recipeId = recipeId;
    return this;
  }

  withRunId(runId: string): ContextBuilder {
    this.options.runId = runId;
    return this;
  }

  withDryRun(dryRun: boolean): ContextBuilder {
    this.options.dryRun = dryRun;
    return this;
  }


  withParallel(parallel: boolean): ContextBuilder {
    this.options.parallel = parallel;
    return this;
  }

  withMaxRetries(maxRetries: number): ContextBuilder {
    this.options.maxRetries = maxRetries;
    return this;
  }

  withTimeout(timeout?: number): ContextBuilder {
    if (timeout !== undefined) {
      this.options.timeout = timeout;
    }
    return this;
  }

  withLogger(logger: Logger): ContextBuilder {
    this.options.logger = logger;
    return this;
  }

  withGlobalVars(vars: Variables): ContextBuilder {
    this.options.globalVars = merge({}, this.options.globalVars, vars);
    return this;
  }

  withSecrets(secrets: Variables): ContextBuilder {
    this.options.secrets = merge({}, this.options.secrets, secrets);
    return this;
  }

  withHosts(hosts: string[]): ContextBuilder {
    this.options.hosts = hosts;
    return this;
  }

  withTags(tags: string[]): ContextBuilder {
    this.options.tags = tags;
    return this;
  }

  withState(state: Map<string, any>): ContextBuilder {
    this.options.state = state;
    return this;
  }

  withTaskId(taskId: string): ContextBuilder {
    this.options.taskId = taskId;
    return this;
  }

  withVars(vars: Variables): ContextBuilder {
    this.options.vars = merge({}, this.options.vars, vars);
    return this;
  }

  withHost(host?: string): ContextBuilder {
    this.options.host = host;
    return this;
  }

  withPhase(phase?: string): ContextBuilder {
    this.options.phase = phase;
    return this;
  }

  withAttempt(attempt: number): ContextBuilder {
    this.options.attempt = attempt;
    return this;
  }

  inheritFrom(parentContext: ExecutionContext): ContextBuilder {
    this.options = {
      ...this.options,
      recipeId: parentContext.recipeId,
      runId: parentContext.runId,
      dryRun: parentContext.dryRun,
      parallel: parentContext.parallel,
      maxRetries: parentContext.maxRetries,
      timeout: parentContext.timeout,
      globalVars: { ...parentContext.globalVars },
      secrets: { ...parentContext.secrets },
      hosts: parentContext.hosts ? [...parentContext.hosts] : undefined,
      tags: parentContext.tags ? [...parentContext.tags] : undefined,
      state: parentContext.state
    };
    return this;
  }

  build(): ExecutionContext {
    const {
      recipeId = 'unknown',
      runId = randomUUID(),
      taskId = 'unknown',
      vars = {},
      host,
      phase,
      attempt = 1,
      dryRun = false,
      parallel = false,
      maxRetries = 3,
      timeout = 300000,
      globalVars = {},
      secrets = {},
      hosts,
      tags,
      state = new Map()
    } = this.options;

    let logger = this.options.logger;
    if (!logger) {
      if (taskId && taskId !== 'unknown') {
        logger = createTaskLogger(taskId);
      } else if (recipeId && recipeId !== 'unknown') {
        logger = createRecipeLogger(recipeId);
      } else {
        logger = createLogger();
      }
    }


    return {
      recipeId,
      runId,
      taskId,
      vars,
      host,
      phase,
      attempt,
      dryRun,
      parallel,
      maxRetries,
      timeout,
      startTime: new Date(),
      logger,
      globalVars,
      secrets,
      state,
      hosts,
      tags
    };
  }
}

export function createExecutionContext(options?: ContextBuilderOptions): ExecutionContext {
  return new ContextBuilder(options).build();
}

export function createTaskContext(
  task: Task,
  parentContext?: ExecutionContext,
  options?: Partial<TaskContext>
): ExecutionContext {
  const builder = ContextBuilder.forTask(task, parentContext);
  
  if (options) {
    if (options.vars) builder.withVars(options.vars);
    if (options.host) builder.withHost(options.host);
    if (options.phase) builder.withPhase(options.phase);
    if (options.attempt) builder.withAttempt(options.attempt);
  }
  
  return builder.build();
}

export function createRecipeContext(
  recipe: Recipe,
  options?: ContextBuilderOptions
): ExecutionContext {
  return ContextBuilder.forRecipe(recipe, options).build();
}

export function mergeContexts(
  base: ExecutionContext,
  override: Partial<ExecutionContext>
): ExecutionContext {
  return {
    ...base,
    ...override,
    vars: merge({}, base.vars, override.vars),
    globalVars: merge({}, base.globalVars, override.globalVars),
    secrets: merge({}, base.secrets, override.secrets)
  };
}
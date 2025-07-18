
import { Validator } from '../core/validation.js';
import { ValidationError } from '../core/errors.js';

import type {
  Task,
  Variables,
  Condition,
  JSONSchema,
  TaskHandler,
  TaskOptions,
  RetryConfig,
  HostSelector
} from '../core/types.js';

// Re-export Task type for convenience
export type { Task };

export interface TaskBuilderOptions {
  id?: string;
  name: string;
  description?: string;
  handler: TaskHandler;
  options?: Partial<TaskOptions>;
  dependencies?: string[];
  tags?: string[];
  metadata?: Record<string, any>;
}

export class TaskBuilder {
  private task: Partial<Task>;
  private taskOptions: Partial<TaskOptions> = {};

  constructor(name: string) {
    this.task = {
      id: name,  // Use name as default id instead of UUID
      name,
      dependencies: [],
      tags: [],
      metadata: {},
      options: {} as TaskOptions
    };
  }

  static create(name: string): TaskBuilder {
    return new TaskBuilder(name);
  }

  id(id: string): TaskBuilder {
    this.task.id = id;
    return this;
  }

  description(description: string): TaskBuilder {
    this.task.description = description;
    return this;
  }

  handler(handler: TaskHandler): TaskBuilder {
    this.task.handler = handler;
    return this;
  }

  run(handler: TaskHandler): TaskBuilder {
    return this.handler(handler);
  }

  vars(vars: Variables): TaskBuilder {
    this.taskOptions.vars = { ...this.taskOptions.vars, ...vars };
    return this;
  }

  var(name: string, value: any): TaskBuilder {
    if (!this.taskOptions.vars) {
      this.taskOptions.vars = {};
    }
    this.taskOptions.vars[name] = value;
    return this;
  }

  depends(...taskIds: string[]): TaskBuilder {
    this.task.dependencies = [...(this.task.dependencies || []), ...taskIds];
    return this;
  }

  dependsOn(...taskIds: string[]): TaskBuilder {
    return this.depends(...taskIds);
  }

  requires(...varNames: string[]): TaskBuilder {
    // Store in metadata for now
    if (!this.task.metadata) {
      this.task.metadata = {};
    }
    this.task.metadata['requiredVars'] = [...(this.task.metadata['requiredVars'] || []), ...varNames];
    return this;
  }

  schema(schema: JSONSchema): TaskBuilder {
    // Store in metadata for now
    if (!this.task.metadata) {
      this.task.metadata = {};
    }
    this.task.metadata['varsSchema'] = schema;
    return this;
  }

  phase(phase: string): TaskBuilder {
    if (!this.task.metadata) {
      this.task.metadata = {};
    }
    this.task.metadata['phase'] = phase;
    return this;
  }

  unless(condition: Condition): TaskBuilder {
    if (!this.task.metadata) {
      this.task.metadata = {};
    }
    this.task.metadata['unless'] = condition;
    return this;
  }

  onlyIf(condition: Condition): TaskBuilder {
    return this.when(condition);
  }

  skipIf(condition: Condition): TaskBuilder {
    return this.unless(condition);
  }

  when(condition: Condition): TaskBuilder {
    this.taskOptions.when = condition;
    return this;
  }

  hosts(...args: HostSelector[] | [HostSelector]): TaskBuilder {
    // Handle multiple string arguments
    if (args.length > 1 || (args.length === 1 && typeof args[0] === 'string')) {
      const newHosts = args.filter(h => typeof h === 'string') as string[];
      const currentHosts = this.taskOptions.hosts;

      if (Array.isArray(currentHosts)) {
        this.taskOptions.hosts = [...currentHosts, ...newHosts];
      } else if (typeof currentHosts === 'string') {
        this.taskOptions.hosts = [currentHosts, ...newHosts];
      } else {
        this.taskOptions.hosts = newHosts;
      }
    } else {
      // Handle function or array selector
      this.taskOptions.hosts = args[0];
    }
    return this;
  }

  tags(...tags: string[]): TaskBuilder {
    this.task.tags = [...(this.task.tags || []), ...tags];
    return this;
  }

  timeout(ms: number): TaskBuilder {
    Validator.validateTimeout(ms);
    this.taskOptions.timeout = ms;
    return this;
  }

  retry(config: RetryConfig | number): TaskBuilder {
    if (typeof config === 'number') {
      this.taskOptions.retry = { maxAttempts: config };
    } else {
      Validator.validateRetryConfig(config);
      this.taskOptions.retry = config;
    }
    return this;
  }

  parallel(parallel: boolean = true): TaskBuilder {
    this.taskOptions.parallel = parallel;
    return this;
  }

  continueOnError(continueOnError: boolean = true): TaskBuilder {
    this.taskOptions.continueOnError = continueOnError;
    return this;
  }

  rollback(handler: TaskHandler): TaskBuilder {
    // Store rollback handler in metadata for now
    if (!this.task.metadata) {
      this.task.metadata = {};
    }
    this.task.metadata['rollback'] = handler;
    return this;
  }

  meta(key: string, value: any): TaskBuilder;
  meta(data: Record<string, any>): TaskBuilder;
  meta(keyOrData: string | Record<string, any>, value?: any): TaskBuilder {
    if (!this.task.metadata) {
      this.task.metadata = {};
    }
    if (typeof keyOrData === 'string') {
      this.task.metadata[keyOrData] = value;
    } else {
      this.task.metadata = { ...this.task.metadata, ...keyOrData };
    }
    return this;
  }

  validate(): void {
    if (!this.task.id) {
      throw new ValidationError('Task must have an id');
    }

    if (!this.task.name) {
      throw new ValidationError('Task must have a name');
    }

    if (!this.task.handler) {
      throw new ValidationError('Task must have a handler', 'handler');
    }

    if (this.task.dependencies) {
      const uniqueDeps = new Set(this.task.dependencies);
      if (uniqueDeps.size !== this.task.dependencies.length) {
        throw new ValidationError('Task has duplicate dependencies', 'dependencies', this.task.dependencies);
      }

      if (this.task.dependencies.includes(this.task.id)) {
        throw new ValidationError('Task cannot depend on itself', 'dependencies', this.task.id);
      }
    }

    // Validate requiredVars against schema
    if (this.task.metadata?.['requiredVars'] && this.task.metadata?.['varsSchema']) {
      const schema = this.task.metadata['varsSchema'];
      const schemaProps = schema['properties'] || {};
      const requiredVars = this.task.metadata['requiredVars'];

      const undefinedVars = requiredVars.filter((v: string) => !(v in schemaProps));
      if (undefinedVars.length > 0) {
        throw new ValidationError(`Required vars not defined in schema: ${undefinedVars.join(', ')}`, 'requiredVars', undefinedVars);
      }
    }
  }

  build(): Task {
    this.validate();

    // Build the task with legacy compatibility
    const task: Task = {
      id: this.task.id!,
      name: this.task.name!,
      description: this.task.description,
      handler: this.task.handler!,
      options: {
        retry: this.taskOptions.retry,
        timeout: this.taskOptions.timeout,
        when: this.taskOptions.when,
        hosts: this.taskOptions.hosts,
        parallel: this.taskOptions.parallel,
        continueOnError: this.taskOptions.continueOnError,
        vars: this.taskOptions.vars || {}
      },
      dependencies: this.task.dependencies || [],
      tags: this.task.tags || [],
      metadata: this.task.metadata || {}
    };

    // Add legacy properties for backward compatibility
    const legacyTask = task as any;
    legacyTask.depends = task.dependencies;
    legacyTask.hosts = task.options.hosts || [];
    legacyTask.vars = task.options.vars;
    legacyTask.phase = task.metadata?.['phase'];
    legacyTask.requiredVars = task.metadata?.['requiredVars'] || [];
    legacyTask.varsSchema = task.metadata?.['varsSchema'];
    legacyTask.when = task.options.when;
    legacyTask.unless = task.metadata?.['unless'];
    legacyTask.timeout = task.options.timeout;
    legacyTask.retry = task.options.retry;
    legacyTask.parallel = task.options.parallel;
    legacyTask.continueOnError = task.options.continueOnError;
    legacyTask.rollback = task.metadata?.['rollback'];
    // Filter out system fields for legacy meta
    const systemFields = ['phase', 'requiredVars', 'varsSchema', 'unless', 'rollback'];
    legacyTask.meta = {};
    if (task.metadata) {
      Object.keys(task.metadata).forEach(key => {
        if (!systemFields.includes(key)) {
          legacyTask.meta[key] = task.metadata![key];
        }
      });
    }

    return task;
  }
}

export function task(name: string, handler?: TaskHandler): TaskBuilder {
  const builder = TaskBuilder.create(name);
  if (handler) {
    builder.handler(handler);
  }
  return builder;
}

export function shell(name: string, command: string, options?: {
  cwd?: string;
  env?: Record<string, string>;
  shell?: string;
}): TaskBuilder {
  return task(name).handler(async (context) => {
    const { $ } = await import('@xec/ush');
    let execEngine = $;
    if (options?.cwd) {
      execEngine = execEngine.cd(options.cwd);
    }
    if (options?.env) {
      execEngine = execEngine.env(options.env);
    }
    
    // Use template literal syntax
    const result = await execEngine`${command}`;

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode
    };
  });
}

export function script(name: string, scriptPath: string, args?: string[]): TaskBuilder {
  return task(name).handler(async (context) => {
    const { $ } = await import('@xec/ush');
    const command = args ? `${scriptPath} ${args.join(' ')}` : scriptPath;
    const result = await $`${command}`;

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode
    };
  });
}

export function parallel(name: string, tasks: Task[]): TaskBuilder {
  return task(name)
    .handler(async (context) => {
      const results = await Promise.all(
        tasks.map(t => t.handler(context))
      );
      return { results };
    })
    .parallel(true);
}

export function sequence(name: string, tasks: Task[]): TaskBuilder {
  // Set dependencies between tasks
  if (tasks.length > 1) {
    for (let i = 1; i < tasks.length; i++) {
      const currentTask = tasks[i];
      const previousTask = tasks[i - 1];
      if (currentTask && previousTask) {
        const prevDeps = currentTask.dependencies || [];
        currentTask.dependencies = [...prevDeps, previousTask.id];
        // Also update legacy property
        (currentTask as any).depends = currentTask.dependencies;
      }
    }
  }

  const builder = task(name).handler(async (context) => {
    const results = [];
    for (const t of tasks) {
      const result = await t.handler(context);
      results.push(result);
    }
    return { results };
  });

  return builder;
}

export function group(name: string, tasks: Task[]): TaskBuilder {
  return task(name)
    .handler(async (context) => ({ message: `Group ${name} completed`, tasks: tasks.map(t => t.id) }))
    .meta('tasks', tasks);
}

export function noop(name: string): TaskBuilder {
  return task(name).handler(async () => ({ message: 'No operation' }));
}

export function log(name: string, message: string, level: 'debug' | 'info' | 'warn' | 'error' = 'info'): TaskBuilder {
  return task(name).handler(async (context) => {
    context.logger[level](message);
    return { message, level };
  });
}

export function fail(name: string, message: string): TaskBuilder {
  return task(name).handler(async () => {
    throw new Error(message);
  });
}

export function wait(name: string, ms: number): TaskBuilder {
  return task(name).handler(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
    return { waited: ms };
  });
}
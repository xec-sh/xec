/**
 * Task manager for Xec configuration
 * Main API for task management and execution
 */

import { EventEmitter } from 'events';

import { TaskParser } from './task-parser.js';
import { TargetResolver } from './target-resolver.js';
import { ConfigurationManager } from './configuration-manager.js';
import { VariableInterpolator } from './variable-interpolator.js';
import { TaskExecutor, TaskExecutionOptions } from './task-executor.js';

import type {
  TaskConfig,
  TaskResult,
  TaskParameter,
  Configuration,
  TaskDefinition,
} from './types.js';

export interface TaskManagerOptions {
  /** Configuration manager instance */
  configManager: ConfigurationManager;

  /** Enable debug output */
  debug?: boolean;

  /** Dry run mode */
  dryRun?: boolean;

  /** Default timeout for tasks */
  defaultTimeout?: number;
}

export interface TaskInfo {
  name: string;
  description?: string;
  params?: TaskParameter[];
  isPrivate?: boolean;
  hasSteps?: boolean;
  hasCommand?: boolean;
  hasScript?: boolean;
  target?: string;
  targets?: string[];
}

export class TaskManager extends EventEmitter {
  private parser: TaskParser;
  private executor: TaskExecutor;
  private configManager: ConfigurationManager;
  private interpolator: VariableInterpolator;
  private targetResolver: TargetResolver;
  private parsedTasks: Map<string, TaskDefinition> = new Map();
  private config: Configuration | null = null;

  constructor(private options: TaskManagerOptions) {
    super();

    this.configManager = options.configManager;
    this.parser = new TaskParser();
    this.interpolator = new VariableInterpolator();

    // TargetResolver will be initialized in load() after config is loaded
    this.targetResolver = null as any;

    this.executor = new TaskExecutor({
      interpolator: this.interpolator,
      targetResolver: this.targetResolver,
      defaultTimeout: options.defaultTimeout,
      debug: options.debug,
      dryRun: options.dryRun,
    });

    // Forward executor events
    this.executor.on('task:start', event => this.emit('task:start', event));
    this.executor.on('task:complete', event => this.emit('task:complete', event));
    this.executor.on('task:error', event => this.emit('task:error', event));
    this.executor.on('step:retry', event => this.emit('step:retry', event));
    this.executor.on('event', event => this.emit('event', event));
  }

  /**
   * Load tasks from configuration
   */
  async load(): Promise<void> {
    this.config = await this.configManager.load();

    // Initialize target resolver now that we have config
    this.targetResolver = new TargetResolver(this.config);

    // Update executor with real target resolver
    this.executor = new TaskExecutor({
      interpolator: this.interpolator,
      targetResolver: this.targetResolver,
      defaultTimeout: (this.executor as any).options.defaultTimeout,
      debug: (this.executor as any).options.debug || this.options.debug,
      dryRun: (this.executor as any).options.dryRun
    });

    // Re-attach event listeners
    this.executor.on('task:start', event => this.emit('task:start', event));
    this.executor.on('task:complete', event => this.emit('task:complete', event));
    this.executor.on('task:error', event => this.emit('task:error', event));
    this.executor.on('step:retry', event => this.emit('step:retry', event));
    this.executor.on('event', event => this.emit('event', event));

    if (!this.config.tasks) {
      return;
    }

    const parsed = this.parser.parseTasks(this.config.tasks);

    for (const [name, task] of Object.entries(parsed)) {
      this.parsedTasks.set(name, task);
    }
  }

  /**
   * List all available tasks
   */
  async list(): Promise<TaskInfo[]> {
    await this.ensureLoaded();

    const tasks: TaskInfo[] = [];

    for (const [name, task] of this.parsedTasks) {
      // Skip private tasks
      if (task.private && !this.options.debug) {
        continue;
      }

      tasks.push({
        name,
        description: task.description,
        params: task.params,
        isPrivate: task.private,
        hasSteps: !!task.steps,
        hasCommand: !!task.command,
        hasScript: !!task.script,
        target: task.target,
        targets: task.targets,
      });
    }

    return tasks.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get a specific task definition
   */
  async get(taskName: string): Promise<TaskDefinition | null> {
    await this.ensureLoaded();
    return this.parsedTasks.get(taskName) || null;
  }

  /**
   * Check if a task exists
   */
  async exists(taskName: string): Promise<boolean> {
    await this.ensureLoaded();
    return this.parsedTasks.has(taskName);
  }

  /**
   * Execute a task
   */
  async run(
    taskName: string,
    params?: Record<string, any>,
    options?: TaskExecutionOptions
  ): Promise<TaskResult> {
    await this.ensureLoaded();

    const task = this.parsedTasks.get(taskName);
    if (!task) {
      throw new Error(`Task '${taskName}' not found`);
    }

    // Validate and apply parameter defaults
    let finalParams = params || {};
    if (task.params) {
      this.validateParameters(taskName, task.params, finalParams);
      // Apply defaults for missing parameters
      finalParams = this.applyParameterDefaults(task.params, finalParams);
    }

    // Execute task with configuration vars
    return this.executor.execute(taskName, task, {
      ...options,
      params: finalParams,
      vars: this.config?.vars || {},
    });
  }

  /**
   * Execute a task with specific target
   */
  async runOnTarget(
    taskName: string,
    target: string,
    params?: Record<string, any>,
    options?: TaskExecutionOptions
  ): Promise<TaskResult> {
    return this.run(taskName, params, {
      ...options,
      target,
    });
  }

  /**
   * Create a task programmatically
   */
  async create(taskName: string, config: TaskConfig): Promise<void> {
    const task = this.parser.parseTask(taskName, config);

    if (!task) {
      const errors = this.parser.getErrors();
      throw new Error(`Invalid task configuration: ${errors[0]?.message}`);
    }

    this.parsedTasks.set(taskName, task);

    // Update configuration
    if (!this.config) {
      await this.load();
    }
    const currentConfig = this.config!;
    currentConfig.tasks = currentConfig.tasks || {};
    currentConfig.tasks[taskName] = config;

    await this.configManager.save();
  }

  /**
   * Update an existing task
   */
  async update(taskName: string, config: TaskConfig): Promise<void> {
    if (!this.parsedTasks.has(taskName)) {
      throw new Error(`Task '${taskName}' not found`);
    }

    await this.create(taskName, config);
  }

  /**
   * Delete a task
   */
  async delete(taskName: string): Promise<void> {
    if (!this.parsedTasks.has(taskName)) {
      throw new Error(`Task '${taskName}' not found`);
    }

    this.parsedTasks.delete(taskName);

    // Update configuration
    if (!this.config) {
      await this.load();
    }
    const currentConfig = this.config!;
    if (currentConfig.tasks) {
      delete currentConfig.tasks[taskName];
    }

    await this.configManager.save();
  }

  /**
   * Explain what a task will do
   */
  async explain(taskName: string, params?: Record<string, any>): Promise<string[]> {
    await this.ensureLoaded();

    const task = this.parsedTasks.get(taskName);
    if (!task) {
      throw new Error(`Task '${taskName}' not found`);
    }

    const explanation: string[] = [];

    // Task description
    if (task.description) {
      explanation.push(`Task: ${task.description}`);
    } else {
      explanation.push(`Task: ${taskName}`);
    }

    // Parameters
    if (task.params && task.params.length > 0) {
      explanation.push('');
      explanation.push('Parameters:');
      for (const param of task.params) {
        const value = params?.[param.name] ?? param.default;
        const required = param.required ? ' (required)' : '';
        explanation.push(`  ${param.name}: ${value}${required}`);
        if (param.description) {
          explanation.push(`    ${param.description}`);
        }
      }
    }

    // Execution plan
    explanation.push('');
    explanation.push('Execution plan:');

    if (task.command) {
      const interpolated = this.interpolator.interpolate(task.command, {
        params: params || {},
        vars: await this.configManager.get('vars') || {},
      });
      explanation.push(`  Execute: ${interpolated}`);
    } else if (task.steps) {
      const parallel = task.parallel ? ' (in parallel)' : '';
      explanation.push(`  Execute ${task.steps.length} steps${parallel}:`);

      for (let i = 0; i < task.steps.length; i++) {
        const step = task.steps[i];
        if (!step) continue;

        const prefix = `    ${i + 1}. `;

        if (step.command) {
          const interpolated = this.interpolator.interpolate(step.command, {
            params: params || {},
            vars: await this.configManager.get('vars') || {},
          });
          explanation.push(`${prefix}${step.name || 'Command'}: ${interpolated}`);
        } else if (step.task) {
          explanation.push(`${prefix}${step.name || 'Task'}: Run task '${step.task}'`);
        } else if (step.script) {
          explanation.push(`${prefix}${step.name || 'Script'}: Execute ${step.script}`);
        }

        if (step.when) {
          explanation.push(`       When: ${step.when}`);
        }

        if (step.target || step.targets) {
          const targets = step.targets || [step.target!];
          explanation.push(`       On: ${targets.join(', ')}`);
        }
      }
    } else if (task.script) {
      explanation.push(`  Execute script: ${task.script}`);
    }

    // Target
    if (task.target || task.targets) {
      explanation.push('');
      const targets = task.targets || [task.target!];
      explanation.push(`Target${targets.length > 1 ? 's' : ''}: ${targets.join(', ')}`);
    }

    // Additional info
    if (task.timeout) {
      explanation.push('');
      explanation.push(`Timeout: ${task.timeout}`);
    }

    if (task.cache) {
      explanation.push('');
      explanation.push(`Cached with key: ${task.cache.key}`);
    }

    return explanation;
  }

  /**
   * Apply parameter defaults for missing values
   */
  private applyParameterDefaults(
    params: TaskParameter[],
    provided: Record<string, any>
  ): Record<string, any> {
    const result = { ...provided };

    for (const param of params) {
      if (!(param.name in result) && param.default !== undefined) {
        result[param.name] = param.default;
      }
    }

    return result;
  }

  /**
   * Validate task parameters
   */
  private validateParameters(
    taskName: string,
    params: TaskParameter[],
    provided: Record<string, any>
  ): void {
    const errors: string[] = [];

    for (const param of params) {
      const value = provided[param.name];

      // Check required
      if (param.required && value === undefined) {
        errors.push(`Missing required parameter: ${param.name}`);
        continue;
      }

      // Skip if not provided and not required
      if (value === undefined) {
        continue;
      }

      // Type validation
      if (param.type) {
        const valid = this.validateParameterType(param, value);
        if (!valid) {
          errors.push(`Invalid type for parameter '${param.name}': expected ${param.type}`);
        }
      }

      // Pattern validation
      if (param.pattern && typeof value === 'string') {
        const regex = new RegExp(param.pattern);
        if (!regex.test(value)) {
          errors.push(`Parameter '${param.name}' does not match pattern: ${param.pattern}`);
        }
      }

      // Enum validation
      if (param.values && !param.values.includes(value)) {
        errors.push(`Parameter '${param.name}' must be one of: ${param.values.join(', ')}`);
      }

      // Range validation
      if (typeof value === 'number') {
        if (param.min !== undefined && value < param.min) {
          errors.push(`Parameter '${param.name}' must be at least ${param.min}`);
        }
        if (param.max !== undefined && value > param.max) {
          errors.push(`Parameter '${param.name}' must be at most ${param.max}`);
        }
      }

      // Array validation
      if (Array.isArray(value)) {
        if (param.minItems !== undefined && value.length < param.minItems) {
          errors.push(`Parameter '${param.name}' must have at least ${param.minItems} items`);
        }
        if (param.maxItems !== undefined && value.length > param.maxItems) {
          errors.push(`Parameter '${param.name}' must have at most ${param.maxItems} items`);
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Task '${taskName}' validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * Validate parameter type
   */
  private validateParameterType(param: TaskParameter, value: any): boolean {
    switch (param.type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'enum':
        return param.values?.includes(value) ?? false;
      default:
        return true;
    }
  }

  /**
   * Ensure tasks are loaded
   */
  private async ensureLoaded(): Promise<void> {
    if (this.parsedTasks.size === 0) {
      await this.load();
    }
  }

  /**
   * Clear cached tasks
   */
  clearCache(): void {
    this.parsedTasks.clear();
  }
}
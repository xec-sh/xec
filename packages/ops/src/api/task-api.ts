/**
 * Task API
 * 
 * Provides programmatic access to xec task management.
 * Supports listing, executing, and creating tasks.
 */

import { TaskManager } from '../config/task-manager.js';
import { TargetResolver } from '../config/target-resolver.js';
import { ConfigurationManager } from '../config/configuration-manager.js';

import type { 
  TaskResult, 
  TaskDefinition, 
  TaskExecutionOptions 
} from './types.js';

export class TaskAPI {
  private manager?: TaskManager;
  private configManager: ConfigurationManager;
  private targetResolver?: TargetResolver;

  constructor() {
    this.configManager = new ConfigurationManager();
  }

  /**
   * Initialize the task API
   */
  private async initialize(): Promise<void> {
    if (!this.manager) {
      await this.configManager.load();
      this.targetResolver = new TargetResolver(this.configManager.getConfig());
      this.manager = new TaskManager({
        configManager: this.configManager
      });
    }
  }

  /**
   * List all available tasks
   * @param filter - Optional filter pattern
   */
  async list(filter?: string): Promise<TaskDefinition[]> {
    await this.initialize();
    const config = this.configManager.getConfig();
    const tasks = config.tasks || {};
    
    let taskList = Object.entries(tasks).map(([name, def]) => {
      const taskDef = typeof def === 'string' 
        ? { command: def }
        : def;
      
      return {
        name,
        ...taskDef
      } as TaskDefinition;
    });

    // Apply filter if provided
    if (filter) {
      const pattern = new RegExp(filter, 'i');
      taskList = taskList.filter(task => pattern.test(task.name));
    }

    return taskList;
  }

  /**
   * Get a specific task definition
   * @param name - Task name
   */
  async get(name: string): Promise<TaskDefinition | undefined> {
    await this.initialize();
    const config = this.configManager.getConfig();
    const taskDef = config.tasks?.[name];
    
    if (!taskDef) {
      return undefined;
    }

    const definition = typeof taskDef === 'string'
      ? { command: taskDef }
      : taskDef;

    return {
      name,
      ...definition
    } as TaskDefinition;
  }

  /**
   * Execute a task
   * @param name - Task name
   * @param params - Task parameters
   * @param options - Execution options
   */
  async run(
    name: string, 
    params: Record<string, any> = {}, 
    options: TaskExecutionOptions = {}
  ): Promise<TaskResult> {
    await this.initialize();
    
    // Check if task exists
    const taskDef = await this.get(name);
    if (!taskDef) {
      throw new Error(`Task '${name}' not found`);
    }

    // Run the task
    const result = await this.manager!.run(name, params, {
      target: options.target,
      timeout: options.timeout,
      env: options.env
    });

    // Convert to API result format
    return {
      success: result.success,
      error: result.error,
      duration: result.duration,
      outputs: {},
      steps: result.steps?.map(step => ({
        name: step.name || 'unnamed',
        success: step.success,
        output: step.output,
        error: step.error,
        duration: step.duration
      }))
    };
  }

  /**
   * Create a new task programmatically
   * @param name - Task name
   * @param definition - Task definition
   */
  async create(name: string, definition: Partial<TaskDefinition>): Promise<void> {
    await this.initialize();
    
    // Add task to configuration
    const config = this.configManager.getConfig();
    if (!config.tasks) {
      config.tasks = {};
    }
    
    // Remove name from definition as it's stored as the key
    const { name: _, ...taskDef } = definition as any;
    config.tasks[name] = taskDef;
    
    // Save configuration
    await this.configManager.save();
  }

  /**
   * Update an existing task
   * @param name - Task name
   * @param definition - Updated task definition
   */
  async update(name: string, definition: Partial<TaskDefinition>): Promise<void> {
    await this.initialize();
    
    const config = this.configManager.getConfig();
    if (!config.tasks?.[name]) {
      throw new Error(`Task '${name}' not found`);
    }
    
    // Merge with existing definition
    const existing = config.tasks[name];
    const updated = typeof existing === 'string'
      ? { command: existing, ...definition }
      : { ...existing, ...definition };
    
    // Remove name from definition
    const { name: _, ...taskDef } = updated as any;
    config.tasks[name] = taskDef;
    
    await this.configManager.save();
  }

  /**
   * Delete a task
   * @param name - Task name
   */
  async delete(name: string): Promise<void> {
    await this.initialize();
    
    const config = this.configManager.getConfig();
    if (!config.tasks?.[name]) {
      throw new Error(`Task '${name}' not found`);
    }
    
    delete config.tasks[name];
    await this.configManager.save();
  }

  /**
   * Check if a task exists
   * @param name - Task name
   */
  async exists(name: string): Promise<boolean> {
    const task = await this.get(name);
    return task !== undefined;
  }

  /**
   * Get task execution history
   * @param name - Task name
   * @param limit - Maximum number of entries
   */
  async getHistory(name: string, limit: number = 10): Promise<TaskResult[]> {
    // This would typically fetch from a persistence layer
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Execute multiple tasks in sequence
   * @param taskNames - Array of task names
   * @param params - Parameters for all tasks
   * @param options - Execution options
   */
  async runSequence(
    taskNames: string[], 
    params: Record<string, any> = {},
    options: TaskExecutionOptions = {}
  ): Promise<TaskResult[]> {
    const results: TaskResult[] = [];
    
    for (const taskName of taskNames) {
      const result = await this.run(taskName, params, options);
      results.push(result);
      
      // Stop on failure unless explicitly told to continue
      if (!result.success && !options.parallel) {
        break;
      }
    }
    
    return results;
  }

  /**
   * Execute multiple tasks in parallel
   * @param taskNames - Array of task names
   * @param params - Parameters for all tasks
   * @param options - Execution options
   */
  async runParallel(
    taskNames: string[], 
    params: Record<string, any> = {},
    options: TaskExecutionOptions = {}
  ): Promise<TaskResult[]> {
    const promises = taskNames.map(taskName => 
      this.run(taskName, params, { ...options, parallel: true })
    );
    
    return Promise.all(promises);
  }

  /**
   * Dry run a task (show what would be executed)
   * @param name - Task name
   * @param params - Task parameters
   */
  async dryRun(
    name: string, 
    params: Record<string, any> = {}
  ): Promise<string[]> {
    await this.initialize();
    
    const task = await this.get(name);
    if (!task) {
      throw new Error(`Task '${name}' not found`);
    }

    // Return array of commands that would be executed
    const commands: string[] = [];
    
    if (task.command) {
      commands.push(task.command);
    }
    
    if (task.steps) {
      for (const step of task.steps) {
        if (typeof step === 'string') {
          commands.push(step);
        } else if (step.command) {
          commands.push(step.command);
        } else if (step.task) {
          commands.push(`[Task: ${step.task}]`);
        }
      }
    }
    
    return commands;
  }
}

// Export singleton instance for convenience
export const tasks = new TaskAPI();
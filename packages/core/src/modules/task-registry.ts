import { z } from 'zod';

import { TaskDefinition } from './types.js';
import { ITaskRegistry } from './interfaces';

export class TaskRegistry implements ITaskRegistry {
  private tasks: Map<string, TaskDefinition> = new Map();
  private tasksByModule: Map<string, Map<string, TaskDefinition>> = new Map();
  private executionStats: Map<string, ExecutionStats> = new Map();

  register(moduleName: string, task: TaskDefinition): void {
    const taskName = `${moduleName}:${task.name}`;

    if (this.tasks.has(taskName)) {
      throw new Error(`Task '${taskName}' is already registered`);
    }

    this.tasks.set(taskName, task);

    if (!this.tasksByModule.has(moduleName)) {
      this.tasksByModule.set(moduleName, new Map());
    }
    this.tasksByModule.get(moduleName)!.set(task.name, task);

    this.executionStats.set(taskName, {
      totalExecutions: 0,
      successCount: 0,
      failureCount: 0,
      averageExecutionTime: 0,
      lastExecutionTime: 0,
      lastError: null,
    });
  }

  unregister(moduleName: string, taskName: string): void {
    const fullTaskName = `${moduleName}:${taskName}`;

    this.tasks.delete(fullTaskName);
    this.tasksByModule.get(moduleName)?.delete(taskName);
    this.executionStats.delete(fullTaskName);

    if (this.tasksByModule.get(moduleName)?.size === 0) {
      this.tasksByModule.delete(moduleName);
    }
  }

  unregisterAll(moduleName: string): void {
    const moduleTasks = this.tasksByModule.get(moduleName);
    if (!moduleTasks) return;

    for (const taskName of moduleTasks.keys()) {
      const fullTaskName = `${moduleName}:${taskName}`;
      this.tasks.delete(fullTaskName);
      this.executionStats.delete(fullTaskName);
    }

    this.tasksByModule.delete(moduleName);
  }

  get(taskName: string): TaskDefinition | undefined {
    // Support both full and short names
    if (this.tasks.has(taskName)) {
      return this.tasks.get(taskName);
    }

    // Try to find by short name
    for (const [fullName, task] of this.tasks.entries()) {
      if (fullName.endsWith(`:${taskName}`)) {
        return task;
      }
    }

    return undefined;
  }

  getByModule(moduleName: string): Map<string, TaskDefinition> {
    return this.tasksByModule.get(moduleName) || new Map();
  }

  getAll(): Map<string, TaskDefinition> {
    return new Map(this.tasks);
  }

  async execute(taskName: string, params: any): Promise<any> {
    const task = this.get(taskName);
    if (!task) {
      throw new Error(`Task '${taskName}' not found`);
    }

    const stats = this.executionStats.get(taskName) || this.createEmptyStats();
    const startTime = Date.now();

    try {
      // Validate parameters
      if (task.parameters) {
        try {
          params = task.parameters.parse(params);
        } catch (error) {
          if (error instanceof z.ZodError) {
            throw new Error(`Invalid parameters: ${error.message}`);
          }
          throw error;
        }
      }

      // Execute with timeout
      let result: any;
      if (task.options?.timeout) {
        result = await this.executeWithTimeout(task.handler, params, task.options.timeout);
      } else {
        result = await task.handler(params);
      }

      // Validate return value
      if (task.returns) {
        try {
          result = task.returns.parse(result);
        } catch (error) {
          if (error instanceof z.ZodError) {
            throw new Error(`Invalid return value: ${error.message}`);
          }
          throw error;
        }
      }

      // Update stats
      const executionTime = Date.now() - startTime;
      stats.totalExecutions++;
      stats.successCount++;
      stats.lastExecutionTime = executionTime;
      stats.averageExecutionTime =
        (stats.averageExecutionTime * (stats.totalExecutions - 1) + executionTime) /
        stats.totalExecutions;
      stats.lastError = null;

      return result;
    } catch (error) {
      // Handle retries
      if (task.options?.retry && task.options.retry.maxAttempts && task.options.retry.maxAttempts > 0) {
        return await this.executeWithRetries(task, params, task.options.retry.maxAttempts);
      }

      // Update stats
      stats.totalExecutions++;
      stats.failureCount++;
      stats.lastError = error as Error;

      throw error;
    } finally {
      this.executionStats.set(taskName, stats);
    }
  }

  search(criteria: { name?: string; tags?: string[] }): TaskDefinition[] {
    const results: TaskDefinition[] = [];

    for (const [taskName, task] of this.tasks.entries()) {
      if (criteria.name && !task.name.includes(criteria.name)) {
        continue;
      }

      if (criteria.tags && criteria.tags.length > 0) {
        const taskTags = (task as any).tags || [];
        const hasAllTags = criteria.tags.every(tag => taskTags.includes(tag));
        if (!hasAllTags) {
          continue;
        }
      }

      results.push(task);
    }

    return results;
  }

  getStats(taskName: string): ExecutionStats | undefined {
    return this.executionStats.get(taskName);
  }

  getAllStats(): Map<string, ExecutionStats> {
    return new Map(this.executionStats);
  }

  private async executeWithTimeout(
    handler: (params: any) => Promise<any>,
    params: any,
    timeout: number
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Task execution timed out after ${timeout}ms`));
      }, timeout);

      handler(params)
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private async executeWithRetries(
    task: TaskDefinition,
    params: any,
    retriesLeft: number
  ): Promise<any> {
    for (let i = 0; i < retriesLeft; i++) {
      try {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));

        if (task.options?.timeout) {
          return await this.executeWithTimeout(task.handler, params, task.options.timeout);
        } else {
          return await task.handler(params);
        }
      } catch (error) {
        if (i === retriesLeft - 1) {
          throw error;
        }
      }
    }

    throw new Error('All retries exhausted');
  }

  private createEmptyStats(): ExecutionStats {
    return {
      totalExecutions: 0,
      successCount: 0,
      failureCount: 0,
      averageExecutionTime: 0,
      lastExecutionTime: 0,
      lastError: null,
    };
  }
}

interface ExecutionStats {
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  averageExecutionTime: number;
  lastExecutionTime: number;
  lastError: Error | null;
}
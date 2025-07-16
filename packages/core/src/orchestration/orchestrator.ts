import { EventEmitter } from 'events';

export interface OrchestratorConfig {
  parallelism?: number;
  strategy?: 'sequential' | 'parallel' | 'batch';
  maxConcurrency?: number;
  retryPolicy?: {
    maxRetries: number;
    retryDelay: number;
    backoffMultiplier?: number;
  };
}

export interface TaskExecution {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  error?: Error;
  result?: any;
}

export class Orchestrator extends EventEmitter {
  private config: OrchestratorConfig;
  private executions: Map<string, TaskExecution> = new Map();
  private running: Set<string> = new Set();

  constructor(config: OrchestratorConfig = {}) {
    super();
    this.config = {
      parallelism: config.parallelism || 1,
      strategy: config.strategy || 'sequential',
      maxConcurrency: config.maxConcurrency || 10,
      retryPolicy: config.retryPolicy || {
        maxRetries: 3,
        retryDelay: 1000,
        backoffMultiplier: 2,
      },
    };
  }

  getConfig(): OrchestratorConfig {
    return { ...this.config };
  }

  async executeTask(task: any, context: any): Promise<any> {
    const execution: TaskExecution = {
      id: task.id || Math.random().toString(36).substring(7),
      name: task.name,
      status: 'pending',
    };

    this.executions.set(execution.id, execution);
    this.emit('taskQueued', execution);

    try {
      // Wait if we're at max concurrency
      await this.waitForCapacity();

      execution.status = 'running';
      execution.startTime = new Date();
      this.running.add(execution.id);
      this.emit('taskStarted', execution);

      // Execute the task
      const result = await this.runTaskWithRetry(task, context);

      execution.status = 'completed';
      execution.result = result;
      execution.endTime = new Date();
      this.emit('taskCompleted', execution);

      return result;
    } catch (error) {
      execution.status = 'failed';
      execution.error = error as Error;
      execution.endTime = new Date();
      this.emit('taskFailed', execution);
      throw error;
    } finally {
      this.running.delete(execution.id);
    }
  }

  async executeTasks(tasks: any[], context: any): Promise<any[]> {
    switch (this.config.strategy) {
      case 'sequential':
        return this.executeSequential(tasks, context);
      case 'parallel':
        return this.executeParallel(tasks, context);
      case 'batch':
        return this.executeBatch(tasks, context);
      default:
        throw new Error(`Unknown strategy: ${this.config.strategy}`);
    }
  }

  private async executeSequential(tasks: any[], context: any): Promise<any[]> {
    const results = [];
    for (const task of tasks) {
      const result = await this.executeTask(task, context);
      results.push(result);
    }
    return results;
  }

  private async executeParallel(tasks: any[], context: any): Promise<any[]> {
    const results: any[] = new Array(tasks.length);
    const executing: Promise<void>[] = [];
    let taskIndex = 0;

    const executeNext = async (): Promise<void> => {
      while (taskIndex < tasks.length) {
        const currentIndex = taskIndex++;
        const task = tasks[currentIndex];
        
        try {
          results[currentIndex] = await this.executeTask(task, context);
        } catch (error) {
          results[currentIndex] = error;
          throw error;
        }
      }
    };

    // Start initial batch of tasks up to maxConcurrency
    const initialBatch = Math.min(this.config.maxConcurrency || 10, tasks.length);
    for (let i = 0; i < initialBatch; i++) {
      executing.push(executeNext());
    }

    // Wait for all tasks to complete
    try {
      await Promise.all(executing);
    } catch (error) {
      // If any task fails, wait for all running tasks to complete
      await Promise.allSettled(executing);
      throw error;
    }

    return results;
  }

  private async executeBatch(tasks: any[], context: any): Promise<any[]> {
    const results = [];
    const batchSize = this.config.parallelism || 1;

    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(task => this.executeTask(task, context))
      );
      results.push(...batchResults);
    }

    return results;
  }

  private async waitForCapacity(): Promise<void> {
    while (this.running.size >= (this.config.maxConcurrency || 10)) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  private async runTaskWithRetry(task: any, context: any): Promise<any> {
    const retryPolicy = this.config.retryPolicy!;
    let lastError: Error | undefined;
    let delay = retryPolicy.retryDelay;

    for (let attempt = 0; attempt <= retryPolicy.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          this.emit('taskRetrying', { task, attempt, delay });
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Execute the task
        if (typeof task.execute === 'function') {
          return await task.execute(context);
        } else if (typeof task === 'function') {
          return await task(context);
        } else {
          throw new Error('Task must be a function or have an execute method');
        }
      } catch (error) {
        lastError = error as Error;
        delay *= retryPolicy.backoffMultiplier || 2;
      }
    }

    throw lastError;
  }

  getExecutions(): TaskExecution[] {
    return Array.from(this.executions.values());
  }

  getExecution(id: string): TaskExecution | undefined {
    return this.executions.get(id);
  }

  isRunning(): boolean {
    return this.running.size > 0;
  }

  async waitForCompletion(): Promise<void> {
    while (this.isRunning()) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  reset(): void {
    this.executions.clear();
    this.running.clear();
  }
}
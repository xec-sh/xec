// Task list component for managing and displaying multiple async tasks

import { Spinner } from './spinner.js';
import { Renderer } from '../../core/renderer.js';
import { EventEmitter } from '../../core/event-emitter.js';
import { StreamHandler } from '../../core/stream-handler.js';
import { createDefaultTheme } from '../../themes/default.js';

import type { Theme } from '../../core/types.js';

export interface TaskContext {
  [key: string]: any;
}

export interface Task<T = TaskContext> {
  title: string;
  task: (ctx: T, task: TaskInstance) => Promise<void> | void;
  skip?: boolean | string | ((ctx: T) => boolean | string);
  retry?: number;
  rollback?: (ctx: T, task: TaskInstance) => Promise<void> | void;
}

export interface TaskInstance {
  title: string;
  output?: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  error?: Error;
  spinner?: Spinner;
  
  log(message: string): void;
  spin(message: string): Spinner;
  succeed(message?: string): void;
  fail(message?: string | Error): void;
  skip(reason?: string): void;
}

export interface TaskListOptions<T = TaskContext> {
  tasks: Task<T>[];
  concurrent?: number;
  stopOnError?: boolean;
  context?: T;
  theme?: Theme;
}

export class TaskList<T = TaskContext> extends EventEmitter {
  private tasks: Task<T>[];
  private instances: TaskInstance[] = [];
  private concurrent: number;
  private stopOnError: boolean;
  private context: T;
  private renderer: Renderer;
  private stream: StreamHandler;
  private theme: Theme;
  private isRunning = false;
  private currentIndex = 0;
  private runningTasks = new Set<number>();

  constructor(options: TaskListOptions<T>) {
    super();
    
    this.tasks = options.tasks;
    this.concurrent = options.concurrent || 1;
    this.stopOnError = options.stopOnError !== false;
    this.context = options.context || {} as T;
    this.theme = { ...createDefaultTheme(), ...options.theme };
    
    this.stream = new StreamHandler();
    this.renderer = new Renderer({ theme: this.theme, stream: this.stream });
    
    // Initialize task instances
    this.tasks.forEach(task => {
      this.instances.push(this.createTaskInstance(task));
    });
  }

  async run(context?: Partial<T>): Promise<T> {
    if (this.isRunning) {
      throw new Error('TaskList is already running');
    }
    
    this.isRunning = true;
    this.context = { ...this.context, ...context };
    
    this.stream.start();
    this.stream.hideCursor();
    
    try {
      await this.runTasks();
      this.emit('complete', this.context);
      return this.context;
    } catch (error) {
      this.emit('error', error);
      throw error;
    } finally {
      this.isRunning = false;
      this.stop();
    }
  }

  private async runTasks(): Promise<void> {
    while (this.currentIndex < this.tasks.length || this.runningTasks.size > 0) {
      // Start new tasks up to concurrent limit
      while (
        this.runningTasks.size < this.concurrent &&
        this.currentIndex < this.tasks.length
      ) {
        const index = this.currentIndex++;
        this.runningTasks.add(index);
        
        // Run task without awaiting (for concurrency)
        this.runTask(index).finally(() => {
          this.runningTasks.delete(index);
        });
      }
      
      // Wait for at least one task to complete
      if (this.runningTasks.size > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Check for failures if stopOnError is enabled
      if (this.stopOnError) {
        const hasFailure = this.instances.some(i => i.status === 'failed');
        if (hasFailure) {
          // Wait for running tasks to complete
          while (this.runningTasks.size > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          throw new Error('Task failed');
        }
      }
      
      this.render();
    }
  }

  private async runTask(index: number): Promise<void> {
    const task = this.tasks[index];
    const instance = this.instances[index];
    
    if (!task || !instance) return;
    
    try {
      // Check skip condition
      const skipResult = this.checkSkip(task);
      if (skipResult.skip) {
        instance.skip(skipResult.reason);
        return;
      }
      
      // Run task with retries
      let attempts = 0;
      const maxAttempts = (task?.retry || 0) + 1;
      
      while (attempts < maxAttempts) {
        attempts++;
        instance.status = 'running';
        this.render();
        
        try {
          await task.task(this.context, instance);
          
          if (instance.status === 'running') {
            instance.succeed();
          }
          break;
        } catch (error) {
          if (attempts < maxAttempts) {
            this.emit('retry', { task, attempt: attempts, error });
            await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      instance.fail(error as Error);
      
      // Try rollback if available
      if (task?.rollback) {
        try {
          await task.rollback(this.context, instance);
        } catch (rollbackError) {
          // Log rollback error but don't override original error
          instance.output = `Rollback failed: ${(rollbackError as Error).message}`;
        }
      }
    }
  }

  private checkSkip(task: Task<T>): { skip: boolean; reason?: string } {
    if (task.skip === undefined) {
      return { skip: false };
    }
    
    if (typeof task.skip === 'boolean') {
      return { skip: task.skip };
    }
    
    if (typeof task.skip === 'string') {
      return { skip: true, reason: task.skip };
    }
    
    if (typeof task.skip === 'function') {
      const result = task.skip(this.context);
      if (typeof result === 'boolean') {
        return { skip: result };
      }
      return { skip: true, reason: result };
    }
    
    return { skip: false };
  }

  private createTaskInstance(task: Task<T>): TaskInstance {
    const instance: TaskInstance = {
      title: task.title,
      status: 'pending',
      
      log: (message: string) => {
        instance.output = message;
        this.render();
      },
      
      spin: (message: string) => {
        if (instance.spinner) {
          instance.spinner.stop();
        }
        instance.spinner = new Spinner(message, { theme: this.theme });
        instance.output = undefined;
        return instance.spinner;
      },
      
      succeed: (message?: string) => {
        if (instance.spinner) {
          instance.spinner.stop();
          instance.spinner = undefined;
        }
        instance.status = 'success';
        instance.output = message;
        this.render();
      },
      
      fail: (messageOrError?: string | Error) => {
        if (instance.spinner) {
          instance.spinner.stop();
          instance.spinner = undefined;
        }
        instance.status = 'failed';
        
        if (messageOrError instanceof Error) {
          instance.error = messageOrError;
          instance.output = messageOrError.message;
        } else {
          instance.output = messageOrError;
        }
        
        this.render();
      },
      
      skip: (reason?: string) => {
        instance.status = 'skipped';
        instance.output = reason;
        this.render();
      }
    };
    
    return instance;
  }

  private render(): void {
    const lines: string[] = [];
    
    this.instances.forEach((instance, index) => {
      const isRunning = this.runningTasks.has(index);
      lines.push(this.renderTask(instance, isRunning));
      
      if (instance.output && !instance.spinner) {
        lines.push(`  ${this.theme.formatters.muted(instance.output)}`);
      }
      
      if (instance.spinner) {
        lines.push(`  ${(instance.spinner as any).frame()}`);
      }
    });
    
    this.renderer.render(lines.join('\n'));
  }

  private renderTask(instance: TaskInstance, isRunning: boolean): string {
    const icon = this.getStatusIcon(instance.status);
    const title = instance.title;
    
    if (isRunning && instance.status === 'running') {
      return `${icon} ${this.theme.formatters.primary(title)}`;
    }
    
    switch (instance.status) {
      case 'success':
        return `${icon} ${this.theme.formatters.success(title)}`;
      case 'failed':
        return `${icon} ${this.theme.formatters.error(title)}`;
      case 'skipped':
        return `${icon} ${this.theme.formatters.muted(title)}`;
      default:
        return `${icon} ${title}`;
    }
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'pending':
        return this.theme.symbols.bullet;
      case 'running':
        return this.theme.formatters.primary('◐');
      case 'success':
        return this.theme.formatters.success(this.theme.symbols.success);
      case 'failed':
        return this.theme.formatters.error(this.theme.symbols.error);
      case 'skipped':
        return this.theme.formatters.muted('○');
      default:
        return ' ';
    }
  }

  private stop(): void {
    this.renderer.clear();
    this.stream.showCursor();
    this.stream.stop();
    
    // Render final state
    const lines: string[] = [];
    
    this.instances.forEach(instance => {
      lines.push(this.renderTask(instance, false));
      
      if (instance.output) {
        lines.push(`  ${this.theme.formatters.muted(instance.output)}`);
      }
    });
    
    this.stream.write(lines.join('\n') + '\n');
  }
}

// Factory function
export function taskList<T = TaskContext>(
  tasks: Task<T>[],
  options?: Omit<TaskListOptions<T>, 'tasks'>
): TaskList<T> {
  return new TaskList({ ...options, tasks });
}
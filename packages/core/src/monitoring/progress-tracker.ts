import { EventEmitter } from 'events';

import { Logger } from '../utils/logger.js';

export interface ProgressEvent {
  taskId: string;
  taskName: string;
  phase: 'started' | 'progress' | 'completed' | 'failed';
  current?: number;
  total?: number;
  percentage?: number;
  message?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface TaskProgress {
  taskId: string;
  taskName: string;
  startTime: Date;
  endTime?: Date;
  current: number;
  total: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: Error;
  metadata?: Record<string, any>;
  subtasks?: Map<string, TaskProgress>;
}

export class ProgressTracker extends EventEmitter {
  private tasks: Map<string, TaskProgress> = new Map();
  private logger: Logger;

  constructor(logger?: Logger) {
    super();
    this.logger = logger || new Logger({ name: 'progress-tracker' });
  }

  startTask(taskId: string, taskName: string, total: number = 100, metadata?: Record<string, any>): void {
    const task: TaskProgress = {
      taskId,
      taskName,
      startTime: new Date(),
      current: 0,
      total,
      status: 'running',
      metadata,
      subtasks: new Map()
    };

    this.tasks.set(taskId, task);
    
    this.emitProgress({
      taskId,
      taskName,
      phase: 'started',
      current: 0,
      total,
      percentage: 0,
      metadata,
      timestamp: new Date()
    });
  }

  updateTask(taskId: string, current: number, message?: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.logger.warn(`Task ${taskId} not found`);
      return;
    }

    task.current = current;
    const percentage = Math.round((current / task.total) * 100);

    this.emitProgress({
      taskId,
      taskName: task.taskName,
      phase: 'progress',
      current,
      total: task.total,
      percentage,
      message,
      timestamp: new Date()
    });
  }

  completeTask(taskId: string, message?: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.logger.warn(`Task ${taskId} not found`);
      return;
    }

    task.endTime = new Date();
    task.status = 'completed';
    task.current = task.total;

    this.emitProgress({
      taskId,
      taskName: task.taskName,
      phase: 'completed',
      current: task.total,
      total: task.total,
      percentage: 100,
      message,
      timestamp: new Date()
    });
  }

  failTask(taskId: string, error: Error, message?: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.logger.warn(`Task ${taskId} not found`);
      return;
    }

    task.endTime = new Date();
    task.status = 'failed';
    task.error = error;

    this.emitProgress({
      taskId,
      taskName: task.taskName,
      phase: 'failed',
      current: task.current,
      total: task.total,
      percentage: Math.round((task.current / task.total) * 100),
      message: message || error.message,
      timestamp: new Date()
    });
  }

  startSubtask(parentTaskId: string, subtaskId: string, subtaskName: string, total: number = 100): void {
    const parentTask = this.tasks.get(parentTaskId);
    if (!parentTask) {
      this.logger.warn(`Parent task ${parentTaskId} not found`);
      return;
    }

    const subtask: TaskProgress = {
      taskId: subtaskId,
      taskName: subtaskName,
      startTime: new Date(),
      current: 0,
      total,
      status: 'running'
    };

    parentTask.subtasks?.set(subtaskId, subtask);
    
    this.emitProgress({
      taskId: subtaskId,
      taskName: subtaskName,
      phase: 'started',
      current: 0,
      total,
      percentage: 0,
      metadata: { parentTaskId },
      timestamp: new Date()
    });
  }

  getTask(taskId: string): TaskProgress | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): TaskProgress[] {
    return Array.from(this.tasks.values());
  }

  getActiveTasks(): TaskProgress[] {
    return Array.from(this.tasks.values()).filter(task => task.status === 'running');
  }

  clearCompleted(): void {
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.status === 'completed') {
        this.tasks.delete(taskId);
      }
    }
  }

  reset(): void {
    this.tasks.clear();
  }

  private emitProgress(event: ProgressEvent): void {
    this.emit('progress', event);
    
    // Log progress
    const logMessage = this.formatProgressMessage(event);
    if (event.phase === 'failed') {
      this.logger.error(logMessage);
    } else {
      this.logger.info(logMessage);
    }
  }

  private formatProgressMessage(event: ProgressEvent): string {
    const { taskName, phase, percentage, message } = event;
    
    switch (phase) {
      case 'started':
        return `[${taskName}] Started${message ? `: ${message}` : ''}`;
      case 'progress':
        const progressBar = this.createProgressBar(percentage || 0);
        return `[${taskName}] ${progressBar} ${percentage}%${message ? ` - ${message}` : ''}`;
      case 'completed':
        return `[${taskName}] ✓ Completed${message ? `: ${message}` : ''}`;
      case 'failed':
        return `[${taskName}] ✗ Failed${message ? `: ${message}` : ''}`;
      default:
        return `[${taskName}] ${phase}${message ? `: ${message}` : ''}`;
    }
  }

  private createProgressBar(percentage: number, width: number = 20): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${' '.repeat(empty)}]`;
  }

  // Convenience method for tracking async operations
  async trackAsync<T>(
    taskId: string,
    taskName: string,
    operation: (tracker: (current: number, message?: string) => void) => Promise<T>,
    options?: { total?: number; metadata?: Record<string, any> }
  ): Promise<T> {
    const total = options?.total || 100;
    
    this.startTask(taskId, taskName, total, options?.metadata);
    
    try {
      const result = await operation((current, message) => {
        this.updateTask(taskId, current, message);
      });
      
      this.completeTask(taskId);
      return result;
    } catch (error) {
      this.failTask(taskId, error as Error);
      throw error;
    }
  }

  // Create a child tracker for hierarchical progress
  createChildTracker(parentTaskId: string): ProgressTracker {
    const childTracker = new ProgressTracker(this.logger);
    
    // Forward child events to parent with metadata
    childTracker.on('progress', (event: ProgressEvent) => {
      this.emit('progress', {
        ...event,
        metadata: {
          ...event.metadata,
          parentTaskId
        }
      });
    });
    
    return childTracker;
  }
}

// Global progress tracker instance
let globalProgressTracker: ProgressTracker | null = null;

export function getProgressTracker(): ProgressTracker {
  if (!globalProgressTracker) {
    globalProgressTracker = new ProgressTracker();
  }
  return globalProgressTracker;
}

export function setProgressTracker(tracker: ProgressTracker): void {
  globalProgressTracker = tracker;
}
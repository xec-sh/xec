import { EventEmitter } from 'events';

import { Logger } from '../utils/logger.js';
import { TaskResult, ExecutionContext } from '../core/types.js';

export interface MonitoringEvent {
  type: 'task_start' | 'task_complete' | 'task_error' | 'state_change' | 'metric' | 'log';
  timestamp: Date;
  taskId?: string;
  taskName?: string;
  recipeId?: string;
  runId?: string;
  data?: any;
  error?: Error;
  duration?: number;
}

export interface TaskMetrics {
  taskId: string;
  taskName: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  error?: Error;
  result?: TaskResult;
  retries?: number;
  host?: string;
}

export interface SystemMetrics {
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalDuration: number;
  avgTaskDuration: number;
  tasksPerSecond: number;
  memoryUsage?: number;
  cpuUsage?: number;
}

export interface MonitoringOptions {
  logger?: Logger;
  metricsInterval?: number;
  includeSystemMetrics?: boolean;
  bufferSize?: number;
}

export class RealTimeMonitor extends EventEmitter {
  private logger: Logger;
  private tasks: Map<string, TaskMetrics> = new Map();
  private eventBuffer: MonitoringEvent[] = [];
  private bufferSize: number;
  private metricsInterval?: NodeJS.Timeout;
  private startTime: Date;
  private includeSystemMetrics: boolean;

  constructor(options: MonitoringOptions = {}) {
    super();
    this.logger = options.logger || new Logger({ name: 'real-time-monitor' });
    this.bufferSize = options.bufferSize || 1000;
    this.startTime = new Date();
    this.includeSystemMetrics = options.includeSystemMetrics || false;

    if (options.metricsInterval && options.metricsInterval > 0) {
      this.startMetricsCollection(options.metricsInterval);
    }
  }

  onTaskStart(context: ExecutionContext, taskId: string, taskName: string): void {
    const metrics: TaskMetrics = {
      taskId,
      taskName,
      startTime: new Date(),
      status: 'running',
      host: context.host
    };

    this.tasks.set(taskId, metrics);

    const event: MonitoringEvent = {
      type: 'task_start',
      timestamp: new Date(),
      taskId,
      taskName,
      recipeId: context.recipeId,
      runId: context.runId,
      data: {
        host: context.host,
        phase: context.phase
      }
    };

    this.emitEvent(event);
  }

  onTaskComplete(taskId: string, result: TaskResult, duration: number): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.logger.warn(`Task ${taskId} not found in monitoring`);
      return;
    }

    task.endTime = new Date();
    task.duration = duration;
    task.status = 'completed';
    task.result = result;

    const event: MonitoringEvent = {
      type: 'task_complete',
      timestamp: new Date(),
      taskId,
      taskName: task.taskName,
      duration,
      data: { result }
    };

    this.emitEvent(event);
  }

  onTaskError(taskId: string, error: Error, duration?: number): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.logger.warn(`Task ${taskId} not found in monitoring`);
      return;
    }

    task.endTime = new Date();
    task.duration = duration || Date.now() - task.startTime.getTime();
    task.status = 'failed';
    task.error = error;

    const event: MonitoringEvent = {
      type: 'task_error',
      timestamp: new Date(),
      taskId,
      taskName: task.taskName,
      error,
      duration: task.duration
    };

    this.emitEvent(event);
  }

  onTaskSkipped(taskId: string, taskName: string, reason?: string): void {
    const metrics: TaskMetrics = {
      taskId,
      taskName,
      startTime: new Date(),
      endTime: new Date(),
      status: 'skipped',
      duration: 0
    };

    this.tasks.set(taskId, metrics);

    const event: MonitoringEvent = {
      type: 'task_complete',
      timestamp: new Date(),
      taskId,
      taskName,
      data: { skipped: true, reason }
    };

    this.emitEvent(event);
  }

  onTaskRetry(taskId: string, attempt: number, error: Error): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.retries = (task.retries || 0) + 1;
    }

    const event: MonitoringEvent = {
      type: 'metric',
      timestamp: new Date(),
      taskId,
      data: {
        type: 'retry',
        attempt,
        error: error.message
      }
    };

    this.emitEvent(event);
  }

  onStateChange(key: string, oldValue: any, newValue: any, context?: ExecutionContext): void {
    const event: MonitoringEvent = {
      type: 'state_change',
      timestamp: new Date(),
      recipeId: context?.recipeId,
      runId: context?.runId,
      data: {
        key,
        oldValue,
        newValue
      }
    };

    this.emitEvent(event);
  }

  logMetric(name: string, value: number, unit?: string, metadata?: Record<string, any>): void {
    const event: MonitoringEvent = {
      type: 'metric',
      timestamp: new Date(),
      data: {
        name,
        value,
        unit,
        ...metadata
      }
    };

    this.emitEvent(event);
  }

  getTaskMetrics(taskId: string): TaskMetrics | undefined {
    return this.tasks.get(taskId);
  }

  getAllTaskMetrics(): TaskMetrics[] {
    return Array.from(this.tasks.values());
  }

  getSystemMetrics(): SystemMetrics {
    const allTasks = this.getAllTaskMetrics();
    const completedTasks = allTasks.filter(t => t.status === 'completed');
    const failedTasks = allTasks.filter(t => t.status === 'failed');
    const activeTasks = allTasks.filter(t => t.status === 'running');

    const totalDuration = Date.now() - this.startTime.getTime();
    const avgTaskDuration = completedTasks.length > 0
      ? completedTasks.reduce((sum, t) => sum + (t.duration || 0), 0) / completedTasks.length
      : 0;

    const metrics: SystemMetrics = {
      activeTasks: activeTasks.length,
      completedTasks: completedTasks.length,
      failedTasks: failedTasks.length,
      totalDuration,
      avgTaskDuration,
      tasksPerSecond: completedTasks.length / (totalDuration / 1000)
    };

    if (this.includeSystemMetrics) {
      metrics.memoryUsage = process.memoryUsage().heapUsed;
      // CPU usage would require additional implementation
    }

    return metrics;
  }

  getEvents(filter?: {
    type?: MonitoringEvent['type'];
    taskId?: string;
    since?: Date;
    limit?: number;
  }): MonitoringEvent[] {
    let events = [...this.eventBuffer];

    if (filter?.type) {
      events = events.filter(e => e.type === filter.type);
    }

    if (filter?.taskId) {
      events = events.filter(e => e.taskId === filter.taskId);
    }

    if (filter?.since) {
      const since = filter.since;
      events = events.filter(e => e.timestamp >= since);
    }

    if (filter?.limit) {
      events = events.slice(-filter.limit);
    }

    return events;
  }

  clearEvents(): void {
    this.eventBuffer = [];
  }

  reset(): void {
    this.tasks.clear();
    this.eventBuffer = [];
    this.startTime = new Date();
  }

  stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }
  }

  private emitEvent(event: MonitoringEvent): void {
    // Add to buffer
    this.eventBuffer.push(event);
    
    // Maintain buffer size
    if (this.eventBuffer.length > this.bufferSize) {
      this.eventBuffer.shift();
    }

    // Emit event
    this.emit('event', event);
    this.emit(event.type, event);

    // Log based on event type
    switch (event.type) {
      case 'task_start':
        this.logger.debug(`Task started: ${event.taskName} (${event.taskId})`);
        break;
      case 'task_complete':
        this.logger.debug(`Task completed: ${event.taskName} (${event.taskId}) - ${event.duration}ms`);
        break;
      case 'task_error':
        this.logger.error(`Task failed: ${event.taskName} (${event.taskId}) - ${event.error?.message}`);
        break;
      case 'state_change':
        this.logger.debug(`State changed: ${event.data?.key}`);
        break;
    }
  }

  private startMetricsCollection(interval: number): void {
    this.metricsInterval = setInterval(() => {
      const metrics = this.getSystemMetrics();
      
      const event: MonitoringEvent = {
        type: 'metric',
        timestamp: new Date(),
        data: {
          type: 'system',
          metrics
        }
      };

      this.emitEvent(event);
    }, interval);
  }

  // Create a snapshot of current state
  createSnapshot(): {
    timestamp: Date;
    tasks: TaskMetrics[];
    events: MonitoringEvent[];
    systemMetrics: SystemMetrics;
  } {
    return {
      timestamp: new Date(),
      tasks: this.getAllTaskMetrics(),
      events: [...this.eventBuffer],
      systemMetrics: this.getSystemMetrics()
    };
  }

  // Export monitoring data
  async exportData(format: 'json' | 'csv' = 'json'): Promise<string> {
    const snapshot = this.createSnapshot();

    if (format === 'json') {
      return JSON.stringify(snapshot, null, 2);
    }

    // CSV format
    const headers = ['timestamp', 'type', 'taskId', 'taskName', 'duration', 'status', 'error'];
    const rows = [headers.join(',')];

    for (const event of snapshot.events) {
      const row = [
        event.timestamp.toISOString(),
        event.type,
        event.taskId || '',
        event.taskName || '',
        event.duration || '',
        event.data?.status || '',
        event.error?.message || ''
      ];
      rows.push(row.map(v => `"${v}"`).join(','));
    }

    return rows.join('\n');
  }
}

// Global monitor instance
let globalMonitor: RealTimeMonitor | null = null;

export function getRealTimeMonitor(): RealTimeMonitor {
  if (!globalMonitor) {
    globalMonitor = new RealTimeMonitor();
  }
  return globalMonitor;
}

export function setRealTimeMonitor(monitor: RealTimeMonitor): void {
  if (globalMonitor) {
    globalMonitor.stop();
  }
  globalMonitor = monitor;
}
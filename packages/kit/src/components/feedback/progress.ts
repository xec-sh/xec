// Progress bar component with support for single and multiple progress tracking

import { Renderer } from '../../core/renderer.js';
import { EventEmitter } from '../../core/event-emitter.js';
import { StreamHandler } from '../../core/stream-handler.js';
import { createDefaultTheme } from '../../themes/default.js';

import type { Theme } from '../../core/types.js';

export interface ProgressOptions {
  title?: string;
  total?: number;
  width?: number;
  format?: (current: number, total: number) => string;
  showPercentage?: boolean;
  showETA?: boolean;
  theme?: Theme;
}

export interface ProgressTask {
  id: string;
  label: string;
  weight?: number;
  progress?: number;
  status?: 'pending' | 'active' | 'completed' | 'failed';
  error?: string;
}

export interface MultiProgressOptions extends ProgressOptions {
  tasks: ProgressTask[];
}

export class Progress extends EventEmitter {
  private current = 0;
  private total: number;
  private startTime: number;
  private renderer: Renderer;
  private stream: StreamHandler;
  private theme: Theme;
  private isActive = false;
  private title?: string;
  private width: number;
  private showPercentage: boolean;
  private showETA: boolean;
  private format?: (current: number, total: number) => string;

  constructor(options: ProgressOptions = {}) {
    super();
    this.total = options.total || 100;
    this.title = options.title;
    this.width = options.width || 40;
    this.showPercentage = options.showPercentage !== false;
    this.showETA = options.showETA !== false;
    this.format = options.format;
    this.theme = { ...createDefaultTheme(), ...options.theme };
    
    this.stream = new StreamHandler();
    this.renderer = new Renderer({ theme: this.theme, stream: this.stream });
    this.startTime = Date.now();
  }

  start(): void {
    if (this.isActive) return;
    
    this.isActive = true;
    this.startTime = Date.now();
    this.stream.start();
    this.stream.hideCursor();
    this.render();
  }

  update(value: number): void {
    this.current = Math.min(value, this.total);
    this.emit('progress', this.current, this.total);
    
    if (this.isActive) {
      this.render();
    }
    
    if (this.current >= this.total) {
      this.complete();
    }
  }

  increment(delta = 1): void {
    this.update(this.current + delta);
  }

  complete(): void {
    this.current = this.total;
    this.render();
    this.stop();
    this.emit('complete');
  }

  fail(error?: string): void {
    this.stop();
    this.emit('error', error);
  }

  stop(): void {
    if (!this.isActive) return;
    
    this.isActive = false;
    this.renderer.clear();
    this.stream.showCursor();
    this.stream.stop();
    
    // Render final state
    const finalMessage = this.renderFinal();
    if (finalMessage) {
      this.stream.write(finalMessage + '\n');
    }
  }

  private render(): void {
    const lines: string[] = [];
    
    // Title
    if (this.title) {
      lines.push(this.theme.formatters.primary(this.title));
    }
    
    // Progress bar
    const bar = this.renderBar();
    lines.push(bar);
    
    // Additional info
    const info = this.renderInfo();
    if (info) {
      lines.push(info);
    }
    
    this.renderer.render(lines.join('\n'));
  }

  private renderBar(): string {
    const percentage = this.total > 0 ? this.current / this.total : 0;
    const filled = Math.round(this.width * percentage);
    const empty = this.width - filled;
    
    const bar = 
      this.theme.formatters.success('█'.repeat(filled)) +
      this.theme.formatters.muted('░'.repeat(empty));
    
    let result = `[${bar}]`;
    
    if (this.showPercentage) {
      result += ` ${Math.round(percentage * 100)}%`;
    }
    
    return result;
  }

  private renderInfo(): string {
    const parts: string[] = [];
    
    // Custom format
    if (this.format) {
      parts.push(this.format(this.current, this.total));
    } else {
      parts.push(`${this.current}/${this.total}`);
    }
    
    // ETA
    if (this.showETA && this.current > 0 && this.current < this.total) {
      const elapsed = Date.now() - this.startTime;
      const rate = this.current / elapsed;
      const remaining = (this.total - this.current) / rate;
      const eta = this.formatTime(remaining);
      parts.push(`ETA: ${eta}`);
    }
    
    return this.theme.formatters.muted(parts.join(' • '));
  }

  private renderFinal(): string {
    const elapsed = Date.now() - this.startTime;
    const time = this.formatTime(elapsed);
    
    if (this.current >= this.total) {
      return this.theme.formatters.success(`✓ ${this.title || 'Progress'} completed in ${time}`);
    } else {
      return this.theme.formatters.error(`✗ ${this.title || 'Progress'} failed`);
    }
  }

  private formatTime(ms: number): string {
    const seconds = Math.round(ms / 1000);
    
    if (seconds < 60) {
      return `${seconds}s`;
    }
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes < 60) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    return `${hours}h ${remainingMinutes}m`;
  }
}

export class MultiProgress extends EventEmitter {
  private tasks: Map<string, ProgressTask>;
  private renderer: Renderer;
  private stream: StreamHandler;
  private theme: Theme;
  private isActive = false;
  private title?: string;
  private width: number;
  private startTime: number;

  constructor(options: MultiProgressOptions) {
    super();
    
    this.tasks = new Map();
    options.tasks.forEach(task => {
      this.tasks.set(task.id, { 
        ...task, 
        progress: task.progress || 0,
        status: task.status || 'pending'
      });
    });
    
    this.title = options.title;
    this.width = options.width || 40;
    this.theme = { ...createDefaultTheme(), ...options.theme };
    
    this.stream = new StreamHandler();
    this.renderer = new Renderer({ theme: this.theme, stream: this.stream });
    this.startTime = Date.now();
  }

  start(): void {
    if (this.isActive) return;
    
    this.isActive = true;
    this.startTime = Date.now();
    this.stream.start();
    this.stream.hideCursor();
    this.render();
  }

  update(taskId: string, update: Partial<ProgressTask>): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    
    Object.assign(task, update);
    this.emit('update', taskId, task);
    
    if (this.isActive) {
      this.render();
    }
    
    // Check if all tasks are complete
    const allComplete = Array.from(this.tasks.values()).every(
      t => t.status === 'completed' || t.status === 'failed'
    );
    
    if (allComplete) {
      this.complete();
    }
  }

  complete(taskId?: string): void {
    if (taskId) {
      this.update(taskId, { status: 'completed', progress: 100 });
    } else {
      this.stop();
      this.emit('complete');
    }
  }

  fail(taskId: string, error?: string): void {
    this.update(taskId, { status: 'failed', error });
  }

  addTask(task: ProgressTask): void {
    this.tasks.set(task.id, {
      ...task,
      progress: task.progress || 0,
      status: task.status || 'pending'
    });
    
    if (this.isActive) {
      this.render();
    }
  }

  stop(): void {
    if (!this.isActive) return;
    
    this.isActive = false;
    this.renderer.clear();
    this.stream.showCursor();
    this.stream.stop();
    
    // Render final state
    const finalMessage = this.renderFinal();
    if (finalMessage) {
      this.stream.write(finalMessage + '\n');
    }
  }

  private render(): void {
    const lines: string[] = [];
    
    // Title
    if (this.title) {
      lines.push(this.theme.formatters.primary(this.title));
      lines.push('');
    }
    
    // Overall progress
    const overall = this.calculateOverallProgress();
    const overallBar = this.renderProgressBar(overall);
    lines.push(this.theme.formatters.bold('Overall Progress'));
    lines.push(overallBar);
    lines.push('');
    
    // Individual tasks
    this.tasks.forEach(task => {
      const taskLines = this.renderTask(task);
      lines.push(...taskLines);
    });
    
    this.renderer.render(lines.join('\n'));
  }

  private renderTask(task: ProgressTask): string[] {
    const lines: string[] = [];
    
    // Task label with status icon
    const icon = this.getStatusIcon(task.status!);
    const label = `${icon} ${task.label}`;
    lines.push(label);
    
    // Progress bar for active tasks
    if (task.status === 'active') {
      const bar = this.renderProgressBar(task.progress || 0);
      lines.push(`  ${bar}`);
    } else if (task.status === 'failed' && task.error) {
      lines.push(this.theme.formatters.error(`  ${task.error}`));
    }
    
    lines.push('');
    return lines;
  }

  private renderProgressBar(percentage: number): string {
    const filled = Math.round(this.width * (percentage / 100));
    const empty = this.width - filled;
    
    const bar = 
      this.theme.formatters.success('█'.repeat(filled)) +
      this.theme.formatters.muted('░'.repeat(empty));
    
    return `[${bar}] ${Math.round(percentage)}%`;
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'pending':
        return this.theme.formatters.muted('○');
      case 'active':
        return this.theme.formatters.primary('◐');
      case 'completed':
        return this.theme.formatters.success('✓');
      case 'failed':
        return this.theme.formatters.error('✗');
      default:
        return ' ';
    }
  }

  private calculateOverallProgress(): number {
    const tasks = Array.from(this.tasks.values());
    const totalWeight = tasks.reduce((sum, task) => sum + (task.weight || 1), 0);
    
    let weightedProgress = 0;
    tasks.forEach(task => {
      const weight = task.weight || 1;
      const progress = task.status === 'completed' ? 100 : task.progress || 0;
      weightedProgress += (progress * weight) / totalWeight;
    });
    
    return Math.round(weightedProgress);
  }

  private renderFinal(): string {
    const elapsed = Date.now() - this.startTime;
    const time = this.formatTime(elapsed);
    
    const tasks = Array.from(this.tasks.values());
    const completed = tasks.filter(t => t.status === 'completed').length;
    const failed = tasks.filter(t => t.status === 'failed').length;
    
    if (failed === 0) {
      return this.theme.formatters.success(
        `✓ ${this.title || 'All tasks'} completed (${completed}/${tasks.length}) in ${time}`
      );
    } else {
      return this.theme.formatters.error(
        `✗ ${this.title || 'Tasks'} failed (${failed} failed, ${completed} completed) in ${time}`
      );
    }
  }

  private formatTime(ms: number): string {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
}

// Factory functions
export function progress(options?: ProgressOptions): Progress {
  const p = new Progress(options);
  p.start();
  return p;
}

export function multiProgress(options: MultiProgressOptions): MultiProgress {
  const mp = new MultiProgress(options);
  mp.start();
  return mp;
}
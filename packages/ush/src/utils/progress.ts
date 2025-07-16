export interface ProgressEvent {
  type: 'start' | 'progress' | 'complete' | 'error';
  message?: string;
  current?: number;
  total?: number;
  percentage?: number;
  duration?: number;
  rate?: number;
  eta?: number;
  data?: any;
}

export interface ProgressOptions {
  /**
   * Whether to show progress bars/indicators
   */
  enabled?: boolean;
  
  /**
   * Custom progress callback
   */
  onProgress?: (event: ProgressEvent) => void;
  
  /**
   * Update interval in milliseconds
   */
  updateInterval?: number;
  
  /**
   * Whether to report line-by-line progress for commands
   */
  reportLines?: boolean;
  
  /**
   * Custom message prefix
   */
  prefix?: string;
}

export class ProgressReporter {
  private startTime?: number;
  private lastUpdate?: number;
  private lineCount = 0;
  private byteCount = 0;
  
  constructor(private options: ProgressOptions = {}) {
    this.options = {
      enabled: true,
      updateInterval: 500,
      reportLines: false,
      ...options
    };
  }
  
  start(message?: string): void {
    if (!this.options.enabled) return;
    
    this.startTime = Date.now();
    this.lastUpdate = this.startTime;
    this.lineCount = 0;
    this.byteCount = 0;
    
    this.emit({
      type: 'start',
      message: message || 'Starting command execution...'
    });
  }
  
  reportOutput(data: string | Buffer): void {
    if (!this.options.enabled) return;
    
    const dataStr = data.toString();
    const lines = dataStr.split('\n').length - 1;
    this.lineCount += lines;
    this.byteCount += dataStr.length;
    
    if (this.options.reportLines && lines > 0) {
      this.progress(`Processed ${this.lineCount} lines`);
    }
    
    this.maybeUpdateProgress();
  }
  
  progress(message: string, current?: number, total?: number): void {
    if (!this.options.enabled) return;
    
    const now = Date.now();
    const duration = this.startTime ? now - this.startTime : 0;
    
    const event: ProgressEvent = {
      type: 'progress',
      message,
      current,
      total,
      duration
    };
    
    if (current !== undefined && total !== undefined && total > 0) {
      event.percentage = (current / total) * 100;
      
      if (duration > 0) {
        event.rate = current / (duration / 1000); // items per second
        
        if (event.rate > 0) {
          const remaining = total - current;
          event.eta = remaining / event.rate * 1000; // milliseconds
        }
      }
    }
    
    this.emit(event);
    this.lastUpdate = now;
  }
  
  complete(message?: string): void {
    if (!this.options.enabled) return;
    
    const duration = this.startTime ? Date.now() - this.startTime : 0;
    
    this.emit({
      type: 'complete',
      message: message || 'Command completed successfully',
      duration,
      data: {
        linesProcessed: this.lineCount,
        bytesProcessed: this.byteCount
      }
    });
  }
  
  error(error: Error, message?: string): void {
    if (!this.options.enabled) return;
    
    const duration = this.startTime ? Date.now() - this.startTime : 0;
    
    this.emit({
      type: 'error',
      message: message || `Command failed: ${error.message}`,
      duration,
      data: { error }
    });
  }
  
  private maybeUpdateProgress(): void {
    if (!this.lastUpdate || !this.options.updateInterval) return;
    
    const now = Date.now();
    if (now - this.lastUpdate >= this.options.updateInterval) {
      if (this.byteCount > 0) {
        this.progress(`Processed ${this.formatBytes(this.byteCount)}`);
      }
    }
  }
  
  private emit(event: ProgressEvent): void {
    if (this.options.prefix && event.message) {
      event.message = `${this.options.prefix}: ${event.message}`;
    }
    
    if (this.options.onProgress) {
      this.options.onProgress(event);
    } else {
      this.defaultProgressHandler(event);
    }
  }
  
  private defaultProgressHandler(event: ProgressEvent): void {
    switch (event.type) {
      case 'start':
        console.log(`▶ ${event.message}`);
        break;
      case 'progress':
        if (event.percentage !== undefined) {
          const bar = this.createProgressBar(event.percentage);
          console.log(`${bar} ${event.percentage.toFixed(1)}% ${event.message}`);
        } else {
          console.log(`⏳ ${event.message}`);
        }
        break;
      case 'complete':
        const durationStr = event.duration ? ` (${this.formatDuration(event.duration)})` : '';
        console.log(`✅ ${event.message}${durationStr}`);
        break;
      case 'error':
        console.error(`❌ ${event.message}`);
        break;
    }
  }
  
  private createProgressBar(percentage: number, width = 20): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${' '.repeat(empty)}]`;
  }
  
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
  
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  }
}

export function createProgressReporter(options?: ProgressOptions): ProgressReporter {
  return new ProgressReporter(options);
}
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

// Progress bar specific options
interface ProgressBarOptions extends ProgressOptions {
  total?: number;
  width?: number;
  complete?: string;
  incomplete?: string;
  head?: string;
  format?: string;
  tokens?: Record<string, string>;
  renderThrottle?: number;
}

// Progress bar implementation
export class ProgressBar {
  private current = 0;
  private startTime?: number;
  private lastRender = 0;
  
  constructor(private options: ProgressBarOptions = {}) {
    this.options = {
      total: 100,
      width: 40,
      complete: '=',
      incomplete: ' ',
      head: '>',
      format: ':bar :percent :etas',
      renderThrottle: 16,
      ...options
    };
    this.startTime = Date.now();
  }
  
  update(value: number): void {
    this.current = Math.min(value, this.options.total || 100);
    this.render();
  }
  
  increment(delta = 1): void {
    this.update(this.current + delta);
  }
  
  complete(): void {
    this.update(this.options.total || 100);
    process.stdout.write('\n');
  }
  
  private render(): void {
    const now = Date.now();
    if (now - this.lastRender < (this.options.renderThrottle || 16)) {
      return;
    }
    this.lastRender = now;
    
    const total = this.options.total || 100;
    const percent = total > 0 ? (this.current / total) * 100 : 100;
    const filled = Math.round((percent / 100) * (this.options.width || 40));
    const empty = (this.options.width || 40) - filled;
    
    let bar = this.options.complete?.repeat(filled) || '';
    if (filled < (this.options.width || 40)) {
      bar += this.options.head || '';
      bar += this.options.incomplete?.repeat(Math.max(0, empty - 1)) || '';
    }
    
    let output = this.options.format || ':bar :percent :etas';
    output = output.replace(':bar', bar);
    output = output.replace(':percent', `${percent.toFixed(0)}%`);
    output = output.replace(':current', String(this.current));
    output = output.replace(':total', String(total));
    
    // Calculate ETA
    if (this.startTime && percent > 0 && percent < 100) {
      const elapsed = now - this.startTime;
      const eta = (elapsed / percent) * (100 - percent);
      output = output.replace(':etas', this.formatTime(eta / 1000));
      output = output.replace(':eta', this.formatTime(eta / 1000));
    } else {
      output = output.replace(':etas', '0s');
      output = output.replace(':eta', '0s');
    }
    
    // Replace custom tokens
    if (this.options.tokens) {
      for (const [key, value] of Object.entries(this.options.tokens)) {
        output = output.replace(`:${key}`, value);
      }
    }
    
    // Clear line and write
    process.stdout.write('\r' + output);
  }
  
  private formatTime(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  }
}

export function createProgressBar(options?: ProgressBarOptions): ProgressBar {
  return new ProgressBar(options);
}

// Spinner implementation
export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private frameIndex = 0;
  private intervalId?: NodeJS.Timeout;
  
  constructor(private options: { text?: string; interval?: number } = {}) {
    this.options = {
      interval: 80,
      ...options
    };
  }
  
  start(text?: string): void {
    this.stop();
    if (text) this.options.text = text;
    
    this.intervalId = setInterval(() => {
      const frame = this.frames[this.frameIndex];
      const output = `\r${frame} ${this.options.text || ''}`;
      process.stdout.write(output);
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    }, this.options.interval || 80);
  }
  
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      process.stdout.write('\r\x1b[K'); // Clear line
    }
  }
  
  succeed(text?: string): void {
    this.stop();
    process.stdout.write(`✓ ${text || this.options.text || ''}\n`);
  }
  
  fail(text?: string): void {
    this.stop();
    process.stdout.write(`✗ ${text || this.options.text || ''}\n`);
  }
  
  info(text?: string): void {
    this.stop();
    process.stdout.write(`ℹ ${text || this.options.text || ''}\n`);
  }
  
  warn(text?: string): void {
    this.stop();
    process.stdout.write(`⚠ ${text || this.options.text || ''}\n`);
  }
}

export function createSpinner(options?: { text?: string; interval?: number }): Spinner {
  return new Spinner(options);
}

// Multi-progress implementation
export class MultiProgress {
  private bars: Map<string, ProgressBar> = new Map();
  private spinners: Map<string, Spinner> = new Map();
  private lineCount = 0;
  
  constructor() {}
  
  create(id: string, options?: ProgressBarOptions): ProgressBar {
    const bar = new ProgressBar(options);
    this.bars.set(id, bar);
    return bar;
  }
  
  createSpinner(id: string, options?: { text?: string; interval?: number }): Spinner {
    const spinner = new Spinner(options);
    this.spinners.set(id, spinner);
    return spinner;
  }
  
  remove(id: string): void {
    const bar = this.bars.get(id);
    if (bar) {
      this.bars.delete(id);
    }
    
    const spinner = this.spinners.get(id);
    if (spinner) {
      spinner.stop();
      this.spinners.delete(id);
    }
  }
  
  clear(): void {
    for (const spinner of this.spinners.values()) {
      spinner.stop();
    }
    this.bars.clear();
    this.spinners.clear();
  }
}
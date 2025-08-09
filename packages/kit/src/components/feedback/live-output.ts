/**
 * Live output component for streaming command execution output
 * Provides real-time display with highlighting, filtering, and controls
 */

import chalk from 'chalk';
import { stdout } from 'process';
import { Writable } from 'stream';
import * as sisteransi from 'sisteransi';

export interface LiveOutputOptions {
  title?: string;
  height?: number;
  follow?: boolean;
  highlight?: {
    error?: RegExp;
    warning?: RegExp;
    success?: RegExp;
    [key: string]: RegExp | undefined;
  };
  controls?: {
    pause?: string;
    clear?: string;
    filter?: string;
    [key: string]: string | undefined;
  };
  showLineNumbers?: boolean;
  maxLines?: number;
  wrapLines?: boolean;
}

export interface LiveOutputResult {
  append: (data: string, type?: 'info' | 'error' | 'warning' | 'success') => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  clear: () => void;
  pause: () => void;
  resume: () => void;
  destroy: () => void;
  getOutput: () => string[];
}

export class LiveOutput {
  private lines: string[] = [];
  private displayOffset = 0;
  private isPaused = false;
  private isDestroyed = false;
  private filter: RegExp | null = null;
  private renderTimer: NodeJS.Timeout | null = null;
  private stream: Writable;
  
  constructor(private options: LiveOutputOptions = {}) {
    this.stream = stdout;
    this.initialize();
  }
  
  private initialize(): void {
    const { title, controls = {} } = this.options;
    
    // Display title
    if (title) {
      this.stream.write(chalk.bold.blue(`📺 ${title}\n`));
      this.stream.write(chalk.gray('─'.repeat(50)) + '\n');
    }
    
    // Display controls if any
    const controlKeys = Object.entries(controls);
    if (controlKeys.length > 0) {
      const controlsText = controlKeys
        .map(([action, key]) => `${chalk.cyan(key)}: ${action}`)
        .join(' │ ');
      this.stream.write(chalk.gray(`Controls: ${controlsText}\n`));
      this.stream.write(chalk.gray('─'.repeat(50)) + '\n');
    }
    
    // Set up keyboard input handling if controls are defined
    if (controlKeys.length > 0) {
      this.setupKeyboardControls();
    }
    
    // Start render loop
    this.startRenderLoop();
  }
  
  private setupKeyboardControls(): void {
    const { controls = {} } = this.options;
    
    if (!process.stdin.isTTY) return;
    
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    process.stdin.on('data', (key: string) => {
      if (key === '\u0003') { // Ctrl+C
        this.destroy();
        process.exit();
      }
      
      if (controls.pause && key === controls.pause) {
        if (this.isPaused) {
          this.resume();
        } else {
          this.pause();
        }
      }
      
      if (controls.clear && key === controls.clear) {
        this.clear();
      }
      
      if (controls.filter && key === controls.filter) {
        // TODO: Implement interactive filter input
        this.stream.write('\n' + chalk.yellow('Filter mode not yet implemented\n'));
      }
    });
  }
  
  private startRenderLoop(): void {
    this.renderTimer = setInterval(() => {
      if (!this.isPaused && !this.isDestroyed) {
        this.render();
      }
    }, 100);
  }
  
  private render(): void {
    const { height = 20, follow = true, showLineNumbers = false } = this.options;
    
    // Clear previous output
    if (this.lines.length > 0) {
      const linesToClear = Math.min(height, this.lines.length);
      // Move cursor up and clear lines
      for (let i = 0; i < linesToClear; i++) {
        this.stream.write(sisteransi.cursor.up(1) + sisteransi.erase.line);
      }
    }
    
    // Determine which lines to display
    let linesToShow = this.lines;
    
    // Apply filter if set
    if (this.filter) {
      linesToShow = linesToShow.filter(line => this.filter!.test(line));
    }
    
    // Handle scrolling
    const totalLines = linesToShow.length;
    let startIndex = 0;
    let endIndex = totalLines;
    
    if (totalLines > height) {
      if (follow) {
        // Follow mode: show last N lines
        startIndex = totalLines - height;
        endIndex = totalLines;
      } else {
        // Manual scroll mode
        startIndex = this.displayOffset;
        endIndex = Math.min(startIndex + height, totalLines);
      }
    }
    
    // Display lines
    const displayLines = linesToShow.slice(startIndex, endIndex);
    displayLines.forEach((line, index) => {
      const lineNumber = showLineNumbers ? chalk.gray(`${(startIndex + index + 1).toString().padStart(4)} │ `) : '';
      const highlightedLine = this.highlightLine(line);
      this.stream.write(lineNumber + highlightedLine + '\n');
    });
    
    // Pad with empty lines if needed
    const remainingLines = height - displayLines.length;
    for (let i = 0; i < remainingLines; i++) {
      this.stream.write('\n');
    }
  }
  
  private highlightLine(line: string): string {
    const { highlight = {} } = this.options;
    
    // Check for highlighting patterns
    if (highlight.error && highlight.error.test(line)) {
      return chalk.red(line);
    }
    if (highlight.warning && highlight.warning.test(line)) {
      return chalk.yellow(line);
    }
    if (highlight.success && highlight.success.test(line)) {
      return chalk.green(line);
    }
    
    // Check custom highlight patterns
    for (const [color, pattern] of Object.entries(highlight)) {
      if (pattern && !['error', 'warning', 'success'].includes(color) && pattern.test(line)) {
        // Apply custom color if available in chalk
        const chalkColor = (chalk as any)[color];
        if (typeof chalkColor === 'function') {
          return chalkColor(line);
        }
      }
    }
    
    return line;
  }
  
  append(data: string, type?: 'info' | 'error' | 'warning' | 'success'): void {
    if (this.isDestroyed) return;
    
    // Split data into lines
    const newLines = data.split('\n').filter(line => line.length > 0);
    
    // Apply type-based coloring if specified
    const coloredLines = newLines.map(line => {
      switch (type) {
        case 'error':
          return chalk.red(line);
        case 'warning':
          return chalk.yellow(line);
        case 'success':
          return chalk.green(line);
        default:
          return line;
      }
    });
    
    // Add to buffer
    this.lines.push(...coloredLines);
    
    // Limit buffer size
    const { maxLines = 1000 } = this.options;
    if (this.lines.length > maxLines) {
      this.lines = this.lines.slice(-maxLines);
    }
  }
  
  success(message: string): void {
    this.append(`✅ ${message}`, 'success');
  }
  
  error(message: string): void {
    this.append(`❌ ${message}`, 'error');
  }
  
  warning(message: string): void {
    this.append(`⚠️  ${message}`, 'warning');
  }
  
  clear(): void {
    this.lines = [];
    this.displayOffset = 0;
    this.render();
  }
  
  pause(): void {
    this.isPaused = true;
    this.stream.write('\n' + chalk.yellow('⏸  Output paused\n'));
  }
  
  resume(): void {
    this.isPaused = false;
    this.stream.write(chalk.green('▶️  Output resumed\n'));
  }
  
  destroy(): void {
    this.isDestroyed = true;
    
    if (this.renderTimer) {
      clearInterval(this.renderTimer);
      this.renderTimer = null;
    }
    
    // Restore terminal
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
  }
  
  getOutput(): string[] {
    return [...this.lines];
  }
  
  toResult(): LiveOutputResult {
    return {
      append: (data, type) => this.append(data, type),
      success: (message) => this.success(message),
      error: (message) => this.error(message),
      warning: (message) => this.warning(message),
      clear: () => this.clear(),
      pause: () => this.pause(),
      resume: () => this.resume(),
      destroy: () => this.destroy(),
      getOutput: () => this.getOutput(),
    };
  }
}

/**
 * Create a live output display for streaming data
 */
export function liveOutput(options: LiveOutputOptions = {}): LiveOutputResult {
  const output = new LiveOutput(options);
  return output.toResult();
}
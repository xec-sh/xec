import picocolors from 'picocolors';
import { erase, cursor } from 'sisteransi';

import { Theme } from '../../core/types.js';
import { EventEmitter } from '../../core/event-emitter.js';

export interface SpinnerOptions {
  text?: string;
  frames?: string[];
  interval?: number;
  theme?: Theme;
}

export class Spinner {
  private text: string;
  private frames: string[];
  private interval: number;
  private frameIndex: number = 0;
  private timer: NodeJS.Timeout | null = null;
  private stream: NodeJS.WriteStream;
  private isSpinning: boolean = false;
  private events: EventEmitter;
  private lineCount: number = 0;
  private lastFrame: string = '';
  private theme?: Theme;

  constructor(text?: string, options: SpinnerOptions = {}) {
    this.text = text || options.text || '';
    this.frames = options.frames || ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.interval = options.interval || 80;
    this.stream = process.stdout;
    this.events = new EventEmitter();
    this.theme = options.theme;
  }

  private clearLines() {
    for (let i = 0; i < this.lineCount; i++) {
      this.stream.write(cursor.up(1) + erase.line);
    }
    this.lineCount = 0;
  }

  private render() {
    if (!this.isSpinning) return;

    const frame = this.frames[this.frameIndex];
    const pc = picocolors;
    
    let output = '';
    
    // Clear previous frame
    if (this.lastFrame) {
      this.clearLines();
    }
    
    // Hide cursor
    output += cursor.hide;
    
    // Render spinner frame and text
    output += pc.cyan(frame) + ' ' + this.text;
    
    // Count newlines
    this.lineCount = (output.match(/\n/g) || []).length + 1;
    this.lastFrame = output;
    
    this.stream.write(output);
    
    // Update frame index
    this.frameIndex = (this.frameIndex + 1) % this.frames.length;
  }

  start(text?: string): Spinner {
    if (this.isSpinning) return this;
    
    if (text !== undefined) {
      this.text = text;
    }
    
    this.isSpinning = true;
    this.render();
    
    this.timer = setInterval(() => {
      this.render();
    }, this.interval);
    
    this.events.emit('start');
    return this;
  }

  stop(text?: string): Spinner {
    if (!this.isSpinning) return this;
    
    this.isSpinning = false;
    
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    
    // Clear the spinner
    this.clearLines();
    
    // Show cursor
    this.stream.write(cursor.show);
    
    // Display final text if provided
    if (text) {
      const pc = picocolors;
      this.stream.write(pc.dim('•') + ' ' + text + '\n');
    }
    
    this.events.emit('stop', text);
    return this;
  }

  success(text?: string): Spinner {
    this.stop();
    
    const finalText = text || this.text;
    const symbol = this.theme?.symbols?.success || '✓';
    const pc = picocolors;
    
    this.stream.write(pc.green(symbol) + ' ' + finalText + '\n');
    this.events.emit('success', finalText);
    
    return this;
  }

  error(text?: string): Spinner {
    this.stop();
    
    const finalText = text || this.text;
    const symbol = this.theme?.symbols?.error || '✗';
    const pc = picocolors;
    
    this.stream.write(pc.red(symbol) + ' ' + finalText + '\n');
    this.events.emit('error', finalText);
    
    return this;
  }

  warn(text?: string): Spinner {
    this.stop();
    
    const finalText = text || this.text;
    const symbol = this.theme?.symbols?.warning || '⚠';
    const pc = picocolors;
    
    this.stream.write(pc.yellow(symbol) + ' ' + finalText + '\n');
    this.events.emit('warn', finalText);
    
    return this;
  }

  info(text?: string): Spinner {
    this.stop();
    
    const finalText = text || this.text;
    const symbol = this.theme?.symbols?.info || 'ℹ';
    const pc = picocolors;
    
    this.stream.write(pc.blue(symbol) + ' ' + finalText + '\n');
    this.events.emit('info', finalText);
    
    return this;
  }

  setText(text: string): Spinner {
    this.text = text;
    return this;
  }

  setFrames(frames: string[]): Spinner {
    this.frames = frames;
    this.frameIndex = 0;
    return this;
  }

  setInterval(interval: number): Spinner {
    this.interval = interval;
    
    // Restart timer with new interval if spinning
    if (this.isSpinning && this.timer) {
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        this.render();
      }, this.interval);
    }
    
    return this;
  }

  isActive(): boolean {
    return this.isSpinning;
  }

  on(event: string, handler: (...args: any[]) => void): Spinner {
    this.events.on(event, handler);
    return this;
  }

  off(event: string, handler: (...args: any[]) => void): Spinner {
    this.events.off(event, handler);
    return this;
  }
}

// Factory function for easy spinner creation
export function spinner(text?: string, options?: SpinnerOptions): Spinner {
  const instance = new Spinner(text, options);
  instance.start();
  return instance;
}
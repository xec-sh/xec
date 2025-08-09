/**
 * Spinner Component
 * An animated loading spinner for terminal display
 */

import { BaseComponent } from '../../core/component.js';
import { Bounds } from '../../core/types.js';

export interface SpinnerOptions {
  type?: 'dots' | 'line' | 'arc' | 'star';
  color?: string;
  text?: string;
  interval?: number;
}

export interface SpinnerState {
  frame: number;
  isSpinning: boolean;
  text: string;
}

/**
 * An animated spinner component
 */
export class Spinner extends BaseComponent<SpinnerState> {
  private options: SpinnerOptions;
  private timer: NodeJS.Timeout | null = null;
  private frames: string[];
  
  private static readonly SPINNER_FRAMES = {
    dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    line: ['-', '\\', '|', '/'],
    arc: ['◜', '◠', '◝', '◞', '◡', '◟'],
    star: ['✶', '✸', '✹', '✺', '✹', '✸']
  };
  
  constructor(options: SpinnerOptions = {}) {
    super();
    
    this.options = {
      type: 'dots',
      color: 'cyan',
      text: '',
      interval: 80,
      ...options
    };
    
    this.frames = Spinner.SPINNER_FRAMES[this.options.type!];
    
    this.state = {
      frame: 0,
      isSpinning: false,
      text: this.options.text!
    };
  }
  
  /**
   * Start the spinner animation
   */
  start(): void {
    if (this.state.isSpinning) return;
    
    this.setState({ isSpinning: true });
    
    this.timer = setInterval(() => {
      this.setState({
        frame: (this.state.frame + 1) % this.frames.length
      });
    }, this.options.interval);
  }
  
  /**
   * Stop the spinner animation
   */
  stop(): void {
    if (!this.state.isSpinning) return;
    
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    
    this.setState({ isSpinning: false, frame: 0 });
  }
  
  /**
   * Set the spinner text
   */
  setText(text: string): void {
    this.setState({ text });
  }
  
  /**
   * Toggle the spinner
   */
  toggle(): void {
    if (this.state.isSpinning) {
      this.stop();
    } else {
      this.start();
    }
  }
  
  /**
   * Render the spinner
   */
  render(bounds?: Bounds, terminal?: any): any {
    let output = '';
    
    if (this.state.isSpinning) {
      output = this.frames[this.state.frame] || ' ';
    } else {
      output = ' '; // Placeholder when not spinning
    }
    
    if (this.state.text) {
      output += ' ' + this.state.text;
    }
    
    return {
      lines: [output],
      width: output.length,
      height: 1
    };
  }
  
  /**
   * Get component bounds
   */
  override getBounds(): Bounds {
    const width = 1 + (this.state.text ? this.state.text.length + 1 : 0);
    return {
      x: 0,
      y: 0,
      width,
      height: 1
    };
  }
  
  /**
   * Clean up on unmount
   */
  override async unmount(): Promise<void> {
    this.stop();
    await super.unmount();
  }
}
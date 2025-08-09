/**
 * ProgressBar Component
 * A simple progress bar for terminal display
 */

import { BaseComponent } from '../../core/component.js';
import { Bounds } from '../../core/types.js';

export interface ProgressBarOptions {
  value?: number; // 0-100
  width?: number;
  showPercentage?: boolean;
  filledChar?: string;
  emptyChar?: string;
  color?: string;
  backgroundColor?: string;
}

export interface ProgressBarState {
  value: number;
  width: number;
  showPercentage: boolean;
}

/**
 * A progress bar component that shows completion percentage
 */
export class ProgressBar extends BaseComponent<ProgressBarState> {
  private options: ProgressBarOptions;
  
  constructor(options: ProgressBarOptions = {}) {
    super();
    
    this.options = {
      value: 0,
      width: 20,
      showPercentage: false,
      filledChar: '█',
      emptyChar: '░',
      color: 'green',
      backgroundColor: 'gray',
      ...options
    };
    
    this.state = {
      value: Math.max(0, Math.min(100, this.options.value!)),
      width: this.options.width!,
      showPercentage: this.options.showPercentage!
    };
  }
  
  /**
   * Set the progress value (0-100)
   */
  setValue(value: number): void {
    const clampedValue = Math.max(0, Math.min(100, value));
    this.setState({ value: clampedValue });
  }
  
  /**
   * Get the current value
   */
  getValue(): number {
    return this.state.value;
  }
  
  /**
   * Set the width of the progress bar
   */
  setWidth(width: number): void {
    this.setState({ width: Math.max(1, width) });
  }
  
  /**
   * Toggle percentage display
   */
  togglePercentage(): void {
    this.setState({ showPercentage: !this.state.showPercentage });
  }
  
  /**
   * Render the progress bar
   */
  render(bounds?: Bounds, terminal?: any): any {
    const barWidth = this.state.showPercentage 
      ? Math.max(1, this.state.width - 5) // Reserve space for "100%"
      : this.state.width;
    
    const filledWidth = Math.round((this.state.value / 100) * barWidth);
    const emptyWidth = barWidth - filledWidth;
    
    // Build the bar
    let bar = '';
    bar += this.options.filledChar!.repeat(filledWidth);
    bar += this.options.emptyChar!.repeat(emptyWidth);
    
    // Add percentage if enabled
    if (this.state.showPercentage) {
      bar += ` ${this.state.value.toString().padStart(3)}%`;
    }
    
    // Return the rendered output
    return {
      lines: [bar],
      width: bar.length,
      height: 1
    };
  }
  
  /**
   * Get component bounds
   */
  override getBounds(): Bounds {
    return {
      x: 0,
      y: 0,
      width: this.state.width + (this.state.showPercentage ? 5 : 0),
      height: 1
    };
  }
}
import picocolors from 'picocolors';
import { cursor } from 'sisteransi';

import { Prompt } from '../../core/prompt.js';
import { Key, PromptConfig } from '../../core/types.js';
import { StateManager } from '../../core/state-manager.js';

export interface NumberOptions {
  min?: number;
  max?: number;
  step?: number;
  default?: number;
  validate?: (value: number) => string | undefined;
}

interface NumberState {
  value: string;
  cursorPosition: number;
  error: string | undefined;
}

export class NumberPrompt extends Prompt<number, NumberOptions> {
  private min: number = -Infinity;
  private max: number = Infinity;
  private step: number = 1;
  private validate?: (value: number) => string | undefined;

  constructor(config: PromptConfig<number, NumberOptions> & NumberOptions) {
    super(config);
    
    this.min = config.min ?? -Infinity;
    this.max = config.max ?? Infinity;
    this.step = config.step ?? 1;
    this.validate = config.validate;
    
    // Set initial value
    const defaultValue = config.default ?? config.initialValue ?? 0;
    this.state = new StateManager<NumberState>({
      value: defaultValue.toString(),
      cursorPosition: defaultValue.toString().length,
      error: undefined
    });
  }

  private getCurrentNumber(): number | null {
    const { value } = this.state.getState();
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  }

  private validateInput(value: string): string | undefined {
    // Allow empty string, minus sign, and decimal point during typing
    if (value === '' || value === '-' || value === '.') {
      return undefined;
    }

    // Check if it's a valid number format
    const num = parseFloat(value);
    if (isNaN(num)) {
      return 'Please enter a valid number';
    }

    // Check min/max bounds
    if (num < this.min) {
      return `Value must be at least ${this.min}`;
    }
    if (num > this.max) {
      return `Value must be at most ${this.max}`;
    }

    // Custom validation
    if (this.validate) {
      return this.validate(num);
    }

    return undefined;
  }

  private moveUp() {
    const num = this.getCurrentNumber();
    if (num !== null) {
      const newValue = Math.min(num + this.step, this.max);
      const newStr = newValue.toString();
      this.state.setState({
        value: newStr,
        cursorPosition: newStr.length,
        error: undefined
      });
    }
  }

  private moveDown() {
    const num = this.getCurrentNumber();
    if (num !== null) {
      const newValue = Math.max(num - this.step, this.min);
      const newStr = newValue.toString();
      this.state.setState({
        value: newStr,
        cursorPosition: newStr.length,
        error: undefined
      });
    }
  }

  private insertChar(char: string) {
    const { value, cursorPosition } = this.state.getState();
    const newValue = value.slice(0, cursorPosition) + char + value.slice(cursorPosition);
    const error = this.validateInput(newValue);
    
    this.state.setState({
      value: newValue,
      cursorPosition: cursorPosition + 1,
      error
    });
  }

  private deleteChar() {
    const { value, cursorPosition } = this.state.getState();
    if (cursorPosition > 0) {
      const newValue = value.slice(0, cursorPosition - 1) + value.slice(cursorPosition);
      const error = this.validateInput(newValue);
      
      this.state.setState({
        value: newValue,
        cursorPosition: cursorPosition - 1,
        error
      });
    }
  }

  private moveCursorLeft() {
    const { cursorPosition } = this.state.getState();
    if (cursorPosition > 0) {
      this.state.setState({
        ...this.state.getState(),
        cursorPosition: cursorPosition - 1
      });
    }
  }

  private moveCursorRight() {
    const { value, cursorPosition } = this.state.getState();
    if (cursorPosition < value.length) {
      this.state.setState({
        ...this.state.getState(),
        cursorPosition: cursorPosition + 1
      });
    }
  }

  private moveCursorToStart() {
    this.state.setState({
      ...this.state.getState(),
      cursorPosition: 0
    });
  }

  private moveCursorToEnd() {
    const { value } = this.state.getState();
    this.state.setState({
      ...this.state.getState(),
      cursorPosition: value.length
    });
  }

  render(): string {
    const { value, cursorPosition, error } = this.state.getState();
    const theme = this.theme;
    const pc = picocolors;

    let output = '';
    
    // Hide cursor
    output += cursor.hide;
    
    // Message
    const questionSymbol = theme.symbols?.question || '?';
    output += questionSymbol + ' ' + pc.bold(this.config.message) + ' ';
    
    // Input with cursor - ensure value is a string
    const strValue = String(value || '');
    const beforeCursor = strValue.slice(0, cursorPosition);
    const atCursor = strValue[cursorPosition] || ' ';
    const afterCursor = strValue.slice(cursorPosition + 1);
    
    output += pc.cyan(beforeCursor);
    output += pc.inverse(atCursor);
    output += pc.cyan(afterCursor);
    
    // Show range hint
    if (this.min !== -Infinity || this.max !== Infinity) {
      output += pc.dim(' ');
      if (this.min !== -Infinity && this.max !== Infinity) {
        output += pc.dim(`(${this.min} - ${this.max})`);
      } else if (this.min !== -Infinity) {
        output += pc.dim(`(>= ${this.min})`);
      } else {
        output += pc.dim(`(<= ${this.max})`);
      }
    }
    
    // Error message
    if (error) {
      const errorSymbol = theme.symbols?.error || '✖';
      output += '\n' + errorSymbol + ' ' + pc.red(error);
    }
    
    return output;
  }

  async handleInput(key: Key): Promise<void> {
    const keyName = key.name || key.char || '';
    
    switch (keyName) {
      case 'up':
        this.moveUp();
        break;
      case 'down':
        this.moveDown();
        break;
      case 'left':
        this.moveCursorLeft();
        break;
      case 'right':
        this.moveCursorRight();
        break;
      case 'home':
        this.moveCursorToStart();
        break;
      case 'end':
        this.moveCursorToEnd();
        break;
      case 'backspace':
      case 'delete':
        this.deleteChar();
        break;
      case 'return':
      case 'enter':
        const { value, error } = this.state.getState();
        if (!error && value !== '' && value !== '-' && value !== '.') {
          const num = parseFloat(value);
          if (!isNaN(num)) {
            this.resolve(num);
          }
        }
        break;
      default:
        // Insert numeric characters, decimal point, and minus sign
        if (key.char && /^[\d.-]$/.test(key.char)) {
          this.insertChar(key.char);
        }
        break;
    }
  }
}
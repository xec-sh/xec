/**
 * NumberInput component for Terex
 * Provides numeric input with validation, formatting, and step control
 */

import { StyleBuilder } from '../../core/color.js';
import { BaseComponent, type ComponentEventMap } from '../../core/component.js';

import type { Key, Output } from '../../core/types.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface NumberInputOptions {
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  format?: (value: number) => string;
  validate?: (value: number) => string | undefined | Promise<string | undefined>;
  placeholder?: string;
  readOnly?: boolean;
  disabled?: boolean;
  allowNegative?: boolean;
  allowDecimal?: boolean;
  thousandsSeparator?: string;
  decimalSeparator?: string;
  prefix?: string;
  suffix?: string;
  cursorStyle?: 'block' | 'underline' | 'bar';
  showCursor?: boolean;
}

export interface NumberInputInternalOptions {
  defaultValue: number | null;
  min: number;
  max: number;
  step: number;
  precision: number;
  format: (value: number) => string;
  validate: (value: number) => string | undefined | Promise<string | undefined>;
  placeholder: string;
  readOnly: boolean;
  disabled: boolean;
  allowNegative: boolean;
  allowDecimal: boolean;
  thousandsSeparator: string;
  decimalSeparator: string;
  prefix: string;
  suffix: string;
  cursorStyle: 'block' | 'underline' | 'bar';
  showCursor: boolean;
}

export interface NumberInputState {
  value: number | null;
  displayValue: string;
  cursorPosition: number;
  error?: string;
  isValidating: boolean;
  isFocused: boolean;
  showPlaceholder: boolean;
}

// ============================================================================
// NumberInput Component
// ============================================================================

export class NumberInput extends BaseComponent<NumberInputState> {
  private options: NumberInputInternalOptions;
  private style: StyleBuilder;
  private hasCustomFormat: boolean;
  
  constructor(options: NumberInputOptions = {}) {
    // Set default options first (before formatting)
    const defaultOptions = {
      defaultValue: options.defaultValue ?? null,
      min: options.min ?? -Infinity,
      max: options.max ?? Infinity,
      step: options.step ?? 1,
      precision: options.precision ?? 0,
      format: options.format ?? ((v) => v.toString()),
      validate: options.validate ?? (() => undefined),
      placeholder: options.placeholder ?? '0',
      readOnly: options.readOnly ?? false,
      disabled: options.disabled ?? false,
      allowNegative: options.allowNegative ?? true,
      allowDecimal: options.allowDecimal ?? (options.precision ? options.precision > 0 : true),
      thousandsSeparator: options.thousandsSeparator ?? '',
      decimalSeparator: options.decimalSeparator ?? '.',
      prefix: options.prefix ?? '',
      suffix: options.suffix ?? '',
      cursorStyle: options.cursorStyle ?? 'block',
      showCursor: options.showCursor ?? true
    };
    
    // Format initial display value using helper function (before super())
    const defaultValue = options.defaultValue;
    let formattedValue = '';
    
    if (defaultValue != null) {
      const hasCustomFormat = options.format !== undefined;
      
      if (hasCustomFormat) {
        formattedValue = defaultOptions.format(defaultValue);
      } else {
        // Basic formatting for initialization
        let str: string;
        if (defaultOptions.allowDecimal && defaultOptions.precision > 0) {
          str = defaultValue.toFixed(defaultOptions.precision);
        } else if (defaultOptions.allowDecimal) {
          str = defaultValue.toString();
        } else {
          str = Math.round(defaultValue).toString();
        }
        
        // Add thousands separator
        if (defaultOptions.thousandsSeparator) {
          const parts = str.split('.');
          parts[0] = parts[0]?.replace(/\B(?=(\d{3})+(?!\d))/g, defaultOptions.thousandsSeparator) ?? '';
          str = parts.join(defaultOptions.decimalSeparator);
        } else {
          str = str.replace('.', defaultOptions.decimalSeparator);
        }
        
        // Add prefix and suffix
        if (defaultOptions.prefix || defaultOptions.suffix) {
          str = `${defaultOptions.prefix}${str}${defaultOptions.suffix}`;
        }
        
        formattedValue = str;
      }
    }
    
    // Round the value if allowDecimal is false
    let initialValue = defaultValue ?? null;
    if (initialValue !== null && !defaultOptions.allowDecimal) {
      initialValue = Math.round(initialValue);
    }

    const initialState: NumberInputState = {
      value: initialValue,
      displayValue: formattedValue,
      cursorPosition: defaultValue ? formattedValue.length : 0,
      error: undefined,
      isValidating: false,
      isFocused: false,
      showPlaceholder: !defaultValue
    };
    
    super({ initialState });
    
    // Track if custom format was provided (after super)
    this.hasCustomFormat = options.format !== undefined;
    
    // Set options after super()
    this.options = defaultOptions;

    this.style = new StyleBuilder();
  }
  
  // ============================================================================
  // Rendering
  // ============================================================================
  
  render(): Output {
    const { value, displayValue, cursorPosition, error, isFocused, showPlaceholder } = this.state;
    const { placeholder, prefix, suffix, disabled, readOnly } = this.options;
    
    // Determine what to display
    let display = displayValue;
    
    if (showPlaceholder && !displayValue && placeholder) {
      display = placeholder;
    } else if (value !== null && !isFocused) {
      // Only format when not focused to maintain editing experience
      display = this.formatNumber(value);
    }
    
    // Respect width constraints from setDimensions
    const maxWidth = this.dimensions.width;
    if (maxWidth && maxWidth > 0 && display.length > maxWidth) {
      // Truncate display to fit width, leaving room for cursor
      const availableWidth = maxWidth - (this.options.prefix?.length || 0) - (this.options.suffix?.length || 0);
      if (availableWidth > 0) {
        display = display.substring(0, availableWidth);
      }
    }
    
    // Build the display line
    const lines: string[] = [];
    let line = '';
    
    // Add prefix
    if (prefix) {
      line += this.style.dim().text(prefix);
    }
    
    // Build number display with cursor
    for (let i = 0; i < display.length; i++) {
      const char = display[i] ?? ' ';
      let styled = char;
      
      // Apply cursor styling (if enabled)
      if (isFocused && this.options.showCursor && i === cursorPosition) {
        if (this.options.cursorStyle === 'block') {
          styled = this.style.inverse().text(char);
        } else if (this.options.cursorStyle === 'underline') {
          styled = this.style.underline().text(char);
        } else {
          // Bar cursor - shown as inverse of the character
          styled = this.style.inverse().text('|');
        }
      }
      // Apply placeholder styling
      else if (showPlaceholder) {
        styled = this.style.dim().text(char);
      }
      // Apply disabled/readonly styling
      else if (disabled || readOnly) {
        styled = this.style.dim().text(char);
      }
      
      line += styled;
    }
    
    // Add cursor at end if needed (if enabled)
    if (isFocused && this.options.showCursor && cursorPosition >= display.length) {
      if (this.options.cursorStyle === 'block') {
        line += this.style.inverse().text(' ');
      } else if (this.options.cursorStyle === 'underline') {
        line += this.style.underline().text(' ');
      } else {
        line += this.style.text('|');
      }
    }
    
    // Add suffix
    if (suffix) {
      line += this.style.dim().text(suffix);
    }
    
    lines.push(line);
    
    // Add error message if present
    if (error) {
      lines.push(this.style.red().text(`⚠ ${error}`));
    }
    
    return {
      lines,
      cursor: this.state.isFocused ? { x: this.state.cursorPosition, y: 0 } : undefined
    };
  }
  
  // ============================================================================
  // Input Handling
  // ============================================================================
  
  override handleKeypress(key: Key): boolean {
    // Handle input asynchronously but return synchronously
    this.handleInput(key).catch(error => {
      console.error('Input handling error:', error);
    });
    return true; // Always consume the event
  }
  
  // Add a test helper method that awaits async input handling
  async handleKeypressAsync(key: Key): Promise<boolean> {
    if (this.options.disabled || this.options.readOnly) {
      return false;
    }
    
    await this.handleInput(key);
    return true;
  }
  
  async handleInput(key: Key): Promise<void> {
    if (this.options.disabled || this.options.readOnly) {
      return;
    }
    
    const { displayValue, cursorPosition } = this.state;
    
    // Handle special keys
    if (key.ctrl) {
      await this.handleCtrlKey(key);
      return;
    }
    
    switch (key.name) {
      case 'return':
      case 'enter':
        await this.handleSubmit();
        break;
        
      case 'backspace':
        await this.handleBackspace();
        break;
        
      case 'delete':
        await this.handleDelete();
        break;
        
      case 'left':
        this.moveCursor(-1);
        break;
        
      case 'right':
        this.moveCursor(1);
        break;
        
      case 'home':
        this.moveCursorToStart();
        break;
        
      case 'end':
        this.moveCursorToEnd();
        break;
        
      case 'up':
        await this.increment();
        break;
        
      case 'down':
        await this.decrement();
        break;
        
      case 'tab':
        this.emit('tab', key.shift ?? false);
        break;
        
      case 'escape':
        this.handleEscape();
        break;
        
      default:
        // Regular character input
        if (key.sequence && key.sequence.length === 1 && !key.meta) {
          await this.insertCharacter(key.sequence);
        }
    }
    
    this.invalidate();
  }
  
  private async handleCtrlKey(key: Key): Promise<void> {
    switch (key.name) {
      case 'a':
        // Select all (move cursor to end)
        this.moveCursorToEnd();
        break;
        
      case 'k':
        // Clear to end
        this.clearToEnd();
        break;
        
      case 'u':
        // Clear all
        this.clear();
        break;
    }
  }
  
  // ============================================================================
  // Number Manipulation
  // ============================================================================
  
  private async insertCharacter(char: string): Promise<void> {
    const { displayValue, cursorPosition } = this.state;
    
    // Only allow valid characters
    if (!this.isValidCharacter(char)) {
      return;
    }
    
    let newDisplay: string;
    let newCursorPosition: number;
    
    // Special handling for negative sign - always goes at the beginning
    if (char === '-' && this.options.allowNegative) {
      if (!displayValue.includes('-')) {
        newDisplay = '-' + displayValue;
        newCursorPosition = 1; // Position after the minus sign
      } else {
        return; // Already has a negative sign
      }
    } else {
      // Normalize decimal point to standard format for internal processing
      let normalizedChar = char;
      if (char === '.' || char === this.options.decimalSeparator) {
        normalizedChar = '.';
      }
      
      // Insert character at cursor position
      newDisplay = 
        displayValue.slice(0, cursorPosition) + 
        normalizedChar + 
        displayValue.slice(cursorPosition);
      newCursorPosition = cursorPosition + 1;
    }
    
    // Try to parse the number
    const parsed = this.parseNumber(newDisplay);
    
    // Update display value and parsed value with cursor position
    await this.setValueWithCursor(parsed, newDisplay, newCursorPosition);
    
    // Emit input event for every keystroke
    this.emit('input', { value: parsed, displayValue: newDisplay });
  }
  
  private isValidCharacter(char: string): boolean {
    // Allow digits
    if (/\d/.test(char)) {
      return true;
    }
    
    // Allow negative sign (we handle positioning in insertCharacter)
    if (char === '-' && this.options.allowNegative) {
      return !this.state.displayValue.includes('-');
    }
    
    // Allow decimal separator (check both . and decimalSeparator)
    if ((char === '.' || char === this.options.decimalSeparator) && this.options.allowDecimal) {
      return !this.state.displayValue.includes('.') && !this.state.displayValue.includes(this.options.decimalSeparator);
    }
    
    return false;
  }
  
  private async handleBackspace(): Promise<void> {
    const { displayValue, cursorPosition } = this.state;
    
    if (cursorPosition > 0) {
      const newDisplay = 
        displayValue.slice(0, cursorPosition - 1) + 
        displayValue.slice(cursorPosition);
      
      const parsed = this.parseNumber(newDisplay);
      await this.setValue(parsed, newDisplay);
      this.setState({ cursorPosition: cursorPosition - 1 });
    }
  }
  
  private async handleDelete(): Promise<void> {
    const { displayValue, cursorPosition } = this.state;
    
    if (cursorPosition < displayValue.length) {
      const newDisplay = 
        displayValue.slice(0, cursorPosition) + 
        displayValue.slice(cursorPosition + 1);
      
      const parsed = this.parseNumber(newDisplay);
      await this.setValue(parsed, newDisplay);
    }
  }
  
  private clearToEnd(): void {
    const { displayValue, cursorPosition } = this.state;
    const newDisplay = displayValue.slice(0, cursorPosition);
    const parsed = this.parseNumber(newDisplay);
    this.setValue(parsed, newDisplay);
  }
  
  private async increment(): Promise<void> {
    const { value } = this.state;
    const { step, max } = this.options;
    
    const current = value ?? 0;
    const newValue = Math.min(max, current + step);
    
    await this.setValue(newValue, newValue.toString());
    this.moveCursorToEnd();
  }
  
  private async decrement(): Promise<void> {
    const { value } = this.state;
    const { step, min } = this.options;
    
    const current = value ?? 0;
    const newValue = Math.max(min, current - step);
    
    await this.setValue(newValue, newValue.toString());
    this.moveCursorToEnd();
  }
  
  // ============================================================================
  // Cursor Management
  // ============================================================================
  
  private moveCursor(delta: number): void {
    const { displayValue, cursorPosition } = this.state;
    const newPosition = Math.max(0, Math.min(displayValue.length, cursorPosition + delta));
    
    this.setState({ cursorPosition: newPosition });
  }
  
  private moveCursorToStart(): void {
    this.setState({ cursorPosition: 0 });
  }
  
  private moveCursorToEnd(): void {
    this.setState({ cursorPosition: this.state.displayValue.length });
  }
  
  // ============================================================================
  // Parsing and Formatting
  // ============================================================================
  
  private parseNumber(str: string): number | null {
    if (!str || str === '-') {
      return null;
    }
    
    // Remove formatting characters
    let cleaned = str;
    
    // Remove prefix and suffix if they exist
    if (this.options.prefix && cleaned.startsWith(this.options.prefix)) {
      cleaned = cleaned.slice(this.options.prefix.length);
    }
    if (this.options.suffix && cleaned.endsWith(this.options.suffix)) {
      cleaned = cleaned.slice(0, -this.options.suffix.length);
    }
    
    // Remove thousands separator (only if it exists)
    if (this.options.thousandsSeparator) {
      const escapedSeparator = this.options.thousandsSeparator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      cleaned = cleaned.replace(new RegExp(escapedSeparator, 'g'), '');
    }
    
    // Replace decimal separator with standard decimal point
    if (this.options.decimalSeparator !== '.') {
      cleaned = cleaned.replace(this.options.decimalSeparator, '.');
    }
    
    const parsed = parseFloat(cleaned);
    
    if (isNaN(parsed)) {
      return null;
    }
    
    // Don't round if we allow decimals - keep the parsed value
    if (this.options.allowDecimal) {
      return parsed;
    }
    
    return Math.round(parsed);
  }
  
  private formatNumber(num: number): string {
    // Apply custom format if provided
    if (this.hasCustomFormat) {
      return this.options.format(num);
    }
    
    // Apply precision based on allowDecimal
    let str: string;
    if (this.options.allowDecimal && this.options.precision > 0) {
      str = num.toFixed(this.options.precision);
    } else if (this.options.allowDecimal) {
      str = num.toString();
    } else {
      str = Math.round(num).toString();
    }
    
    // Add thousands separator
    if (this.options.thousandsSeparator) {
      const parts = str.split('.');
      parts[0] = parts[0]?.replace(/\B(?=(\d{3})+(?!\d))/g, this.options.thousandsSeparator) ?? '';
      str = parts.join(this.options.decimalSeparator);
    } else {
      str = str.replace('.', this.options.decimalSeparator);
    }
    
    return str;
  }
  
  // ============================================================================
  // Validation
  // ============================================================================
  
  private async setValue(value: number | null, displayValue: string): Promise<void> {
    const oldValue = this.state.value;
    
    this.setState({
      value,
      displayValue,
      error: undefined,
      showPlaceholder: !displayValue
    });
    
    // Only emit change if value actually changed
    if (value !== oldValue && value !== null) {
      this.emit('change', {
        type: 'change',
        detail: { value, previousValue: oldValue }
      });
    }
    
    if (value !== null) {
      const isValid = await this.validateInternal(value);
      this.emit('validation', { isValid, error: this.state.error, value });
    }
  }

  private async setValueWithCursor(value: number | null, displayValue: string, cursorPosition: number): Promise<void> {
    const oldValue = this.state.value;
    
    this.setState({
      value,
      displayValue,
      cursorPosition,
      error: undefined,
      showPlaceholder: !displayValue
    });
    
    // Only emit change if value actually changed
    if (value !== oldValue && value !== null) {
      this.emit('change', {
        type: 'change',
        detail: { value, previousValue: oldValue }
      });
    }
    
    if (value !== null) {
      const isValid = await this.validateInternal(value);
      this.emit('validation', { isValid, error: this.state.error, value });
    }
  }
  
  private async validateInternal(value: number): Promise<boolean> {
    const { min, max, validate } = this.options;
    let errorMessage: string | undefined = undefined;
    
    // Check range
    if (value < min) {
      errorMessage = `Minimum value is ${min}`;
    } else if (value > max) {
      errorMessage = `Maximum value is ${max}`;
    }
    
    // If basic validation fails, set error and return
    if (errorMessage) {
      this.setState({ error: errorMessage, isValidating: false });
      return false;
    }
    
    // Custom validation
    this.setState({ isValidating: true });
    
    try {
      const customError = await validate(value);
      
      if (customError) {
        this.setState({ error: customError, isValidating: false });
        return false;
      }
      
      this.setState({ error: undefined, isValidating: false });
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Validation failed';
      this.setState({
        error: errorMsg,
        isValidating: false
      });
      return false;
    }
  }
  
  // ============================================================================
  // Submission
  // ============================================================================
  
  private async handleSubmit(): Promise<void> {
    const { value } = this.state;
    
    if (value === null) {
      this.setState({ error: 'Value is required' });
      return;
    }
    
    // Validate before submit
    const isValid = await this.validateInternal(value);
    
    if (!isValid) {
      return;
    }
    
    // Emit submit event
    this.emit('submit', value);
  }
  
  private handleEscape(): void {
    this.emit('cancel', { type: 'cancel', detail: {} });
  }
  
  // ============================================================================
  // Focus Management
  // ============================================================================
  
  override focus(): void {
    this.setState({ 
      isFocused: true,
      showPlaceholder: false
    });
    this.moveCursorToEnd();
    super.focus();
  }
  
  override blur(): void {
    this.setState({ isFocused: false });
    
    // Format the display value when losing focus
    if (this.state.value !== null) {
      this.setState({ displayValue: this.formatNumber(this.state.value) });
    } else {
      this.setState({ showPlaceholder: true });
    }
    
    super.blur();
  }
  
  // ============================================================================
  // Public API
  // ============================================================================
  
  getValue(): number | null {
    return this.state.value;
  }
  
  async validate(): Promise<boolean> {
    const { value } = this.state;
    if (value === null) {
      this.setState({ error: 'Value is required' });
      return false;
    }
    const isValid = await this.validateInternal(value);
    this.emit('validation', { type: 'validation', detail: { isValid, error: this.state.error, value } });
    return isValid;
  }
  
  async setValuePublic(value: number): Promise<void> {
    const formatted = this.formatNumber(value);
    await this.setValue(value, formatted);
    this.moveCursorToEnd();
  }
  
  clear(): void {
    this.setState({
      value: null,
      displayValue: '',
      cursorPosition: 0,
      error: undefined,
      showPlaceholder: true
    });
    
    // Emit change event for clearing
    this.emit('change', { type: 'change', detail: { value: null, previousValue: this.state.value } });
  }
  
  async isValid(): Promise<boolean> {
    const { value } = this.state;
    if (value === null) {
      return false;
    }
    return await this.validateInternal(value);
  }
  
  getError(): string | undefined {
    return this.state.error;
  }
  
  // ============================================================================
  // Utilities
  // ============================================================================
  

  // Helper method for event emission
  public override emit<K extends keyof ComponentEventMap>(
    event: K, 
    ...args: ComponentEventMap[K]
  ): void {
    super.emit(event, ...args);
  }

  /**
   * Get the current state (for test compatibility)
   */
  override getState(): NumberInputState {
    return this.state;
  }
}
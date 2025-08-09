/**
 * TextInput component for Terex
 * Provides single-line text input with cursor, selection, and validation
 */

import { ColorSystem, StyleBuilder } from '../../core/color.js';
import { BaseComponent, type ComponentEventMap } from '../../core/component.js';

import type { Key, Output } from '../../core/types.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface TextInputOptions {
  placeholder?: string;
  defaultValue?: string;
  mask?: string | ((char: string) => string);
  maxLength?: number;
  minLength?: number;
  pattern?: RegExp;
  validate?: (value: string) => string | undefined | Promise<string | undefined>;
  transform?: (value: string) => string;
  format?: (value: string) => string;
  multiline?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  selectOnFocus?: boolean;
  clearOnSubmit?: boolean;
  submitOnBlur?: boolean;
  cursorStyle?: 'block' | 'underline' | 'bar';
  showCursor?: boolean;
}

export interface TextInputState {
  value: string;
  cursorPosition: number;
  selectionStart: number;
  selectionEnd: number;
  error?: string;
  isValidating: boolean;
  isFocused: boolean;
  showPlaceholder: boolean;
  history: string[];
  historyIndex: number;
}

// ============================================================================
// TextInput Component
// ============================================================================

export class TextInput extends BaseComponent<TextInputState> {
  private options: Required<TextInputOptions>;
  private style: StyleBuilder;

  constructor(options: TextInputOptions = {}) {
    const defaultValue = options.defaultValue ?? '';
    const initialState: TextInputState = {
      value: defaultValue,
      cursorPosition: defaultValue.length, // Start cursor at end of default value
      selectionStart: -1,
      selectionEnd: -1,
      error: undefined,
      isValidating: false,
      isFocused: false,
      showPlaceholder: !options.defaultValue,
      history: [],
      historyIndex: -1
    };

    super({ initialState });

    // Set default options
    this.options = {
      placeholder: options.placeholder ?? '',
      defaultValue: options.defaultValue ?? '',
      mask: options.mask ?? undefined,
      maxLength: options.maxLength ?? Infinity,
      minLength: options.minLength ?? 0,
      pattern: options.pattern ?? undefined,
      validate: options.validate ?? (() => undefined),
      transform: options.transform ?? ((v) => v),
      format: options.format ?? ((v) => v),
      multiline: options.multiline ?? false,
      readOnly: options.readOnly ?? false,
      disabled: options.disabled ?? false,
      selectOnFocus: options.selectOnFocus ?? false,
      clearOnSubmit: options.clearOnSubmit ?? false,
      submitOnBlur: options.submitOnBlur ?? false,
      cursorStyle: options.cursorStyle ?? 'block',
      showCursor: options.showCursor ?? true
    } as Required<TextInputOptions>;

    // Create a color system that automatically detects terminal capabilities
    // Use fromEnv() to detect color support from environment
    const colorSystem = ColorSystem.fromEnv();
    this.style = new StyleBuilder(colorSystem);
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  render(): Output {
    const { value, cursorPosition, selectionStart, selectionEnd, error, isFocused, showPlaceholder } = this.state;
    const { placeholder, mask, format, disabled, readOnly } = this.options;

    // Determine what to display
    let displayValue = value;

    if (showPlaceholder && !value && placeholder) {
      displayValue = placeholder;
    } else if (mask) {
      if (typeof mask === 'string') {
        displayValue = mask.repeat(value.length);
      } else {
        displayValue = value.split('').map(mask).join('');
      }
    } else {
      displayValue = format(value);
    }

    // Apply styling
    const lines: string[] = [];

    // Build the display line with cursor and selection
    let line = '';

    for (let i = 0; i < displayValue.length; i++) {
      const char = displayValue[i] ?? ' ';
      let styled = char;

      // Apply selection styling
      if (selectionStart !== -1 && i >= selectionStart && i <= selectionEnd) {
        styled = this.style.inverse().text(char);
      }
      // Apply cursor styling (if enabled)
      else if (isFocused && this.options.showCursor && i === cursorPosition) {
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
    if (isFocused && this.options.showCursor && cursorPosition >= displayValue.length) {
      if (this.options.cursorStyle === 'block') {
        line += this.style.inverse().text(' ');
      } else if (this.options.cursorStyle === 'underline') {
        line += this.style.underline().text(' ');
      } else {
        line += this.style.text('|');
      }
    }

    lines.push(line);

    // Add error message if present
    if (error) {
      lines.push(this.style.red().text(`⚠ ${error}`));
    }

    return {
      lines,
      cursor: this.state.isFocused ? {
        x: Math.max(0, Math.min(displayValue.length, this.state.cursorPosition)),
        y: 0
      } : undefined
    };
  }

  // ============================================================================
  // Input Handling
  // ============================================================================

  /**
   * Override handleKeypress to route to handleInput
   */
  override handleKeypress(key: Key): boolean {
    // Call our async handleInput method
    this.handleInput(key).catch((err) => {
      console.error('Error handling input:', err);
    });
    // Return true to indicate we handled the key
    return true;
  }

  async handleInput(key: Key): Promise<void> {
    if (this.options.disabled || this.options.readOnly) {
      return;
    }

    const { value, cursorPosition } = this.state;

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
        this.moveCursor(-1, key.shift);
        break;

      case 'right':
        this.moveCursor(1, key.shift);
        break;

      case 'home':
        this.moveCursorToStart(key.shift);
        break;

      case 'end':
        this.moveCursorToEnd(key.shift);
        break;

      case 'up':
        if (this.state.history.length > 0) {
          this.navigateHistory(-1);
        }
        break;

      case 'down':
        if (this.state.historyIndex !== -1) {
          this.navigateHistory(1);
        }
        break;

      case 'tab':
        // Tab typically moves focus to next component
        this.emit('tab', key.shift);
        break;

      case 'escape':
        this.handleEscape();
        break;

      default:
        // Regular character input (including multi-byte characters)
        // Exclude control characters like \n, \t, \r but allow printable multi-byte chars
        if (key.sequence && !key.meta && key.sequence.length > 0) {
          // Filter out common control characters
          const isControlChar = /[\x00-\x1F\x7F]/.test(key.sequence);
          if (!isControlChar) {
            await this.insertCharacter(key.sequence);
          }
        }
    }

    this.invalidate();
  }

  private async handleCtrlKey(key: Key): Promise<void> {
    // eslint-disable-next-line default-case
    switch (key.name) {
      case 'a':
        // Select all
        this.selectAll();
        break;

      case 'c':
        // If no selection, treat as cancel/interrupt
        if (!this.hasSelection()) {
          this.emit('cancel');
          // Also emit process interrupt for proper cleanup
          if (process.stdin.isTTY) {
            process.emit('SIGINT' as any);
          }
        } else {
          // Copy selected text
          const selected = this.getSelectedText();
          this.emit('copy', selected);
        }
        break;

      case 'x':
        // Cut
        if (this.hasSelection()) {
          const selected = this.getSelectedText();
          this.emit('cut', selected);
          await this.deleteSelection();
        }
        break;

      case 'v':
        // Paste (handled externally)
        this.emit('paste');
        break;

      case 'z':
        // Undo
        this.undo();
        break;

      case 'y':
        // Redo
        this.redo();
        break;

      case 'k':
        // Delete to end of line
        this.deleteToEnd();
        break;

      case 'u':
        // Delete to beginning of line
        this.deleteToStart();
        break;

      case 'w':
        // Delete word backward
        this.deleteWordBackward();
        break;
    }
  }

  // ============================================================================
  // Text Manipulation
  // ============================================================================

  private async insertCharacter(char: string): Promise<void> {
    let { value, cursorPosition } = this.state;

    // Check max length
    if (value.length >= this.options.maxLength) {
      return;
    }

    // Delete selection if exists
    if (this.hasSelection()) {
      await this.deleteSelection();
      // Get updated state after deletion
      value = this.state.value;
      cursorPosition = this.state.cursorPosition;
    }

    // Insert character
    const newValue =
      value.slice(0, cursorPosition) +
      char +
      value.slice(cursorPosition);

    // Update value and cursor position together
    const newCursorPosition = cursorPosition + char.length;
    await this.setValueWithCursor(newValue, newCursorPosition);
  }

  private async handleBackspace(): Promise<void> {
    if (this.hasSelection()) {
      await this.deleteSelection();
    } else if (this.state.cursorPosition > 0) {
      const { value, cursorPosition } = this.state;
      const newValue =
        value.slice(0, cursorPosition - 1) +
        value.slice(cursorPosition);

      await this.setValueWithCursor(newValue, cursorPosition - 1);
    }
  }

  private async handleDelete(): Promise<void> {
    if (this.hasSelection()) {
      await this.deleteSelection();
    } else if (this.state.cursorPosition < this.state.value.length) {
      const { value, cursorPosition } = this.state;
      const newValue =
        value.slice(0, cursorPosition) +
        value.slice(cursorPosition + 1);

      await this.setValueWithCursor(newValue, cursorPosition);
    }
  }

  private async deleteSelection(): Promise<void> {
    const { value, selectionStart, selectionEnd } = this.state;

    if (selectionStart === -1) return;

    const newValue =
      value.slice(0, selectionStart) +
      value.slice(selectionEnd + 1);

    await this.setValue(newValue);
    this.setState({
      cursorPosition: selectionStart,
      selectionStart: -1,
      selectionEnd: -1
    });
  }

  private deleteToEnd(): void {
    const { value, cursorPosition } = this.state;
    const newValue = value.slice(0, cursorPosition);
    this.setValue(newValue);
  }

  private deleteToStart(): void {
    const { value, cursorPosition } = this.state;
    const newValue = value.slice(cursorPosition);
    this.setValue(newValue);
    this.setState({ cursorPosition: 0 });
  }

  private deleteWordBackward(): void {
    const { value, cursorPosition } = this.state;

    // Find word boundary
    let pos = cursorPosition - 1;
    while (pos > 0 && value[pos] === ' ') pos--;
    while (pos > 0 && value[pos - 1] !== ' ') pos--;

    const newValue = value.slice(0, pos) + value.slice(cursorPosition);
    this.setValue(newValue);
    this.setState({ cursorPosition: pos });
  }

  // ============================================================================
  // Cursor and Selection
  // ============================================================================

  private moveCursor(delta: number, select = false): void {
    const { value, cursorPosition } = this.state;
    const newPosition = Math.max(0, Math.min(value.length, cursorPosition + delta));

    if (select) {
      this.extendSelection(newPosition);
    } else {
      this.setState({
        cursorPosition: newPosition,
        selectionStart: -1,
        selectionEnd: -1
      });
    }
  }

  private moveCursorToStart(select = false): void {
    if (select) {
      this.extendSelection(0);
    } else {
      this.setState({
        cursorPosition: 0,
        selectionStart: -1,
        selectionEnd: -1
      });
    }
  }

  private moveCursorToEnd(select = false): void {
    const endPosition = this.state.value.length;

    if (select) {
      this.extendSelection(endPosition);
    } else {
      this.setState({
        cursorPosition: endPosition,
        selectionStart: -1,
        selectionEnd: -1
      });
    }
  }

  private extendSelection(to: number): void {
    const { selectionStart, selectionEnd, cursorPosition } = this.state;

    if (selectionStart === -1) {
      // Start new selection
      const start = Math.min(cursorPosition, to);
      const end = Math.max(cursorPosition, to) - 1;

      this.setState({
        selectionStart: start,
        selectionEnd: end,
        cursorPosition: to
      });
    } else {
      // Extend existing selection
      const anchor = cursorPosition === selectionStart ? selectionEnd + 1 : selectionStart;
      const start = Math.min(anchor, to);
      const end = Math.max(anchor, to) - 1;

      this.setState({
        selectionStart: start,
        selectionEnd: end,
        cursorPosition: to
      });
    }
  }

  private selectAll(): void {
    this.setState({
      selectionStart: 0,
      selectionEnd: this.state.value.length - 1,
      cursorPosition: this.state.value.length
    });
  }

  private hasSelection(): boolean {
    return this.state.selectionStart !== -1;
  }

  private getSelectedText(): string {
    const { value, selectionStart, selectionEnd } = this.state;

    if (selectionStart === -1) return '';

    return value.slice(selectionStart, selectionEnd + 1);
  }

  // ============================================================================
  // History
  // ============================================================================

  private navigateHistory(delta: number): void {
    const { history, historyIndex } = this.state;

    let newIndex: number;

    if (delta < 0) {
      // Going up (towards newer history)
      if (historyIndex === -1) {
        // Start from the most recent item
        newIndex = history.length - 1;
      } else {
        newIndex = Math.max(0, historyIndex + delta);
      }
    } else {
      // Going down (towards older history or current input)
      if (historyIndex + delta >= history.length) {
        newIndex = -1; // Back to current input
      } else {
        newIndex = historyIndex + delta;
      }
    }

    if (newIndex === -1) {
      // Return to current input
      this.setState({
        value: '',
        historyIndex: -1,
        cursorPosition: 0
      });
    } else if (newIndex >= 0 && newIndex < history.length) {
      const value = history[newIndex] ?? '';
      this.setState({
        value,
        historyIndex: newIndex,
        cursorPosition: value.length
      });
    }
  }

  private undo(): void {
    // Simple undo - restore previous value
    // In a real implementation, this would use a proper undo stack
    this.emit('undo');
  }

  private redo(): void {
    // Simple redo
    this.emit('redo');
  }

  // ============================================================================
  // Validation
  // ============================================================================

  private async setValue(value: string): Promise<void> {
    // Apply transform
    const transformed = this.options.transform(value);

    // Clear error when typing
    this.setState({
      value: transformed,
      error: undefined,
      showPlaceholder: !transformed
    });

    // Validate
    await this.validate(transformed);

    // Emit change event
    this.emit('change', transformed);
  }

  private async setValueWithCursor(value: string, cursorPosition: number): Promise<void> {
    // Apply transform
    const transformed = this.options.transform(value);

    // Clear error when typing and update cursor position
    this.setState({
      value: transformed,
      cursorPosition,
      error: undefined,
      showPlaceholder: !transformed
    });

    // Validate
    await this.validate(transformed);

    // Emit change event
    this.emit('change', transformed);
  }

  private async validate(value: string): Promise<boolean> {
    const { minLength, maxLength, pattern, validate } = this.options;

    // Check length constraints
    if (value.length < minLength) {
      this.setState({ error: `Minimum ${minLength} characters required` });
      return false;
    }

    if (value.length > maxLength) {
      this.setState({ error: `Maximum ${maxLength} characters allowed` });
      return false;
    }

    // Check pattern
    if (pattern && !pattern.test(value)) {
      this.setState({ error: 'Invalid format' });
      return false;
    }

    // Custom validation
    this.setState({ isValidating: true });

    try {
      const error = await validate(value);

      if (error) {
        this.setState({ error, isValidating: false });
        return false;
      }

      this.setState({ error: undefined, isValidating: false });
      return true;
    } catch (err) {
      this.setState({
        error: err instanceof Error ? err.message : 'Validation failed',
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

    // Validate before submit
    const isValid = await this.validate(value);

    if (!isValid) {
      return;
    }

    // Add to history
    if (value && !this.state.history.includes(value)) {
      this.setState({
        history: [...this.state.history, value],
        historyIndex: -1
      });
    }

    // Emit submit event
    this.emit('submit', value);

    // Clear if configured
    if (this.options.clearOnSubmit) {
      this.setState({
        value: '',
        cursorPosition: 0,
        showPlaceholder: true
      });
    }
  }

  private handleEscape(): void {
    // Clear the input text
    this.setState({
      value: '',
      cursorPosition: 0,
      selectionStart: -1,
      selectionEnd: -1,
      showPlaceholder: true
    });

    // Emit cancel event
    this.emit('cancel');

    // Invalidate to trigger re-render
    this.invalidate();
  }

  // ============================================================================
  // Focus Management
  // ============================================================================

  override focus(): void {
    this.setState({ isFocused: true });

    if (this.options.selectOnFocus) {
      this.selectAll();
    }

    super.focus();
  }

  override blur(): void {
    this.setState({ isFocused: false });

    if (this.options.submitOnBlur) {
      this.handleSubmit();
    }

    super.blur();
  }

  // ============================================================================
  // Public API
  // ============================================================================

  getValue(): string {
    return this.state.value;
  }

  async setValuePublic(value: string): Promise<void> {
    await this.setValue(value);
    this.setState({ cursorPosition: value.length });
  }

  clear(): void {
    this.setState({
      value: '',
      cursorPosition: 0,
      selectionStart: -1,
      selectionEnd: -1,
      error: undefined,
      showPlaceholder: true
    });
  }

  async isValid(): Promise<boolean> {
    return await this.validate(this.state.value);
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
    this.events.emit(event, ...args);
  }
}
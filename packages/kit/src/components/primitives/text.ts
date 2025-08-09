/**
 * @module components/primitives/text
 * Text input component for capturing user text input
 */

import color from 'picocolors';

import { Prompt } from '../../core/prompt.js';

import type { Key, PromptConfig } from '../../core/types.js';
import type { TransformFunction, ValidationFunction } from '../../utils/types.js';

/**
 * Options for configuring the text input prompt
 * 
 * @interface TextOptions
 * @example
 * ```typescript
 * const name = await text({
 *   message: 'What is your name?',
 *   placeholder: 'John Doe',
 *   validate: (value) => value.length < 2 ? 'Name too short' : undefined
 * });
 * ```
 */
export interface TextOptions {
  /**
   * Placeholder text shown when input is empty
   * @default ''
   */
  placeholder?: string;

  /**
   * Default value to pre-fill the input
   * @default ''
   */
  defaultValue?: string;
  
  /**
   * Alias for defaultValue (for compatibility)
   * @default ''
   */
  default?: string;
  
  /**
   * Suggestions for auto-completion
   */
  suggestions?: string[];
  
  /**
   * Help text to display
   */
  help?: string;

  /**
   * Character or function to mask input (useful for passwords)
   * @example
   * mask: '*' // All characters shown as *
   * mask: (char) => char === ' ' ? char : '•' // Mask non-spaces
   */
  mask?: string | ((char: string) => string);

  /**
   * Validation function that returns error message or undefined
   * Can be async for server-side validation
   * @example
   * validate: (value) => value.includes('@') ? undefined : 'Invalid email'
   * validate: async (value) => await checkUsername(value) ? 'Username taken' : undefined
   */
  validate?: ValidationFunction<string>;

  /**
   * Transform function to modify the final value
   * @example
   * transform: (value) => value.trim().toLowerCase()
   */
  transform?: TransformFunction<string>;

  /**
   * Whether the input is required (cannot be empty)
   * @default false
   */
  required?: boolean;

  /**
   * Minimum length of the input
   */
  minLength?: number;

  /**
   * Maximum length of the input
   */
  maxLength?: number;

  /**
   * Whether to allow multiple lines of input
   * @default false
   */
  multiline?: boolean;
}

/**
 * Text input prompt implementation
 * 
 * @class TextPrompt
 * @extends {Prompt<string, TextOptions>}
 * 
 * @example
 * ```typescript
 * const prompt = new TextPrompt({
 *   message: 'Enter your email:',
 *   validate: (value) => value.includes('@') ? undefined : 'Invalid email'
 * });
 * const email = await prompt.prompt();
 * ```
 */
export class TextPrompt extends Prompt<string, TextOptions> {
  /**
   * Current cursor position in the input
   * @protected
   */
  protected cursor = 0;

  /**
   * Get the current input value
   * @returns {string} The current text value
   */
  get value(): string {
    return this.state.getState().value || '';
  }

  /**
   * Set the input value
   * @param {string} val - The new text value
   */
  set value(val: string) {
    this.state.setState((s: any) => ({ ...s, value: val }));
  }

  /**
   * Create a new text prompt instance
   * @param {PromptConfig<string, TextOptions> & TextOptions} config - Configuration options
   */
  constructor(config: PromptConfig<string, TextOptions> & TextOptions) {
    super(config);
    const initialValue = config.defaultValue || config.default || config.initialValue || '';
    if (initialValue) {
      this.state.setState((s: any) => ({ ...s, value: initialValue }));
      this.cursor = initialValue.length;
    }
  }

  render(): string {
    const ctx = this.getRenderContext();
    const { message, placeholder } = this.config;
    const { error, status } = this.state.getState();

    let output = '';

    // Message
    output += ctx.theme.formatters.highlight(message);
    if (status === 'active') {
      output += ' ' + ctx.theme.formatters.muted('›');
    }
    output += ' ';

    // Input line
    if (status === 'active') {
      const displayValue = this.getMaskedValue();
      const showPlaceholder = !this.value && placeholder;

      if (showPlaceholder) {
        output += ctx.theme.formatters.muted(placeholder);
      } else {
        // Render with cursor
        const before = displayValue.slice(0, this.cursor);
        const char = displayValue[this.cursor] || ' ';
        const after = displayValue.slice(this.cursor + 1);

        output += before;
        output += color.inverse(char);
        output += after;
      }
    } else {
      output += this.formatValue(this.value);
    }

    // Error message
    if (error && status === 'active') {
      output += '\n  ' + ctx.theme.formatters.error(error);
    }

    return output;
  }

  async handleInput(key: Key): Promise<void> {
    const { name, ctrl, shift, char } = key;

    // Submit on Enter (unless multiline mode)
    if ((name === 'enter' || name === 'return') && !this.config.multiline) {
      await this.submit(this.value);
      return;
    }

    // Multiline submit (Ctrl+D)
    if (this.config.multiline && ctrl && name === 'd') {
      await this.submit(this.value);
      return;
    }

    // Navigation
    if (name === 'left') {
      this.cursor = Math.max(0, this.cursor - 1);
      this.renderer.render(this.render());
      return;
    }

    if (name === 'right') {
      this.cursor = Math.min(this.value.length, this.cursor + 1);
      this.renderer.render(this.render());
      return;
    }

    if (name === 'home' || (ctrl && name === 'a')) {
      this.cursor = 0;
      this.renderer.render(this.render());
      return;
    }

    if (name === 'end' || (ctrl && name === 'e')) {
      this.cursor = this.value.length;
      this.renderer.render(this.render());
      return;
    }

    // Deletion
    if (name === 'backspace') {
      if (this.cursor > 0) {
        const currentValue = this.value;
        const newValue =
          currentValue.slice(0, this.cursor - 1) +
          currentValue.slice(this.cursor);
        this.value = newValue;
        this.cursor--;
        this.updateState();
      }
      return;
    }

    if (name === 'delete') {
      const currentValue = this.value;
      if (this.cursor < currentValue.length) {
        const newValue =
          currentValue.slice(0, this.cursor) +
          currentValue.slice(this.cursor + 1);
        this.value = newValue;
        this.updateState();
      }
      return;
    }

    // Clear line
    if (ctrl && name === 'u') {
      this.value = '';
      this.cursor = 0;
      this.updateState();
      return;
    }

    // Clear to end
    if (ctrl && name === 'k') {
      const currentValue = this.value;
      this.value = currentValue.slice(0, this.cursor);
      this.updateState();
      return;
    }

    // Handle newline in multiline mode
    if (this.config.multiline && (name === 'enter' || name === 'return')) {
      const currentValue = this.value;
      const newValue =
        currentValue.slice(0, this.cursor) +
        '\n' +
        currentValue.slice(this.cursor);
      this.value = newValue;
      this.cursor++;
      this.updateState();
      return;
    }

    // Character input - handle both key.char and key.name, preserving all printable characters
    let inputChar = char;
    if (!inputChar && name) {
      // Handle special characters that should be preserved as input
      if (name === 'space') {
        inputChar = ' ';
      } else if (name === 'tab') {
        inputChar = '\t';
      } else if (!ctrl && name.length === 1 && !['up', 'down', 'left', 'right'].includes(name)) {
        // Accept single characters that are not arrow keys or control sequences
        inputChar = name;
      }
    }

    if (inputChar) {
      // Check maxLength before adding characters
      if (this.config.maxLength && this.value.length >= this.config.maxLength) {
        return;
      }

      const currentValue = this.value;

      // For maxLength, truncate the input to fit within the remaining space
      let finalInputChar = inputChar;
      if (this.config.maxLength) {
        const remainingSpace = this.config.maxLength - currentValue.length;
        if (remainingSpace <= 0) {
          return;
        }
        finalInputChar = inputChar.slice(0, remainingSpace);
      }

      const newValue =
        currentValue.slice(0, this.cursor) +
        finalInputChar +
        currentValue.slice(this.cursor);

      this.value = newValue;
      this.cursor += finalInputChar.length;
      this.updateState();
      return;
    }
  }

  private updateState(): void {
    // Only clear error if there's actual content being typed
    // Don't clear validation errors from submit attempts
    this.state.setState((s: any) => ({
      ...s,
      error: this.value ? undefined : s.error
    }));
    // Trigger re-render after state update
    this.renderer.render(this.render());
  }

  private getMaskedValue(): string {
    if (!this.config.mask) {
      return this.value;
    }

    if (typeof this.config.mask === 'string') {
      return this.config.mask.repeat(this.value.length);
    }

    return this.value
      .split('')
      .map(char => (this.config.mask as (char: string) => string)(char))
      .join('');
  }

  override async submit(value: string): Promise<void> {
    // Validate required
    if (this.config.required && !value.trim()) {
      this.state.setState((s: any) => ({ ...s, error: 'This field is required' }));
      this.renderer.render(this.render());
      return;
    }

    // Validate minLength
    if (this.config.minLength && value.length < this.config.minLength) {
      this.state.setState((s: any) => ({
        ...s,
        error: `Must be at least ${this.config.minLength} characters`
      }));
      this.renderer.render(this.render());
      return;
    }

    // Validate maxLength (shouldn't happen due to input prevention, but double check)
    if (this.config.maxLength && value.length > this.config.maxLength) {
      this.state.setState((s: any) => ({
        ...s,
        error: `Must be at most ${this.config.maxLength} characters`
      }));
      this.renderer.render(this.render());
      return;
    }

    // Run custom validation
    if (this.config.validate) {
      try {
        const error = await this.config.validate(value);
        if (error) {
          this.state.setState((s: any) => ({ ...s, error }));
          this.renderer.render(this.render());
          return;
        }
      } catch (err) {
        this.state.setState((s: any) => ({
          ...s,
          error: 'Validation error: ' + (err instanceof Error ? err.message : String(err))
        }));
        this.renderer.render(this.render());
        return;
      }
    }

    // Apply transformation
    let finalValue = value;
    if (this.config.transform) {
      try {
        const transformed = this.config.transform(value);
        // Ensure the transform returns a string
        if (typeof transformed === 'string') {
          finalValue = transformed;
        }
      } catch (err) {
        // If transform fails, use original value silently
      }
    }

    // Call parent submit
    await super.submit(finalValue);
  }
}
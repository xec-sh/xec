import { Prompt } from '../prompt.js';
import { Renderer } from '../renderer.js';
import { EventEmitter } from '../event-emitter.js';
import { ReactiveState } from './reactive-state.js';
import { StreamHandler } from '../stream-handler.js';
import { createDefaultTheme } from '../../themes/default.js';

import type { Key, Theme } from '../types.js';

export interface ReactivePromptConfig<T extends Record<string, any>> {
  initialValues: T;
  prompts: (state: ReactiveState<T>) => ReactivePromptDefinition[];
  theme?: Theme;
}

export interface ReactivePromptDefinition {
  id: string;
  type: 'text' | 'select' | 'confirm' | 'number' | 'multiselect';
  message: string | (() => string);
  value?: any;
  options?: any[] | (() => any[]);
  validate?: (value: any) => string | boolean | Promise<string | boolean>;
  when?: () => boolean;
  onChange?: (value: any) => void;
  dependencies?: string[];
}

export class ReactivePrompt<T extends Record<string, any>> extends EventEmitter {
  private state: ReactiveState<T>;
  private prompts: ReactivePromptDefinition[] = [];
  private currentPromptIndex = 0;
  private renderer: Renderer;
  private stream: StreamHandler;
  private theme: Theme;
  private activePrompts: Map<string, Prompt<any, any>> = new Map();
  private isRendering = false;
  private disposed = false;

  constructor(config: ReactivePromptConfig<T>) {
    super();

    this.state = new ReactiveState(config.initialValues);
    this.theme = { ...createDefaultTheme(), ...config.theme };
    this.stream = new StreamHandler();
    this.renderer = new Renderer({ theme: this.theme, stream: this.stream });

    // Initialize prompts
    this.updatePrompts(config.prompts);

    // Subscribe to state changes
    this.state.subscribeAll(({ key, newValue }) => {
      // Check if any prompts depend on this key
      const dependentPrompts = this.prompts.filter(p =>
        p.dependencies?.includes(String(key)) || !p.dependencies
      );

      if (dependentPrompts.length > 0) {
        this.rerender();
      }

      // Notify onChange handlers
      const prompt = this.prompts.find(p => p.id === String(key));
      if (prompt?.onChange) {
        prompt.onChange(newValue);
      }
    });
  }

  /**
   * Update the prompt definitions
   */
  updatePrompts(promptsFn: (state: ReactiveState<T>) => ReactivePromptDefinition[]): void {
    this.prompts = promptsFn(this.state);
  }

  /**
   * Get the current active prompt
   */
  getCurrentPrompt(): ReactivePromptDefinition | null {
    // Find the first visible prompt from current index
    for (let i = this.currentPromptIndex; i < this.prompts.length; i++) {
      const prompt = this.prompts[i];
      if (prompt && (!prompt.when || prompt.when())) {
        return prompt;
      }
    }
    return null;
  }

  /**
   * Render the current state
   */
  async render(): Promise<string> {
    if (this.isRendering) return '';
    this.isRendering = true;

    try {
      const lines: string[] = [];

      // Render completed prompts
      for (let i = 0; i < this.currentPromptIndex; i++) {
        const prompt = this.prompts[i];
        if (prompt && (!prompt.when || prompt.when())) {
          const value = this.state.get(prompt.id as keyof T);
          if (value !== undefined) {
            lines.push(this.formatCompletedPrompt(prompt, value));
          }
        }
      }

      // Render current prompt
      const currentPrompt = this.getCurrentPrompt();
      if (currentPrompt) {
        const promptInstance = await this.getOrCreatePrompt(currentPrompt);
        if (promptInstance) {
          const promptOutput = await promptInstance.render();
          lines.push(promptOutput);
        }
      }

      return lines.join('\n');
    } finally {
      this.isRendering = false;
    }
  }

  /**
   * Handle keyboard input
   */
  async handleInput(key: Key): Promise<void> {
    const currentPrompt = this.getCurrentPrompt();
    if (!currentPrompt) return;

    const promptInstance = await this.getOrCreatePrompt(currentPrompt);
    if (!promptInstance) return;

    // Special handling for navigation between prompts
    if (key.name === 'up' && key.shift && this.currentPromptIndex > 0) {
      // Go to previous prompt
      this.currentPromptIndex--;
      await this.rerender();
      return;
    }

    if (key.name === 'down' && key.shift && this.currentPromptIndex < this.prompts.length - 1) {
      // Go to next prompt if current has value
      const value = this.state.get(currentPrompt.id as keyof T);
      if (value !== undefined) {
        this.currentPromptIndex++;
        await this.rerender();
        return;
      }
    }

    // Handle Enter to submit current prompt
    if (key.name === 'enter' || key.name === 'return') {
      const value = await this.getPromptValue(promptInstance);
      if (value !== undefined) {
        // Validate the value
        if (currentPrompt.validate) {
          const validation = await currentPrompt.validate(value);
          if (typeof validation === 'string') {
            // Show validation error
            this.emit('validation-error', { prompt: currentPrompt, error: validation });
            return;
          }
          if (validation === false) {
            this.emit('validation-error', { prompt: currentPrompt, error: 'Invalid value' });
            return;
          }
        }

        // Update state
        this.state.set(currentPrompt.id as keyof T, value);

        // Move to next prompt
        this.currentPromptIndex++;

        // Check if we're done
        const nextPrompt = this.getCurrentPrompt();
        if (!nextPrompt) {
          this.emit('complete', this.state.getState());
        } else {
          await this.rerender();
        }
        return;
      }
    }

    // Let the prompt handle the input
    await promptInstance.handleInput(key);

    // Rerender to show updates
    await this.rerender();
  }

  /**
   * Run the reactive prompt flow
   */
  async prompt(): Promise<T> {
    this.stream.start();
    this.stream.hideCursor();

    try {
      // Initial render
      await this.rerender();

      // Wait for completion
      return new Promise((resolve, reject) => {
        this.once('complete', (state) => {
          resolve(state);
        });

        this.once('cancel', () => {
          reject(new Error('Prompt cancelled'));
        });

        // Handle input
        this.stream.on('key', async (key: Key) => {
          if (key.ctrl && key.name === 'c') {
            this.emit('cancel');
            return;
          }

          await this.handleInput(key);
        });
      });
    } finally {
      this.stream.showCursor();
      this.stream.stop();
      this.dispose();
    }
  }

  /**
   * Update a specific value in the state
   */
  update<K extends keyof T>(key: K, value: T[K]): void {
    this.state.set(key, value);
  }

  /**
   * Get the current state
   */
  getState(): Readonly<T> {
    return this.state.getState();
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.state.dispose();
    this.activePrompts.forEach(prompt => {
      if ('dispose' in prompt && typeof prompt.dispose === 'function') {
        prompt.dispose();
      }
    });
    this.activePrompts.clear();
    this.removeAllListeners();
  }

  private async rerender(): Promise<void> {
    const output = await this.render();
    this.renderer.clear();
    this.renderer.render(output);
  }

  private async getOrCreatePrompt(definition: ReactivePromptDefinition): Promise<Prompt<any, any> | null> {
    const existing = this.activePrompts.get(definition.id);
    if (existing) return existing;

    // Create new prompt based on type
    let prompt: Prompt<any, any> | null = null;

    // Import the appropriate component dynamically
    // eslint-disable-next-line default-case
    switch (definition.type) {
      case 'text': {
        const { TextPrompt } = await import('../../components/primitives/text.js');
        const message = typeof definition.message === 'function'
          ? definition.message()
          : definition.message;
        prompt = new TextPrompt({
          message,
          defaultValue: definition.value || this.state.get(definition.id as keyof T),
          theme: this.theme,
        });
        break;
      }
      case 'select': {
        const { SelectPrompt } = await import('../../components/primitives/select.js');
        const message = typeof definition.message === 'function'
          ? definition.message()
          : definition.message;
        const options = typeof definition.options === 'function'
          ? definition.options()
          : definition.options || [];
        prompt = new SelectPrompt({
          message,
          options,
          theme: this.theme,
        });
        break;
      }
      case 'confirm': {
        const { ConfirmPrompt } = await import('../../components/primitives/confirm.js');
        const message = typeof definition.message === 'function'
          ? definition.message()
          : definition.message;
        prompt = new ConfirmPrompt({
          message,
          defaultValue: definition.value ?? true,
          theme: this.theme,
        });
        break;
      }
      case 'number': {
        const { NumberPrompt } = await import('../../components/primitives/number.js');
        const message = typeof definition.message === 'function'
          ? definition.message()
          : definition.message;
        prompt = new NumberPrompt({
          message,
          default: definition.value,
          theme: this.theme,
        });
        break;
      }
      case 'multiselect': {
        const { MultiSelectPrompt } = await import('../../components/primitives/multiselect.js');
        const message = typeof definition.message === 'function'
          ? definition.message()
          : definition.message;
        const options = typeof definition.options === 'function'
          ? definition.options()
          : definition.options || [];
        prompt = new MultiSelectPrompt({
          message,
          options,
          theme: this.theme,
        });
        break;
      }
    }

    if (prompt) {
      this.activePrompts.set(definition.id, prompt);
    }

    return prompt;
  }

  private async getPromptValue(prompt: Prompt<any, any>): Promise<any> {
    // Since we can't directly access the protected state property,
    // we'll wait for the prompt to complete and get the value from the result
    // This is a limitation of the current design
    return undefined;
  }

  private formatCompletedPrompt(prompt: ReactivePromptDefinition, value: any): string {
    const message = typeof prompt.message === 'function'
      ? prompt.message()
      : prompt.message;

    const symbol = this.theme.symbols.success;
    const formattedValue = this.formatValue(prompt.type, value);

    return `${symbol} ${message} · ${formattedValue}`;
  }

  private formatValue(type: string, value: any): string {
    switch (type) {
      case 'confirm':
        return value ? 'Yes' : 'No';
      case 'multiselect':
        return Array.isArray(value) ? value.join(', ') : String(value);
      default:
        return String(value);
    }
  }
}

/**
 * Create a reactive prompt flow
 */
export function reactive<T extends Record<string, any>>(
  config: ReactivePromptConfig<T>
): ReactivePrompt<T> {
  return new ReactivePrompt(config);
}
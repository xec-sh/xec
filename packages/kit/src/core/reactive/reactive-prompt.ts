import { Prompt } from '../prompt.js';
import { Renderer } from '../renderer.js';
import { EventEmitter } from '../event-emitter.js';
import { ReactiveState } from './reactive-state.js';
import { StreamHandler } from '../stream-handler.js';
import { createDefaultTheme } from '../../themes/default.js';
// Import all prompt types
import { TextPrompt } from '../../components/primitives/text.js';
import { SelectPrompt } from '../../components/primitives/select.js';
import { NumberPrompt } from '../../components/primitives/number.js';
import { ConfirmPrompt } from '../../components/primitives/confirm.js';
import { PasswordPrompt } from '../../components/primitives/password.js';
import { MultiSelectPrompt } from '../../components/primitives/multiselect.js';

import type { Key, Theme } from '../types.js';

// Wrapper to manage child prompts without full lifecycle
interface PromptWrapper<T = any> {
  definition: ReactivePromptDefinition;
  instance: Prompt<T, any>;
  render(): Promise<string>;
  handleInput(key: Key): Promise<void>;
  getValue(): T | undefined;
  validate(): Promise<boolean | string>;
}

export interface ReactivePromptConfig<T extends Record<string, any>> {
  initialValues: T;
  prompts: (state: ReactiveState<T>) => ReactivePromptDefinition[];
  theme?: Theme;
}

export interface ReactivePromptDefinition {
  id: string;
  type: 'text' | 'select' | 'confirm' | 'number' | 'multiselect' | 'password';
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
  private prompts: PromptWrapper[] = [];
  private currentIndex = 0;
  private renderer: Renderer;
  private stream: StreamHandler;
  private theme: Theme;
  private isRunning = false;
  private disposed = false;

  constructor(config: ReactivePromptConfig<T>) {
    super();

    this.state = new ReactiveState(config.initialValues);
    this.theme = { ...createDefaultTheme(), ...config.theme };
    
    // Single shared stream for all operations
    this.stream = new StreamHandler({ shared: true });
    this.renderer = new Renderer({ theme: this.theme, stream: this.stream });

    // Initialize prompts with wrapper
    this.initializePrompts(config.prompts);
  }

  /**
   * Initialize prompts with wrapper for shared stream management
   */
  private initializePrompts(promptsFn: (state: ReactiveState<T>) => ReactivePromptDefinition[]): void {
    const definitions = promptsFn(this.state);
    
    this.prompts = definitions.map(def => this.createPromptWrapper(def));
  }
  
  /**
   * Create a wrapper for managing child prompts without full lifecycle
   */
  private createPromptWrapper(definition: ReactivePromptDefinition): PromptWrapper {
    const instance = this.createPromptInstance(definition);
    
    return {
      definition,
      instance,
      render: () => instance.renderOnly(),
      handleInput: (key: Key) => instance.handleInputOnly(key),
      getValue: () => instance.getValue(),
      validate: async () => {
        if (!definition.validate) return true;
        const value = instance.getValue();
        return definition.validate(value);
      }
    };
  }

  /**
   * Get the current active prompt wrapper
   */
  private getCurrentPrompt(): PromptWrapper | null {
    // Find first visible prompt from current index
    for (let i = this.currentIndex; i < this.prompts.length; i++) {
      const prompt = this.prompts[i];
      if (!prompt) continue;
      
      const def = prompt.definition;
      
      if (!def.when || def.when()) {
        return prompt;
      }
    }
    
    return null;
  }

  /**
   * Render the current state
   */
  private async renderCurrent(): Promise<void> {
    const lines: string[] = [];
    
    // Render completed prompts
    for (let i = 0; i < this.currentIndex; i++) {
      const prompt = this.prompts[i];
      if (!prompt) continue;
      
      const value = this.state.get(prompt.definition.id as keyof T);
      
      if (value !== undefined) {
        lines.push(this.formatCompleted(prompt.definition, value));
      }
    }
    
    // Render current prompt
    const current = this.getCurrentPrompt();
    if (current) {
      const output = await current.render();
      lines.push(output);
    }
    
    // Clear and render all
    this.renderer.clear();
    this.renderer.render(lines.join('\n'));
  }

  /**
   * Handle keyboard input
   */
  private async handleKey(key: Key): Promise<void> {
    try {
      // Handle cancel
      if (key.ctrl && key.name === 'c') {
        this.emit('cancel');
        return;
      }
      
      // Handle submit
      if (key.name === 'enter' || key.name === 'return') {
        const current = this.getCurrentPrompt();
        if (!current) return;
        
        const value = current.getValue();
        if (value === undefined) {
          // Let the prompt handle the input if no value yet
          await current.handleInput(key);
          await this.renderCurrent();
          return;
        }
        
        // Validate
        const validation = await current.validate();
        if (validation !== true) {
          // Show error inline
          await this.renderError(validation as string);
          return;
        }
        
        // Update state
        this.state.set(
          current.definition.id as keyof T, 
          value
        );
        
        // Call onChange if defined
        if (current.definition.onChange) {
          current.definition.onChange(value);
        }
        
        // Move to next
        this.currentIndex++;
        
        // Check if done
        if (this.currentIndex >= this.prompts.length || !this.getCurrentPrompt()) {
          this.emit('complete', this.state.getState());
        } else {
          await this.renderCurrent();
        }
        
        return;
      }
      
      // Let current prompt handle input
      const current = this.getCurrentPrompt();
      if (current) {
        await current.handleInput(key);
        await this.renderCurrent();
      }
    } catch (error) {
      this.emit('error', error);
    }
  }
  
  /**
   * Render validation error
   */
  private async renderError(message: string): Promise<void> {
    const lines: string[] = [];
    
    // Render completed prompts
    for (let i = 0; i < this.currentIndex; i++) {
      const prompt = this.prompts[i];
      if (!prompt) continue;
      
      const value = this.state.get(prompt.definition.id as keyof T);
      
      if (value !== undefined) {
        lines.push(this.formatCompleted(prompt.definition, value));
      }
    }
    
    // Render current prompt with error
    const current = this.getCurrentPrompt();
    if (current) {
      const output = await current.render();
      lines.push(output);
      lines.push(this.theme.formatters.error(`  ✖ ${message}`));
    }
    
    // Clear and render all
    this.renderer.clear();
    this.renderer.render(lines.join('\n'));
  }

  /**
   * Run the reactive prompt flow
   */
  async prompt(): Promise<T> {
    if (this.isRunning) {
      throw new Error('ReactivePrompt is already running');
    }
    
    this.isRunning = true;
    this.stream.acquire(); // Use shared stream
    this.stream.hideCursor();
    
    try {
      // Initial render
      await this.renderCurrent();
      
      return new Promise((resolve, reject) => {
        const handleKeyEvent = async (key: Key) => {
          await this.handleKey(key);
        };
        
        const handleComplete = (state: T) => {
          cleanup();
          resolve(state);
        };
        
        const handleCancel = () => {
          cleanup();
          reject(new Error('Cancelled'));
        };
        
        const handleError = (error: Error) => {
          cleanup();
          reject(error);
        };
        
        const cleanup = () => {
          this.stream.off('key', handleKeyEvent);
          this.off('complete', handleComplete);
          this.off('cancel', handleCancel);
          this.off('error', handleError);
        };
        
        // Set up event handlers
        this.stream.on('key', handleKeyEvent);
        this.once('complete', handleComplete);
        this.once('cancel', handleCancel);
        this.once('error', handleError);
      });
    } finally {
      this.isRunning = false;
      this.stream.showCursor();
      this.stream.release(); // Release shared stream
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
    this.prompts.forEach(wrapper => {
      // Cleanup prompt instances if they have dispose
      const instance = wrapper.instance as any;
      if (instance.dispose && typeof instance.dispose === 'function') {
        instance.dispose();
      }
    });
    this.prompts = [];
    this.removeAllListeners();
  }


  /**
   * Create prompt instance with shared stream
   */
  private createPromptInstance(definition: ReactivePromptDefinition): Prompt<any, any> {
    const baseConfig = {
      stream: this.stream, // Share our stream
      theme: this.theme,
      message: typeof definition.message === 'function' 
        ? definition.message() 
        : definition.message
    };
    
    switch (definition.type) {
      case 'text':
        return new TextPrompt({
          ...baseConfig,
          initialValue: definition.value || this.state.get(definition.id as keyof T)
        });
      
      case 'select': {
        const options = typeof definition.options === 'function'
          ? definition.options()
          : definition.options || [];
        return new SelectPrompt({
          ...baseConfig,
          options
        });
      }
      
      case 'confirm':
        return new ConfirmPrompt({
          ...baseConfig,
          defaultValue: definition.value ?? true
        });
      
      case 'number':
        return new NumberPrompt({
          ...baseConfig,
          default: definition.value
        });
      
      case 'multiselect': {
        const options = typeof definition.options === 'function'
          ? definition.options()
          : definition.options || [];
        return new MultiSelectPrompt({
          ...baseConfig,
          options
        });
      }
      
      case 'password':
        return new PasswordPrompt({
          ...baseConfig,
          defaultValue: definition.value || this.state.get(definition.id as keyof T)
        });
      
      default:
        throw new Error(`Unknown prompt type: ${definition.type}`);
    }
  }


  private formatCompleted(prompt: ReactivePromptDefinition, value: any): string {
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
      case 'password':
        return '•'.repeat(String(value).length);
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
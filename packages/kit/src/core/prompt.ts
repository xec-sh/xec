// Base prompt class for all interactive components


import { Renderer } from './renderer.js';
import { PromptLifecycle } from './types.js';
import { EventEmitter } from './event-emitter.js';
import { StateManager } from './state-manager.js';
import { StreamHandler } from './stream-handler.js';
import { createDefaultTheme } from '../themes/default.js';

import type { 
  Key, 
  Theme, 
  PromptState, 
  PromptConfig,
  RenderContext
} from './types.js';

export abstract class Prompt<TValue = any, TConfig = {}> extends EventEmitter {
  protected state: StateManager<any>;
  protected renderer: Renderer;
  protected stream: StreamHandler;
  protected config: PromptConfig<TValue, TConfig> & TConfig;
  protected theme: Theme;
  protected lifecycle: PromptLifecycle = PromptLifecycle.Created;
  private unsubscribers: Array<() => void> = [];
  private isActive = false;
  private ownStream: boolean;
  private isInitialized = false;
  private resolvePromise?: (value: TValue | symbol) => void;

  constructor(config: PromptConfig<TValue, TConfig> & TConfig) {
    super();
    this.config = config;
    this.theme = { ...createDefaultTheme(), ...config.theme };
    
    // Use provided stream or create new one
    if (config.stream) {
      this.stream = config.stream;
      this.ownStream = false;
    } else {
      this.stream = new StreamHandler({ 
        shared: config.sharedStream ?? false
      });
      this.ownStream = true;
    }
    
    // Renderer always uses our stream
    this.renderer = new Renderer({ theme: this.theme, stream: this.stream });
    
    this.state = new StateManager({
      value: config.initialValue as TValue,
      status: 'idle' as PromptState,
      error: undefined,
      cursor: 0
    });
  }

  abstract render(): string;
  abstract handleInput(key: Key): void | Promise<void>;
  
  // Separate initialization from construction
  protected async initialize(): Promise<void> {
    if (this.lifecycle !== PromptLifecycle.Created) return;
    
    this.lifecycle = PromptLifecycle.Initialized;
    this.isInitialized = true;
    
    // Subscribe to state changes for re-rendering
    this.unsubscribers.push(
      this.state.subscribe(() => {
        if (this.isActive) {
          this.renderer.render(this.render());
        }
      })
    );
  }
  
  // Public API for rendering without full prompt lifecycle
  async renderOnly(): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return this.render();
  }
  
  // Handle input without full prompt lifecycle
  async handleInputOnly(key: Key): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    await this.handleInput(key);
  }
  
  // Get current value without completing prompt
  getValue(): TValue | undefined {
    const state = this.state.getState();
    return state.value;
  }

  async prompt(): Promise<TValue | symbol> {
    if (!this.stream.isInteractive()) {
      return this.handleNonInteractive();
    }
    
    // Initialize if not already done
    if (!this.isInitialized) {
      await this.initialize();
    }

    this.isActive = true;
    this.lifecycle = PromptLifecycle.Active;
    this.state.setState((s: any) => ({ ...s, status: 'active' }));
    this.emit('start');

    try {
      // Initial render
      this.stream.hideCursor();
      this.renderer.render(this.render());

      // Start stream handling
      if (this.ownStream) {
        this.stream.start();
      } else if (this.stream.isSharedMode()) {
        this.stream.acquire();
      }

      // Handle key events
      const onKey = async (key: Key) => {
        try {
          await this.handleCommonKeys(key);
          if (this.state.getState().status === 'active') {
            await this.handleInput(key);
          }
        } catch (error) {
          this.handleError(error as Error);
        }
      };

      this.stream.on('key', onKey);
      this.unsubscribers.push(() => this.stream.off('key', onKey));

      // Handle resize
      const onResize = (size: { width: number; height: number }) => {
        this.emit('resize', size);
        this.renderer.render(this.render());
      };

      this.stream.on('resize', onResize);
      this.unsubscribers.push(() => this.stream.off('resize', onResize));

      // Wait for completion
      return await this.waitForCompletion();
    } finally {
      this.cleanup();
    }
  }

  protected async handleCommonKeys(key: Key): Promise<void> {
    // Ctrl+C - Cancel
    if (key.ctrl && key.name === 'c') {
      this.cancel();
      return;
    }

    // Escape - Cancel
    if (key.name === 'escape') {
      this.cancel();
      return;
    }

    // Ctrl+Z - Undo
    if (key.ctrl && key.name === 'z') {
      if (this.state.canUndo()) {
        this.state.undo();
      }
      return;
    }

    // Ctrl+Y - Redo
    if (key.ctrl && key.name === 'y') {
      if (this.state.canRedo()) {
        this.state.redo();
      }
      return;
    }
  }

  protected async submit(value?: TValue): Promise<void> {
    const finalValue = value ?? this.state.getState().value;
    
    // Validate
    if (this.config.validate) {
      const error = await this.config.validate(finalValue);
      if (error) {
        this.state.setState((s: any) => ({ ...s, error }));
        return;
      }
    }

    this.state.setState((s: any) => ({ 
      ...s, 
      value: finalValue, 
      status: 'submit',
      error: undefined 
    }));
    
    this.emit('submit', finalValue);
  }

  protected cancel(): void {
    this.state.setState((s: any) => ({ ...s, status: 'cancel' }));
    this.emit('cancel');
  }

  protected handleError(error: Error): void {
    this.state.setState((s: any) => ({ 
      ...s, 
      status: 'error',
      error: error.message 
    }));
    this.emit('error', error);
  }

  protected getRenderContext(): RenderContext {
    const { width, height } = this.stream.getSize();
    const state = this.state.getState();
    
    return {
      width,
      height,
      theme: this.theme,
      state: state.status || 'idle',
      error: state.error
    };
  }
  
  protected resolve(value: TValue): void {
    if (this.resolvePromise) {
      this.state.setState((s: any) => ({ ...s, status: 'submit', value }));
      this.emit('submit', value);
    }
  }

  protected formatValue(value: TValue): string {
    if ((this.config as any).format) {
      return (this.config as any).format(value);
    }
    return String(value ?? '');
  }

  private async waitForCompletion(): Promise<TValue | symbol> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      
      const checkStatus = () => {
        const { status, value } = this.state.getState();
        
        switch (status) {
          case 'submit':
            this.state.setState((s: any) => ({ ...s, status: 'done' }));
            resolve(value);
            break;
          
          case 'cancel':
            resolve(Symbol.for('kit.cancel'));
            break;
          
          case 'error':
            // Stay in active state for error recovery
            this.state.setState((s: any) => ({ ...s, status: 'active' }));
            break;
        }
      };

      this.unsubscribers.push(
        this.state.subscribe(checkStatus)
      );
      
      // Initial check
      checkStatus();
    });
  }

  protected handleNonInteractive(): TValue | symbol {
    // In non-TTY mode, return initial value or cancel
    const { value } = this.state.getState();
    if (value !== undefined) {
      return value;
    }
    return Symbol.for('kit.cancel');
  }

  protected cleanup(): void {
    this.isActive = false;
    this.lifecycle = PromptLifecycle.Completed;
    
    // Stop stream handling
    if (this.ownStream) {
      this.stream.stop();
      this.stream.showCursor();
    } else if (this.stream.isSharedMode()) {
      this.stream.release();
      // Only show cursor if last reference
      if (this.stream.getRefCount() === 0) {
        this.stream.showCursor();
      }
    }
    
    // Clear and render final state
    this.renderer.clear();
    const finalRender = this.renderFinal();
    if (finalRender) {
      this.stream.write(finalRender + '\n');
    }
    
    // Unsubscribe all
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
    
    // Remove all event listeners
    this.removeAllListeners();
    
    this.lifecycle = PromptLifecycle.Disposed;
  }

  protected renderFinal(): string {
    const { status, value, error } = this.state.getState();
    
    if (status === 'cancel') {
      return this.theme.formatters.muted('Cancelled');
    }
    
    if (error) {
      return this.theme.formatters.error(`✗ ${error}`);
    }
    
    if (status === 'submit' || status === 'done') {
      const formatted = this.formatValue(value);
      return `${this.theme.symbols.success} ${this.config.message} ${this.theme.formatters.muted('·')} ${formatted}`;
    }
    
    return '';
  }
}
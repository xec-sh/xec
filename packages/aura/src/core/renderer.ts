/**
 * Renderer - Renders Aura components to terminal using TRM
 */

import { TerminalImpl, BufferManagerImpl, type TerminalOptions } from '@xec-sh/trm';

import { schedule } from './scheduler.js';
import { reconcile } from './reconciler.js';

import type { Aura, AuraElement } from '../types.js';

export interface RenderOptions extends TerminalOptions {
  // root?: HTMLElement; // For future web support
  debug?: boolean;
}

/**
 * Renderer context manages the terminal and rendering pipeline
 */
export class Renderer {
  private terminal: TerminalImpl;
  private bufferManager: BufferManagerImpl;
  private rootAura: Aura | null = null;
  private mounted = false;
  private renderScheduled = false;
  private debug: boolean;

  constructor(options: RenderOptions = {}) {
    this.debug = options.debug ?? false;
    
    // Initialize terminal
    this.terminal = new TerminalImpl({
      mode: 'fullscreen',
      alternateBuffer: true,
      rawMode: true,
      keyboard: true,
      mouse: true,
      ...options
    });

    // Initialize buffer manager
    this.bufferManager = new BufferManagerImpl(this.terminal.stream);
  }

  /**
   * Initialize the renderer
   */
  async init(): Promise<void> {
    await this.terminal.init();
    
    // Set up event handlers
    this.setupEventHandlers();
    
    // Clear screen
    this.terminal.screen.clear();
    
    this.mounted = true;
    
    if (this.debug) {
      console.error('[Renderer] Initialized');
    }
  }

  /**
   * Render an Aura tree to the terminal
   */
  render(aura: Aura): void {
    if (!this.mounted) {
      throw new Error('Renderer not initialized. Call init() first.');
    }

    const previousRoot = this.rootAura;
    this.rootAura = aura;

    // Schedule render
    this.scheduleRender(() => {
      if (previousRoot) {
        // Reconcile with previous tree
        reconcile(previousRoot, aura, this.bufferManager);
      } else {
        // Initial render
        this.renderTree(aura);
      }

      // Flip buffers and render to terminal
      this.bufferManager.flip();
      this.bufferManager.render(this.bufferManager.frontBuffer);
    });
  }

  /**
   * Schedule a render operation
   */
  private scheduleRender(callback: () => void): void {
    if (this.renderScheduled) return;
    
    this.renderScheduled = true;
    schedule(() => {
      callback();
      this.renderScheduled = false;
    });
  }

  /**
   * Render an Aura tree recursively
   */
  private renderTree(aura: Aura, _parentElement?: AuraElement): void {
    // Create element for this Aura
    const element = this.createElement(aura);
    aura.element = element;

    // Render based on type
    switch (aura.type) {
      case 'text':
        this.renderText(aura as Aura<'text'>);
        break;
      case 'box':
      case 'flex':
      case 'grid':
        this.renderContainer(aura);
        break;
      case 'input':
        this.renderInput(aura as Aura<'input'>);
        break;
      case 'button':
        this.renderButton(aura as Aura<'button'>);
        break;
      // Add more component types as needed
      default:
        if (this.debug) {
          console.error(`[Renderer] Unknown component type: ${aura.type}`);
        }
    }

    // Render children
    if (aura.children) {
      for (const child of aura.children) {
        this.renderTree(child, element);
      }
    }
  }

  /**
   * Create an AuraElement for the given Aura
   */
  private createElement(aura: Aura): AuraElement {
    const element: AuraElement = {
      focus: () => {
        // TODO: Implement focus management
        if (this.debug) {
          console.error(`[Renderer] Focus: ${aura.id}`);
        }
      },
      blur: () => {
        // TODO: Implement blur
        if (this.debug) {
          console.error(`[Renderer] Blur: ${aura.id}`);
        }
      },
      scrollIntoView: () => {
        // TODO: Implement scroll
      },
      getBoundingRect: () => 
        // TODO: Calculate actual bounds
         ({ x: 0, y: 0, width: 0, height: 0 })
      ,
      setAttribute: (_name: string, _value: any) => {
        // TODO: Store attributes
      },
      getAttribute: (_name: string) => 
        // TODO: Retrieve attributes
         undefined
      
    };

    return element;
  }

  /**
   * Render a text component
   */
  private renderText(aura: Aura<'text'>): void {
    const props = aura.props;
    const value = typeof props.value === 'function' ? props.value() : props.value;
    
    // Calculate position
    const x = this.resolvePosition(props.x, 'x');
    const y = this.resolvePosition(props.y, 'y');
    
    // Get style
    const style = typeof props.style === 'function' ? props.style() : props.style;
    
    // Write to buffer
    this.bufferManager.backBuffer.writeText(x, y, value, style);
  }

  /**
   * Render a container component
   */
  private renderContainer(_aura: Aura): void {
    // Containers primarily affect layout of children
    // Actual rendering happens via children
    // TODO: Implement layout calculations
  }

  /**
   * Render an input component
   */
  private renderInput(aura: Aura<'input'>): void {
    const props = aura.props;
    const value = props.value();
    
    // Calculate position
    const x = this.resolvePosition(props.x, 'x');
    const y = this.resolvePosition(props.y, 'y');
    
    // Get style
    const style = typeof props.style === 'function' ? props.style() : props.style;
    
    // Render input field
    // TODO: Add cursor, selection, etc.
    const displayValue = props.type === 'password' ? '*'.repeat(value.length) : value;
    const placeholder = !value && props.placeholder ? props.placeholder : '';
    
    this.bufferManager.backBuffer.writeText(
      x, 
      y, 
      displayValue || placeholder,
      style
    );
  }

  /**
   * Render a button component
   */
  private renderButton(aura: Aura<'button'>): void {
    const props = aura.props;
    const label = typeof props.label === 'function' ? props.label() : props.label;
    
    // Calculate position
    const x = this.resolvePosition(props.x, 'x');
    const y = this.resolvePosition(props.y, 'y');
    
    // Get style
    const style = typeof props.style === 'function' ? props.style() : props.style;
    
    // Render button
    // TODO: Add borders, padding, etc.
    this.bufferManager.backBuffer.writeText(x, y, `[ ${label} ]`, style);
  }

  /**
   * Resolve position value
   */
  private resolvePosition(
    value: any,
    axis: 'x' | 'y'
  ): any {
    if (typeof value === 'function') {
      value = value();
    }

    if (typeof value === 'number') {
      return value;
    }

    if (value === 'center') {
      const max = axis === 'x' ? this.terminal.stream.cols : this.terminal.stream.rows;
      return Math.floor(max / 2);
    }

    if (typeof value === 'string' && value.endsWith('%')) {
      const percent = parseInt(value.slice(0, -1), 10) / 100;
      const max = axis === 'x' ? this.terminal.stream.cols : this.terminal.stream.rows;
      return Math.floor(max * percent);
    }

    return 0; // Default position
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    // Keyboard events
    this.terminal.events.on('key', (event) => {
      if (this.rootAura) {
        this.handleKeyEvent(this.rootAura, event);
      }
    });

    // Mouse events
    this.terminal.events.on('mouse', (event) => {
      if (this.rootAura) {
        this.handleMouseEvent(this.rootAura, event);
      }
    });

    // Resize events
    this.terminal.events.on('resize', (_rows, _cols) => {
      if (this.rootAura) {
        // Re-render on resize
        this.render(this.rootAura);
      }
    });
  }

  /**
   * Handle keyboard events
   */
  private handleKeyEvent(aura: Aura, event: any): boolean {
    // Check if this component handles the event
    if (aura.props.onKey) {
      const handled = aura.props.onKey(event);
      if (handled) return true;
    }

    // Propagate to children
    if (aura.children) {
      for (const child of aura.children) {
        if (this.handleKeyEvent(child, event)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Handle mouse events
   */
  private handleMouseEvent(aura: Aura, event: any): boolean {
    // Check if this component handles the event
    if (aura.props.onMouse) {
      aura.props.onMouse(event);
      return true;
    }

    // Propagate to children
    if (aura.children) {
      for (const child of aura.children) {
        if (this.handleMouseEvent(child, event)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Clean up and close the renderer
   */
  async cleanup(): Promise<void> {
    this.mounted = false;
    this.rootAura = null;
    
    // Reset terminal
    this.terminal.cursor.show();
    this.terminal.screen.clear();
    await this.terminal.close();
    
    if (this.debug) {
      console.error('[Renderer] Cleaned up');
    }
  }
}

// ============================================================================
// Public API
// ============================================================================

let defaultRenderer: Renderer | null = null;

/**
 * Render an Aura tree to the terminal
 */
export async function render(
  aura: Aura,
  options?: RenderOptions
): Promise<Renderer> {
  if (!defaultRenderer) {
    defaultRenderer = new Renderer(options);
    await defaultRenderer.init();
  }
  
  defaultRenderer.render(aura);
  return defaultRenderer;
}

/**
 * Mount an Aura tree to the terminal
 */
export async function mount(
  aura: Aura,
  options?: RenderOptions
): Promise<Renderer> {
  const renderer = new Renderer(options);
  await renderer.init();
  renderer.render(aura);
  return renderer;
}

/**
 * Unmount and cleanup
 */
export async function unmount(renderer?: Renderer): Promise<void> {
  const r = renderer || defaultRenderer;
  if (r) {
    await r.cleanup();
    if (r === defaultRenderer) {
      defaultRenderer = null;
    }
  }
}
/**
 * Unified rendering engine for Terex
 * Centralizes all rendering logic and manages the main render loop
 * Enhanced with improved terminal management and cursor positioning
 */

import { BaseComponent } from './component.js';
import { InputManager } from './input-manager.js';
import { LayerManager } from './layer-manager.js';
import { TerminalManager } from './terminal-manager.js';
import { RenderScheduler } from './renderer-scheduler.js';

import type {
  Key,
  Component,
  MouseEvent,
  TerminalStream
} from './types.js';

// ============================================================================
// Types
// ============================================================================

export type RenderMode = 'inline' | 'fullscreen';

export interface RenderEngineOptions {
  readonly targetFps?: number;
  readonly enableFrameScheduling?: boolean;
  readonly autoResize?: boolean;
  /** 
   * Render mode:
   * - 'inline': Renders at current cursor position (default, like log-update)
   * - 'fullscreen': Takes over entire terminal, enables zIndex/draggable/resizable
   */
  readonly mode?: RenderMode;
  /** Whether to preserve terminal state on exit */
  readonly preserveState?: boolean;
  /** Whether to enable enhanced input handling */
  readonly enhancedInput?: boolean;
}

export interface RenderStats {
  readonly framesRendered: number;
  readonly averageFrameTime: number;
  readonly lastFrameTime: number;
  readonly skipCount: number;
  readonly renderQueueSize: number;
}

// ============================================================================
// Unified Render Engine
// ============================================================================

/**
 * Central rendering engine that manages the main render loop
 * Integrates DifferentialRenderer, RenderScheduler, and component lifecycle
 */
export class RenderEngine {
  private readonly stream: TerminalStream;
  private readonly options: Required<RenderEngineOptions>;

  // Enhanced terminal management
  private readonly terminalManager: TerminalManager;
  private readonly inputManager: InputManager;

  // Rendering components (kept only for scheduler and fallback)
  private readonly scheduler: RenderScheduler;

  // Layer management (fractal architecture)
  private readonly layerManager: LayerManager;

  // State management
  private rootComponent: Component<unknown> | null = null;
  private running = false;
  private renderLoopId: NodeJS.Timeout | null = null;
  private lastRenderTime = 0;
  private listenerSetupComponents = new Set<Component<unknown>>();

  // Dirty component tracking
  private readonly dirtyComponents = new Set<Component<unknown>>();
  private renderRequested = false;

  // Drag and resize state
  private draggingComponent: BaseComponent<unknown> | null = null;
  private resizingComponent: BaseComponent<unknown> | null = null;

  // Statistics
  private stats: RenderStats = {
    framesRendered: 0,
    averageFrameTime: 0,
    lastFrameTime: 0,
    skipCount: 0,
    renderQueueSize: 0
  };

  constructor(stream: TerminalStream, options: RenderEngineOptions = {}) {
    this.stream = stream;

    // Determine render mode - support legacy logUpdateStyle option
    const mode: RenderMode = options.mode ?? 'inline'; // default

    this.options = {
      targetFps: options.targetFps ?? 60,
      enableFrameScheduling: options.enableFrameScheduling ?? true,
      autoResize: options.autoResize ?? true,
      mode,
      preserveState: options.preserveState ?? true,
      enhancedInput: options.enhancedInput ?? true
    };

    // Initialize enhanced terminal management
    this.terminalManager = new TerminalManager(stream, {
      preserveState: this.options.preserveState,
      mode,
      hideCursor: true,
      autoCleanup: true,
    });

    this.inputManager = new InputManager(stream, {
      rawMode: this.options.enhancedInput,
      handlePaste: true,
    });

    // Initialize scheduler for frame scheduling
    this.scheduler = new RenderScheduler(this.options.targetFps);

    // Initialize layer manager (fractal architecture)
    this.layerManager = new LayerManager();

    // Setup auto-resize handling
    if (this.options.autoResize && stream.output.on) {
      stream.output.on('resize', () => {
        this.handleResize();
      });
    }
  }

  // ============================================================================
  // Engine Lifecycle
  // ============================================================================

  /**
   * Start the render engine with a root component
   */
  async start(rootComponent: Component<unknown>): Promise<void> {
    if (this.running) {
      throw new Error('RenderEngine is already running');
    }

    if (!rootComponent) {
      throw new Error('Root component is required');
    }

    this.rootComponent = rootComponent;
    this.running = true;

    // Initialize enhanced terminal management
    await this.terminalManager.initialize();

    // Set up enhanced input handling
    if (this.options.enhancedInput) {
      this.inputManager.onKeypress((event) => {
        if (this.rootComponent instanceof BaseComponent) {
          this.rootComponent.handleKeypress(event.key);
        }
      });

      // Add mouse event handling (fractal architecture)
      this.inputManager.onMouseEvent((event) => {
        this.handleMouseEvent(event);
      });

      this.inputManager.start();
    }

    // Mount the root component
    if (rootComponent instanceof BaseComponent) {
      await rootComponent.mount();

      // Set up event listeners for component invalidation
      this.setupComponentListeners(rootComponent);
    }

    // Perform initial render using terminal manager
    await this.requestRender();

    // Start render loop if frame scheduling is enabled
    if (this.options.enableFrameScheduling) {
      this.startRenderLoop();
    }
  }

  /**
   * Stop the render engine
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    // Stop render loop
    if (this.renderLoopId) {
      clearTimeout(this.renderLoopId);
      this.renderLoopId = null;
    }

    // Cancel pending renders
    this.scheduler.cancel();

    // Cleanup listener tracking
    this.listenerSetupComponents.clear();

    // Cleanup components
    if (this.rootComponent instanceof BaseComponent) {
      await this.rootComponent.unmount();
    }

    // Use enhanced terminal manager for proper cleanup
    await this.terminalManager.endRender();
    await this.terminalManager.cleanup();

    // Stop input manager
    this.inputManager.stop();

    this.rootComponent = null;
  }

  /**
   * Request a render on the next frame
   */
  async requestRender(): Promise<void> {
    if (!this.running || !this.rootComponent) {
      return;
    }

    if (this.options.enableFrameScheduling) {
      // Schedule render through scheduler
      this.scheduler.schedule(() => {
        this.performRender();
      });
    } else {
      // Render immediately
      await this.performRender();
    }
  }

  /**
   * Force an immediate render, bypassing scheduling
   */
  async forceRender(): Promise<void> {
    if (!this.running || !this.rootComponent) {
      return;
    }

    await this.performRender();
  }

  // ============================================================================
  // Component Management
  // ============================================================================

  /**
   * Mark a component as dirty and needing re-render
   */
  markComponentDirty(component: Component<unknown>): void {
    if (!this.running) {
      return;
    }

    this.dirtyComponents.add(component);

    // Request render if not already requested
    if (!this.renderRequested) {
      this.renderRequested = true;
      // Don't await here to avoid blocking - let it schedule asynchronously
      this.requestRender().catch(err => {
        console.error('Render request failed:', err);
      });
    }
  }

  /**
   * Setup event listeners for component tree changes with circular reference protection
   */
  private setupComponentListeners(component: BaseComponent<unknown>): void {
    // Prevent circular reference infinite recursion
    if (this.listenerSetupComponents.has(component)) {
      return;
    }
    this.listenerSetupComponents.add(component);

    // Listen for render events
    component.on('render', () => {
      this.markComponentDirty(component);
    });

    // Listen for state changes
    component.on('stateChange', () => {
      this.markComponentDirty(component);
    });

    // Don't listen for focus/blur events here to avoid circular references
    // Focus management should be handled by the application layer

    // Setup listeners for children
    component.getChildren().forEach(child => {
      if (child instanceof BaseComponent) {
        this.setupComponentListeners(child);
      }
    });

    // Listen for new children
    component.on('childAdded', (child) => {
      if (child instanceof BaseComponent) {
        this.setupComponentListeners(child);
      }
    });
  }

  // ============================================================================
  // Rendering Implementation
  // ============================================================================

  /**
   * Perform the actual rendering with z-index layer support
   */
  private async performRender(): Promise<void> {
    if (!this.rootComponent) {
      return;
    }

    const startTime = performance.now();

    try {
      const width = this.stream.output.columns ?? 80;
      const height = this.stream.output.rows ?? 24;

      // Set component dimensions based on mode
      if (this.rootComponent instanceof BaseComponent) {
        if (this.options.mode === 'fullscreen') {
          // Fullscreen mode: use full terminal size
          this.rootComponent.setDimensions(width, height);
          this.rootComponent.setPosition(0, 0);
        } else {
          // Inline mode: let component use minimal height or auto-size
          // Set width but use minimal height (1 line) to start
          this.rootComponent.setDimensions(width, 1);
          this.rootComponent.setPosition(0, 0);
        }
      }

      let compositeOutput: string[];

      if (this.options.mode === 'fullscreen') {
        // Fullscreen mode: use layerManager for proper z-index support
        // and enable draggable/resizable features

        // Clear layers for fresh render
        this.layerManager.clear();

        // Collect all components with their z-index
        const components = this.collectComponentsWithZIndex(this.rootComponent);

        // Add components to layer manager
        for (const { component, zIndex } of components) {
          if (component instanceof BaseComponent) {
            this.layerManager.push(component, { zIndex });
          }
        }

        // Get sorted components from layer manager
        const layers = this.layerManager.getRenderOrder();
        const sortedComponents = layers.map(layer => layer.component);

        // Create composite output by layering components
        compositeOutput = new Array(height).fill(' '.repeat(width));

        // Render each component in z-order
        for (const component of sortedComponents) {
          if (component instanceof BaseComponent && component.isVisible()) {
            const output = component.render();
            const pos = component.getPosition();

            // Apply draggable offset if component is being dragged
            const effectiveX = pos.x;
            const effectiveY = pos.y;
            if (component === this.draggingComponent && component.canDrag()) {
              // Apply drag offset (would be set by mouse handler)
              // This is handled in handleMouseEvent
            }

            // Overlay this component's output onto the composite
            for (let i = 0; i < output.lines.length; i++) {
              const y = effectiveY + i;
              if (y >= 0 && y < height) {
                const line = output.lines[i];
                const x = effectiveX;

                // Merge line into composite at the correct position
                if (x >= 0 && x < width) {
                  const currentLine = compositeOutput[y];
                  if (currentLine !== undefined && line !== undefined) {
                    const before = currentLine.substring(0, x);
                    const after = currentLine.substring(x + line.length);
                    compositeOutput[y] = before + line + after;
                  }
                }
              }
            }
          }
        }

        // In fullscreen mode, render to full terminal
        await this.terminalManager.renderFullscreen(compositeOutput);

      } else {
        // Inline mode: simple rendering without z-index/draggable/resizable
        // Just render root component and its children in order

        if (this.rootComponent instanceof BaseComponent) {
          const output = this.rootComponent.render();
          compositeOutput = [...output.lines]; // Create mutable copy
        } else {
          compositeOutput = [''];
        }

        // Use log-update style rendering at cursor position
        await this.terminalManager.renderAtPosition(compositeOutput);
      }

      // Clear dirty flags on all tracked components
      for (const component of this.dirtyComponents) {
        if (component instanceof BaseComponent) {
          (component as any).dirty = false;
        }
      }

      // Clear dirty components
      this.dirtyComponents.clear();
      this.renderRequested = false;

      // Update statistics
      const frameTime = performance.now() - startTime;
      this.updateStats(frameTime);

    } catch (error) {
      console.error('Render error:', error);

      // Try to recover by showing error message
      const errorMessage = 'Render Error: ' + (error instanceof Error ? error.message : String(error));
      if (this.options.mode === 'inline') {
        await this.terminalManager.renderAtPosition([errorMessage]);
      } else {
        this.stream.output.write(errorMessage + '\n');
      }
    }
  }

  /**
   * Collect all components with their z-index for layered rendering
   */
  private collectComponentsWithZIndex(component: Component<unknown>, parentZIndex = 0): Array<{ component: BaseComponent<unknown>; zIndex: number }> {
    const result: Array<{ component: BaseComponent<unknown>; zIndex: number }> = [];

    if (component instanceof BaseComponent) {
      const zIndex = component.getZIndex() + parentZIndex;
      result.push({ component, zIndex });

      // Recursively collect children
      const children = component.getChildren();
      for (const child of children) {
        result.push(...this.collectComponentsWithZIndex(child, zIndex));
      }
    }

    return result;
  }


  /**
   * Start the main render loop
   */
  private startRenderLoop(): void {
    const frameTime = 1000 / this.options.targetFps;

    const loop = async () => {
      if (!this.running) {
        return;
      }

      // Only render if components are dirty or render was requested
      if (this.dirtyComponents.size > 0 || this.renderRequested) {
        await this.performRender();
      }

      // Schedule next frame
      this.renderLoopId = setTimeout(loop, frameTime);
    };

    this.renderLoopId = setTimeout(loop, frameTime);
  }

  // ============================================================================
  // Resize Handling
  // ============================================================================

  /**
   * Handle terminal resize
   */
  private handleResize(): void {
    if (!this.running) {
      return;
    }

    const width = this.stream.output.columns ?? 80;
    const height = this.stream.output.rows ?? 24;

    // Force re-render with new dimensions
    if (this.rootComponent instanceof BaseComponent) {
      this.rootComponent.setDimensions(width, height);
      this.markComponentDirty(this.rootComponent);
    }

    this.forceRender();
  }

  // ============================================================================
  // Input Handling
  // ============================================================================

  /**
   * Handle mouse events for drag and resize operations (fractal architecture)
   */
  private handleMouseEvent(event: MouseEvent): void {
    if (!this.rootComponent) return;

    // Draggable and resizable features only work in fullscreen mode
    if (this.options.mode !== 'fullscreen') {
      return;
    }

    // Handle ongoing drag operation
    if (this.draggingComponent) {
      if (event.type === 'mousemove') {
        this.draggingComponent.updateDrag(event.x, event.y);
        this.requestRender();
      } else if (event.type === 'mouseup') {
        this.draggingComponent.endDrag();
        this.draggingComponent = null;
        this.requestRender();
      }
      return;
    }

    // Handle ongoing resize operation
    if (this.resizingComponent) {
      if (event.type === 'mousemove') {
        this.resizingComponent.updateResize(event.x, event.y);
        this.requestRender();
      } else if (event.type === 'mouseup') {
        this.resizingComponent.endResize();
        this.resizingComponent = null;
        this.requestRender();
      }
      return;
    }

    // Find component at mouse position (hit test from top to bottom z-order)
    const components = this.collectComponentsWithZIndex(this.rootComponent);
    components.sort((a, b) => b.zIndex - a.zIndex); // Sort highest to lowest for hit testing

    for (const { component } of components) {
      if (component.contains(event.x, event.y)) {
        // Check for resize handle
        if (event.type === 'mousedown' && component.canResize()) {
          const handle = component.getResizeHandleAt(event.x, event.y);
          if (handle) {
            this.resizingComponent = component;
            component.startResize(handle, event.x, event.y);
            this.requestRender();
            return;
          }
        }

        // Check for drag initiation
        if (event.type === 'mousedown' && component.canDrag()) {
          this.draggingComponent = component;
          component.startDrag(event.x, event.y);
          this.requestRender();
          return;
        }

        // Otherwise pass to component
        const handled = component.handleMouseEvent(event);
        if (handled) {
          this.requestRender();
          return;
        }
      }
    }
  }

  /**
   * Parse key from input buffer
   */
  private parseKey(data: Buffer): Key {
    const str = data.toString();

    // Common key mappings
    const keyMap: Record<string, Key> = {
      '\x1b[A': { name: 'up', sequence: '\x1b[A', ctrl: false, meta: false, shift: false },
      '\x1b[B': { name: 'down', sequence: '\x1b[B', ctrl: false, meta: false, shift: false },
      '\x1b[C': { name: 'right', sequence: '\x1b[C', ctrl: false, meta: false, shift: false },
      '\x1b[D': { name: 'left', sequence: '\x1b[D', ctrl: false, meta: false, shift: false },
      '\r': { name: 'enter', sequence: '\r', ctrl: false, meta: false, shift: false },
      '\n': { name: 'enter', sequence: '\n', ctrl: false, meta: false, shift: false },
      '\x03': { name: 'c', ctrl: true, sequence: '\x03', meta: false, shift: false },
      '\x1b': { name: 'escape', sequence: '\x1b', ctrl: false, meta: false, shift: false },
      '\t': { name: 'tab', sequence: '\t', ctrl: false, meta: false, shift: false },
      '\x7f': { name: 'backspace', sequence: '\x7f', ctrl: false, meta: false, shift: false },
      '\x08': { name: 'backspace', sequence: '\x08', ctrl: false, meta: false, shift: false },
      ' ': { name: 'space', sequence: ' ', ctrl: false, meta: false, shift: false },
      '\x1b[H': { name: 'home', sequence: '\x1b[H', ctrl: false, meta: false, shift: false },
      '\x1b[F': { name: 'end', sequence: '\x1b[F', ctrl: false, meta: false, shift: false },
      '\x1b[5~': { name: 'pageup', sequence: '\x1b[5~', ctrl: false, meta: false, shift: false },
      '\x1b[6~': { name: 'pagedown', sequence: '\x1b[6~', ctrl: false, meta: false, shift: false },
      '\x1b[3~': { name: 'delete', sequence: '\x1b[3~', ctrl: false, meta: false, shift: false }
    };

    // Check for known sequences
    if (keyMap[str]) {
      return keyMap[str];
    }

    // Handle regular characters
    if (str.length === 1 && str.charCodeAt(0) >= 32 && str.charCodeAt(0) < 127) {
      return { name: str, sequence: str, ctrl: false, meta: false, shift: false };
    }

    // Default for unknown sequences
    return { name: 'unknown', sequence: str, ctrl: false, meta: false, shift: false };
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Update rendering statistics
   */
  private updateStats(frameTime: number): void {
    const newFrameCount = this.stats.framesRendered + 1;
    const newAverageFrameTime = newFrameCount === 1
      ? frameTime
      : (this.stats.averageFrameTime * this.stats.framesRendered + frameTime) / newFrameCount;

    this.stats = {
      framesRendered: newFrameCount,
      lastFrameTime: frameTime,
      averageFrameTime: newAverageFrameTime,
      skipCount: this.stats.skipCount, // Updated elsewhere
      renderQueueSize: this.dirtyComponents.size
    };
  }

  /**
   * Get rendering statistics
   */
  getStats(): RenderStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      framesRendered: 0,
      averageFrameTime: 0,
      lastFrameTime: 0,
      skipCount: 0,
      renderQueueSize: 0
    };
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get the current root component
   */
  getRootComponent(): Component<unknown> | null {
    return this.rootComponent;
  }

  /**
   * Check if the engine is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the terminal stream
   */
  getStream(): TerminalStream {
    return this.stream;
  }

  /**
   * Get rendering components
   */
  getRenderers(): {
    terminalManager: TerminalManager;
    inputManager: InputManager;
    scheduler: RenderScheduler;
  } {
    return {
      terminalManager: this.terminalManager,
      inputManager: this.inputManager,
      scheduler: this.scheduler
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new render engine
 */
export function createRenderEngine(
  stream: TerminalStream,
  options?: RenderEngineOptions
): RenderEngine {
  return new RenderEngine(stream, options);
}

/**
 * Create a render engine with default terminal stream
 */
export function createDefaultRenderEngine(options?: RenderEngineOptions): RenderEngine {
  const stream: TerminalStream = {
    input: process.stdin,
    output: process.stdout,
    isTTY: process.stdout.isTTY ?? false,
    colorMode: 'truecolor'
  };

  return new RenderEngine(stream, options);
}

/**
 * Create a render engine in inline/fullscreen mode
 */
export function createCustomRenderEngine(options: RenderEngineOptions = {}): RenderEngine {
  const stream: TerminalStream = {
    input: process.stdin,
    output: process.stdout,
    isTTY: process.stdout.isTTY ?? false,
    colorMode: 'truecolor'
  };

  const renderOptions: RenderEngineOptions = {
    ...options,
    preserveState: options.preserveState ?? true,
    enhancedInput: options.enhancedInput ?? true,
    enableFrameScheduling: options.enableFrameScheduling ?? options.mode === 'fullscreen', // For responsive updates
    autoResize: options.autoResize ?? options.mode === 'fullscreen',
  };

  return new RenderEngine(stream, renderOptions);
}
/**
 * Aura Next - Improved Application Architecture
 * 
 * This implementation properly uses the renderer's root component
 * instead of creating a separate root, providing a more intuitive API
 */

import {
  batch,
  effect,
  onCleanup,
  createRoot,
  type Disposable
} from 'vibrancy';

import { Component } from '../component.js';
import { getKeyHandler } from '../lib/key-handler.js';
import { setGlobalTheme, initializeTheme } from '../theme/context.js';
import {
  mountElement,
  unmountElement
} from './reactive-bridge.js';
import { Renderer, createRenderer, type RendererConfig } from '../renderer/renderer.js';
import { cleanupScreenDimensions, initializeScreenDimensions } from './screen-dimensions.js';

import type { ParsedKey } from '../types.js';
import type {
  AnyAuraElement
} from './types.js';
import type { AuraTheme, PartialTheme } from '../theme/types.js';



export interface ApplicationOptions {
  // Components to render - can be a single element, array, or function returning either
  children: AnyAuraElement | AnyAuraElement[] | (() => AnyAuraElement | AnyAuraElement[]);

  // Terminal renderer options
  renderer?: RendererConfig;

  // Theme configuration
  theme?: AuraTheme | PartialTheme;

  // Global error handler
  onError?: (error: Error) => void;

  // Global keyboard handler
  onKeyPress?: (key: ParsedKey) => void;

  // Lifecycle hooks
  onMount?: () => void;
  onCleanup?: () => void;
  onUpdate?: () => void;

  // Exit on Ctrl+C
  exitOnCtrlC?: boolean;
}

/**
 * Improved Application class for Aura Next
 * Uses the renderer's root component directly, providing a cleaner architecture
 */
export class AuraApplication {
  public renderer: Renderer;
  private disposables: Disposable[] = [];
  private cleanupRoot: (() => void) | null = null;
  private options: ApplicationOptions;
  private isRunning: boolean = false;
  private mountedComponents: Map<string, ReturnType<typeof mountElement>> = new Map();

  constructor(options: ApplicationOptions, renderer: Renderer) {
    this.options = {
      ...options,
      exitOnCtrlC: options.exitOnCtrlC ?? true,
    };
    this.renderer = renderer;
  }

  /**
   * Initialize and start the application
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Application is already running');
    }

    this.isRunning = true;

    try {
      // Initialize theme if provided and not already initialized
      // When using auraApp(), theme is initialized before renderer creation
      // When using Application directly, initialize it here
      if (this.options.theme) {
        initializeTheme(this.options.theme);
      }

      // Initialize screen dimension signals
      initializeScreenDimensions(this.renderer);

      // No need to start the renderer, becasuse we use renderer.requestRender() to trigger renders
      // this.renderer.start();

      // Mount children BEFORE creating reactive root to avoid re-execution
      // This prevents children from being mounted multiple times if they contain reactive dependencies
      this.mountChildren();

      // Create reactive root for the entire application
      this.cleanupRoot = createRoot(() => {
        // Set up global keyboard handler
        if (this.options.onKeyPress || this.options.exitOnCtrlC) {
          getKeyHandler().on("keypress", this.handleKeyPress);
          onCleanup(() => {
            getKeyHandler().off("keypress", this.handleKeyPress);
          });
        }

        // Run mount hook
        if (this.options.onMount) {
          this.options.onMount();
        }

        // Set up rendering effect
        const renderDispose = effect(() => {
          this.render();
        });

        this.disposables.push(renderDispose);

        // Register cleanup
        onCleanup(() => {
          if (this.options.onCleanup) {
            this.options.onCleanup();
          }
        });

        return () => {
          // Cleanup will be handled in stop()
        };
      });

      // Initial render
      this.render();

    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Mount children to the renderer's root
   */
  private mountChildren(): void {
    // Get children elements
    const childrenResult = typeof this.options.children === 'function'
      ? this.options.children()
      : this.options.children;

    const children = Array.isArray(childrenResult) ? childrenResult : [childrenResult];

    // Clear any existing mounted components
    this.clearMountedComponents();

    // Mount each child directly to the renderer's root
    batch(() => {
      children.forEach(child => {
        // Pass renderer.root as parent to provide context
        const mountData = mountElement(child, this.renderer.root);
        // Store mount data for cleanup
        this.mountedComponents.set(mountData.instance.id, mountData);
        // Component is automatically added to parent in mountElement
      });
    });
  }

  /**
   * Clear all mounted components
   */
  private clearMountedComponents(): void {
    batch(() => {
      // Unmount all tracked components
      for (const [id, mountData] of this.mountedComponents) {
        // Remove from renderer's root
        if (mountData.instance.parent === this.renderer.root) {
          this.renderer.root.remove(id);
        }
        unmountElement(mountData);
      }
      // Clear the map
      this.mountedComponents.clear();
    });
  }

  /**
   * Update the application's children
   * Useful for dynamically changing the UI
   */
  updateChildren(children: AnyAuraElement | AnyAuraElement[] | (() => AnyAuraElement | AnyAuraElement[])): void {
    if (!this.isRunning) {
      throw new Error('Cannot update children: application is not running');
    }

    batch(() => {
      // Update the options
      this.options.children = children;

      // Remount children (mountChildren already handles parent correctly)
      this.mountChildren();

      // Trigger update hook
      if (this.options.onUpdate) {
        this.options.onUpdate();
      }

      // Request render
      this.render();
    });
  }

  /**
   * Stop the application
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Clear mounted components
    this.clearMountedComponents();

    // Clean up reactive root
    if (this.cleanupRoot) {
      this.cleanupRoot();
      this.cleanupRoot = null;
    }

    // Dispose all disposables
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];

    // Clean up screen dimensions
    cleanupScreenDimensions();

    // Clean up renderer
    // this.renderer.stop();
    this.renderer.destroy();
  }

  /**
   * Render the application
   */
  private render(): void {
    if (!this.isRunning || !this.renderer.isRunning) {
      return;
    }

    batch(() => {
      try {
        // Just trigger renderer update - components are already in the root
        this.renderer.requestRender();
      } catch (error) {
        this.handleError(error as Error);
      }
    });
  }

  /**
   * Handle keyboard input
   */
  private handleKeyPress = (key: ParsedKey): void => {
    // Check for exit keys
    if (this.options.exitOnCtrlC && key.raw === '\u0003') { // Ctrl+C
      this.stop().then(() => {
        process.exit();
      });
      return;
    }

    // Pass to global handler
    if (this.options.onKeyPress) {
      this.options.onKeyPress(key);
    }
  };

  /**
   * Handle errors
   */
  private handleError(error: Error): void {
    if (this.options.onError) {
      this.options.onError(error);
    } else {
      console.error('Application error:', error);
    }
  }

  /**
   * Get the renderer instance
   */
  getRenderer(): Renderer {
    return this.renderer;
  }

  /**
   * Get the root component (from renderer)
   */
  getRootComponent(): Component {
    return this.renderer.root;
  }

  /**
   * Get all mounted components
   */
  getMountedComponents(): ReadonlyArray<Component> {
    return this.renderer.root.getChildren();
  }

  /**
   * Check if application is running
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Get terminal dimensions
   */
  get dimensions(): { width: number; height: number } {
    return {
      width: this.renderer.width,
      height: this.renderer.height
    };
  }

  /**
   * Update the application theme
   * @param theme - New theme configuration
   */
  setTheme(theme: AuraTheme | PartialTheme): void {
    setGlobalTheme(theme);
    this.options.theme = theme;
    // Request re-render to apply new theme
    this.render();
  }

  /**
   * Get the current theme
   * @returns Current theme configuration
   */
  getTheme(): AuraTheme | PartialTheme | undefined {
    return this.options.theme;
  }
}

/**
 * Simple function to create an app with minimal boilerplate
 * Perfect for quick prototypes and demos
 */
export async function auraApp(
  children: AnyAuraElement | AnyAuraElement[] | (() => AnyAuraElement | AnyAuraElement[]),
  options?: Partial<Omit<ApplicationOptions, 'children'>>
): Promise<AuraApplication> {
  const { renderer: rendererOptions, theme, ...appOptions } = options ?? {};

  // Initialize theme BEFORE creating renderer and components
  if (theme) {
    initializeTheme(theme);
  }

  const renderer = await createRenderer({
    ...rendererOptions,
    exitOnCtrlC: false,
  });
  const app = new AuraApplication({ children, theme, ...appOptions }, renderer);
  await app.start();
  return app;
}

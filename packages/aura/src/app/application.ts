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
import {
  mountElement,
  unmountElement
} from './reactive-bridge.js';
import { Renderer, createCliRenderer, type CliRendererConfig } from '../renderer/renderer.js';

import type {
  AnyAuraElement
} from './types.js';
import type { ParsedKey } from '../lib/parse.keypress.js';



export interface ApplicationOptions {
  // Components to render - can be a single element, array, or function returning either
  children: AnyAuraElement | AnyAuraElement[] | (() => AnyAuraElement | AnyAuraElement[]);

  // Terminal renderer options
  renderer?: CliRendererConfig;

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
class AuraApplication {
  public renderer: Renderer;
  private disposables: Disposable[] = [];
  private cleanupRoot: (() => void) | null = null;
  private options: ApplicationOptions;
  private isRunning: boolean = false;

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
      // No need to start the renderer, becasuse we use renderer.needsUpdate() to trigger renders
      // this.renderer.start();

      // Create reactive root for the entire application
      this.cleanupRoot = createRoot(() => {
        // Mount all children directly to the renderer's root
        this.mountChildren();

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
        const component = mountElement(child);
        if (component) {
          // Add directly to renderer's root
          this.renderer.root.add(component);
        }
      });
    });
  }

  /**
   * Clear all mounted components
   */
  private clearMountedComponents(): void {
    batch(() => {
      this.renderer.root.getChildren().forEach(component => {
        // Remove from renderer's root
        if (component.parent === this.renderer.root) {
          this.renderer.root.remove(component.id);
        }
        unmountElement(component);
      });
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

      // Remount children
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
        this.renderer.needsUpdate();
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
}

/**
 * Simple function to create an app with minimal boilerplate
 * Perfect for quick prototypes and demos
 */
export async function auraApp(
  children: AnyAuraElement | AnyAuraElement[] | (() => AnyAuraElement | AnyAuraElement[]),
  options?: Partial<Omit<ApplicationOptions, 'children'>>
): Promise<AuraApplication> {
  const { renderer: rendererOptions, ...appOptions } = options ?? {};
  const renderer = await createCliRenderer({
    ...rendererOptions,
    exitOnCtrlC: false,
  });
  const app = new AuraApplication({ children, ...appOptions }, renderer);
  await app.start();
  return app;
}

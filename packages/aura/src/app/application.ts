/**
 * Aura Application Architecture
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
import { registerCleanup, lifecycleManager } from './lifecycle-manager.js';
import { Renderer, createRenderer, type RendererConfig } from '../renderer/renderer.js';
import { cleanupScreenDimensions, initializeScreenDimensions } from './screen-dimensions.js';
import {
  runMountHooks,
  runCleanupHooks,
  runInComponentContext,
  type ComponentContext,
  createComponentContext
} from './lifecycle.js';

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

      // NOTE: renderer.start() is intentionally not called here
      // The renderer operates in request-based mode where renders are triggered
      // by requestRender() calls from components

      // Mount children BEFORE creating reactive root to avoid re-execution
      // This prevents children from being mounted multiple times if they contain reactive dependencies
      this.mountChildren();

      // Register application cleanup with lifecycle manager
      // Use lower priority to ensure it runs after component cleanups
      registerCleanup(async () => {
        await this.cleanup();
      }, { name: 'AuraApplication', priority: 90 });

      // Create a root component context for the app
      const appContext = createComponentContext('app-root');

      // Create reactive root for the entire application
      this.cleanupRoot = createRoot(() => {
        // Run in app context so lifecycle hooks work properly
        runInComponentContext(appContext, () => {
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

          // Register cleanup with both reactive system and lifecycle manager
          onCleanup(() => {
            if (this.options.onCleanup) {
              this.options.onCleanup();
            }
          });

          // Also register with global lifecycle manager for graceful shutdown
          if (this.options.onCleanup) {
            registerCleanup(this.options.onCleanup, { name: 'ApplicationOptions.onCleanup', priority: 65 });
          }
        });

        // Run mount hooks for the app context
        runMountHooks(appContext);

        return () => {
          // Run cleanup hooks for app context
          runCleanupHooks(appContext);
          // Additional cleanup will be handled in stop()
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
        // For functional components, instance is null, so use context id
        const id = mountData.instance ? mountData.instance.id : mountData.context.id;
        this.mountedComponents.set(id, mountData);
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
        // Only if it has an instance (functional components don't)
        if (mountData.instance && mountData.instance.parent === this.renderer.root) {
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
   * Internal cleanup method
   */
  private async cleanup(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Clear mounted components first
    this.clearMountedComponents();

    // Clean up reactive root (this will trigger onCleanup handlers)
    if (this.cleanupRoot) {
      // Execute the cleanup function returned by createRoot
      this.cleanupRoot();

      // IMPORTANT: Give the reactive system time to propagate cleanup
      // This ensures all onCleanup handlers are executed
      await new Promise(resolve => setImmediate(resolve));

      this.cleanupRoot = null;
    }

    // Dispose all disposables
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];

    // Clean up screen dimensions
    cleanupScreenDimensions();

    // Clean up renderer
    // Note: renderer.stop() is not called as renderer.start() was never called
    this.renderer.destroy();
  }

  /**
   * Stop the application (triggers graceful shutdown)
   */
  async stop(): Promise<void> {
    // Use lifecycle manager for graceful shutdown
    await lifecycleManager.shutdown(0);
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
      // Trigger graceful shutdown
      lifecycleManager.shutdown(130); // Standard exit code for SIGINT
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
    useAlternateScreen: true,
    exitOnCtrlC: false,
  });

  // Create a context for the app function if children is a function
  // This allows onCleanup to work within the app function
  let finalChildren = children;
  let appFunctionCleanup: (() => void) | null = null;
  let appFunctionContext: ComponentContext | null = null;

  if (typeof children === 'function') {
    // Create component context for the app function
    appFunctionContext = createComponentContext('app-function');

    // We need to run the app function in a way that preserves its reactive context
    // The key is to NOT dispose the reactive root immediately
    let appResult: AnyAuraElement | AnyAuraElement[] | null = null;

    // Create the reactive root and keep it alive
    appFunctionCleanup = createRoot(() => {
      // Run the app function in component context
      runInComponentContext(appFunctionContext!, () => {
        appResult = children();

        // Run mount hooks for the app context
        runMountHooks(appFunctionContext!);
      });

      // Return a cleanup function that will be called when the root is disposed
      return () => {
        // Run cleanup hooks for the app context
        if (appFunctionContext) {
          runCleanupHooks(appFunctionContext);
        }
      };
    });

    // Use the result from the app function
    finalChildren = appResult!;

    // Register cleanup for the app function's reactive root with high priority
    // This ensures it runs before application cleanup
    registerCleanup(() => {
      if (appFunctionCleanup) {
        appFunctionCleanup();
      }
    }, { name: 'app-function-cleanup', priority: 40 });
  }

  const app = new AuraApplication({ children: finalChildren, theme, ...appOptions }, renderer);
  await app.start();
  return app;
}

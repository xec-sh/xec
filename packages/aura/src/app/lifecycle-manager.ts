/**
 * Global Lifecycle Manager for Aura Applications
 * Provides graceful shutdown with proper cleanup handling
 */

export interface CleanupHandler {
  name?: string;
  priority?: number; // Lower numbers execute first
  handler: () => void | Promise<void>;
}

export class LifecycleManager {
  private static instance: LifecycleManager;
  private cleanupHandlers: Map<symbol, CleanupHandler> = new Map();
  private isShuttingDown = false;
  private shutdownPromise: Promise<void> | null = null;
  private signalsRegistered = false;
  private exitCode = 0;
  private forceExitTimeout?: NodeJS.Timeout;
  private readonly forceExitDelay = 5000; // 5 seconds max for cleanup

  private constructor() {}

  static getInstance(): LifecycleManager {
    if (!LifecycleManager.instance) {
      LifecycleManager.instance = new LifecycleManager();
    }
    return LifecycleManager.instance;
  }

  /**
   * Register a cleanup handler
   * @returns Disposable function to unregister the handler
   */
  registerCleanup(handler: CleanupHandler['handler'], options?: { name?: string; priority?: number }): () => void {
    const id = Symbol(options?.name || 'cleanup');
    const name = options?.name || 'unnamed';
    
    // Debug log to track registrations
    if (name.includes('onCleanup') || name.includes('Component')) {
      console.log(`[LIFECYCLE DEBUG] Registering cleanup: ${name} (priority: ${options?.priority ?? 100})`);
    }
    
    this.cleanupHandlers.set(id, {
      name,
      priority: options?.priority ?? 100,
      handler
    });

    // Register process signal handlers on first cleanup registration
    if (!this.signalsRegistered) {
      this.registerSignalHandlers();
    }

    // Return unregister function
    return () => {
      this.cleanupHandlers.delete(id);
    };
  }

  /**
   * Register signal handlers for graceful shutdown
   */
  private registerSignalHandlers(): void {
    if (this.signalsRegistered) return;
    this.signalsRegistered = true;

    const handleSignal = (signal: string) => {
      console.log(`\nReceived ${signal}, starting graceful shutdown...`);
      this.shutdown(signal === 'SIGTERM' ? 0 : 130); // 130 is standard for SIGINT
    };

    // Register handlers for various termination signals
    process.on('SIGINT', () => handleSignal('SIGINT'));
    process.on('SIGTERM', () => handleSignal('SIGTERM'));
    process.on('SIGQUIT', () => handleSignal('SIGQUIT'));
    
    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      this.shutdown(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.shutdown(1);
    });

    // Prevent immediate exit on these signals
    process.on('beforeExit', (code) => {
      if (!this.isShuttingDown) {
        this.shutdown(code);
      }
    });
  }

  /**
   * Execute all cleanup handlers and shutdown
   */
  async shutdown(exitCode = 0): Promise<void> {
    // Prevent multiple simultaneous shutdowns
    if (this.isShuttingDown) {
      return this.shutdownPromise || Promise.resolve();
    }

    this.isShuttingDown = true;
    this.exitCode = exitCode;

    // Set force exit timeout with a longer delay for complex cleanup
    this.forceExitTimeout = setTimeout(() => {
      console.error('Force exit: cleanup took too long');
      process.exit(this.exitCode);
    }, this.forceExitDelay);

    this.shutdownPromise = this.executeCleanup();
    
    try {
      await this.shutdownPromise;
      
      // CRITICAL: Give the reactive system and all async operations time to complete
      // This ensures all cleanup handlers have time to execute properly
      
      // First, yield to the event loop multiple times to allow all queued tasks to execute
      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setImmediate(resolve));
      }
      
      // Then give additional time for async cleanup operations and file I/O
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Finally, ensure all remaining microtasks are complete
      await new Promise(resolve => process.nextTick(resolve));
      
    } finally {
      if (this.forceExitTimeout) {
        clearTimeout(this.forceExitTimeout);
      }
      // Exit the process after all cleanup is done
      process.exit(this.exitCode);
    }
  }

  /**
   * Execute cleanup handlers in priority order
   */
  private async executeCleanup(): Promise<void> {
    // Sort handlers by priority
    const sortedHandlers = Array.from(this.cleanupHandlers.values())
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

    console.log(`[LIFECYCLE DEBUG] Executing ${sortedHandlers.length} cleanup handlers`);
    console.log(`[LIFECYCLE DEBUG] Handlers:`, sortedHandlers.map(h => `${h.name} (${h.priority})`));
    
    // Execute cleanup handlers
    for (const { name, handler } of sortedHandlers) {
      try {
        console.log(`[LIFECYCLE DEBUG] Executing: ${name}`);
        const result = handler();
        if (result instanceof Promise) {
          await result;
        }
        if (name) {
          console.log(`✓ Cleanup completed: ${name}`);
        }
      } catch (error) {
        console.error(`Error in cleanup handler${name ? ` (${name})` : ''}:`, error);
      }
    }
  }

  /**
   * Clear all cleanup handlers (useful for testing)
   */
  clear(): void {
    this.cleanupHandlers.clear();
    this.isShuttingDown = false;
    this.shutdownPromise = null;
    if (this.forceExitTimeout) {
      clearTimeout(this.forceExitTimeout);
      this.forceExitTimeout = undefined;
    }
  }

  /**
   * Check if shutdown is in progress
   */
  get isShuttingDownNow(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Get the number of registered cleanup handlers
   */
  get handlerCount(): number {
    return this.cleanupHandlers.size;
  }
}

// Export singleton instance
export const lifecycleManager = LifecycleManager.getInstance();

/**
 * Convenience function to register a cleanup handler
 */
export function registerCleanup(
  handler: () => void | Promise<void>,
  options?: { name?: string; priority?: number }
): () => void {
  return lifecycleManager.registerCleanup(handler, options);
}

/**
 * Convenience function to trigger shutdown
 */
export function gracefulShutdown(exitCode = 0): Promise<void> {
  return lifecycleManager.shutdown(exitCode);
}
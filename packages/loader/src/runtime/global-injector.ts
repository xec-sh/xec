/**
 * GlobalInjector manages safe injection and restoration of global variables
 * @module @xec-sh/loader/runtime/global-injector
 */

/**
 * Options for global injection
 */
export interface GlobalInjectorOptions {
  /**
   * Custom globals to inject
   */
  globals?: Record<string, any>;

  /**
   * Whether to preserve original values
   */
  preserveOriginals?: boolean;

  /**
   * Globals to skip injection
   */
  skipGlobals?: string[];
}

/**
 * GlobalInjector provides safe injection and restoration of global variables
 */
export class GlobalInjector {
  private injectedGlobals = new Map<string, any>();
  private originalGlobals = new Map<string, any>();
  private isInjected = false;
  private readonly options: Required<GlobalInjectorOptions>;

  constructor(options: GlobalInjectorOptions = {}) {
    this.options = {
      globals: options.globals || {},
      preserveOriginals: options.preserveOriginals ?? true,
      skipGlobals: options.skipGlobals || [],
    };
  }

  /**
   * Check if a global should be skipped
   */
  private shouldSkipGlobal(key: string): boolean {
    return this.options.skipGlobals.includes(key);
  }

  /**
   * Check if global injection is safe
   */
  private isSafeToInject(key: string): boolean {
    // Don't inject reserved Node.js globals
    const reservedGlobals = [
      'global',
      'process',
      'Buffer',
      'console',
      'setTimeout',
      'setInterval',
      'setImmediate',
      'clearTimeout',
      'clearInterval',
      'clearImmediate',
      '__filename',
      '__dirname',
      'require',
      'module',
      'exports',
    ];

    if (reservedGlobals.includes(key)) {
      return false;
    }

    if (this.shouldSkipGlobal(key)) {
      return false;
    }

    return true;
  }

  /**
   * Inject globals into the global scope
   */
  inject(): void {
    if (this.isInjected) {
      throw new Error('Globals are already injected. Call restore() first.');
    }

    for (const [key, value] of Object.entries(this.options.globals)) {
      if (!this.isSafeToInject(key)) {
        console.warn(`[GlobalInjector] Skipping unsafe global: ${key}`);
        continue;
      }

      // Store original value if it exists
      if (key in globalThis) {
        if (this.options.preserveOriginals) {
          this.originalGlobals.set(key, (globalThis as any)[key]);
        }
      }

      // Inject new value
      (globalThis as any)[key] = value;
      this.injectedGlobals.set(key, value);
    }

    this.isInjected = true;
  }

  /**
   * Restore original globals
   */
  restore(): void {
    if (!this.isInjected) {
      return;
    }

    for (const key of this.injectedGlobals.keys()) {
      if (this.originalGlobals.has(key)) {
        // Restore original value
        (globalThis as any)[key] = this.originalGlobals.get(key);
      } else {
        // Remove injected value
        delete (globalThis as any)[key];
      }
    }

    this.injectedGlobals.clear();
    this.originalGlobals.clear();
    this.isInjected = false;
  }

  /**
   * Execute function with injected globals
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.inject();
    try {
      return await fn();
    } finally {
      this.restore();
    }
  }

  /**
   * Execute synchronous function with injected globals
   */
  executeSync<T>(fn: () => T): T {
    this.inject();
    try {
      return fn();
    } finally {
      this.restore();
    }
  }

  /**
   * Add global to inject
   */
  addGlobal(key: string, value: any): void {
    if (this.isInjected) {
      throw new Error('Cannot add globals while they are injected. Call restore() first.');
    }

    this.options.globals[key] = value;
  }

  /**
   * Remove global from injection list
   */
  removeGlobal(key: string): void {
    if (this.isInjected) {
      throw new Error('Cannot remove globals while they are injected. Call restore() first.');
    }

    delete this.options.globals[key];
  }

  /**
   * Get list of injected global keys
   */
  getInjectedKeys(): string[] {
    return Array.from(this.injectedGlobals.keys());
  }

  /**
   * Check if globals are currently injected
   */
  get isActive(): boolean {
    return this.isInjected;
  }

  /**
   * Get all globals that will be injected
   */
  getGlobals(): Record<string, any> {
    return { ...this.options.globals };
  }

  /**
   * Clear all globals
   */
  clear(): void {
    if (this.isInjected) {
      this.restore();
    }
    this.options.globals = {};
  }
}

/**
 * Create a new GlobalInjector instance
 */
export function createInjector(options?: GlobalInjectorOptions): GlobalInjector {
  return new GlobalInjector(options);
}

/**
 * ExecutionContext manages the execution environment for scripts
 * @module @xec-sh/loader/core/execution-context
 */

import type {
  TargetInfo,
  ScriptContext,
  ExecutionEngine,
  ExecutionContextOptions,
} from '../types/index.js';

/**
 * ExecutionContext provides isolated execution environment for scripts
 */
export class ExecutionContext {
  private readonly options: ExecutionContextOptions;
  private readonly injectedGlobals = new Map<string, unknown>();
  private readonly originalGlobals = new Map<string, unknown>();

  constructor(options: ExecutionContextOptions = {}) {
    this.options = options;
  }

  /**
   * Get target information
   */
  getTargetInfo(): TargetInfo | undefined {
    return this.options.target;
  }

  /**
   * Get target execution engine
   */
  getTargetEngine(): ExecutionEngine | undefined {
    return this.options.targetEngine;
  }

  /**
   * Get script context
   */
  getScriptContext(): ScriptContext | undefined {
    return this.options.context;
  }

  /**
   * Get custom globals
   */
  getCustomGlobals(): Record<string, unknown> {
    return this.options.customGlobals || {};
  }

  /**
   * Inject globals into the environment
   */
  async injectGlobals(): Promise<void> {
    const globalsToInject = new Map<string, unknown>();

    // Add script context
    if (this.options.context) {
      globalsToInject.set('__xecScriptContext', this.options.context);

      // The context is also the script's working vocabulary: `args` is what
      // the script was invoked with, `argv` the full shell convention,
      // `__filename`/`__dirname` its own location. These were promised by
      // the documentation and existed only inside __xecScriptContext — an
      // internal carrier nobody was told about — so every script that
      // followed the docs died on a ReferenceError.
      globalsToInject.set('args', this.options.context.args);
      globalsToInject.set('argv', this.options.context.argv);
      globalsToInject.set('__filename', this.options.context.__filename);
      globalsToInject.set('__dirname', this.options.context.__dirname);
    }

    // Add target context
    if (this.options.target && this.options.targetEngine) {
      globalsToInject.set('$target', this.options.targetEngine);
      globalsToInject.set('$targetInfo', this.options.target);
    }

    // Add custom globals
    if (this.options.customGlobals) {
      for (const [key, value] of Object.entries(this.options.customGlobals)) {
        globalsToInject.set(key, value);
      }
    }

    // Save original values and inject
    const global = globalThis as Record<string, unknown>;
    for (const [key, value] of globalsToInject) {
      if (key in globalThis) {
        this.originalGlobals.set(key, global[key]);
      }
      global[key] = value;
      this.injectedGlobals.set(key, value);
    }
  }

  /**
   * Restore original globals
   */
  async restoreGlobals(): Promise<void> {
    const global = globalThis as Record<string, unknown>;
    for (const [key] of this.injectedGlobals) {
      if (this.originalGlobals.has(key)) {
        global[key] = this.originalGlobals.get(key);
      } else {
        delete global[key];
      }
    }

    this.injectedGlobals.clear();
    this.originalGlobals.clear();
  }

  /**
   * Execute function within this context
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.injectGlobals();

    try {
      return await fn();
    } finally {
      await this.restoreGlobals();
    }
  }

  /**
   * Dispose of this context
   */
  async dispose(): Promise<void> {
    await this.restoreGlobals();
  }
}

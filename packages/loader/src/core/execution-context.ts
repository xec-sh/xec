/**
 * ExecutionContext manages the execution environment for scripts
 * @module @xec-sh/loader/core/execution-context
 */

import type {
  TargetInfo,
  ScriptContext,
  ExecutionContextOptions,
} from '../types/index.js';

/**
 * ExecutionContext provides isolated execution environment for scripts
 */
export class ExecutionContext {
  private readonly options: ExecutionContextOptions;
  private readonly injectedGlobals = new Map<string, any>();
  private readonly originalGlobals = new Map<string, any>();

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
  getTargetEngine(): any {
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
  getCustomGlobals(): Record<string, any> {
    return this.options.customGlobals || {};
  }

  /**
   * Inject globals into the environment
   */
  async injectGlobals(): Promise<void> {
    const globalsToInject = new Map<string, any>();

    // Add script context
    if (this.options.context) {
      globalsToInject.set('__xecScriptContext', this.options.context);
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
    for (const [key, value] of globalsToInject) {
      if (key in globalThis) {
        this.originalGlobals.set(key, (globalThis as any)[key]);
      }
      (globalThis as any)[key] = value;
      this.injectedGlobals.set(key, value);
    }
  }

  /**
   * Restore original globals
   */
  async restoreGlobals(): Promise<void> {
    for (const [key] of this.injectedGlobals) {
      if (this.originalGlobals.has(key)) {
        (globalThis as any)[key] = this.originalGlobals.get(key);
      } else {
        delete (globalThis as any)[key];
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

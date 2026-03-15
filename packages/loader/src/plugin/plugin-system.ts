/**
 * Plugin system for extending the loader with custom resolvers,
 * transformers, and lifecycle hooks.
 *
 * @module @xec-sh/loader/plugin/plugin-system
 */

import type { ModuleResolver, ModuleSpecifier } from '../types/index.js';

// ─── Plugin Interface ───────────────────────────────────────────────

/**
 * Lifecycle hooks that plugins can implement.
 * All hooks are optional — implement only what you need.
 */
export interface LoaderPlugin {
  /** Unique plugin name for identification and error messages */
  name: string;

  /**
   * Called when the plugin system is initialized.
   * Use for setup, resource allocation, etc.
   */
  setup?(): void | Promise<void>;

  /**
   * Called when the plugin system is disposed.
   * Use for cleanup, resource release, etc.
   */
  teardown?(): void | Promise<void>;

  /**
   * Custom module resolver. If provided, this resolver is prepended
   * to the resolver chain, giving it highest priority.
   */
  resolver?: ModuleResolver;

  /**
   * Transform source code before execution.
   * Called after TypeScript transformation, before execution.
   *
   * @param code - Source code (JavaScript)
   * @param filename - Source file path
   * @returns Transformed code, or undefined to skip
   */
  transformCode?(code: string, filename: string): string | undefined | Promise<string | undefined>;

  /**
   * Intercept module specifiers before resolution.
   * Return a modified specifier, or undefined to use the original.
   *
   * @example
   * ```typescript
   * // Alias plugin
   * resolveSpecifier(specifier) {
   *   if (specifier.startsWith('@/')) {
   *     return specifier.replace('@/', './src/');
   *   }
   * }
   * ```
   */
  resolveSpecifier?(specifier: ModuleSpecifier): ModuleSpecifier | undefined | Promise<ModuleSpecifier | undefined>;

  /**
   * Called before a script is executed.
   * Return false to cancel execution.
   */
  beforeExecute?(scriptPath: string): boolean | Promise<boolean>;

  /**
   * Called after a script completes execution.
   */
  afterExecute?(scriptPath: string, success: boolean): void | Promise<void>;

  /**
   * Called when an error occurs during execution.
   * Can return a modified error or undefined to use the original.
   */
  onError?(error: Error, scriptPath?: string): Error | undefined | Promise<Error | undefined>;
}

// ─── Plugin Manager ─────────────────────────────────────────────────

/**
 * Manages plugin lifecycle and hook invocation.
 *
 * @example
 * ```typescript
 * const plugins = new PluginManager();
 *
 * plugins.register({
 *   name: 'alias-resolver',
 *   resolveSpecifier(specifier) {
 *     if (specifier.startsWith('~')) return specifier.replace('~', './src');
 *   }
 * });
 *
 * plugins.register({
 *   name: 'env-injector',
 *   transformCode(code, filename) {
 *     return `const __ENV__ = ${JSON.stringify(process.env)};\n${code}`;
 *   }
 * });
 *
 * await plugins.setup();
 * ```
 */
export class PluginManager {
  private plugins: LoaderPlugin[] = [];
  private initialized = false;

  /**
   * Register a plugin. Plugins are invoked in registration order.
   * Must be called before setup().
   */
  register(plugin: LoaderPlugin): this {
    if (this.initialized) {
      throw new Error(`Cannot register plugin "${plugin.name}" after setup(). Register all plugins first.`);
    }

    // Prevent duplicate names
    if (this.plugins.some(p => p.name === plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered.`);
    }

    this.plugins.push(plugin);
    return this;
  }

  /**
   * Initialize all registered plugins (calls setup hooks).
   */
  async setup(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    for (const plugin of this.plugins) {
      if (plugin.setup) {
        await plugin.setup();
      }
    }
  }

  /**
   * Tear down all plugins in reverse order (LIFO cleanup).
   */
  async teardown(): Promise<void> {
    if (!this.initialized) return;

    for (let i = this.plugins.length - 1; i >= 0; i--) {
      const plugin = this.plugins[i]!;
      if (plugin.teardown) {
        try {
          await plugin.teardown();
        } catch (error) {
          console.error(`Plugin "${plugin.name}" teardown error:`, error);
        }
      }
    }

    this.plugins = [];
    this.initialized = false;
  }

  /**
   * Get all plugin-provided resolvers for integration with CompositeModuleResolver.
   */
  getResolvers(): ModuleResolver[] {
    return this.plugins
      .filter((p): p is LoaderPlugin & { resolver: ModuleResolver } => p.resolver !== undefined)
      .map(p => p.resolver);
  }

  /**
   * Run resolveSpecifier hooks. Returns the first non-undefined result.
   */
  async resolveSpecifier(specifier: ModuleSpecifier): Promise<ModuleSpecifier> {
    for (const plugin of this.plugins) {
      if (plugin.resolveSpecifier) {
        const result = await plugin.resolveSpecifier(specifier);
        if (result !== undefined) return result;
      }
    }
    return specifier;
  }

  /**
   * Run transformCode hooks in sequence. Each receives the previous output.
   */
  async transformCode(code: string, filename: string): Promise<string> {
    let result = code;
    for (const plugin of this.plugins) {
      if (plugin.transformCode) {
        const transformed = await plugin.transformCode(result, filename);
        if (transformed !== undefined) result = transformed;
      }
    }
    return result;
  }

  /**
   * Run beforeExecute hooks. Returns false if any plugin cancels.
   */
  async beforeExecute(scriptPath: string): Promise<boolean> {
    for (const plugin of this.plugins) {
      if (plugin.beforeExecute) {
        const ok = await plugin.beforeExecute(scriptPath);
        if (ok === false) return false;
      }
    }
    return true;
  }

  /**
   * Run afterExecute hooks.
   */
  async afterExecute(scriptPath: string, success: boolean): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.afterExecute) {
        await plugin.afterExecute(scriptPath, success);
      }
    }
  }

  /**
   * Run onError hooks. Returns the first modified error, or the original.
   */
  async onError(error: Error, scriptPath?: string): Promise<Error> {
    for (const plugin of this.plugins) {
      if (plugin.onError) {
        const modified = await plugin.onError(error, scriptPath);
        if (modified !== undefined) return modified;
      }
    }
    return error;
  }

  /**
   * Get the number of registered plugins.
   */
  get count(): number {
    return this.plugins.length;
  }

  /**
   * Check if a plugin with the given name is registered.
   */
  has(name: string): boolean {
    return this.plugins.some(p => p.name === name);
  }
}

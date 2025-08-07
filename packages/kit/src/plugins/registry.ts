/**
 * @module plugins/registry
 * Plugin registry for managing Kit plugins
 */

import { EventEmitter } from '../core/event-emitter.js';

import type { Theme } from '../core/types.js';
import type { KitPlugin, PluginContext, ComponentDefinition } from './plugin.js';

/**
 * Plugin registry for managing plugins
 * 
 * @class PluginRegistry
 * @extends EventEmitter
 * 
 * @example
 * ```typescript
 * const registry = new PluginRegistry();
 * 
 * // Register a plugin
 * registry.register(myPlugin);
 * 
 * // Activate a plugin
 * await registry.activate('myPlugin');
 * 
 * // Get all components
 * const components = registry.getComponents();
 * ```
 */
export class PluginRegistry extends EventEmitter {
  private plugins = new Map<string, KitPlugin>();
  private activePlugins = new Set<string>();
  private components = new Map<string, ComponentDefinition>();
  private themeOverrides: Array<Partial<Theme>> = [];
  private context: PluginContext;

  /**
   * Create a new plugin registry
   */
  constructor() {
    super();
    
    this.context = {
      version: '1.0.0', // Version is managed during build process
      features: {
        tty: process.stdout.isTTY || false,
        color: !process.env['NO_COLOR'],
        unicode: process.platform !== 'win32',
      },
      plugins: this.plugins,
      config: {},
    };
  }

  /**
   * Register a plugin
   * 
   * @param {KitPlugin} plugin - The plugin to register
   * @throws {Error} If plugin with same name already exists
   * @throws {Error} If plugin dependencies are not met
   */
  async register(plugin: KitPlugin): Promise<void> {
    const { name, dependencies = [] } = plugin;

    // Check if plugin already exists
    if (this.plugins.has(name)) {
      throw new Error(`Plugin "${name}" is already registered`);
    }

    // Check dependencies
    for (const dep of dependencies) {
      if (!this.plugins.has(dep)) {
        throw new Error(`Plugin "${name}" depends on "${dep}" which is not registered`);
      }
    }

    // Register the plugin
    this.plugins.set(name, plugin);
    
    // Call onRegister hook
    if (plugin.hooks?.onRegister) {
      await plugin.hooks.onRegister();
    }

    this.emit('plugin:registered', { plugin });
  }

  /**
   * Activate a plugin
   * 
   * @param {string} name - Plugin name to activate
   * @throws {Error} If plugin is not registered
   * @throws {Error} If plugin is already active
   */
  async activate(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    
    if (!plugin) {
      throw new Error(`Plugin "${name}" is not registered`);
    }

    if (this.activePlugins.has(name)) {
      throw new Error(`Plugin "${name}" is already active`);
    }

    // Activate dependencies first
    if (plugin.dependencies) {
      for (const dep of plugin.dependencies) {
        if (!this.activePlugins.has(dep)) {
          await this.activate(dep);
        }
      }
    }

    // Register components
    if (plugin.components) {
      for (const [key, component] of Object.entries(plugin.components)) {
        this.components.set(component.name || key, component);
      }
    }

    // Apply theme overrides
    if (plugin.theme) {
      this.themeOverrides.push(plugin.theme);
    }

    // Mark as active
    this.activePlugins.add(name);

    // Call onActivate hook
    if (plugin.hooks?.onActivate) {
      await plugin.hooks.onActivate();
    }

    this.emit('plugin:activated', { plugin });
  }

  /**
   * Deactivate a plugin
   * 
   * @param {string} name - Plugin name to deactivate
   * @throws {Error} If plugin is not registered
   * @throws {Error} If plugin is not active
   * @throws {Error} If other active plugins depend on this plugin
   */
  async deactivate(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    
    if (!plugin) {
      throw new Error(`Plugin "${name}" is not registered`);
    }

    if (!this.activePlugins.has(name)) {
      throw new Error(`Plugin "${name}" is not active`);
    }

    // Check if other active plugins depend on this
    for (const [otherName, otherPlugin] of this.plugins) {
      if (otherName !== name && 
          this.activePlugins.has(otherName) && 
          otherPlugin.dependencies?.includes(name)) {
        throw new Error(`Cannot deactivate "${name}" because "${otherName}" depends on it`);
      }
    }

    // Remove components
    if (plugin.components) {
      for (const [key, component] of Object.entries(plugin.components)) {
        this.components.delete(component.name || key);
      }
    }

    // Remove theme overrides
    if (plugin.theme) {
      const index = this.themeOverrides.indexOf(plugin.theme);
      if (index !== -1) {
        this.themeOverrides.splice(index, 1);
      }
    }

    // Mark as inactive
    this.activePlugins.delete(name);

    // Call onDeactivate hook
    if (plugin.hooks?.onDeactivate) {
      await plugin.hooks.onDeactivate();
    }

    this.emit('plugin:deactivated', { plugin });
  }

  /**
   * Unregister a plugin
   * 
   * @param {string} name - Plugin name to unregister
   * @throws {Error} If plugin is still active
   */
  async unregister(name: string): Promise<void> {
    if (this.activePlugins.has(name)) {
      await this.deactivate(name);
    }

    this.plugins.delete(name);
    this.emit('plugin:unregistered', { name });
  }

  /**
   * Get a registered plugin
   * 
   * @param {string} name - Plugin name
   * @returns {KitPlugin | undefined} The plugin or undefined
   */
  getPlugin(name: string): KitPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get all registered plugins
   * 
   * @returns {KitPlugin[]} Array of all plugins
   */
  getAllPlugins(): KitPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get all active plugins
   * 
   * @returns {KitPlugin[]} Array of active plugins
   */
  getActivePlugins(): KitPlugin[] {
    return Array.from(this.activePlugins)
      .map(name => this.plugins.get(name)!)
      .filter(Boolean);
  }

  /**
   * Check if a plugin is registered
   * 
   * @param {string} name - Plugin name
   * @returns {boolean} True if registered
   */
  isRegistered(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Check if a plugin is active
   * 
   * @param {string} name - Plugin name
   * @returns {boolean} True if active
   */
  isActive(name: string): boolean {
    return this.activePlugins.has(name);
  }

  /**
   * Get a component by name
   * 
   * @param {string} name - Component name
   * @returns {ComponentDefinition | undefined} The component or undefined
   */
  getComponent(name: string): ComponentDefinition | undefined {
    return this.components.get(name);
  }

  /**
   * Get all registered components
   * 
   * @returns {Map<string, ComponentDefinition>} Map of all components
   */
  getComponents(): Map<string, ComponentDefinition> {
    return new Map(this.components);
  }

  /**
   * Get merged theme from all active plugins
   * 
   * @returns {Partial<Theme>} Merged theme object
   */
  getMergedTheme(): Partial<Theme> {
    const merged: Partial<Theme> = {};
    
    for (const override of this.themeOverrides) {
      // Deep merge theme objects
      if (override.colors && merged.colors) {
        merged.colors = { ...merged.colors, ...override.colors };
      } else if (override.colors) {
        merged.colors = { ...override.colors };
      }
      
      if (override.symbols && merged.symbols) {
        merged.symbols = { ...merged.symbols, ...override.symbols };
      } else if (override.symbols) {
        merged.symbols = { ...override.symbols };
      }
      
      if (override.formatters && merged.formatters) {
        merged.formatters = { ...merged.formatters, ...override.formatters };
      } else if (override.formatters) {
        merged.formatters = { ...override.formatters };
      }
    }
    
    return merged;
  }

  /**
   * Execute beforePrompt hooks for all active plugins
   * 
   * @param {string} promptType - Type of prompt
   * @param {any} options - Prompt options
   */
  async executeBeforePrompt(promptType: string, options: any): Promise<void> {
    for (const plugin of this.getActivePlugins()) {
      if (plugin.hooks?.beforePrompt) {
        await plugin.hooks.beforePrompt(promptType, options);
      }
    }
  }

  /**
   * Execute afterPrompt hooks for all active plugins
   * 
   * @param {string} promptType - Type of prompt
   * @param {any} result - Prompt result
   */
  async executeAfterPrompt(promptType: string, result: any): Promise<void> {
    for (const plugin of this.getActivePlugins()) {
      if (plugin.hooks?.afterPrompt) {
        await plugin.hooks.afterPrompt(promptType, result);
      }
    }
  }

  /**
   * Apply plugin enhancements to kit instance
   * 
   * @param {any} kit - Kit instance to enhance
   */
  enhance(kit: any): void {
    for (const plugin of this.getActivePlugins()) {
      if (plugin.enhance) {
        plugin.enhance(kit);
      }
    }
  }

  /**
   * Get plugin context
   * 
   * @returns {PluginContext} The plugin context
   */
  getContext(): PluginContext {
    return this.context;
  }
}
/**
 * @module plugins/plugin
 * Plugin system for extending Kit functionality
 */

import type { Theme } from '../core/types.js';
import type { Prompt } from '../core/prompt.js';

/**
 * Plugin metadata
 */
export interface PluginMeta {
  /**
   * Unique plugin name
   */
  name: string;
  
  /**
   * Plugin version following semver
   */
  version: string;
  
  /**
   * Plugin description
   */
  description?: string;
  
  /**
   * Plugin author
   */
  author?: string;
  
  /**
   * Plugin dependencies (other plugin names)
   */
  dependencies?: string[];
}

/**
 * Component definition for plugins
 */
export interface ComponentDefinition<TValue = any, TOptions = any> {
  /**
   * Component name (used for registration)
   */
  name: string;
  
  /**
   * Component constructor or factory
   */
  create: (options: TOptions) => Prompt<TValue, TOptions>;
  
  /**
   * Shorthand factory function
   */
  factory?: (message: string, options?: TOptions) => Promise<TValue>;
}

/**
 * Plugin interface
 * 
 * @interface KitPlugin
 * @example
 * ```typescript
 * const emojiPlugin: KitPlugin = {
 *   name: 'emoji',
 *   version: '1.0.0',
 *   
 *   components: {
 *     emojiPicker: {
 *       name: 'emojiPicker',
 *       create: (options) => new EmojiPickerPrompt(options),
 *       factory: async (message, options) => {
 *         const prompt = new EmojiPickerPrompt({ message, ...options });
 *         return await prompt.prompt();
 *       }
 *     }
 *   },
 *   
 *   theme: {
 *     symbols: {
 *       success: '✅',
 *       error: '❌',
 *       warning: '⚠️',
 *       info: 'ℹ️'
 *     }
 *   },
 *   
 *   enhance: (kit) => {
 *     kit.emoji = (name: string) => emojiMap[name] || name;
 *   }
 * };
 * ```
 */
export interface KitPlugin extends PluginMeta {
  /**
   * Custom components provided by the plugin
   */
  components?: Record<string, ComponentDefinition>;
  
  /**
   * Theme modifications
   */
  theme?: Partial<Theme>;
  
  /**
   * Enhancement function to add methods to kit instance
   */
  enhance?: (kit: any) => void;
  
  /**
   * Lifecycle hooks
   */
  hooks?: {
    /**
     * Called when plugin is registered
     */
    onRegister?: () => void | Promise<void>;
    
    /**
     * Called when plugin is activated
     */
    onActivate?: () => void | Promise<void>;
    
    /**
     * Called when plugin is deactivated
     */
    onDeactivate?: () => void | Promise<void>;
    
    /**
     * Called before any prompt is shown
     */
    beforePrompt?: (promptType: string, options: any) => void | Promise<void>;
    
    /**
     * Called after any prompt completes
     */
    afterPrompt?: (promptType: string, result: any) => void | Promise<void>;
  };
  
  /**
   * Configuration options for the plugin
   */
  config?: Record<string, any>;
}

/**
 * Plugin context provided to plugins
 */
export interface PluginContext {
  /**
   * Kit version
   */
  version: string;
  
  /**
   * Available features
   */
  features: {
    tty: boolean;
    color: boolean;
    unicode: boolean;
  };
  
  /**
   * Registered plugins
   */
  plugins: Map<string, KitPlugin>;
  
  /**
   * Global configuration
   */
  config: Record<string, any>;
}
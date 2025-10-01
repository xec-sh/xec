/**
 * Script Context Enhancement
 * 
 * Provides enhanced context for script execution including $target,
 * global APIs, and utility functions.
 */

import { glob } from 'glob';
import * as path from 'path';
import { $ } from '@xec-sh/core';
import { prism } from '@xec-sh/kit';
import { minimatch } from 'minimatch';

import { tasks } from './task-api.js';
import { config } from './config-api.js';
import { targets } from './target-api.js';
import { createTargetEngine } from '../utils/direct-execution.js';

import type { Target, TargetInfo, ScriptInfo, ScriptGlobals } from './types.js';

export class ScriptContext {
  /**
   * Create a context for script execution
   * @param scriptPath - Path to the script
   * @param args - Script arguments
   * @param target - Optional target for execution
   */
  static async create(
    scriptPath: string,
    args: string[] = [],
    target?: Target
  ): Promise<ScriptGlobals> {
    // Create $target engine
    const $target = target
      ? await createTargetEngine(target)
      : $;

    // Create target info
    const $targetInfo: TargetInfo | undefined = target
      ? {
        type: target.type,
        name: target.name,
        host: target.type === 'ssh' ? (target.config as any).host : undefined,
        container: target.type === 'docker' ? (target.config as any).container : undefined,
        pod: target.type === 'kubernetes' ? (target.config as any).pod : undefined,
        namespace: target.type === 'kubernetes' ? (target.config as any).namespace : undefined,
        config: target.config
      }
      : undefined;

    // Load configuration
    await config.reload(); // Use reload to ensure we pick up the current directory

    // Get resolved variables
    const vars = config.get('vars') || {};
    const params = this.parseParams(args);

    // Create script info
    const scriptInfo: ScriptInfo = {
      path: scriptPath,
      args,
      target
    };

    // Return complete context
    return {
      // Execution context
      $target: $target as any,
      $targetInfo,
      $: $ as any,

      // Script metadata
      __filename: path.resolve(scriptPath),
      __dirname: path.dirname(path.resolve(scriptPath)),
      __script: scriptInfo,

      // Configuration access
      config,
      vars,
      params,

      // Task management
      tasks,
      targets,

      // Utilities
      prism,
      glob: (pattern: string) => glob(pattern),
      minimatch: (filePath: string, pattern: string) => minimatch(filePath, pattern)
    };
  }

  /**
   * Inject context into global scope for script execution
   * @param context - Script context
   */
  static inject(context: ScriptGlobals): void {
    // Inject into global scope
    const globalAny = global as any;

    for (const [key, value] of Object.entries(context)) {
      globalAny[key] = value;
    }
  }

  /**
   * Clean up injected context
   * @param context - Script context
   */
  static cleanup(context: ScriptGlobals): void {
    const globalAny = global as any;

    for (const key of Object.keys(context)) {
      delete globalAny[key];
    }
  }

  /**
   * Parse command-line parameters
   * @param args - Command-line arguments
   */
  private static parseParams(args: string[]): Record<string, any> {
    const params: Record<string, any> = {};

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (!arg) continue;

      // Handle --key=value
      if (arg.startsWith('--') && arg.includes('=')) {
        const [key, value] = arg.slice(2).split('=', 2);
        if (key && value !== undefined) {
          params[key] = this.parseValue(value);
        }
      }
      // Handle --key value
      else if (arg.startsWith('--') && i + 1 < args.length) {
        const key = arg.slice(2);
        const value = args[i + 1];
        if (value && !value.startsWith('-')) {
          params[key] = this.parseValue(value);
          i++; // Skip next arg
        } else {
          params[key] = true; // Boolean flag
        }
      }
      // Handle -k value
      else if (arg.startsWith('-') && arg.length === 2 && i + 1 < args.length) {
        const key = arg.slice(1);
        const value = args[i + 1];
        if (value && !value.startsWith('-')) {
          params[key] = this.parseValue(value);
          i++; // Skip next arg
        } else {
          params[key] = true; // Boolean flag
        }
      }
      // Handle boolean flags
      else if (arg.startsWith('-')) {
        const key = arg.startsWith('--') ? arg.slice(2) : arg.slice(1);
        params[key] = true;
      }
    }

    return params;
  }

  /**
   * Parse a parameter value
   * @param value - String value
   */
  private static parseValue(value: string): any {
    // Boolean
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Number
    if (/^-?\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    if (/^-?\d+\.\d+$/.test(value)) {
      return parseFloat(value);
    }

    // JSON
    if (value.startsWith('{') || value.startsWith('[')) {
      try {
        return JSON.parse(value);
      } catch {
        // Not valid JSON, return as string
      }
    }

    return value;
  }

  /**
   * Create a REPL context
   * @param target - Optional target for execution
   */
  static async createREPL(target?: Target): Promise<any> {
    const context = await this.create('repl', [], target);

    // Add additional REPL utilities
    const replContext = {
      ...context,
      // Add REPL-specific helpers
      help: () => {
        console.log(`
Available globals:
  $target    - Execute commands on the target
  $          - Execute commands locally
  config     - Configuration API
  tasks      - Task API
  targets    - Target API
  prism      - Terminal colors (chalk is aliased for backward compatibility)
  glob       - File globbing
  minimatch  - Pattern matching

Examples:
  await $target\`ls -la\`
  await tasks.run('build')
  const hosts = await targets.list('ssh')
        `);
      },

      clear: () => {
        process.stdout.write('\x1B[2J\x1B[0f');
      }
    };

    return replContext;
  }
}

/**
 * Execute a script with enhanced context
 * @param scriptPath - Path to script
 * @param args - Script arguments
 * @param target - Optional target
 */
export async function executeScript(
  scriptPath: string,
  args: string[] = [],
  target?: Target
): Promise<void> {
  // Create context
  const context = await ScriptContext.create(scriptPath, args, target);

  try {
    // Inject context
    ScriptContext.inject(context);

    // Import and execute script
    const scriptModule = await import(path.resolve(scriptPath));

    // Execute default export or main function
    if (typeof scriptModule.default === 'function') {
      await scriptModule.default(...args);
    } else if (typeof scriptModule.main === 'function') {
      await scriptModule.main(...args);
    } else if (typeof scriptModule === 'function') {
      await scriptModule(...args);
    }
  } finally {
    // Clean up context
    ScriptContext.cleanup(context);
  }
}
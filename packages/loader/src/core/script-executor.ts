/**
 * ScriptExecutor handles script file execution
 * @module @xec-sh/loader/core/script-executor
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type {
  ExecutionOptions,
  ExecutionResult,
  ScriptContext,
} from '../types/index.js';
import { ExecutionContext } from './execution-context.js';

/**
 * ScriptExecutor executes script files with context injection
 */
export class ScriptExecutor {
  /**
   * Execute a script file
   */
  async executeScript(
    scriptPath: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    try {
      // Resolve absolute path
      const absolutePath = path.resolve(scriptPath);

      // Check if file exists
      try {
        await fs.access(absolutePath);
      } catch {
        throw new Error(`Script file not found: ${scriptPath}`);
      }

      // Prepare script context
      const context: ScriptContext = options.context || {
        args: [],
        argv: [process.argv[0] || 'node', absolutePath],
        __filename: absolutePath,
        __dirname: path.dirname(absolutePath),
      };

      // Create execution context
      const execContext = new ExecutionContext({
        target: options.target,
        targetEngine: options.targetEngine,
        context,
        customGlobals: options.customGlobals,
        verbose: options.verbose,
        quiet: options.quiet,
      });

      // Execute script within context
      const result = await execContext.execute(async () => {
        // Convert path to file URL for import
        const fileURL = pathToFileURL(absolutePath).href;

        // Dynamic import with cache busting
        const cacheBuster = `?t=${Date.now()}`;
        await import(fileURL + cacheBuster);

        return {
          success: true,
        };
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Load a script module (for dynamic commands, etc.)
   */
  async loadScript(
    scriptPath: string,
    _options: ExecutionOptions = {}
  ): Promise<any> {
    const absolutePath = path.resolve(scriptPath);

    // Check if file exists
    try {
      await fs.access(absolutePath);
    } catch {
      throw new Error(`Script file not found: ${scriptPath}`);
    }

    // Convert to file URL
    const fileURL = pathToFileURL(absolutePath).href;

    // Import with cache busting
    const cacheBuster = `?t=${Date.now()}`;
    const module = await import(fileURL + cacheBuster);

    return module;
  }
}

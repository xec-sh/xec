/**
 * ScriptExecutor handles script file execution
 * @module @xec-sh/loader/core/script-executor
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { ExecutionContext } from './execution-context.js';

import type {
  ScriptContext,
  ExecutionResult,
  ExecutionOptions,
} from '../types/index.js';

/**
 * ScriptExecutor executes script files with context injection
 *
 * Provides a clean API for executing TypeScript/JavaScript scripts with
 * custom context and global variables. Supports target-aware execution
 * for local, SSH, Docker, and Kubernetes environments.
 *
 * @example
 * ```typescript
 * const executor = new ScriptExecutor();
 *
 * const result = await executor.executeScript('./deploy.ts', {
 *   context: {
 *     args: ['production'],
 *     argv: ['node', './deploy.ts', 'production'],
 *     __filename: path.resolve('./deploy.ts'),
 *     __dirname: process.cwd(),
 *   },
 *   customGlobals: {
 *     API_KEY: process.env.API_KEY,
 *   },
 * });
 *
 * if (result.success) {
 *   console.log('Deployment successful!');
 * } else {
 *   console.error('Deployment failed:', result.error);
 * }
 * ```
 */
export class ScriptExecutor {
  /**
   * Execute a script file with optional context and custom globals
   *
   * @param scriptPath - Path to the script file (absolute or relative)
   * @param options - Execution options
   * @returns Promise resolving to execution result
   *
   * @example
   * ```typescript
   * const result = await executor.executeScript('./script.ts', {
   *   context: {
   *     args: ['arg1', 'arg2'],
   *     argv: ['node', './script.ts', 'arg1', 'arg2'],
   *     __filename: path.resolve('./script.ts'),
   *     __dirname: process.cwd(),
   *   },
   *   customGlobals: {
   *     $target: targetEngine,
   *     API_URL: 'https://api.example.com',
   *   },
   *   verbose: true,
   * });
   * ```
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

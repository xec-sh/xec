/**
 * ScriptExecutor handles script file execution
 * @module @xec-sh/loader/core/script-executor
 */

import type {
  ScriptContext,
  ExecutionResult,
  ExecutionOptions,
} from '../types/index.js';

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { ExecutionContext } from './execution-context.js';

/**
 * A process-wide, monotonically increasing token appended to every dynamic
 * import URL so each load resolves to a fresh module.
 *
 * Node's ESM loader caches a module by its exact URL and never re-runs it, so a
 * stable URL makes a re-run — a watch reload, or the same script fanned out
 * across targets by `xec on` — silently reuse the first module instead of
 * executing again. `Date.now()` looks unique but collides when two loads land
 * in the same millisecond: two targets in a parallel run then shared one module
 * and one of them never actually ran. A counter cannot collide.
 *
 * The retention this creates is inherent, not a bug to fix here: Node keeps
 * every distinct URL in the registry for the life of the process and exposes no
 * way to evict it, so a long-lived watcher grows by one module per reload.
 * {@link streamExecute} runs the script in a child process and is the leak-free
 * path when a session reloads indefinitely.
 */
let loadCounter = 0;
function freshImportUrl(fileURL: string): string {
  return `${fileURL}?t=${(loadCounter += 1)}`;
}

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

        // A fresh URL per load, so a reload actually re-executes.
        await import(freshImportUrl(fileURL));

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

    // A fresh URL per load, so reloading a dynamic command re-executes it.
    const module = await import(freshImportUrl(fileURL));

    return module;
  }
}

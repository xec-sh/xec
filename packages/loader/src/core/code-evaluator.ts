/**
 * CodeEvaluator handles inline code evaluation
 * @module @xec-sh/loader/core/code-evaluator
 */

import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';

import type {
  ScriptContext,
  ExecutionResult,
  EvaluationOptions,
} from '../types/index.js';

import { ExecutionContext } from './execution-context.js';

/**
 * CodeEvaluator evaluates inline code strings
 */
export class CodeEvaluator {
  /**
   * Import a code string as an ES module and hand it to `use`.
   *
   * The code becomes a transient dot-file in the working directory, not a
   * `data:` URL. A `data:` URL has no place in the filesystem, so Node
   * refuses to resolve bare specifiers from it — `xec -e "await
   * import('lodash')"` failed in a project that had lodash installed, with
   * an error about URL schemes that pointed nowhere near the cause. From a
   * real file, resolution walks up from the working directory exactly as it
   * would for a script.
   *
   * The file is named from `randomBytes`, written 0600, and removed in
   * `finally`. When the directory is not writable the old `data:` URL is
   * used instead: code without imports still runs there, and code with
   * imports fails the way it always did rather than not at all.
   */
  private async importTransient<T>(code: string, use: (module: any) => Promise<T> | T): Promise<T> {
    const file = path.join(process.cwd(), `.xec-eval-${randomBytes(8).toString('hex')}.mjs`);

    let written = false;
    try {
      await fs.writeFile(file, code, { mode: 0o600, flag: 'wx' });
      written = true;
    } catch {
      const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
      return use(await import(dataUrl));
    }

    try {
      return await use(await import(pathToFileURL(file).href));
    } finally {
      if (written) {
        await fs.unlink(file).catch(() => {});
      }
    }
  }

  /**
   * Evaluate code string
   */
  async evaluateCode(
    code: string,
    options: EvaluationOptions = {}
  ): Promise<ExecutionResult> {
    try {
      // Prepare context
      const context: ScriptContext = options.context || {
        args: [],
        argv: ['xec', '<eval>'],
        __filename: '<eval>',
        __dirname: process.cwd(),
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

      // Execute code within context
      const result = await execContext.execute(async () => {
        await this.importTransient(code, () => undefined);

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
   * Evaluate code and return result value
   */
  async eval<T = any>(
    code: string,
    options: EvaluationOptions = {}
  ): Promise<T> {
    // Wrap code to return value as a function
    const wrappedCode = `
      export default async function __eval() {
        ${code}
      }
    `;

    const execContext = new ExecutionContext({
      target: options.target,
      targetEngine: options.targetEngine,
      context: options.context,
      customGlobals: options.customGlobals,
    });

    return execContext.execute(async () =>
      this.importTransient(wrappedCode, async module => (await module.default()) as T)
    );
  }
}

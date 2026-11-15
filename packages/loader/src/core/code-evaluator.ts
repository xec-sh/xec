/**
 * CodeEvaluator handles inline code evaluation
 * @module @xec-sh/loader/core/code-evaluator
 */

import type {
  ModuleExports,
  ScriptContext,
  ExecutionResult,
  EvaluationOptions,
} from '../types/index.js';

import { ExecutionContext } from './execution-context.js';
import { ModuleExecutor } from '../module/module-executor.js';

/**
 * CodeEvaluator evaluates inline code strings
 */
export class CodeEvaluator {
  /** Native execution and file ownership are shared with other in-memory modules. */
  private importTransient<T>(code: string, use: (module: ModuleExports) => Promise<T> | T): Promise<T> {
    return new ModuleExecutor(process.cwd()).withModule(
      { content: code, specifier: '<eval>', type: 'esm' },
      use,
    );
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
  async eval<T = unknown>(
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
      this.importTransient(wrappedCode, async module => {
        if (typeof module.default !== 'function') throw new TypeError('Inline module has no callable default export');
        return (await module.default()) as T;
      })
    );
  }
}

/**
 * CodeEvaluator handles inline code evaluation
 * @module @xec-sh/loader/core/code-evaluator
 */

import { ExecutionContext } from './execution-context.js';

import type {
  ScriptContext,
  ExecutionResult,
  EvaluationOptions,
} from '../types/index.js';

/**
 * CodeEvaluator evaluates inline code strings
 */
export class CodeEvaluator {
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
        // Create data URL from code
        const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

        // Dynamic import
        await import(dataUrl);

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

    const dataUrl = `data:text/javascript;base64,${Buffer.from(wrappedCode).toString('base64')}`;

    const execContext = new ExecutionContext({
      target: options.target,
      targetEngine: options.targetEngine,
      context: options.context,
      customGlobals: options.customGlobals,
    });

    return execContext.execute(async () => {
      const module = await import(dataUrl);
      // Call the function to get the result
      return await module.default();
    });
  }
}

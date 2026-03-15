/**
 * Script loader wrapper for backward compatibility
 * Delegates to @xec-sh/loader via loader-adapter
 */

import { getScriptLoader, type ExecutionOptions } from '../adapters/loader-adapter.js';

/**
 * Execute a script file
 */
export async function executeScript(
  scriptPath: string,
  options: ExecutionOptions = {}
): Promise<void> {
  const loader = getScriptLoader();
  const result = await loader.executeScript(scriptPath, options);

  if (!result.success && result.error) {
    throw result.error;
  }
}

/**
 * Evaluate code string
 */
export async function evaluateCode(
  code: string,
  options: ExecutionOptions = {}
): Promise<void> {
  const loader = getScriptLoader();
  const result = await loader.evaluateCode(code, options);

  if (!result.success && result.error) {
    throw result.error;
  }
}

/**
 * Start REPL
 */
export async function startRepl(options: ExecutionOptions = {}): Promise<void> {
  const loader = getScriptLoader();
  await loader.startRepl(options);
}

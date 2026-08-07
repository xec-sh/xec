import * as jsYaml from 'js-yaml';
import { prism } from '@xec-sh/kit';

import { ValidationError } from './validation.js';
import { UntrustedConfigError } from '../config/configuration-manager.js';
import { enhanceError, type ErrorContext, EnhancedExecutionError } from './enhanced-error.js';

/** Options relevant to error handling (subset of CLI command options) */
export interface CommandOptions {
  verbose?: boolean;
  quiet?: boolean;
  output?: 'text' | 'json' | 'yaml' | 'csv';
  dryRun?: boolean;
}

export interface ErrorDetails {
  code?: string;
  field?: string;
  suggestion?: string;
  documentation?: string;
}

export class XecError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: ErrorDetails
  ) {
    super(message);
    this.name = 'XecError';
  }
}

/**
 * A failure the user caused and the message fully explains.
 *
 * Most errors reach the handler as something the CLI did not anticipate, so
 * it wraps them: a code, a context block, a suggestion, a pointer to the
 * troubleshooting page. That machinery is what makes an unfamiliar failure
 * approachable — and what makes an anticipated one absurd. Naming a secret
 * that does not exist produced a message that said exactly what was wrong
 * and how to fix it, followed by `Code: UNKNOWN_ERROR` and the suggestion
 * "An unexpected error occurred", which is the tool contradicting itself in
 * consecutive lines.
 *
 * Throwing this says: the message is the whole story, print it and stop.
 */
export class UserError extends XecError {
  /**
   * Marks the class where `instanceof` cannot reach.
   *
   * The CLI resolves `@xec-sh/ops` to `dist` while its tests resolve `src`,
   * so the same class can exist twice in one process and `instanceof` then
   * answers false for a genuine instance.
   */
  readonly isUserError = true;

  /** The process exit code, when the failure implies a specific one. */
  readonly exitCode: number;

  constructor(message: string, options?: { exitCode?: number }) {
    super(message, 'USER_ERROR');
    this.name = 'UserError';
    this.exitCode = options?.exitCode ?? 1;
  }
}

/** Whether a failure explains itself. */
export function isUserError(error: unknown): error is UserError {
  return (
    error instanceof UserError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { isUserError?: unknown }).isUserError === true)
  );
}

export class ConfigurationError extends XecError {
  constructor(message: string, field?: string, suggestion?: string) {
    super(message, 'CONFIG_ERROR', { field, suggestion });
    this.name = 'ConfigurationError';
  }
}

export class ModuleError extends XecError {
  constructor(message: string, moduleName?: string, suggestion?: string) {
    super(message, 'MODULE_ERROR', { field: moduleName, suggestion });
    this.name = 'ModuleError';
  }
}

export class TaskError extends XecError {
  constructor(message: string, taskName?: string, suggestion?: string) {
    super(message, 'TASK_ERROR', { field: taskName, suggestion });
    this.name = 'TaskError';
  }
}

export class RecipeError extends XecError {
  constructor(message: string, recipeName?: string, suggestion?: string) {
    super(message, 'RECIPE_ERROR', { field: recipeName, suggestion });
    this.name = 'RecipeError';
  }
}

export class NetworkError extends XecError {
  constructor(message: string, url?: string, suggestion?: string) {
    super(message, 'NETWORK_ERROR', { field: url, suggestion });
    this.name = 'NetworkError';
  }
}

export class FileSystemError extends XecError {
  constructor(message: string, path?: string, suggestion?: string) {
    super(message, 'FILESYSTEM_ERROR', { field: path, suggestion });
    this.name = 'FileSystemError';
  }
}

export class TimeoutError extends XecError {
  constructor(message: string, operation?: string, suggestion?: string) {
    super(message, 'TIMEOUT_ERROR', { field: operation, suggestion });
    this.name = 'TimeoutError';
  }
}

/**
 * Handle errors and provide user-friendly messages
 */
export function handleError(error: any, options: CommandOptions): void {
  // A failure that explains itself is printed as written. Wrapping it in a
  // code, a context block and a generic suggestion buries the sentence the
  // reader needs under three the tool does not mean.
  if (isUserError(error)) {
    displayUserError(error, options);
    process.exit(getExitCode(error));
  }

  // Don't show errors in quiet mode unless it's critical
  if (options.quiet && !isCriticalError(error)) {
    process.exit(1);
  }

  // Enhance error with core system if not already enhanced
  const enhancedError = enhanceErrorWithContext(error, options);

  // Log detailed error info in debug mode
  if (process.env['XEC_DEBUG'] === '1' || process.env['XEC_DEBUG'] === 'true') {
    console.error(prism.red('\n=== DEBUG ERROR INFO ==='));
    console.error(prism.gray('Error type:'), error.constructor.name);
    console.error(prism.gray('Error code:'), error.code || 'none');
    console.error(prism.gray('Error message:'), error.message);
    if (error.path) console.error(prism.gray('Path:'), error.path);
    if (error.syscall) console.error(prism.gray('Syscall:'), error.syscall);
    if (error.stack) {
      console.error(prism.gray('\nStack trace:'));
      console.error(prism.gray(error.stack));
    }
    console.error(prism.red('======================\n'));
  }

  // Display error based on format
  if (options.output === 'json') {
    console.error(JSON.stringify(formatEnhancedErrorAsJSON(enhancedError), null, 2));
  } else if (options.output === 'yaml') {
    console.error(jsYaml.dump(formatEnhancedErrorAsJSON(enhancedError)));
  } else {
    displayEnhancedError(enhancedError, options);
  }

  // Exit with appropriate code
  process.exit(getExitCode(error));
}

/**
 * Check if error is critical (should be shown even in quiet mode)
 */
function isCriticalError(error: any): boolean {
  return error instanceof ValidationError ||
    error instanceof ConfigurationError ||
    error.code === 'MODULE_NOT_FOUND' ||
    error.code === 'PERMISSION_DENIED';
}

/**
 * Enhance error with CLI context
 */
function enhanceErrorWithContext(error: any, options: CommandOptions): EnhancedExecutionError {
  // Build context from CLI options and environment
  const context: ErrorContext = {
    cwd: process.cwd(),
    timestamp: new Date()
    // Note: adapter, host, container, env would come from specific command options
    // For now, we just use the base context
  };

  // If it's already an enhanced error, just add context
  if (error.context && error.suggestions) {
    Object.assign(error.context, context);
    return error;
  }

  // enhanceError() only recognises command, connection and timeout errors; a
  // validation failure or a bare errno falls through to its generic branch and
  // is reported as "An unexpected error occurred". Those are the CLI's most
  // common failures — a missing file, a permission denial, a refused
  // connection — so answer them specifically before handing over.
  // A refused configuration already carries the whole explanation: which
  // file, which commands, and how to approve them. Enhancing it would
  // replace that with "An unexpected error occurred", which is the tool
  // hiding the one thing the reader needs.
  if (error instanceof UntrustedConfigError) {
    return new EnhancedExecutionError(error.message, 'UNTRUSTED_CONFIG', context, []);
  }

  if (error instanceof ValidationError) {
    return new EnhancedExecutionError(error.message, error.code || 'VALIDATION_ERROR', context, [
      { message: getValidationSuggestion(error) },
    ]);
  }

  if (typeof error.code === 'string' && SYSTEM_ERROR_CODES.has(error.code)) {
    return new EnhancedExecutionError(error.message, error.code, context, [
      { message: getSystemErrorSuggestion(error) },
    ]);
  }

  // Enhance the error with core system
  return enhanceError(error, context) as EnhancedExecutionError;
}

/**
 * Print a failure that explains itself.
 *
 * The first line is the failure; anything after it is guidance the thrower
 * wrote, and it is indented already. Machine formats still get a document,
 * because a caller asking for JSON needs one whether the run succeeded or
 * not.
 *
 * @param error - The failure.
 * @param options - Output format and verbosity, as the command received them.
 */
function displayUserError(error: UserError, options: CommandOptions): void {
  if (options.output === 'json') {
    console.error(JSON.stringify({ error: true, message: error.message, code: 'USER_ERROR' }, null, 2));
    return;
  }

  if (options.output === 'yaml') {
    console.error(jsYaml.dump({ error: true, message: error.message, code: 'USER_ERROR' }));
    return;
  }

  const [first, ...rest] = error.message.split('\n');
  console.error(`${prism.red('✗')} ${first}`);
  for (const line of rest) {
    console.error(prism.dim(line));
  }
}

/**
 * Format enhanced error as JSON
 */
function formatEnhancedErrorAsJSON(error: EnhancedExecutionError): any {
  return {
    error: true,
    message: error.message,
    code: error.code || 'UNKNOWN_ERROR',
    timestamp: new Date().toISOString(),
    context: error.context,
    suggestions: error.suggestions,
    systemInfo: error.systemInfo,
    type: error.name
  };
}

/**
 * Display enhanced error in text format
 */
function displayEnhancedError(error: EnhancedExecutionError, options: CommandOptions): void {
  // Use the formatted output from enhanced error
  const formatted = error.format ? error.format(options.verbose) : error.message;

  // Split by lines and apply CLI coloring
  const lines = formatted.split('\n');

  lines.forEach(line => {
    if (!line) return; // Skip empty lines

    // Every line goes to stderr, including the message itself. It used to
    // go through kit's logger, which writes to stdout — so a diagnostic
    // arrived torn in half across two streams, and `xec ... -o json > out`
    // wrote the error text into the data file while its code and
    // suggestions went to the terminal.
    if (line.startsWith('Error:')) {
      console.error(prism.bold(prism.red(line)));
    } else if (line.includes('Context:') || line.includes('Suggestions:')) {
      console.error(prism.yellow(line));
    } else if (line.includes('Try:') || line.includes('See:')) {
      console.error(prism.cyan(line));
    } else if (line.includes('Code:')) {
      console.error(prism.gray(line));
    } else {
      console.error(line);
    }
  });

  // Add CLI-specific hints
  if (!options.verbose) {
    console.error('');
    console.error(prism.dim('Run with --verbose for more details'));
  }

  // No help pointer here. `error.context.command` is the command that
  // failed on the far side — `sleep 30`, `psql`, `systemctl` — and taking
  // its first word as a xec command produced advice like "Run 'xec docker
  // --help'" for a timeout in `xec in`, sending the reader to the wrong
  // manual. A wrong pointer costs more than no pointer.
}

/**
 * Get exit code based on error type
 */
function getExitCode(error: any): number {
  // A command that chose its own exit code keeps it. `exit 3` inside a
  // task means something to whoever wrote the task, and answering 1 for
  // every failure tells a caller only that something went wrong.
  if (typeof error?.exitCode === 'number' && Number.isInteger(error.exitCode) &&
      error.exitCode > 0 && error.exitCode < 256) {
    return error.exitCode;
  }

  if (error instanceof ValidationError) return 2;
  if (error instanceof ConfigurationError) return 3;
  if (error instanceof ModuleError) return 4;
  if (error instanceof TaskError) return 5;
  if (error instanceof RecipeError) return 6;
  if (error instanceof NetworkError) return 7;
  if (error instanceof FileSystemError) return 8;
  if (error instanceof TimeoutError) return 9;

  // System errors
  if (error.code === 'ENOENT') return 10;
  if (error.code === 'EACCES') return 11;
  if (error.code === 'ENOTDIR') return 12;
  if (error.code === 'EISDIR') return 13;

  return 1; // Generic error
}

/**
 * Get suggestion for validation errors
 */
function getValidationSuggestion(error: ValidationError): string {
  if (error.field === 'filePath') {
    return 'Check that the file path is correct and the file exists';
  }
  if (error.field === 'directoryPath') {
    return 'Check that the directory path is correct and the directory exists';
  }
  if (error.field === 'json') {
    return 'Ensure the JSON is properly formatted with matching quotes and brackets';
  }
  if (error.field === 'variables') {
    return 'Use JSON format like \'{"key": "value"}\' or key=value pairs';
  }
  if (error.field === 'timeout') {
    return 'Use formats like "30s", "5m", "1h" or number in milliseconds';
  }
  if (error.field === 'hostPattern') {
    return 'Use valid hostname, IP address, or wildcard pattern';
  }
  if (error.field === 'tagPattern') {
    return 'Use alphanumeric characters, dots, hyphens, and underscores only';
  }

  return 'Check the documentation for valid input formats';
}

/**
 * The errno codes {@link getSystemErrorSuggestion} answers specifically.
 *
 * Kept next to the switch so the two cannot drift: a code listed here without
 * a case would fall back to the generic advice, and a case missing from here
 * would never be reached.
 */
const SYSTEM_ERROR_CODES = new Set([
  'ENOENT',
  'EACCES',
  'ENOTDIR',
  'EISDIR',
  'EMFILE',
  'ENOMEM',
  'ENOSPC',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'EADDRINUSE',
]);

/**
 * Get suggestion for system errors
 */
function getSystemErrorSuggestion(error: any): string {
  switch (error.code) {
    case 'ENOENT':
      return 'Check that the file or directory exists';
    case 'EACCES':
      return 'Check file permissions or run with appropriate privileges';
    case 'ENOTDIR':
      return 'Path should point to a directory, not a file';
    case 'EISDIR':
      return `Path points to a directory but a file was expected${error.path ? ': ' + error.path : ''}. Check the command or script path.`;
    case 'EMFILE':
      return 'Too many open files. Try closing some applications';
    case 'ENOMEM':
      return 'Insufficient memory. Try freeing up system resources';
    case 'ENOSPC':
      return 'Insufficient disk space. Free up some disk space';
    case 'ETIMEDOUT':
      return 'Operation timed out. Try again or increase timeout';
    case 'ECONNREFUSED':
      return 'Connection refused. Check if the service is running';
    case 'EHOSTUNREACH':
      return 'Host unreachable. Check network connectivity';
    case 'EADDRINUSE':
      return 'Address already in use. Try using a different port';
    default:
      return 'Check system resources and try again';
  }
}

/**
 * Wrap async function with error handling
 */
export function withErrorHandling<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  options: CommandOptions
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error, options);
      throw error; // This won't be reached due to process.exit
    }
  };
}

/**
 * Create context-aware error
 */
export function createContextError(
  message: string,
  context: string,
  suggestion?: string
): XecError {
  return new XecError(message, 'CONTEXT_ERROR', {
    field: context,
    suggestion,
  });
}

/**
 * Create user-friendly error messages
 */
export const errorMessages = {
  fileNotFound: (path: string) => new FileSystemError(
    `File not found: ${path}`,
    path,
    'Check that the file path is correct and the file exists'
  ),

  directoryNotFound: (path: string) => new FileSystemError(
    `Directory not found: ${path}`,
    path,
    'Check that the directory path is correct and the directory exists'
  ),

  moduleNotFound: (name: string) => new ModuleError(
    `Module not found: ${name}`,
    name,
    'Check that the module is installed and the name is correct'
  ),

  taskNotFound: (name: string) => new TaskError(
    `Task not found: ${name}`,
    name,
    'Check that the task exists and is loaded from the correct module'
  ),

  recipeNotFound: (name: string) => new RecipeError(
    `Recipe not found: ${name}`,
    name,
    'Check that the recipe file exists and is in the correct location'
  ),

  configurationInvalid: (field: string, reason: string) => new ConfigurationError(
    `Invalid configuration for ${field}: ${reason}`,
    field,
    'Check the configuration file format and required fields'
  ),

  networkTimeout: (url: string) => new NetworkError(
    `Network timeout: ${url}`,
    url,
    'Check network connectivity and try again with a longer timeout'
  ),

  permissionDenied: (path: string) => new FileSystemError(
    `Permission denied: ${path}`,
    path,
    'Check file permissions or run with appropriate privileges'
  ),

  operationFailed: (operation: string, reason: string) => new XecError(
    `Operation failed: ${operation} - ${reason}`,
    'OPERATION_FAILED',
    { suggestion: 'Check the error details and try again' }
  ),

  resourceNotFound: (resource: string) => new XecError(
    `Resource not found: ${resource}`,
    'RESOURCE_NOT_FOUND',
    { suggestion: 'Check that the resource exists and is accessible' }
  ),

  invalidInput: (field: string, reason: string) => new ValidationError(
    `Invalid input for ${field}: ${reason}`,
    field
  ),
};
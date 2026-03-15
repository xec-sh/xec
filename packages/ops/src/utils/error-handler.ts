import jsYaml from 'js-yaml';
import { log, prism } from '@xec-sh/kit';

import { ValidationError } from './validation.js';
import { CommandOptions } from './command-base.js';
import { enhanceError, type ErrorContext, type EnhancedExecutionError } from './enhanced-error.js';

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
 * Extract structured error information
 */
function extractErrorInfo(error: any): any {
  const baseInfo = {
    error: true,
    message: error.message || 'Unknown error',
    timestamp: new Date().toISOString(),
  };

  if (error instanceof XecError) {
    return {
      ...baseInfo,
      type: error.name,
      code: error.code,
      field: error.details?.field,
      suggestion: error.details?.suggestion,
      documentation: error.details?.documentation,
    };
  }

  if (error instanceof ValidationError) {
    return {
      ...baseInfo,
      type: 'ValidationError',
      code: 'VALIDATION_ERROR',
      field: error.field,
      suggestion: getValidationSuggestion(error),
    };
  }

  // Node.js system errors
  if (error.code) {
    return {
      ...baseInfo,
      type: 'SystemError',
      code: error.code,
      path: error.path,
      syscall: error.syscall,
      suggestion: getSystemErrorSuggestion(error),
    };
  }

  // Generic error
  return {
    ...baseInfo,
    type: 'Error',
    stack: error.stack,
  };
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

  // Enhance the error with core system
  return enhanceError(error, context) as EnhancedExecutionError;
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
  const logger = log;

  lines.forEach(line => {
    if (!line) return; // Skip empty lines

    if (line.startsWith('Error:')) {
      logger.error(prism.bold(line));
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

  // Show help command for context
  if (error.context?.command) {
    const baseCommand = error.context.command.split(' ')[0];
    console.error(prism.dim(`Run 'xec ${baseCommand} --help' for usage information`));
  }
}

/**
 * Display error in text format (legacy)
 */
function displayTextError(errorInfo: any, options: CommandOptions): void {
  // Error header
  const logger = log;
  logger.error(prism.bold(errorInfo.message));

  // Error details
  if (errorInfo.field) {
    console.error(prism.gray(`Field: ${errorInfo.field}`));
  }

  if (errorInfo.code) {
    console.error(prism.gray(`Code: ${errorInfo.code}`));
  }

  // Suggestion
  if (errorInfo.suggestion) {
    console.error();
    console.error(prism.yellow('💡 Suggestion:'));
    console.error(prism.yellow(`   ${errorInfo.suggestion}`));
  }

  // Documentation link
  if (errorInfo.documentation) {
    console.error();
    console.error(prism.blue('📚 Documentation:'));
    console.error(prism.blue(`   ${errorInfo.documentation}`));
  }

  // Stack trace in verbose mode
  if (options.verbose && errorInfo.stack) {
    console.error();
    console.error(prism.gray('Stack trace:'));
    console.error(prism.gray(errorInfo.stack));
  }

  // Debug information
  if (options.verbose) {
    console.error();
    console.error(prism.gray('Debug information:'));
    console.error(prism.gray(`  Time: ${errorInfo.timestamp}`));
    console.error(prism.gray(`  Type: ${errorInfo.type}`));
    if (errorInfo.path) {
      console.error(prism.gray(`  Path: ${errorInfo.path}`));
    }
    if (errorInfo.syscall) {
      console.error(prism.gray(`  Syscall: ${errorInfo.syscall}`));
    }
  }
}

/**
 * Get exit code based on error type
 */
function getExitCode(error: any): number {
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
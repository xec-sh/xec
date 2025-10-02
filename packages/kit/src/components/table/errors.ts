/**
 * Table error handling utilities (Phase 4)
 *
 * Provides structured error types and error handling for table operations.
 */

/**
 * Table error codes
 */
export type TableErrorCode =
  | 'INVALID_DATA'
  | 'COLUMN_NOT_FOUND'
  | 'RENDER_ERROR'
  | 'STREAM_ERROR'
  | 'VALIDATION_ERROR'
  | 'EDIT_FAILED'
  | 'EXPORT_FAILED';

/**
 * Table error with context
 */
export class TableError extends Error {
  /** Error code for programmatic handling */
  code: TableErrorCode;

  /** Additional context about the error */
  context?: any;

  /** Whether this error is recoverable */
  recoverable: boolean;

  constructor(code: TableErrorCode, message: string, context?: any, recoverable: boolean = false) {
    super(message);
    this.name = 'TableError';
    this.code = code;
    this.context = context;
    this.recoverable = recoverable;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TableError);
    }
  }

  /**
   * Convert to JSON for logging/serialization
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      recoverable: this.recoverable,
      stack: this.stack,
    };
  }
}

/**
 * Create an invalid data error
 */
export function createInvalidDataError(message: string, context?: any): TableError {
  return new TableError('INVALID_DATA', message, context, false);
}

/**
 * Create a column not found error
 */
export function createColumnNotFoundError(columnKey: string, availableColumns: string[]): TableError {
  return new TableError(
    'COLUMN_NOT_FOUND',
    `Column "${columnKey}" not found`,
    { columnKey, availableColumns },
    false
  );
}

/**
 * Create a render error
 */
export function createRenderError(message: string, context?: any): TableError {
  return new TableError('RENDER_ERROR', message, context, true);
}

/**
 * Create a stream error
 */
export function createStreamError(message: string, context?: any): TableError {
  return new TableError('STREAM_ERROR', message, context, true);
}

/**
 * Create a validation error
 */
export function createValidationError(message: string, context?: any): TableError {
  return new TableError('VALIDATION_ERROR', message, context, true);
}

/**
 * Create an edit failed error
 */
export function createEditFailedError(message: string, context?: any): TableError {
  return new TableError('EDIT_FAILED', message, context, true);
}

/**
 * Create an export failed error
 */
export function createExportFailedError(message: string, context?: any): TableError {
  return new TableError('EXPORT_FAILED', message, context, true);
}

/**
 * Error handler function type
 */
export type TableErrorHandler = (error: TableError) => void;

/**
 * Safe execution wrapper that catches and converts errors
 */
export function safeExecute<T>(
  fn: () => T,
  errorCode: TableErrorCode,
  errorMessage?: string
): T | TableError {
  try {
    return fn();
  } catch (error) {
    if (error instanceof TableError) {
      return error;
    }

    const message = errorMessage || (error instanceof Error ? error.message : String(error));
    return new TableError(errorCode, message, { originalError: error }, true);
  }
}

/**
 * Async safe execution wrapper
 */
export async function safeExecuteAsync<T>(
  fn: () => Promise<T>,
  errorCode: TableErrorCode,
  errorMessage?: string
): Promise<T | TableError> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof TableError) {
      return error;
    }

    const message = errorMessage || (error instanceof Error ? error.message : String(error));
    return new TableError(errorCode, message, { originalError: error }, true);
  }
}

/**
 * Check if value is a TableError
 */
export function isTableError(value: any): value is TableError {
  return value instanceof TableError;
}

/**
 * Check if error is recoverable
 */
export function isRecoverableError(error: TableError): boolean {
  return error.recoverable;
}

/**
 * Format error for display
 */
export function formatError(error: TableError): string {
  const parts = [`[${error.code}] ${error.message}`];

  if (error.context) {
    parts.push(`Context: ${JSON.stringify(error.context)}`);
  }

  if (error.recoverable) {
    parts.push('(Recoverable)');
  }

  return parts.join(' ');
}

/**
 * Error recovery strategies
 */
export const ErrorRecovery = {
  /**
   * Retry operation with exponential backoff
   */
  async retry<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    delayMs: number = 100
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
        }
      }
    }

    throw lastError;
  },

  /**
   * Fallback to default value on error
   */
  withFallback<T>(fn: () => T, fallback: T): T {
    try {
      return fn();
    } catch {
      return fallback;
    }
  },

  /**
   * Log and swallow error
   */
  swallow(fn: () => void, logger?: (error: Error) => void): void {
    try {
      fn();
    } catch (error) {
      if (logger && error instanceof Error) {
        logger(error);
      }
    }
  },
};

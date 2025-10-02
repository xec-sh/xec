/**
 * Tests for table error handling (Phase 4)
 */

import { describe, it, expect } from 'vitest';
import {
  TableError,
  createInvalidDataError,
  createColumnNotFoundError,
  createRenderError,
  createStreamError,
  createValidationError,
  createEditFailedError,
  createExportFailedError,
  safeExecute,
  safeExecuteAsync,
  isTableError,
  isRecoverableError,
  formatError,
  ErrorRecovery,
} from '../src/components/table/errors.js';

describe('table-errors', () => {
  describe('TableError', () => {
    it('should create error with code and message', () => {
      const error = new TableError('INVALID_DATA', 'Invalid table data');

      expect(error.code).toBe('INVALID_DATA');
      expect(error.message).toBe('Invalid table data');
      expect(error.recoverable).toBe(false);
    });

    it('should include context', () => {
      const context = { rowIndex: 5, columnKey: 'name' };
      const error = new TableError('VALIDATION_ERROR', 'Validation failed', context, true);

      expect(error.context).toEqual(context);
      expect(error.recoverable).toBe(true);
    });

    it('should serialize to JSON', () => {
      const error = new TableError('RENDER_ERROR', 'Render failed', { detail: 'test' }, true);
      const json = error.toJSON();

      expect(json.name).toBe('TableError');
      expect(json.code).toBe('RENDER_ERROR');
      expect(json.message).toBe('Render failed');
      expect(json.context).toEqual({ detail: 'test' });
      expect(json.recoverable).toBe(true);
      expect(json.stack).toBeDefined();
    });
  });

  describe('Error factory functions', () => {
    it('should create invalid data error', () => {
      const error = createInvalidDataError('Data is not an array');

      expect(error.code).toBe('INVALID_DATA');
      expect(error.message).toBe('Data is not an array');
      expect(error.recoverable).toBe(false);
    });

    it('should create column not found error', () => {
      const error = createColumnNotFoundError('age', ['id', 'name', 'email']);

      expect(error.code).toBe('COLUMN_NOT_FOUND');
      expect(error.message).toBe('Column "age" not found');
      expect(error.context).toEqual({
        columnKey: 'age',
        availableColumns: ['id', 'name', 'email'],
      });
    });

    it('should create render error', () => {
      const error = createRenderError('Failed to render table');

      expect(error.code).toBe('RENDER_ERROR');
      expect(error.recoverable).toBe(true);
    });

    it('should create stream error', () => {
      const error = createStreamError('Stream closed unexpectedly');

      expect(error.code).toBe('STREAM_ERROR');
      expect(error.recoverable).toBe(true);
    });

    it('should create validation error', () => {
      const error = createValidationError('Email is invalid');

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.recoverable).toBe(true);
    });

    it('should create edit failed error', () => {
      const error = createEditFailedError('Cannot edit readonly column');

      expect(error.code).toBe('EDIT_FAILED');
      expect(error.recoverable).toBe(true);
    });

    it('should create export failed error', () => {
      const error = createExportFailedError('Cannot export to CSV');

      expect(error.code).toBe('EXPORT_FAILED');
      expect(error.recoverable).toBe(true);
    });
  });

  describe('safeExecute', () => {
    it('should return value on success', () => {
      const result = safeExecute(() => 42, 'RENDER_ERROR');

      expect(result).toBe(42);
    });

    it('should catch and convert errors', () => {
      const result = safeExecute(
        () => {
          throw new Error('Something went wrong');
        },
        'RENDER_ERROR',
        'Custom error message'
      );

      expect(isTableError(result)).toBe(true);
      if (isTableError(result)) {
        expect(result.code).toBe('RENDER_ERROR');
        expect(result.message).toBe('Custom error message');
      }
    });

    it('should preserve TableError', () => {
      const originalError = createValidationError('Invalid value');

      const result = safeExecute(() => {
        throw originalError;
      }, 'RENDER_ERROR');

      expect(result).toBe(originalError);
    });
  });

  describe('safeExecuteAsync', () => {
    it('should return value on success', async () => {
      const result = await safeExecuteAsync(async () => 42, 'STREAM_ERROR');

      expect(result).toBe(42);
    });

    it('should catch and convert async errors', async () => {
      const result = await safeExecuteAsync(
        async () => {
          throw new Error('Async error');
        },
        'STREAM_ERROR',
        'Stream failed'
      );

      expect(isTableError(result)).toBe(true);
      if (isTableError(result)) {
        expect(result.code).toBe('STREAM_ERROR');
        expect(result.message).toBe('Stream failed');
      }
    });
  });

  describe('isTableError', () => {
    it('should identify TableError', () => {
      const error = new TableError('INVALID_DATA', 'Test');

      expect(isTableError(error)).toBe(true);
      expect(isTableError(new Error('Regular error'))).toBe(false);
      expect(isTableError('not an error')).toBe(false);
    });
  });

  describe('isRecoverableError', () => {
    it('should check if error is recoverable', () => {
      const recoverableError = new TableError('VALIDATION_ERROR', 'Test', undefined, true);
      const fatalError = new TableError('INVALID_DATA', 'Test', undefined, false);

      expect(isRecoverableError(recoverableError)).toBe(true);
      expect(isRecoverableError(fatalError)).toBe(false);
    });
  });

  describe('formatError', () => {
    it('should format error for display', () => {
      const error = new TableError(
        'VALIDATION_ERROR',
        'Value is required',
        { field: 'email' },
        true
      );

      const formatted = formatError(error);

      expect(formatted).toContain('[VALIDATION_ERROR]');
      expect(formatted).toContain('Value is required');
      expect(formatted).toContain('Context:');
      expect(formatted).toContain('(Recoverable)');
    });

    it('should format error without context', () => {
      const error = new TableError('RENDER_ERROR', 'Render failed');

      const formatted = formatError(error);

      expect(formatted).toBe('[RENDER_ERROR] Render failed');
    });
  });

  describe('ErrorRecovery', () => {
    describe('retry', () => {
      it('should succeed on first attempt', async () => {
        let attempts = 0;
        const result = await ErrorRecovery.retry(async () => {
          attempts++;
          return 42;
        });

        expect(result).toBe(42);
        expect(attempts).toBe(1);
      });

      it('should retry on failure', async () => {
        let attempts = 0;

        const result = await ErrorRecovery.retry(
          async () => {
            attempts++;
            if (attempts < 3) {
              throw new Error('Temporary failure');
            }
            return 'success';
          },
          3,
          10
        );

        expect(result).toBe('success');
        expect(attempts).toBe(3);
      });

      it('should throw after max attempts', async () => {
        let attempts = 0;

        await expect(
          ErrorRecovery.retry(
            async () => {
              attempts++;
              throw new Error('Always fails');
            },
            3,
            10
          )
        ).rejects.toThrow('Always fails');

        expect(attempts).toBe(3);
      });
    });

    describe('withFallback', () => {
      it('should return value on success', () => {
        const result = ErrorRecovery.withFallback(() => 42, 0);

        expect(result).toBe(42);
      });

      it('should return fallback on error', () => {
        const result = ErrorRecovery.withFallback(() => {
          throw new Error('Failed');
        }, 'fallback');

        expect(result).toBe('fallback');
      });
    });

    describe('swallow', () => {
      it('should execute function without error', () => {
        let executed = false;

        ErrorRecovery.swallow(() => {
          executed = true;
        });

        expect(executed).toBe(true);
      });

      it('should swallow errors', () => {
        let executed = false;

        ErrorRecovery.swallow(() => {
          executed = true;
          throw new Error('Test error');
        });

        expect(executed).toBe(true);
      });

      it('should log errors if logger provided', () => {
        let loggedError: Error | undefined;

        ErrorRecovery.swallow(
          () => {
            throw new Error('Test error');
          },
          (error) => {
            loggedError = error;
          }
        );

        expect(loggedError).toBeDefined();
        expect(loggedError?.message).toBe('Test error');
      });
    });
  });
});

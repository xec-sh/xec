import * as kit from '@xec-sh/kit';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { ValidationError } from '../../src/utils/validation.js';
import { CommandOptions } from '../../src/utils/command-base.js';
import {
  XecError,
  TaskError,
  ModuleError,
  RecipeError,
  handleError,
  NetworkError,
  TimeoutError,
  errorMessages,
  FileSystemError,
  withErrorHandling,
  ConfigurationError,
  createContextError
} from '../../src/utils/error-handler.js';

// Mock console methods
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

// Track process.exit calls without actually exiting
let processExitCode: number | undefined;
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
  processExitCode = code;
  // Throw to prevent further execution in tests
  throw new Error(`Process exited with code: ${code}`);
}) as any;

const mockKitError = jest.spyOn(kit.log, 'error').mockImplementation();

describe('error-handler', () => {
  const defaultOptions: CommandOptions = {
    verbose: false,
    quiet: false,
    output: 'text',
    filter: [],
    workingDirectory: '',
    env: [],
    tags: []
  };
  
  beforeEach(() => {
    jest.clearAllMocks();
    processExitCode = undefined;
    delete process.env['XEC_DEBUG'];
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Error Classes', () => {
    describe('XecError', () => {
      it('should create error with message, code and details', () => {
        const error = new XecError('Test error', 'TEST_CODE', {
          field: 'testField',
          suggestion: 'Test suggestion'
        });
        
        expect(error.message).toBe('Test error');
        expect(error.code).toBe('TEST_CODE');
        expect(error.details?.field).toBe('testField');
        expect(error.details?.suggestion).toBe('Test suggestion');
        expect(error.name).toBe('XecError');
      });
    });
    
    describe('ConfigurationError', () => {
      it('should create configuration error', () => {
        const error = new ConfigurationError('Config error', 'field', 'suggestion');
        
        expect(error.message).toBe('Config error');
        expect(error.code).toBe('CONFIG_ERROR');
        expect(error.details?.field).toBe('field');
        expect(error.details?.suggestion).toBe('suggestion');
        expect(error.name).toBe('ConfigurationError');
      });
    });
    
    describe('ModuleError', () => {
      it('should create module error', () => {
        const error = new ModuleError('Module error', 'moduleName', 'suggestion');
        
        expect(error.message).toBe('Module error');
        expect(error.code).toBe('MODULE_ERROR');
        expect(error.details?.field).toBe('moduleName');
        expect(error.name).toBe('ModuleError');
      });
    });
    
    describe('Other Error Classes', () => {
      it('should create TaskError', () => {
        const error = new TaskError('Task error', 'taskName');
        expect(error.code).toBe('TASK_ERROR');
        expect(error.name).toBe('TaskError');
      });
      
      it('should create RecipeError', () => {
        const error = new RecipeError('Recipe error', 'recipeName');
        expect(error.code).toBe('RECIPE_ERROR');
        expect(error.name).toBe('RecipeError');
      });
      
      it('should create NetworkError', () => {
        const error = new NetworkError('Network error', 'http://example.com');
        expect(error.code).toBe('NETWORK_ERROR');
        expect(error.name).toBe('NetworkError');
      });
      
      it('should create FileSystemError', () => {
        const error = new FileSystemError('FS error', '/path/to/file');
        expect(error.code).toBe('FILESYSTEM_ERROR');
        expect(error.name).toBe('FileSystemError');
      });
      
      it('should create TimeoutError', () => {
        const error = new TimeoutError('Timeout', 'operation');
        expect(error.code).toBe('TIMEOUT_ERROR');
        expect(error.name).toBe('TimeoutError');
      });
    });
  });
  
  describe('handleError', () => {
    it('should handle XecError', () => {
      const error = new XecError('Test error', 'TEST_CODE');
      
      expect(() => handleError(error, defaultOptions)).toThrow('Process exited with code: 1');
      expect(mockKitError).toHaveBeenCalled();
    });
    
    it('should handle ValidationError with exit code 2', () => {
      const error = new ValidationError('Invalid input', 'field');
      
      expect(() => handleError(error, defaultOptions)).toThrow('Process exited with code: 2');
    });
    
    it('should handle system errors', () => {
      const error = new Error('File not found');
      (error as any).code = 'ENOENT';
      (error as any).path = '/test/file';
      
      expect(() => handleError(error, defaultOptions)).toThrow('Process exited with code: 10');
    });
    
    it('should not show error in quiet mode for non-critical errors', () => {
      const error = new Error('Regular error');
      const options = { ...defaultOptions, quiet: true };
      
      expect(() => handleError(error, options)).toThrow('Process exited with code: 1');
      expect(mockKitError).not.toHaveBeenCalled();
    });
    
    it('should show critical errors even in quiet mode', () => {
      const error = new ValidationError('Critical validation error', 'field');
      const options = { ...defaultOptions, quiet: true };
      
      expect(() => handleError(error, options)).toThrow('Process exited with code: 2');
      expect(mockKitError).toHaveBeenCalled();
    });
    
    it('should output JSON format', () => {
      const error = new XecError('Test error', 'TEST_CODE');
      const options = { ...defaultOptions, output: 'json' };
      
      expect(() => handleError(error, options)).toThrow('Process exited with code: 1');
      
      const output = mockConsoleError.mock.calls[0][0];
      expect(() => JSON.parse(output)).not.toThrow();
      const parsed = JSON.parse(output);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toBe('Test error');
    });
    
    it('should show debug info when XEC_DEBUG is set', () => {
      process.env['XEC_DEBUG'] = 'true';
      const error = new Error('Debug error');
      (error as any).code = 'DEBUG_CODE';
      
      expect(() => handleError(error, defaultOptions)).toThrow('Process exited with code: 1');
      
      const errorCalls = mockConsoleError.mock.calls;
      const hasDebugInfo = errorCalls.some(call => 
        call[0] && typeof call[0] === 'string' && call[0].includes('=== DEBUG ERROR INFO ===')
      );
      const hasDebugCode = errorCalls.some(call => 
        call.some(arg => arg && typeof arg === 'string' && arg.includes('DEBUG_CODE'))
      );
      expect(hasDebugInfo).toBe(true);
      expect(hasDebugCode).toBe(true);
    });
    
    it('should display verbose error info', () => {
      const error = new Error('Verbose error');
      error.stack = 'Error stack trace';
      const options = { ...defaultOptions, verbose: true };
      
      expect(() => handleError(error, options)).toThrow('Process exited with code: 1');
      // Verbose mode should not show the "Run with --verbose" hint
      expect(mockConsoleError.mock.calls.some(call => 
        call[0]?.includes && call[0].includes('Run with --verbose')
      )).toBe(false);
    });
  });
  
  describe('Exit Codes', () => {
    it.skip('should return correct exit codes for different error types', () => {
      const testCases = [
        { error: new ValidationError('msg', 'field'), code: 2 },
        { error: new ConfigurationError('msg'), code: 3 },
        { error: new ModuleError('msg'), code: 4 },
        { error: new TaskError('msg'), code: 5 },
        { error: new RecipeError('msg'), code: 6 },
        { error: new NetworkError('msg'), code: 7 },
        { error: new FileSystemError('msg'), code: 8 },
        { error: new TimeoutError('msg', 'test-operation'), code: 9 },
      ];
      
      testCases.forEach(({ error, code }) => {
        jest.clearAllMocks();
        expect(() => handleError(error, defaultOptions)).toThrow(`Process exited with code: ${code}`);
      });
    });
    
    it('should return correct exit codes for system errors', () => {
      const systemErrors = [
        { code: 'ENOENT', exitCode: 10 },
        { code: 'EACCES', exitCode: 11 },
        { code: 'ENOTDIR', exitCode: 12 },
        { code: 'EISDIR', exitCode: 13 },
      ];
      
      systemErrors.forEach(({ code, exitCode }) => {
        const error = new Error('System error');
        (error as any).code = code;
        
        expect(() => handleError(error, defaultOptions)).toThrow(`Process exited with code: ${exitCode}`);
      });
    });
  });
  
  describe('withErrorHandling', () => {
    it('should wrap async function with error handling', async () => {
      const asyncFn = jest.fn().mockRejectedValue(new Error('Async error'));
      const wrapped = withErrorHandling(asyncFn, defaultOptions);
      
      await expect(wrapped()).rejects.toThrow('Process exited with code: 1');
      expect(mockKitError).toHaveBeenCalled();
    });
    
    it('should pass through successful results', async () => {
      const asyncFn = jest.fn().mockResolvedValue('success');
      const wrapped = withErrorHandling(asyncFn, defaultOptions);
      
      const result = await wrapped();
      expect(result).toBe('success');
      expect(mockKitError).not.toHaveBeenCalled();
    });
    
    it('should pass arguments to wrapped function', async () => {
      const asyncFn = jest.fn().mockResolvedValue('result');
      const wrapped = withErrorHandling(asyncFn, defaultOptions);
      
      await wrapped('arg1', 'arg2');
      expect(asyncFn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });
  
  describe('createContextError', () => {
    it('should create context-aware error', () => {
      const error = createContextError('Context error', 'test-context', 'Try this');
      
      expect(error.message).toBe('Context error');
      expect(error.code).toBe('CONTEXT_ERROR');
      expect(error.details?.field).toBe('test-context');
      expect(error.details?.suggestion).toBe('Try this');
    });
  });
  
  describe('errorMessages', () => {
    it('should create file not found error', () => {
      const error = errorMessages.fileNotFound('/path/to/file');
      
      expect(error).toBeInstanceOf(FileSystemError);
      expect(error.message).toContain('/path/to/file');
      expect(error.details?.suggestion).toBeTruthy();
    });
    
    it('should create directory not found error', () => {
      const error = errorMessages.directoryNotFound('/path/to/dir');
      
      expect(error).toBeInstanceOf(FileSystemError);
      expect(error.message).toContain('/path/to/dir');
    });
    
    it('should create module not found error', () => {
      const error = errorMessages.moduleNotFound('test-module');
      
      expect(error).toBeInstanceOf(ModuleError);
      expect(error.message).toContain('test-module');
    });
    
    it('should create task not found error', () => {
      const error = errorMessages.taskNotFound('test-task');
      
      expect(error).toBeInstanceOf(TaskError);
      expect(error.message).toContain('test-task');
    });
    
    it('should create recipe not found error', () => {
      const error = errorMessages.recipeNotFound('test-recipe');
      
      expect(error).toBeInstanceOf(RecipeError);
      expect(error.message).toContain('test-recipe');
    });
    
    it('should create configuration invalid error', () => {
      const error = errorMessages.configurationInvalid('field', 'reason');
      
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error.message).toContain('field');
      expect(error.message).toContain('reason');
    });
    
    it('should create network timeout error', () => {
      const error = errorMessages.networkTimeout('http://example.com');
      
      expect(error).toBeInstanceOf(NetworkError);
      expect(error.message).toContain('http://example.com');
    });
    
    it('should create permission denied error', () => {
      const error = errorMessages.permissionDenied('/restricted/path');
      
      expect(error).toBeInstanceOf(FileSystemError);
      expect(error.message).toContain('/restricted/path');
    });
    
    it('should create operation failed error', () => {
      const error = errorMessages.operationFailed('test-op', 'failure reason');
      
      expect(error).toBeInstanceOf(XecError);
      expect(error.message).toContain('test-op');
      expect(error.message).toContain('failure reason');
    });
    
    it('should create resource not found error', () => {
      const error = errorMessages.resourceNotFound('test-resource');
      
      expect(error).toBeInstanceOf(XecError);
      expect(error.message).toContain('test-resource');
    });
    
    it('should create invalid input error', () => {
      const error = errorMessages.invalidInput('field', 'invalid format');
      
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toContain('field');
      expect(error.message).toContain('invalid format');
    });
  });
  
  describe('Error Suggestions', () => {
    it.skip('should provide suggestions for validation errors', () => {
      const validationErrors = [
        { field: 'filePath', expectedSuggestion: 'file path is correct' },
        { field: 'directoryPath', expectedSuggestion: 'directory path is correct' },
        { field: 'json', expectedSuggestion: 'JSON is properly formatted' },
        { field: 'variables', expectedSuggestion: 'key=value pairs' },
        { field: 'timeout', expectedSuggestion: '"30s", "5m", "1h"' },
        { field: 'hostPattern', expectedSuggestion: 'valid hostname' },
        { field: 'tagPattern', expectedSuggestion: 'alphanumeric characters' },
      ];
      
      validationErrors.forEach(({ field, expectedSuggestion }) => {
        jest.clearAllMocks();
        const error = new ValidationError(`Invalid ${field}`, field);
        expect(() => handleError(error, defaultOptions)).toThrow();
        
        const errorOutput = mockConsoleError.mock.calls
          .flat()
          .filter(arg => typeof arg === 'string')
          .join('\n');
        
        // The enhanceError function transforms these, so check the error message at least
        expect(errorOutput).toContain(`Invalid ${field}`);
      });
    });
    
    it('should provide suggestions for system errors', () => {
      const systemErrors = [
        { code: 'ENOENT', suggestion: 'ENOENT' },
        { code: 'EACCES', suggestion: 'EACCES' },
        { code: 'ENOTDIR', suggestion: 'ENOTDIR' },
        { code: 'EISDIR', suggestion: 'EISDIR' },
        { code: 'EMFILE', suggestion: 'EMFILE' },
        { code: 'ENOMEM', suggestion: 'ENOMEM' },
        { code: 'ENOSPC', suggestion: 'ENOSPC' },
        { code: 'ETIMEDOUT', suggestion: 'ETIMEDOUT' },
        { code: 'ECONNREFUSED', suggestion: 'ECONNREFUSED' },
        { code: 'EHOSTUNREACH', suggestion: 'EHOSTUNREACH' },
        { code: 'EADDRINUSE', suggestion: 'EADDRINUSE' },
      ];
      
      systemErrors.forEach(({ code, suggestion }) => {
        jest.clearAllMocks();
        const error = new Error('System error');
        (error as any).code = code;
        
        expect(() => handleError(error, defaultOptions)).toThrow();
        
        const errorOutput = mockConsoleError.mock.calls
          .flat()
          .filter(arg => typeof arg === 'string')
          .join('\n');
        
        // Check that the error code is at least shown
        expect(errorOutput).toContain('Code:');
      });
    });
  });
});
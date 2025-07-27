import { it, jest, expect, describe } from '@jest/globals';

import { 
  pipe, 
  retry, 
  within,
  parallel, 
  Pipeline, 
  withinSync, 
  RetryError,
  ParallelEngine,
  type RetryOptions,
  type PipelineOptions
} from '../../src/index.js';

describe('Utility Exports', () => {
  it('should export pipe function', () => {
    expect(pipe).toBeDefined();
    expect(typeof pipe).toBe('function');
  });
  
  it('should export parallel function and ParallelEngine class', () => {
    expect(parallel).toBeDefined();
    expect(typeof parallel).toBe('function');
    
    expect(ParallelEngine).toBeDefined();
    expect(typeof ParallelEngine).toBe('function'); // Classes are functions in JS
  });
  
  it('should export within and withinSync functions', () => {
    expect(within).toBeDefined();
    expect(typeof within).toBe('function');
    
    expect(withinSync).toBeDefined();
    expect(typeof withinSync).toBe('function');
  });
  
  it('should export Pipeline class', () => {
    expect(Pipeline).toBeDefined();
    expect(typeof Pipeline).toBe('function'); // Classes are functions in JS
  });
  
  it('should export retry function (withExecutionRetry)', () => {
    expect(retry).toBeDefined();
    expect(typeof retry).toBe('function');
  });
  
  it('should export RetryError class', () => {
    expect(RetryError).toBeDefined();
    expect(typeof RetryError).toBe('function');
    
    // Test that it can be instantiated
    const mockResult = { exitCode: 1, stdout: '', stderr: 'error' } as any;
    const error = new RetryError('Test error', 3, mockResult, [mockResult]);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RetryError);
  });
  
  it('should have proper function signatures', () => {
    // Check function lengths (number of required parameters)
    expect(pipe.length).toBe(2); // pipe(from, to)
    expect(parallel.length).toBe(2); // parallel(commands, engine)
    expect(within.length).toBe(2); // within(store, fn)
    expect(withinSync.length).toBe(2); // withinSync(store, fn)
    expect(retry.length).toBe(1); // retry(fn, options) - options has default
  });
  
  it('should export utility types', () => {
    // Types are compile-time only, but we can check they don't break imports
    const testRetryOptions: RetryOptions = {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 60000,
      backoffMultiplier: 2,
      jitter: true
    };
    
    const testPipelineOptions: PipelineOptions = {
      stopOnError: true,
      collectResults: false,
      concurrency: 5
    };
    
    // These are just to use the variables and avoid TS unused variable errors
    expect(testRetryOptions).toBeDefined();
    expect(testPipelineOptions).toBeDefined();
  });
  
  describe('Integration', () => {
    it('should be able to create a Pipeline instance', () => {
      // Pipeline requires an engine parameter
      const mockEngine = { 
        run: jest.fn(),
        with: jest.fn()
      } as any;
      
      const pipeline = new Pipeline(mockEngine);
      expect(pipeline).toBeInstanceOf(Pipeline);
    });
    
    it('should be able to create a ParallelEngine instance', () => {
      // ParallelEngine requires an engine parameter
      const mockEngine = { 
        run: jest.fn(),
        with: jest.fn()
      } as any;
      
      const parallelEngine = new ParallelEngine(mockEngine);
      expect(parallelEngine).toBeInstanceOf(ParallelEngine);
    });
  });
});
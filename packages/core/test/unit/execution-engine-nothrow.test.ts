import { it, expect, describe } from '@jest/globals';

import { ExecutionEngine, createCallableEngine } from '../../src/index.js';

describe('ExecutionEngine throwOnNonZeroExit configuration', () => {
  it('should not throw when throwOnNonZeroExit is false', async () => {
    const engine = new ExecutionEngine({ throwOnNonZeroExit: false });
    const $ = createCallableEngine(engine);
    
    // Test with a simple command that exits with non-zero code
    const result = await $`sh -c "exit 42"`;
    
    expect(result.exitCode).toBe(42);
    expect(result.ok).toBe(false);
    expect(result.stdout).toBe('');
  });

  it('should throw when throwOnNonZeroExit is true (default)', async () => {
    const engine = new ExecutionEngine({ throwOnNonZeroExit: true });
    const $ = createCallableEngine(engine);
    
    let error: any;
    try {
      await $`sh -c "exit 42"`;
    } catch (e) {
      error = e;
    }
    
    expect(error).toBeDefined();
    expect(error.message).toContain('exit code 42');
  });

  it('should propagate throwOnNonZeroExit to adapter', async () => {
    const engine = new ExecutionEngine({ throwOnNonZeroExit: false });
    const adapter = engine.getAdapter('local');
    
    expect(adapter?.getConfig().throwOnNonZeroExit).toBe(false);
  });

  it('should respect default throwOnNonZeroExit value', async () => {
    const engine = new ExecutionEngine({});
    const adapter = engine.getAdapter('local');
    
    expect(adapter?.getConfig().throwOnNonZeroExit).toBe(true);
  });
});
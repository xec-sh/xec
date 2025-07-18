import { it, expect, describe } from '@jest/globals';

import { $ } from '../../src/index.js';

describe('Original Issue Verification', () => {
  it('should work with original README example: await $`sleep 10`.timeout(5000)', async () => {
    // This is the exact example from the README that was failing
    // We use sleep 0.1 to make the test faster
    const result = await $`sleep 0.1`.timeout(5000);
    
    expect(result.exitCode).toBe(0);
    expect(typeof result.stdout).toBe('string');
    expect(typeof result.stderr).toBe('string');
    expect(result.duration).toBeGreaterThan(0);
  });

  it('should have timeout method available on $ command result', () => {
    const command = $`echo "test"`;
    
    // This was the original error: $(...).timeout is not a function
    expect(typeof command.timeout).toBe('function');
  });

  it('should return ProcessPromise with all expected methods', () => {
    const command = $`echo "test"`;
    
    // Verify all methods mentioned in README are available
    expect(typeof command.timeout).toBe('function');
    expect(typeof command.nothrow).toBe('function');
    expect(typeof command.quiet).toBe('function');
    expect(typeof command.text).toBe('function');
    expect(typeof command.json).toBe('function');
    expect(typeof command.lines).toBe('function');
    expect(typeof command.buffer).toBe('function');
    expect(typeof command.cwd).toBe('function');
    expect(typeof command.env).toBe('function');
    expect(typeof command.shell).toBe('function');
  });

  it('should work with method chaining as shown in README', async () => {
    // Various chaining examples from README
    const result1 = await $`echo "test"`.timeout(1000).nothrow();
    expect(result1.exitCode).toBe(0);
    
    const result2 = await $`echo "test"`.timeout(1000).quiet();
    expect(result2.exitCode).toBe(0);
    
    const result3 = await $`echo "test"`.cwd('/tmp').timeout(1000);
    expect(result3.exitCode).toBe(0);
    
    const result4 = await $`echo $TEST_VAR`.env({ TEST_VAR: 'hello' }).timeout(1000);
    expect(result4.stdout.trim()).toBe('hello');
  });

  it('should work with all zx-compatible methods', async () => {
    // Test all zx-compatible methods
    const text = await $`echo "hello"`.timeout(1000).text();
    expect(text).toBe('hello');
    
    const json = await $`echo '{"test": true}'`.timeout(1000).json();
    expect(json).toEqual({ test: true });
    
    const lines = await $`printf "a\\nb\\nc"`.timeout(1000).lines();
    expect(lines).toEqual(['a', 'b', 'c']);
    
    const buffer = await $`echo "test"`.timeout(1000).buffer();
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.toString().trim()).toBe('test');
  });
});
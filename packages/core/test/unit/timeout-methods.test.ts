import { it, expect, describe } from '@jest/globals';

import { $ } from '../../src/index.js';

describe('Timeout Methods from README', () => {
  it('should have timeout method on ProcessPromise', async () => {
    // This is the exact example from the README
    const command = $`echo "test"`;
    
    // Check that timeout method exists
    expect(typeof command.timeout).toBe('function');
    
    // Test that timeout method returns a ProcessPromise
    const timeoutCommand = command.timeout(5000);
    expect(typeof timeoutCommand.then).toBe('function');
    expect(typeof timeoutCommand.timeout).toBe('function');
    
    // Test actual execution
    const result = await timeoutCommand;
    expect(result.stdout.trim()).toBe('test');
  });

  it('should work with sleep command and timeout', async () => {
    // This should timeout after 1 second
    const command = $`sleep 0.5`.timeout(1000);
    const result = await command;
    expect(result.exitCode).toBe(0);
  });

  it('should work with nothrow method', async () => {
    const command = $`exit 1`.nothrow();
    
    expect(typeof command.nothrow).toBe('function');
    expect(typeof command.timeout).toBe('function');
    
    const result = await command;
    expect(result.exitCode).toBe(1);
  });

  it('should work with quiet method', async () => {
    const command = $`echo "test"`.quiet();
    
    expect(typeof command.quiet).toBe('function');
    expect(typeof command.timeout).toBe('function');
    
    const result = await command;
    expect(result.stdout.trim()).toBe('test');
  });

  it('should work with chaining timeout and nothrow', async () => {
    const command = $`exit 1`.timeout(1000).nothrow();
    
    const result = await command;
    expect(result.exitCode).toBe(1);
  });

  it('should work with chaining timeout and quiet', async () => {
    const command = $`echo "test"`.timeout(1000).quiet();
    
    const result = await command;
    expect(result.stdout.trim()).toBe('test');
  });

  it('should work with text() method', async () => {
    const command = $`echo "hello world"`;
    
    expect(typeof command.text).toBe('function');
    
    const text = await command.text();
    expect(text).toBe('hello world');
  });

  it('should work with json() method', async () => {
    const command = $`echo '{"key": "value"}'`;
    
    expect(typeof command.json).toBe('function');
    
    const json = await command.json();
    expect(json).toEqual({ key: 'value' });
  });

  it('should work with lines() method', async () => {
    const command = $`printf "line1\\nline2\\nline3\\n"`;
    
    expect(typeof command.lines).toBe('function');
    
    const lines = await command.lines();
    expect(lines).toEqual(['line1', 'line2', 'line3']);
  });

  it('should work with buffer() method', async () => {
    const command = $`echo "test"`;
    
    expect(typeof command.buffer).toBe('function');
    
    const buffer = await command.buffer();
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.toString().trim()).toBe('test');
  });
});
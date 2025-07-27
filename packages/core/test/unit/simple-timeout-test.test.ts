import { it, expect, describe } from '@jest/globals';

import { $ } from '../../src/index.js';

describe('Simple timeout method test', () => {
  it('should have timeout method available', () => {
    // Just check that the timeout method exists without executing anything
    const command = $`echo "test"`;
    
    expect(typeof command.timeout).toBe('function');
    expect(typeof command.nothrow).toBe('function');
    expect(typeof command.quiet).toBe('function');
    expect(typeof command.text).toBe('function');
    expect(typeof command.json).toBe('function');
    expect(typeof command.lines).toBe('function');
    expect(typeof command.buffer).toBe('function');
  });

  it('should return ProcessPromise with chaining', () => {
    const command = $`echo "test"`;
    const timeoutCommand = command.timeout(1000);
    
    // Check that it returns a ProcessPromise with methods
    expect(typeof timeoutCommand.timeout).toBe('function');
    expect(typeof timeoutCommand.nothrow).toBe('function');
    expect(typeof timeoutCommand.quiet).toBe('function');
    expect(typeof timeoutCommand.then).toBe('function');
  });

  it('should work with method chaining', () => {
    const command = $`echo "test"`.timeout(1000).nothrow().quiet();
    
    expect(typeof command.then).toBe('function');
    expect(typeof command.timeout).toBe('function');
  });
});
import { it, expect, describe } from '@jest/globals';

import { $ } from '../../src/index.js';

describe('Timeout execution test', () => {
  it('should execute command with timeout successfully', async () => {
    const result = await $`echo "test"`.timeout(5000);
    
    expect(result.stdout.trim()).toBe('test');
    expect(result.exitCode).toBe(0);
  });

  it('should work with nothrow', async () => {
    const result = await $`exit 1`.timeout(1000).nothrow();
    
    expect(result.exitCode).toBe(1);
  });

  it('should work with text() method', async () => {
    const text = await $`echo "hello"`.timeout(1000).text();
    
    expect(text).toBe('hello');
  });

  it('should work with json() method', async () => {
    const json = await $`echo '{"key": "value"}'`.timeout(1000).json();
    
    expect(json).toEqual({ key: 'value' });
  });

  it('should work with lines() method', async () => {
    const lines = await $`printf "line1\\nline2\\nline3"`.timeout(1000).lines();
    
    expect(lines).toEqual(['line1', 'line2', 'line3']);
  });

  it('should work with buffer() method', async () => {
    const buffer = await $`echo "test"`.timeout(1000).buffer();
    
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.toString().trim()).toBe('test');
  });

  it('should work with method chaining', async () => {
    const result = await $`echo "test"`.timeout(1000).quiet().nothrow();
    
    expect(result.stdout.trim()).toBe('test');
    expect(result.exitCode).toBe(0);
  });
});
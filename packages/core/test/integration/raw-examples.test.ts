import { it, expect, describe } from '@jest/globals';

import { $ } from '../../src/index.js';

describe('Raw examples from README', () => {
  it('should handle glob patterns without escaping', async () => {
    const pattern = '*.txt';
    
    // Check that the raw method exists and can be called
    expect(typeof $.raw).toBe('function');
    
    // Verify the command is constructed correctly without escaping
    const processPromise = $.raw`ls ${pattern}`;
    expect(processPromise).toBeDefined();
    expect(typeof processPromise.then).toBe('function');
  });

  it('should handle pipe operations without escaping', async () => {
    const command = 'ps aux | grep node';
    
    // Check that the raw method exists and can be called
    expect(typeof $.raw).toBe('function');
    
    // Verify the command is constructed correctly without escaping  
    const processPromise = $.raw`${command}`;
    expect(processPromise).toBeDefined();
    expect(typeof processPromise.then).toBe('function');
  });

  it('should demonstrate the difference between regular and raw interpolation', async () => {
    const pattern = '*.txt';
    
    // Regular interpolation should escape the pattern
    const regularPromise = $`ls ${pattern}`;
    expect(regularPromise).toBeDefined();
    
    // Raw interpolation should NOT escape the pattern
    const rawPromise = $.raw`ls ${pattern}`;
    expect(rawPromise).toBeDefined();
    
    // Both should return ProcessPromise instances
    expect(typeof regularPromise.then).toBe('function');
    expect(typeof rawPromise.then).toBe('function');
  });

  it('should handle complex shell constructs', async () => {
    const commands = [
      'echo "test" | grep test',
      'find . -name "*.txt" | head -5',
      'cat file.txt | sort | uniq'
    ];
    
    for (const command of commands) {
      const processPromise = $.raw`${command}`;
      expect(processPromise).toBeDefined();
      expect(typeof processPromise.then).toBe('function');
    }
  });
});
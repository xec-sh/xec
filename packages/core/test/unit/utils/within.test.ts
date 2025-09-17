import { test, expect, describe } from '@jest/globals';

import { within, withinSync, getLocalContext, asyncLocalStorage } from '../../../src/utils/within';

describe('within utilities', () => {
  describe('within', () => {
    test('should run async function with context', async () => {
      const config = { timeout: 5000 };
      let capturedContext: any;

      const result = await within(config, async () => {
        capturedContext = getLocalContext();
        return 'test-result';
      });

      expect(result).toBe('test-result');
      expect(capturedContext).toEqual(config);
    });

    test('should run sync function with context', async () => {
      const config = { cwd: '/test/path' };
      let capturedContext: any;

      const result = await within(config, () => {
        capturedContext = getLocalContext();
        return 42;
      });

      expect(result).toBe(42);
      expect(capturedContext).toEqual(config);
    });

    test('should handle errors in async function', async () => {
      const config = { nothrow: false };

      await expect(
        within(config, async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });
  });
  
  describe('withinSync', () => {
    test('should run sync function with context', () => {
      const config = { shell: '/bin/sh' };
      let capturedContext: any;

      const result = withinSync(config, () => {
        capturedContext = getLocalContext();
        return 'sync-result';
      });

      expect(result).toBe('sync-result');
      expect(capturedContext).toEqual(config);
    });
    
    test('should handle errors in sync function', () => {
      const config = { stdin: 'ignore' };

      expect(() => {
        withinSync(config, () => {
          throw new Error('Sync error');
        });
      }).toThrow('Sync error');
    });
  });
  
  describe('getLocalContext', () => {
    test('should return undefined when no context', () => {
      expect(getLocalContext()).toBeUndefined();
    });
    
    test('should return context when inside within', async () => {
      const config = { shell: '/bin/bash' };

      await within(config, async () => {
        const context = getLocalContext();
        expect(context).toEqual(config);
      });
    });
    
    test('should return context when inside withinSync', () => {
      const config = { detached: true };
      
      withinSync(config, () => {
        const context = getLocalContext();
        expect(context).toEqual(config);
      });
    });
  });
  
  describe('nested contexts', () => {
    test('should handle nested within calls', async () => {
      const outerConfig = { timeout: 1000 };
      const innerConfig = { timeout: 2000, stdin: 'pipe' };
      
      await within(outerConfig, async () => {
        const outerContext = getLocalContext();
        expect(outerContext).toEqual(outerConfig);
        
        await within(innerConfig, async () => {
          const innerContext = getLocalContext();
          expect(innerContext).toEqual(innerConfig);
        });
        
        // Back to outer context
        const contextAfterInner = getLocalContext();
        expect(contextAfterInner).toEqual(outerConfig);
      });
    });
  });
  
  describe('asyncLocalStorage export', () => {
    test('should export asyncLocalStorage instance', () => {
      expect(asyncLocalStorage).toBeDefined();
      expect(asyncLocalStorage.getStore).toBeDefined();
      expect(asyncLocalStorage.run).toBeDefined();
    });
  });
});
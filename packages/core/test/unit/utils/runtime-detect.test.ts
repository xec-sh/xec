import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { RuntimeDetector } from '../../../src/adapters/local/runtime-detect.js';

describe('RuntimeDetector', () => {
  let originalBun: any;
  let originalDeno: any;
  
  beforeEach(() => {
    // Save original globals
    originalBun = (globalThis as any).Bun;
    originalDeno = (globalThis as any).Deno;
    
    // Reset detector state
    RuntimeDetector.reset();
  });
  
  afterEach(() => {
    // Restore original globals
    if (originalBun !== undefined) {
      (globalThis as any).Bun = originalBun;
    } else {
      delete (globalThis as any).Bun;
    }
    
    if (originalDeno !== undefined) {
      (globalThis as any).Deno = originalDeno;
    } else {
      delete (globalThis as any).Deno;
    }
    
    RuntimeDetector.reset();
  });
  
  describe('detect()', () => {
    it('should detect Node.js runtime', () => {
      delete (globalThis as any).Bun;
      delete (globalThis as any).Deno;
      
      expect(RuntimeDetector.detect()).toBe('node');
    });
    
    it('should detect Bun runtime', () => {
      (globalThis as any).Bun = { version: '1.0.0' };
      delete (globalThis as any).Deno;
      
      expect(RuntimeDetector.detect()).toBe('bun');
    });
    
    it('should detect Deno runtime', () => {
      delete (globalThis as any).Bun;
      (globalThis as any).Deno = { version: { deno: '1.0.0' } };
      
      expect(RuntimeDetector.detect()).toBe('deno');
    });
    
    it('should prioritize Bun over Deno if both exist', () => {
      (globalThis as any).Bun = { version: '1.0.0' };
      (globalThis as any).Deno = { version: { deno: '1.0.0' } };
      
      expect(RuntimeDetector.detect()).toBe('bun');
    });
    
    it('should cache the detection result', () => {
      delete (globalThis as any).Bun;
      delete (globalThis as any).Deno;
      
      // First call
      const result1 = RuntimeDetector.detect();
      
      // Add Bun after first detection
      (globalThis as any).Bun = { version: '1.0.0' };
      
      // Second call should return cached result
      const result2 = RuntimeDetector.detect();
      
      expect(result1).toBe('node');
      expect(result2).toBe('node'); // Still node due to caching
    });
  });
  
  describe('getBunVersion()', () => {
    it('should return Bun version when running in Bun', () => {
      (globalThis as any).Bun = { version: '1.0.25' };
      
      expect(RuntimeDetector.getBunVersion()).toBe('1.0.25');
    });
    
    it('should return null when not running in Bun', () => {
      delete (globalThis as any).Bun;
      
      expect(RuntimeDetector.getBunVersion()).toBeNull();
    });
    
    it('should cache Bun version', () => {
      (globalThis as any).Bun = { version: '1.0.0' };
      
      // First call
      const version1 = RuntimeDetector.getBunVersion();
      
      // Change version (shouldn't affect cached result)
      (globalThis as any).Bun.version = '2.0.0';
      
      // Second call should return cached version
      const version2 = RuntimeDetector.getBunVersion();
      
      expect(version1).toBe('1.0.0');
      expect(version2).toBe('1.0.0');
    });
  });
  
  describe('hasFeature()', () => {
    describe('Bun features', () => {
      beforeEach(() => {
        (globalThis as any).Bun = {
          spawn: jest.fn(),
          serve: jest.fn(),
          SQLite: jest.fn(),
          version: '1.0.0'
        };
      });
      
      it('should detect Bun spawn feature', () => {
        expect(RuntimeDetector.hasFeature('spawn')).toBe(true);
      });
      
      it('should detect Bun serve feature', () => {
        expect(RuntimeDetector.hasFeature('serve')).toBe(true);
      });
      
      it('should detect Bun SQLite feature', () => {
        expect(RuntimeDetector.hasFeature('sqlite')).toBe(true);
      });
      
      it('should return false for missing Bun features', () => {
        delete (globalThis as any).Bun.serve;
        expect(RuntimeDetector.hasFeature('serve')).toBe(false);
      });
      
      it('should return false when Bun is not available', () => {
        delete (globalThis as any).Bun;
        RuntimeDetector.reset(); // Reset cache after deleting Bun global
        
        // When Bun is not available, we're in Node.js runtime
        // Node.js has spawn feature, but not Bun-specific features
        expect(RuntimeDetector.hasFeature('spawn')).toBe(true); // Node.js has spawn
        expect(RuntimeDetector.hasFeature('serve')).toBe(false);
        expect(RuntimeDetector.hasFeature('sqlite')).toBe(false);
      });
    });
    
    describe('Node.js features', () => {
      beforeEach(() => {
        delete (globalThis as any).Bun;
        delete (globalThis as any).Deno;
      });
      
      it('should always have spawn in Node.js', () => {
        expect(RuntimeDetector.hasFeature('spawn')).toBe(true);
      });
      
      it('should not have Bun-specific features in Node.js', () => {
        expect(RuntimeDetector.hasFeature('serve')).toBe(false);
        expect(RuntimeDetector.hasFeature('sqlite')).toBe(false);
      });
    });
    
    describe('Deno features', () => {
      beforeEach(() => {
        delete (globalThis as any).Bun;
        (globalThis as any).Deno = { version: { deno: '1.0.0' } };
      });
      
      it('should return false for all features in Deno', () => {
        expect(RuntimeDetector.hasFeature('spawn')).toBe(false);
        expect(RuntimeDetector.hasFeature('serve')).toBe(false);
        expect(RuntimeDetector.hasFeature('sqlite')).toBe(false);
      });
    });
  });
  
  describe('Helper methods', () => {
    it('isNode() should work correctly', () => {
      delete (globalThis as any).Bun;
      delete (globalThis as any).Deno;
      
      expect(RuntimeDetector.isNode()).toBe(true);
      
      (globalThis as any).Bun = { version: '1.0.0' };
      RuntimeDetector.reset();
      
      expect(RuntimeDetector.isNode()).toBe(false);
    });
    
    it('isBun() should work correctly', () => {
      delete (globalThis as any).Bun;
      expect(RuntimeDetector.isBun()).toBe(false);
      
      (globalThis as any).Bun = { version: '1.0.0' };
      RuntimeDetector.reset();
      
      expect(RuntimeDetector.isBun()).toBe(true);
    });
    
    it('isDeno() should work correctly', () => {
      delete (globalThis as any).Deno;
      expect(RuntimeDetector.isDeno()).toBe(false);
      
      (globalThis as any).Deno = { version: { deno: '1.0.0' } };
      RuntimeDetector.reset();
      
      expect(RuntimeDetector.isDeno()).toBe(true);
    });
  });
  
  describe('reset()', () => {
    it('should clear cached runtime detection', () => {
      delete (globalThis as any).Bun;
      
      // Initial detection
      expect(RuntimeDetector.detect()).toBe('node');
      
      // Add Bun
      (globalThis as any).Bun = { version: '1.0.0' };
      
      // Should still return cached value
      expect(RuntimeDetector.detect()).toBe('node');
      
      // Reset cache
      RuntimeDetector.reset();
      
      // Should now detect Bun
      expect(RuntimeDetector.detect()).toBe('bun');
    });
    
    it('should clear cached Bun version', () => {
      (globalThis as any).Bun = { version: '1.0.0' };
      
      expect(RuntimeDetector.getBunVersion()).toBe('1.0.0');
      
      // Change version
      (globalThis as any).Bun.version = '2.0.0';
      
      // Should still return cached version
      expect(RuntimeDetector.getBunVersion()).toBe('1.0.0');
      
      // Reset cache
      RuntimeDetector.reset();
      
      // Should now return new version
      expect(RuntimeDetector.getBunVersion()).toBe('2.0.0');
    });
  });
  
  describe('Edge cases', () => {
    it('should handle malformed Bun global', () => {
      (globalThis as any).Bun = {}; // No version property
      
      expect(RuntimeDetector.detect()).toBe('bun');
      expect(RuntimeDetector.getBunVersion()).toBeUndefined();
    });
    
    it('should handle malformed Deno global', () => {
      (globalThis as any).Deno = {}; // No version property
      
      expect(RuntimeDetector.detect()).toBe('deno');
    });
    
    it('should handle Bun global without required functions', () => {
      (globalThis as any).Bun = { version: '1.0.0' }; // No spawn, serve, etc.
      
      expect(RuntimeDetector.hasFeature('spawn')).toBe(false);
      expect(RuntimeDetector.hasFeature('serve')).toBe(false);
      expect(RuntimeDetector.hasFeature('sqlite')).toBe(false);
    });
  });
});
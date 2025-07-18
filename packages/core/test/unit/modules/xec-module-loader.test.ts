import { readFile } from 'fs/promises';
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { ModuleLoader } from '../../../src/modules/module-loader.js';

import type { Module } from '../../../src/modules/types.js';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn()
}));

// Mock module imports
vi.mock('path/to/module', () => ({
  default: () => ({ metadata: { name: 'test-module' } })
}));

describe('Module Loader', () => {
  let loader: ModuleLoader;
  let mockLogger: any;

  const mockLegacyModule: Module = {
    metadata: {
      name: 'test-module',
      version: '1.0.0',
      description: 'Test module'
    },
    exports: {
      testExport: 'value'
    }
  };

  beforeEach(() => {
    mockLogger = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn()
    };

    loader = new ModuleLoader();
  });

  afterEach(() => {
    loader.clearCache();
  });

  describe('Legacy module compatibility', () => {
    it('should continue loading legacy modules', async () => {
      const mockPath = '/path/to/legacy-module.json';
      const mockContent = JSON.stringify(mockLegacyModule);
      
      vi.mocked(readFile).mockResolvedValue(mockContent);
      
      const result = await loader.load(mockPath);
      
      expect(result.metadata).toEqual(mockLegacyModule.metadata);
      // Note: exports may be processed differently by the loader
      expect(result.exports).toBeDefined();
    });
  });

  describe('Cache management', () => {
    it('should clear cache', () => {
      const mockPath = '/path/to/module.js';
      
      // Access private properties for testing
      const moduleLoader = loader as any;
      moduleLoader.cache.set(mockPath, mockLegacyModule);
      
      loader.clearCache(mockPath);
      
      expect(moduleLoader.cache.has(mockPath)).toBe(false);
    });
  });
});
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { ModuleLoader } from '../../../src/module/module-loader.js';

// Mock global fetch
global.fetch = vi.fn();

describe('ModuleLoader', () => {
  let loader: ModuleLoader;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-loader-test-'));
    loader = new ModuleLoader({
      cacheDir: tempDir,
      cache: true,
      verbose: false,
    });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await loader.clearCache();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Local module loading', () => {
    it('should load local ESM module', async () => {
      const testFile = path.join(tempDir, 'test-module.mjs');
      await fs.writeFile(testFile, 'export const value = 42;');

      const module = await loader.import(testFile);
      expect(module.value).toBe(42);
    });

    it('should load local module with relative path', async () => {
      const testFile = path.join(tempDir, 'test-module.mjs');
      await fs.writeFile(testFile, 'export const value = 42;');

      // Use relative path from current directory
      const relativePath = path.relative(process.cwd(), testFile);
      const module = await loader.import(relativePath);
      expect(module.value).toBe(42);
    });

    it('should load local module with file:// URL', async () => {
      const testFile = path.join(tempDir, 'test-module.mjs');
      await fs.writeFile(testFile, 'export const value = 42;');

      const fileUrl = `file://${testFile}`;
      const module = await loader.import(fileUrl);
      expect(module.value).toBe(42);
    });
  });

  describe('CDN module loading', () => {
    it('should load module from CDN with npm: prefix', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => 'export const test = "value";',
        headers: new Map([['content-type', 'application/javascript']]),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const module = await loader.import('npm:test-package');
      expect(module.test).toBe('value');
    });

    it('should load module from CDN with esm: prefix', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => 'export const foo = "bar";',
        headers: new Map([['content-type', 'application/javascript']]),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const module = await loader.import('esm:another-package');
      expect(module.foo).toBe('bar');
    });

    it('should load module from direct HTTPS URL', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => 'export const direct = true;',
        headers: new Map([['content-type', 'application/javascript']]),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const module = await loader.import('https://example.com/module.js');
      expect(module.direct).toBe(true);
    });
  });

  describe('Node module loading', () => {
    it('should load built-in Node.js module', async () => {
      const module = await loader.import('path');
      expect(typeof module.join).toBe('function');
      expect(typeof module.resolve).toBe('function');
    });

    it('should load built-in module with node: prefix', async () => {
      const module = await loader.import('node:path');
      expect(typeof module.join).toBe('function');
    });

    it('should fallback to CDN for non-existent bare specifier', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => 'export const fallback = true;',
        headers: new Map([['content-type', 'application/javascript']]),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const module = await loader.import('non-existent-package-12345');
      expect(module.fallback).toBe(true);
    });
  });

  describe('Caching', () => {
    it('should cache CDN modules', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => 'export const cached = true;',
        headers: new Map([['content-type', 'application/javascript']]),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      // First load
      await loader.import('npm:cacheable-package');

      // Second load should use cache
      await loader.import('npm:cacheable-package');

      // Fetch should only be called once
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should provide cache statistics', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => 'export const test = true;',
        headers: new Map([['content-type', 'application/javascript']]),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      await loader.import('npm:test-stats');

      const stats = await loader.getCacheStats();
      expect(stats.memoryEntries).toBeGreaterThan(0);
    });

    it('should clear all caches', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => 'export const test = true;',
        headers: new Map([['content-type', 'application/javascript']]),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      await loader.import('npm:test-clear');
      await loader.clearCache();

      const stats = await loader.getCacheStats();
      expect(stats.memoryEntries).toBe(0);
    });
  });

  describe('CDN-only mode', () => {
    it('should skip node_modules resolution in cdnOnly mode', async () => {
      const cdnLoader = new ModuleLoader({
        cacheDir: tempDir,
        cdnOnly: true,
      });

      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => 'export const cdnOnly = true;',
        headers: new Map([['content-type', 'application/javascript']]),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const module = await cdnLoader.import('npm:some-package');
      expect(module.cdnOnly).toBe(true);
    });
  });

  describe('Preferred CDN', () => {
    it('should use preferred CDN', async () => {
      const loaderWithCDN = new ModuleLoader({
        cacheDir: tempDir,
        preferredCDN: 'unpkg',
      });

      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => 'export const test = true;',
        headers: new Map([['content-type', 'application/javascript']]),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      await loaderWithCDN.import('npm:test-package');

      // Check that fetch was called with unpkg URL
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('unpkg.com'),
        expect.any(Object)
      );
    });
  });

  describe('Concurrent loading', () => {
    it('should prevent duplicate fetches for same module', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => {
          // Simulate slow network
          await new Promise(resolve => setTimeout(resolve, 100));
          return 'export const concurrent = true;';
        },
        headers: new Map([['content-type', 'application/javascript']]),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      // Start multiple imports of the same module concurrently
      const results = await Promise.all([
        loader.import('npm:concurrent-package'),
        loader.import('npm:concurrent-package'),
        loader.import('npm:concurrent-package'),
      ]);

      // All should succeed with same value
      expect(results[0].concurrent).toBe(true);
      expect(results[1].concurrent).toBe(true);
      expect(results[2].concurrent).toBe(true);

      // Fetch should only be called once despite 3 concurrent requests
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling', () => {
    it('should throw error for non-existent local module', async () => {
      await expect(
        loader.import('/non/existent/path.js')
      ).rejects.toThrow();
    });

    it('should throw error for failed CDN fetch', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Map(),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      await expect(
        loader.import('npm:non-existent-cdn-package')
      ).rejects.toThrow();
    });
  });

  describe('Verbose mode', () => {
    it('should log in verbose mode', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const verboseLoader = new ModuleLoader({
        cacheDir: tempDir,
        verbose: true,
      });

      const testFile = path.join(tempDir, 'verbose-test.mjs');
      await fs.writeFile(testFile, 'export const verbose = true;');

      await verboseLoader.import(testFile);

      expect(consoleLogSpy).toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });
  });
});

import { join } from 'path';
import { tmpdir } from 'os';
import { rm } from 'fs/promises';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { ModuleLoader } from '../../src/utils/module-loader.js';

describe('ModuleLoader - Simplified API', () => {
  let loader: ModuleLoader;
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = join(tmpdir(), 'xec-test-cache-' + Date.now());
    loader = new ModuleLoader({
      cacheDir,
      verbose: false,
      cache: false
    });
    await loader.init();
  });

  afterEach(async () => {
    // Clean up cache directory
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('should register use() as a global function', () => {
    expect(typeof (globalThis as any).use).toBe('function');
  });

  it('should register x() as a global function', () => {
    expect(typeof (globalThis as any).x).toBe('function');
  });

  it('use() should call importModule with the correct spec', async () => {
    const importModuleSpy = jest.spyOn(loader, 'importModule');

    // Call use() with a test spec
    const testSpec = 'npm:test-package';
    (globalThis as any).use(testSpec);

    expect(importModuleSpy).toHaveBeenCalledWith(testSpec);
    importModuleSpy.mockRestore();
  });

  it('x() should call importModule with the correct spec', async () => {
    const importModuleSpy = jest.spyOn(loader, 'importModule');

    // Call x() with a test spec
    const testSpec = 'jsr:@test/package';
    (globalThis as any).x(testSpec);

    expect(importModuleSpy).toHaveBeenCalledWith(testSpec);
    importModuleSpy.mockRestore();
  });

  it('all global functions should reference the same underlying method', () => {
    // They should all be functions that call the same underlying importModule
    const use = (globalThis as any).use;
    const x = (globalThis as any).x;

    expect(typeof use).toBe('function');
    expect(typeof x).toBe('function');

    // Verify they're all bound to the same loader instance's importModule
    expect(use.toString()).toContain('importModule');
    expect(x.toString()).toContain('importModule');
  });
});
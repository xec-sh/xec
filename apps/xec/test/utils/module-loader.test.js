import { join } from 'path';
import { tmpdir } from 'os';
import { rm } from 'fs/promises';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';
import { ModuleLoader } from '../../src/utils/module-loader.js';
describe('ModuleLoader - Simplified API', () => {
    let loader;
    let cacheDir;
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
        await rm(cacheDir, { recursive: true, force: true });
    });
    it('should register use() as a global function', () => {
        expect(typeof globalThis.use).toBe('function');
    });
    it('should register x() as a global function', () => {
        expect(typeof globalThis.x).toBe('function');
    });
    it('use() should call importModule with the correct spec', async () => {
        const importModuleSpy = jest.spyOn(loader, 'importModule');
        const testSpec = 'npm:test-package';
        globalThis.use(testSpec);
        expect(importModuleSpy).toHaveBeenCalledWith(testSpec);
        importModuleSpy.mockRestore();
    });
    it('x() should call importModule with the correct spec', async () => {
        const importModuleSpy = jest.spyOn(loader, 'importModule');
        const testSpec = 'jsr:@test/package';
        globalThis.x(testSpec);
        expect(importModuleSpy).toHaveBeenCalledWith(testSpec);
        importModuleSpy.mockRestore();
    });
    it('all global functions should reference the same underlying method', () => {
        const use = globalThis.use;
        const x = globalThis.x;
        expect(typeof use).toBe('function');
        expect(typeof x).toBe('function');
        expect(use.toString()).toContain('importModule');
        expect(x.toString()).toContain('importModule');
    });
});
//# sourceMappingURL=module-loader.test.js.map
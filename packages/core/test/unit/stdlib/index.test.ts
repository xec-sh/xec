import { it, expect, describe } from 'vitest';

import {
  coreModule,
  fileModule,
  systemModule,
  stdlibModules,
  getStdlibModule,
  listStdlibModules,
  loadStandardLibrary
} from '../../../src/stdlib/index.js';

describe('stdlib/index', () => {
  describe('module exports', () => {
    it('should export all stdlib modules', () => {
      expect(stdlibModules).toBeDefined();
      expect(stdlibModules['@xec/stdlib-core']).toBe(coreModule);
      expect(stdlibModules['@xec/stdlib-system']).toBe(systemModule);
      expect(stdlibModules['@xec/stdlib-file']).toBe(fileModule);
    });

    it('should export individual modules', () => {
      expect(coreModule).toBeDefined();
      expect(coreModule.name).toBe('@xec/stdlib-core');

      expect(fileModule).toBeDefined();
      expect(fileModule.name).toBe('@xec/stdlib-file');

      expect(systemModule).toBeDefined();
      expect(systemModule.name).toBe('@xec/stdlib-system');
    });
  });

  describe('loadStandardLibrary', () => {
    it('should load all stdlib modules', async () => {
      const modules = await loadStandardLibrary();

      expect(modules).toBeInstanceOf(Array);
      expect(modules).toHaveLength(3);
      expect(modules).toContain(coreModule);
      expect(modules).toContain(fileModule);
      expect(modules).toContain(systemModule);
    });

    it('should return modules without setup', async () => {
      const modules = await loadStandardLibrary();

      modules.forEach(module => {
        expect(module).toHaveProperty('name');
        expect(module).toHaveProperty('version');
        expect(module).toHaveProperty('exports');
      });
    });
  });

  describe('getStdlibModule', () => {
    it('should get specific stdlib module by name', () => {
      const core = getStdlibModule('@xec/stdlib-core');
      expect(core).toBe(coreModule);

      const file = getStdlibModule('@xec/stdlib-file');
      expect(file).toBe(fileModule);

      const system = getStdlibModule('@xec/stdlib-system');
      expect(system).toBe(systemModule);
    });

    it('should return undefined for unknown module', () => {
      const unknown = getStdlibModule('@xec/stdlib-unknown');
      expect(unknown).toBeUndefined();
    });
  });

  describe('listStdlibModules', () => {
    it('should list all available stdlib module names', () => {
      const names = listStdlibModules();

      expect(names).toBeInstanceOf(Array);
      expect(names).toHaveLength(3);
      expect(names).toContain('@xec/stdlib-core');
      expect(names).toContain('@xec/stdlib-file');
      expect(names).toContain('@xec/stdlib-system');
    });

    it('should return module names in consistent order', () => {
      const names1 = listStdlibModules();
      const names2 = listStdlibModules();

      expect(names1).toEqual(names2);
    });
  });

  describe('module structure', () => {
    it('should have consistent module structure', () => {
      const modules = [coreModule, fileModule, systemModule];

      modules.forEach(module => {
        // Basic module properties
        expect(module).toHaveProperty('name');
        expect(module).toHaveProperty('version');
        expect(module).toHaveProperty('description');
        expect(module).toHaveProperty('exports');
        expect(module).toHaveProperty('dependencies');
        expect(module).toHaveProperty('metadata');

        // Module exports structure
        expect(module.exports).toHaveProperty('tasks');
        expect(module.exports).toHaveProperty('helpers');
        expect(module.exports).toHaveProperty('patterns');
        expect(module.exports).toHaveProperty('integrations');

        // Module metadata
        // Module metadata (if exists)
        if (module.metadata) {
          expect(module.metadata).toHaveProperty('category');
          expect(module.metadata.category).toBe('stdlib');
          expect(module.metadata).toHaveProperty('tags');
          expect(Array.isArray(module.metadata.tags)).toBe(true);
        }
      });
    });

    it('should have proper dependencies', () => {
      expect(coreModule.dependencies).toEqual([]);
      expect(fileModule.dependencies).toContain('@xec/stdlib-core');
      expect(systemModule.dependencies).toContain('@xec/stdlib-core');
    });
  });
});
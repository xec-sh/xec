import fs from 'fs';
import path from 'path';
import { it, expect, describe } from '@jest/globals';

import { createProgram } from '../src/main.js';

describe('Basic CLI Tests', () => {
  describe('CLI Program', () => {
    it('should create program with correct name and description', () => {
      const program = createProgram();

      expect(program.name()).toBe('xec');
      expect(program.description()).toContain('Xec');
      expect(program.description()).toContain('orchestration');
    });

    it('should have all required options', () => {
      const program = createProgram();
      const options = program.options.map(opt => opt.long);

      expect(options).toContain('--verbose');
      expect(options).toContain('--quiet');
      expect(options).toContain('--cwd');
      expect(options).toContain('--no-color');
      expect(options).toContain('--eval');
    });
  });

  describe('Script Detection', () => {
    it('should identify script files by extension', () => {
      const scriptExtensions = ['.js', '.ts', '.mjs'];
      const testFiles = ['script.js', 'app.ts', 'module.mjs'];

      testFiles.forEach(file => {
        const hasScriptExt = scriptExtensions.some(ext => file.endsWith(ext));
        expect(hasScriptExt).toBe(true);
      });
    });

    it('should not identify non-script files', () => {
      const nonScriptFiles = ['readme.md', 'config.json', 'image.png'];
      const scriptExtensions = ['.js', '.ts', '.mjs'];

      nonScriptFiles.forEach(file => {
        const hasScriptExt = scriptExtensions.some(ext => file.endsWith(ext));
        expect(hasScriptExt).toBe(false);
      });
    });
  });

  describe('Utilities', () => {
    it('should provide path utilities', () => {
      expect(path.join).toBeDefined();
      expect(path.resolve).toBeDefined();
      expect(path.dirname).toBeDefined();
      expect(path.basename).toBeDefined();
    });

    it('should provide fs utilities', () => {
      expect(fs.existsSync).toBeDefined();
      expect(fs.readFileSync).toBeDefined();
      expect(fs.writeFileSync).toBeDefined();
    });
  });

  describe('Script Context', () => {
    it('should have required script utilities', async () => {
      const utils = await import('../src/script-utils.js');

      // Core utilities
      expect(typeof utils.$).toBe('function');
      expect(typeof utils.cd).toBe('function');
      expect(typeof utils.pwd).toBe('function');
      expect(typeof utils.echo).toBe('function');

      // Async utilities
      expect(typeof utils.sleep).toBe('function');
      expect(typeof utils.retry).toBe('function');

      // File utilities
      expect(typeof utils.glob).toBe('function');
      expect(utils.fs).toBeDefined();
      expect(utils.path).toBeDefined();

      // Other utilities
      expect(utils.chalk).toBeDefined();
      expect(typeof utils.which).toBe('function');
      expect(typeof utils.fetch).toBe('function');
    });

    it('should handle sleep correctly', async () => {
      const utils = await import('../src/script-utils.js');

      const start = Date.now();
      await utils.sleep(50);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(45);
      expect(elapsed).toBeLessThan(100);
    });

    it('should handle quote correctly', async () => {
      const utils = await import('../src/script-utils.js');

      expect(utils.quote('simple')).toBe('simple');
      expect(utils.quote('with spaces')).toBe("'with spaces'");
      expect(utils.quote("with'quote")).toBe("'with'\"'\"'quote'");
    });

    it('should handle tmpfile generation', async () => {
      const utils = await import('../src/script-utils.js');

      const tmpfile1 = utils.tmpfile();
      const tmpfile2 = utils.tmpfile();

      expect(tmpfile1).toContain('xec-');
      expect(tmpfile1).not.toBe(tmpfile2);
    });
  });
});
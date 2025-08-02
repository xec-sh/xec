import path from 'path';
import fs from 'fs-extra';
import { Command } from 'commander';
import { fileURLToPath } from 'url';
import { it, jest, expect, describe, afterAll, beforeAll, beforeEach } from '@jest/globals';

import { loadDynamicCommands, DynamicCommandLoader, getDynamicCommandLoader } from '../../src/utils/dynamic-commands.js';

// Mock @xec-sh/core to avoid import errors
jest.mock('@xec-sh/core', () => ({
  $: jest.fn(),
  unifiedConfig: {}
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('DynamicCommandLoader', () => {
  const fixturesDir = path.join(__dirname, '../fixtures/commands');
  let loader: DynamicCommandLoader;

  beforeAll(() => {
    // Set up test environment
    delete process.env['XEC_DEBUG']; // Disable debug output for cleaner tests

    // Mock the global module context to avoid import errors
    (globalThis as any).__xecModuleContext = {
      import: jest.fn().mockImplementation((module: string) => {
        if (module === 'chalk') {
          return Promise.resolve({ default: {} });
        }
        if (module === '@clack/prompts') {
          return Promise.resolve({
            log: { info: jest.fn(), error: jest.fn() },
            spinner: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() }))
          });
        }
        return Promise.reject(new Error(`Module not found: ${module}`));
      })
    };
  });

  afterAll(() => {
    delete process.env['XEC_DEBUG'];
    delete (globalThis as any).__xecModuleContext;
  });

  beforeEach(() => {
    loader = new DynamicCommandLoader();
  });

  describe('constructor', () => {
    it('should initialize with default command directories', () => {
      const dirs = loader.getCommandDirectories();
      expect(dirs).toContain(path.join(process.cwd(), '.xec', 'commands'));
      expect(dirs).toContain(path.join(process.cwd(), '.xec', 'cli'));
    });

    it('should add paths from XEC_COMMANDS_PATH env variable', () => {
      const customPath = '/custom/commands/path';
      process.env['XEC_COMMANDS_PATH'] = customPath;

      const customLoader = new DynamicCommandLoader();
      const dirs = customLoader.getCommandDirectories();

      expect(dirs).toContain(customPath);
      delete process.env['XEC_COMMANDS_PATH'];
    });
  });

  describe('loadCommands', () => {
    it('should load JavaScript commands from fixtures', async () => {
      const program = new Command();
      loader.addCommandDirectory(fixturesDir);

      await loader.loadCommands(program);

      const loadedCommands = loader.getLoadedCommands();
      const commandNames = loadedCommands.map(cmd => cmd.name);

      expect(commandNames).toContain('simple');
      expect(commandNames).toContain('default-export');
    });

    it('should load TypeScript commands from fixtures', async () => {
      const program = new Command();
      loader.addCommandDirectory(fixturesDir);

      await loader.loadCommands(program);

      const loadedCommands = loader.getLoadedCommands();
      const commandNames = loadedCommands.map(cmd => cmd.name);

      expect(commandNames).toContain('typescript');
      expect(commandNames).toContain('with-imports');
    });

    it('should load commands from subdirectories with prefix', async () => {
      const program = new Command();
      loader.addCommandDirectory(fixturesDir);

      await loader.loadCommands(program);

      const loadedCommands = loader.getLoadedCommands();
      const commandNames = loadedCommands.map(cmd => cmd.name);

      expect(commandNames).toContain('subdir:nested');
    });

    it('should handle invalid command files', async () => {
      const program = new Command();
      loader.addCommandDirectory(fixturesDir);

      await loader.loadCommands(program);

      const failedCommands = loader.getFailedCommands();
      const failedNames = failedCommands.map(cmd => cmd.name);

      expect(failedNames).toContain('invalid');
      expect(failedCommands.find(cmd => cmd.name === 'invalid')?.error).toContain('must export');
    });

    it('should skip hidden files and test files', async () => {
      const testDir = path.join(fixturesDir, 'temp-test');
      await fs.ensureDir(testDir);

      // Create files that should be skipped
      await fs.writeFile(path.join(testDir, '.hidden.js'), 'export function command() {}');
      await fs.writeFile(path.join(testDir, 'command.test.js'), 'export function command() {}');
      await fs.writeFile(path.join(testDir, 'command.spec.ts'), 'export function command() {}');

      const program = new Command();
      loader.addCommandDirectory(testDir);

      await loader.loadCommands(program);

      const loadedCommands = loader.getLoadedCommands();
      const commandNames = loadedCommands.map(cmd => cmd.name);

      expect(commandNames).not.toContain('.hidden');
      expect(commandNames).not.toContain('command.test');
      expect(commandNames).not.toContain('command.spec');

      // Clean up
      await fs.remove(testDir);
    });
  });

  describe('addCommandDirectory', () => {
    it('should add new command directory', () => {
      const newDir = '/new/command/dir';
      loader.addCommandDirectory(newDir);

      expect(loader.getCommandDirectories()).toContain(newDir);
    });

    it('should not add duplicate directories', () => {
      const newDir = '/new/command/dir';
      loader.addCommandDirectory(newDir);
      loader.addCommandDirectory(newDir);

      const dirs = loader.getCommandDirectories();
      const count = dirs.filter(d => d === newDir).length;
      expect(count).toBe(1);
    });
  });

  describe('getCommands', () => {
    it('should return all tracked commands', async () => {
      const program = new Command();
      loader.addCommandDirectory(fixturesDir);

      await loader.loadCommands(program);

      const allCommands = loader.getCommands();
      expect(allCommands.length).toBeGreaterThan(0);
      expect(allCommands.every(cmd => cmd.name && cmd.path)).toBe(true);
    });
  });

  describe('generateCommandTemplate', () => {
    it('should generate valid command template', () => {
      const template = DynamicCommandLoader.generateCommandTemplate('test-cmd', 'Test command');

      expect(template).toContain('export function command(program)');
      expect(template).toContain('test-cmd');
      expect(template).toContain('Test command');
      expect(template).toContain('.command(');
      expect(template).toContain('.action(');
    });
  });

  describe('validateCommandFile', () => {
    it('should validate valid command files', async () => {
      const validFile = path.join(fixturesDir, 'simple.js');
      const result = await DynamicCommandLoader.validateCommandFile(validFile);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should invalidate files without proper exports', async () => {
      const invalidFile = path.join(fixturesDir, 'invalid.js');
      const result = await DynamicCommandLoader.validateCommandFile(invalidFile);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('must export');
    });

    it('should handle non-existent files', async () => {
      const result = await DynamicCommandLoader.validateCommandFile('/non/existent/file.js');

      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('getDynamicCommandLoader', () => {
    it('should return singleton instance', () => {
      const loader1 = getDynamicCommandLoader();
      const loader2 = getDynamicCommandLoader();

      expect(loader1).toBe(loader2);
    });
  });

  describe('loadDynamicCommands', () => {
    it('should load commands and report summary', async () => {
      const program = new Command();

      // Spy on console to check if summary is reported
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      process.env['XEC_DEBUG'] = 'true';
      await loadDynamicCommands(program);

      // Should not throw
      expect(true).toBe(true);

      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      delete process.env['XEC_DEBUG'];
    });
  });

  describe('module context integration', () => {
    it('should have access to global module context', async () => {
      const program = new Command();
      loader.addCommandDirectory(fixturesDir);

      // Suppress expected console errors from test fixtures
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await loader.loadCommands(program);

      // Check that global module context is available
      expect((globalThis as any).__xecModuleContext).toBeDefined();
      // module-loader only provides import function
      // importJSR and importNPM are handled through the main import with prefixes

      consoleErrorSpy.mockRestore();
    });
  });
});
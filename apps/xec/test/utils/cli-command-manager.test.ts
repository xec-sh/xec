import path from 'path';
import fs from 'fs-extra';
import { Command } from 'commander';
import { fileURLToPath } from 'url';
import { it, jest, expect, describe, afterAll, beforeAll, beforeEach } from '@jest/globals';

import {
  findCommand,
  CliCommandManager,
  loadDynamicCommands,
  registerCliCommands,
  getCliCommandManager,
  buildCommandRegistry,
  discoverAndLoadCommands
} from '../../src/utils/cli-command-manager.js';

// Mock @xec-sh/core
jest.mock('@xec-sh/core', () => ({
  $: jest.fn(),
  unifiedConfig: {},
  CommandRegistry: jest.fn().mockImplementation(() => ({
    register: jest.fn(),
    getAllCommands: jest.fn(() => []),
    getCommand: jest.fn()
  }))
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('CliCommandManager', () => {
  const fixturesDir = path.join(__dirname, '../fixtures/commands');
  let manager: CliCommandManager;
  let program: Command;

  beforeAll(() => {
    // Set up test environment
    delete process.env['XEC_DEBUG'];

    // Mock global module context
    (globalThis as any).__xecModuleContext = {
      import: jest.fn().mockImplementation((module: string) => {
        if (module === 'chalk') {
          return Promise.resolve({ default: {} });
        }
        if (module === '@xec-sh/kit') {
          return Promise.resolve({
            log: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), success: jest.fn() },
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
    manager = new CliCommandManager();
    program = new Command('xec');
    program.description('Test CLI');
  });

  describe('constructor', () => {
    it('should initialize with default command directories', () => {
      const dirs = manager.getCommandDirectories();
      expect(dirs).toContain(path.join(process.cwd(), '.xec', 'commands'));
      expect(dirs).toContain(path.join(process.cwd(), '.xec', 'cli'));
    });

    it('should add paths from XEC_COMMANDS_PATH env variable', () => {
      const customPath = '/custom/commands/path';
      process.env['XEC_COMMANDS_PATH'] = customPath;

      const customManager = new CliCommandManager();
      const dirs = customManager.getCommandDirectories();

      expect(dirs).toContain(customPath);
      delete process.env['XEC_COMMANDS_PATH'];
    });
  });

  describe('discoverAndLoad', () => {
    it('should discover and load commands', async () => {
      manager.addCommandDirectory(fixturesDir);
      
      const commands = await manager.discoverAndLoad(program);
      
      expect(commands.length).toBeGreaterThan(0);
      expect(commands.some(cmd => cmd.type === 'dynamic')).toBe(true);
    });

    it('should load JavaScript commands from fixtures', async () => {
      manager.addCommandDirectory(fixturesDir);

      await manager.discoverAndLoad(program);

      const commands = manager.getCommands();
      const commandNames = commands.map(cmd => cmd.name);

      expect(commandNames).toContain('simple');
      expect(commandNames).toContain('default-export');
    });

    it('should load TypeScript commands from fixtures', async () => {
      manager.addCommandDirectory(fixturesDir);

      await manager.discoverAndLoad(program);

      const commands = manager.getCommands();
      const commandNames = commands.map(cmd => cmd.name);

      expect(commandNames).toContain('typescript');
      expect(commandNames).toContain('with-imports');
    });

    it('should load commands from subdirectories with prefix', async () => {
      manager.addCommandDirectory(fixturesDir);

      await manager.discoverAndLoad(program);

      const commands = manager.getCommands();
      const commandNames = commands.map(cmd => cmd.name);

      expect(commandNames).toContain('subdir:nested');
    });

    it('should handle invalid command files', async () => {
      manager.addCommandDirectory(fixturesDir);

      await manager.discoverAndLoad(program);

      const failedCommands = manager.getFailedCommands();
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

      manager.addCommandDirectory(testDir);

      await manager.discoverAndLoad(program);

      const commands = manager.getCommands();
      const commandNames = commands.map(cmd => cmd.name);

      expect(commandNames).not.toContain('.hidden');
      expect(commandNames).not.toContain('command.test');
      expect(commandNames).not.toContain('command.spec');

      // Clean up
      await fs.remove(testDir);
    });
  });

  describe('findCommand', () => {
    beforeEach(() => {
      // Add test commands
      program
        .command('deploy')
        .description('Deploy application')
        .alias('d');
      
      program
        .command('test')
        .description('Run tests')
        .alias('t')
        .alias('check');
      
      program
        .command('Config')
        .description('Manage configuration');
    });
    
    it('should find command by exact name', () => {
      const command = manager.findCommand(program, 'deploy');
      expect(command).toBeDefined();
      expect(command?.name()).toBe('deploy');
    });
    
    it('should find command by alias', () => {
      const command = manager.findCommand(program, 'd');
      expect(command).toBeDefined();
      expect(command?.name()).toBe('deploy');
      
      const testCommand = manager.findCommand(program, 'check');
      expect(testCommand).toBeDefined();
      expect(testCommand?.name()).toBe('test');
    });
    
    it('should find command case-insensitively', () => {
      const command = manager.findCommand(program, 'DEPLOY');
      expect(command).toBeDefined();
      expect(command?.name()).toBe('deploy');
      
      const configCommand = manager.findCommand(program, 'config');
      expect(configCommand).toBeDefined();
      expect(configCommand?.name()).toBe('Config');
    });
    
    it('should return null for non-existent command', () => {
      const command = manager.findCommand(program, 'nonexistent');
      expect(command).toBeNull();
    });
  });

  describe('addCommandDirectory', () => {
    it('should add new command directory', () => {
      const newDir = '/new/command/dir';
      manager.addCommandDirectory(newDir);

      expect(manager.getCommandDirectories()).toContain(newDir);
    });

    it('should not add duplicate directories', () => {
      const newDir = '/new/command/dir';
      manager.addCommandDirectory(newDir);
      manager.addCommandDirectory(newDir);

      const dirs = manager.getCommandDirectories();
      const count = dirs.filter(d => d === newDir).length;
      expect(count).toBe(1);
    });
  });

  describe('getters', () => {
    it('should return all tracked commands', async () => {
      manager.addCommandDirectory(fixturesDir);

      await manager.discoverAndLoad(program);

      const allCommands = manager.getCommands();
      expect(allCommands.length).toBeGreaterThan(0);
      expect(allCommands.every(cmd => cmd.name && cmd.path)).toBe(true);
    });

    it('should filter built-in commands', async () => {
      await manager.discoverAndLoad(program);

      const builtIn = manager.getBuiltInCommands();
      expect(builtIn.every(cmd => cmd.type === 'built-in')).toBe(true);
    });

    it('should filter dynamic commands', async () => {
      manager.addCommandDirectory(fixturesDir);
      await manager.discoverAndLoad(program);

      const dynamic = manager.getDynamicCommands();
      expect(dynamic.every(cmd => cmd.type === 'dynamic')).toBe(true);
    });

    it('should filter loaded commands', async () => {
      await manager.discoverAndLoad(program);

      const loaded = manager.getLoadedCommands();
      expect(loaded.every(cmd => cmd.loaded)).toBe(true);
    });

    it('should filter failed commands', async () => {
      manager.addCommandDirectory(fixturesDir);
      await manager.discoverAndLoad(program);

      const failed = manager.getFailedCommands();
      expect(failed.every(cmd => !cmd.loaded && cmd.error)).toBe(true);
    });
  });

  describe('static methods', () => {
    describe('generateCommandTemplate', () => {
      it('should generate valid command template', () => {
        const template = CliCommandManager.generateCommandTemplate('test-cmd', 'Test command');

        expect(template).toContain('export default function command(program)');
        expect(template).toContain('test-cmd');
        expect(template).toContain('Test command');
        expect(template).toContain('.command(');
        expect(template).toContain('.action(');
      });
    });

    describe('validateCommandFile', () => {
      it('should validate valid command files', async () => {
        const validFile = path.join(fixturesDir, 'simple.js');
        const result = await CliCommandManager.validateCommandFile(validFile);

        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should invalidate files without proper exports', async () => {
        const invalidFile = path.join(fixturesDir, 'invalid.js');
        const result = await CliCommandManager.validateCommandFile(invalidFile);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('must export');
      });

      it('should handle non-existent files', async () => {
        const result = await CliCommandManager.validateCommandFile('/non/existent/file.js');

        expect(result.valid).toBe(false);
        expect(result.error).toBeTruthy();
      });
    });
  });

  describe('singleton', () => {
    it('should return singleton instance', () => {
      const manager1 = getCliCommandManager();
      const manager2 = getCliCommandManager();

      expect(manager1).toBe(manager2);
    });
  });

  describe('exported functions', () => {
    describe('discoverAndLoadCommands', () => {
      it('should discover and load commands', async () => {
        const testProgram = new Command('test');
        const commands = await discoverAndLoadCommands(testProgram);

        expect(Array.isArray(commands)).toBe(true);
      });
    });

    describe('loadDynamicCommands', () => {
      it('should load dynamic commands and return names', async () => {
        const testProgram = new Command('test');
        
        // Spy on console to check if summary is reported
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        process.env['XEC_DEBUG'] = 'true';
        const names = await loadDynamicCommands(testProgram);

        expect(Array.isArray(names)).toBe(true);

        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        delete process.env['XEC_DEBUG'];
      });
    });

    describe('buildCommandRegistry', () => {
      it('should build registry from program', () => {
        const testProgram = new Command('test');
        testProgram
          .command('test')
          .description('Test command')
          .alias('t');
        
        const registry = buildCommandRegistry(testProgram);

        expect(registry).toBeDefined();
      });
    });

    describe('registerCliCommands', () => {
      it('should register CLI commands', () => {
        const testProgram = new Command('test');
        testProgram
          .command('on <host> <command>')
          .description('Execute command on remote host via SSH')
          .alias('ssh');
        
        const registry = registerCliCommands(testProgram);

        expect(registry).toBeDefined();
      });
    });

    describe('findCommand', () => {
      it('should find command by name or alias', () => {
        const testProgram = new Command('test');
        testProgram
          .command('deploy')
          .description('Deploy application')
          .alias('d');
        
        const command = findCommand(testProgram, 'd');
        expect(command).toBeDefined();
        expect(command?.name()).toBe('deploy');
      });

      it('should return null for invalid inputs', () => {
        expect(findCommand(null as any, 'test')).toBeNull();
        expect(findCommand(new Command(), '')).toBeNull();
      });
    });
  });

  describe('integration', () => {
    it('should work with complex command structure', async () => {
      // Create a complex command structure
      const cacheCmd = program
        .command('cache')
        .description('Cache management');
      
      cacheCmd
        .command('clear')
        .description('Clear cache')
        .alias('clean');
      
      cacheCmd
        .command('show')
        .description('Show cache stats');
      
      const moduleCmd = program
        .command('module')
        .description('Module management')
        .alias('mod');
      
      moduleCmd
        .command('install')
        .description('Install module')
        .alias('i');
      
      // Discover and load
      await manager.discoverAndLoad(program);
      
      // Verify findCommand works
      expect(manager.findCommand(program, 'cache')).toBeDefined();
      expect(manager.findCommand(program, 'mod')).toBeDefined();
      expect(manager.findCommand(program, 'module')?.name()).toBe('module');
    });

    it('should merge built-in and dynamic commands', async () => {
      manager.addCommandDirectory(fixturesDir);
      
      // Add a built-in command to program
      program
        .command('built-in')
        .description('Built-in command');
      
      await manager.discoverAndLoad(program);
      
      const builtIn = manager.getBuiltInCommands();
      const dynamic = manager.getDynamicCommands();
      
      expect(builtIn.length).toBeGreaterThanOrEqual(0);
      expect(dynamic.length).toBeGreaterThan(0);
    });
  });

  describe('module context integration', () => {
    it('should have access to global module context', async () => {
      manager.addCommandDirectory(fixturesDir);

      // Suppress expected console errors from test fixtures
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await manager.discoverAndLoad(program);

      // Check that global module context is available
      expect((globalThis as any).__xecModuleContext).toBeDefined();

      consoleErrorSpy.mockRestore();
    });
  });
});
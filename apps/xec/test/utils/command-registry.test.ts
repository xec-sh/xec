import { Command } from 'commander';
import { it, expect, describe, beforeEach } from '@jest/globals';

import {
  findCommand,
  registerCliCommands,
  buildCommandRegistry
} from '../../src/utils/command-registry.js';

describe('command-registry', () => {
  let program: Command;
  
  beforeEach(() => {
    program = new Command('xec');
    program.description('Test CLI');
  });
  
  describe('buildCommandRegistry', () => {
    it('should build registry from simple commands', () => {
      // Add test commands
      program
        .command('test')
        .description('Test command')
        .alias('t');
      
      program
        .command('run')
        .description('Run command');
      
      const registry = buildCommandRegistry(program);
      
      // Check that commands were registered
      const allCommands = registry.getAllCommands();
      
      expect(allCommands).toContain('test');
      expect(allCommands).toContain('run');
    });
    
    it('should include command aliases', () => {
      program
        .command('deploy')
        .description('Deploy application')
        .alias('d')
        .alias('dep');
      
      const registry = buildCommandRegistry(program);
      
      const deployCommand = registry.getCommand('deploy');
      expect(deployCommand?.aliases).toEqual(['d', 'dep']);
    });
    
    it('should handle nested subcommands', () => {
      const moduleCmd = program
        .command('module')
        .description('Module management');
      
      moduleCmd
        .command('install')
        .description('Install module');
      
      moduleCmd
        .command('remove')
        .description('Remove module');
      
      const registry = buildCommandRegistry(program);
      const allCommands = registry.getAllCommands();
      
      expect(allCommands).toContain('module');
      expect(allCommands).toContain('module install');
      expect(allCommands).toContain('module remove');
    });
    
    it('should include command descriptions', () => {
      program
        .command('config')
        .description('Manage configuration');
      
      const registry = buildCommandRegistry(program);
      const configCommand = registry.getCommand('config');
      
      expect(configCommand?.description).toBe('Manage configuration');
    });
    
    it('should not register main program if name is xec', () => {
      const registry = buildCommandRegistry(program);
      const allCommands = registry.getAllCommands();
      
      expect(allCommands).not.toContain('xec');
    });
    
    it('should register main program if name is not xec', () => {
      const customProgram = new Command('mycli');
      customProgram.description('My CLI');
      
      const registry = buildCommandRegistry(customProgram);
      const mainCommand = registry.getCommand('mycli');
      
      expect(mainCommand).toBeDefined();
      expect(mainCommand?.description).toBe('My CLI');
    });
  });
  
  describe('registerCliCommands', () => {
    it('should register built-in CLI commands', () => {
      const registry = registerCliCommands(program);
      const allCommands = registry.getAllCommands();
      
      // Check built-in commands
      expect(allCommands).toContain('on');
      expect(allCommands).toContain('in');
      expect(allCommands).toContain('forward');
      expect(allCommands).toContain('logs');
    });
    
    it('should include command aliases for built-in commands', () => {
      const registry = registerCliCommands(program);
      
      const forwardCommand = registry.getCommand('forward');
      expect(forwardCommand?.aliases).toContain('tunnel');
      expect(forwardCommand?.aliases).toContain('port-forward');
      
      const logsCommand = registry.getCommand('logs');
      expect(logsCommand?.aliases).toContain('log');
      expect(logsCommand?.aliases).toContain('tail');
    });
    
    it('should include usage information', () => {
      const registry = registerCliCommands(program);
      
      const onCommand = registry.getCommand('on');
      expect(onCommand?.usage).toBe('xec on <host> <command>');
      
      const inCommand = registry.getCommand('in');
      expect(inCommand?.usage).toBe('xec in <container|pod:name> <command>');
    });
    
    it('should merge with existing commands', () => {
      // Add a command to the program
      program
        .command('custom')
        .description('Custom command');
      
      const registry = registerCliCommands(program);
      const allCommands = registry.getAllCommands();
      
      // Should have both custom and built-in commands
      expect(allCommands).toContain('custom');
      expect(allCommands).toContain('on');
      expect(allCommands).toContain('in');
    });
  });
  
  describe('findCommand', () => {
    beforeEach(() => {
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
      const command = findCommand(program, 'deploy');
      expect(command).toBeDefined();
      expect(command?.name()).toBe('deploy');
    });
    
    it('should find command by alias', () => {
      const command = findCommand(program, 'd');
      expect(command).toBeDefined();
      expect(command?.name()).toBe('deploy');
      
      const testCommand = findCommand(program, 'check');
      expect(testCommand).toBeDefined();
      expect(testCommand?.name()).toBe('test');
    });
    
    it('should find command case-insensitively', () => {
      const command = findCommand(program, 'DEPLOY');
      expect(command).toBeDefined();
      expect(command?.name()).toBe('deploy');
      
      const configCommand = findCommand(program, 'config');
      expect(configCommand).toBeDefined();
      expect(configCommand?.name()).toBe('Config');
    });
    
    it('should find command by case-insensitive alias', () => {
      const command = findCommand(program, 'D');
      expect(command).toBeDefined();
      expect(command?.name()).toBe('deploy');
      
      const testCommand = findCommand(program, 'CHECK');
      expect(testCommand).toBeDefined();
      expect(testCommand?.name()).toBe('test');
    });
    
    it('should return null for non-existent command', () => {
      const command = findCommand(program, 'nonexistent');
      expect(command).toBeNull();
    });
    
    it('should prefer exact match over case-insensitive', () => {
      // Add a command with uppercase name
      program
        .command('TEST')
        .description('Uppercase test');
      
      // Should find the lowercase 'test' command when searching for 'test'
      const command = findCommand(program, 'test');
      expect(command).toBeDefined();
      expect(command?.name()).toBe('test');
      expect(command?.description()).toBe('Run tests');
    });
  });
  
  describe('integration', () => {
    it('should work with complex command structure', () => {
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
      
      // Register all commands
      const registry = registerCliCommands(program);
      
      // Verify structure
      const allCommands = registry.getAllCommands();
      
      expect(allCommands).toContain('cache');
      expect(allCommands).toContain('cache clear');
      expect(allCommands).toContain('cache show');
      expect(allCommands).toContain('module');
      expect(allCommands).toContain('module install');
      
      // Verify findCommand works
      expect(findCommand(program, 'cache')).toBeDefined();
      expect(findCommand(program, 'mod')).toBeDefined();
      expect(findCommand(program, 'module')?.name()).toBe('module');
    });
  });
});
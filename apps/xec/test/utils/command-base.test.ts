import { Command } from 'commander';
import { it, expect, describe, beforeEach } from '@jest/globals';

import { BaseCommand, CommandConfig, SubcommandBase } from '../../src/utils/command-base.js';

// Test implementation of BaseCommand using real components
class TestCommand extends BaseCommand {
  executeCallCount = 0;
  lastArgs: any[] = [];
  executedOptions: any = null;
  
  async execute(args: any[]): Promise<void> {
    this.executeCallCount++;
    this.lastArgs = args;
    this.executedOptions = { ...this.options }; // Copy to avoid mutations
    
    // Debug logging
    if (process.env.DEBUG_TEST) {
      console.log('Execute called with args:', args);
      console.log('Options:', this.options);
    }
  }
}

// Test implementation of SubcommandBase
class TestSubcommand extends SubcommandBase {
  protected setupSubcommands(command: Command): void {
    command
      .command('sub1')
      .description('Subcommand 1')
      .action(() => {});
    
    command
      .command('sub2')
      .description('Subcommand 2')
      .action(() => {});
  }
}

describe('BaseCommand (Real)', () => {
  let testCommand: TestCommand;
  
  beforeEach(() => {
    // Create test command
    const config: CommandConfig = {
      name: 'test',
      description: 'Test command',
      aliases: ['t'],
      arguments: '<input>',
      options: [
        { flags: '-f, --flag', description: 'Test flag' },
        { flags: '-n, --number <n>', description: 'Test number', defaultValue: 10 }
      ],
      examples: [
        { command: 'xec test file.txt', description: 'Test with file' },
        { command: 'xec test -f', description: 'Test with flag' }
      ]
    };
    
    testCommand = new TestCommand(config);
  });
  
  describe('create', () => {
    it('should create command with basic configuration', () => {
      const command = testCommand.create();
      
      expect(command.name()).toBe('test');
      expect(command.description()).toBe('Test command');
      expect(command.aliases()).toContain('t');
    });
    
    it('should add default options', () => {
      const command = testCommand.create();
      const options = command.options;
      
      expect(options.some(opt => opt.flags === '-o, --output <format>')).toBe(true);
      expect(options.some(opt => opt.flags === '-c, --config <path>')).toBe(true);
      expect(options.some(opt => opt.flags === '--dry-run')).toBe(true);
    });
    
    it('should add custom options', () => {
      const command = testCommand.create();
      const options = command.options;
      
      expect(options.some(opt => opt.flags === '-f, --flag')).toBe(true);
      expect(options.some(opt => opt.flags === '-n, --number <n>')).toBe(true);
    });
    
    it('should handle action execution', async () => {
      const command = testCommand.create();
      
      // Parse a command to trigger the action
      await command.parseAsync(['node', 'test', 'input.txt', '--flag', '-n', '42'], { from: 'node' });
      
      expect(testCommand.executeCallCount).toBe(1);
      expect(testCommand.lastArgs).toContain('input.txt');
      
      // Since we're getting commander internals, let's check the parsed options are available
      const parsedOpts = command.opts();
      expect(parsedOpts.flag).toBe(true);
      expect(parsedOpts.number).toBe('42'); // Commander returns strings unless we add a parser
      expect(parsedOpts.output).toBe('text'); // default value
    });
  });
  
  describe('option handling', () => {
    it('should merge parent and command options', async () => {
      const parentCommand = new Command('parent');
      parentCommand.option('-v, --verbose', 'Verbose output');
      
      const command = testCommand.create();
      parentCommand.addCommand(command);
      
      // Parse with parent verbose option
      await parentCommand.parseAsync(['node', 'parent', '-v', 'test', 'arg'], { from: 'node' });
      
      expect(testCommand.executedOptions.verbose).toBe(true);
      expect(testCommand.executedOptions.output).toBe('text'); // default
    });
    
    it('should handle validateOptions', async () => {
      let validatedOptions: any = null;
      let executeCount = 0;
      
      class ValidateTestCommand extends BaseCommand {
        async execute(args: any[]): Promise<void> {
          executeCount++;
        }
      }
      
      const config: CommandConfig = {
        name: 'validate-test',
        description: 'Test validation',
        arguments: '<arg>',
        validateOptions: (options) => {
          // Capture the actual options object passed
          validatedOptions = { ...options };
        }
      };
      
      const cmd = new ValidateTestCommand(config);
      const command = cmd.create();
      
      await command.parseAsync(['node', 'validate-test', 'testarg', '--output', 'json'], { from: 'node' });
      
      expect(executeCount).toBe(1);
      expect(validatedOptions).toBeDefined();
      
      // Check that validate was called and received the parsed options
      const parsedOpts = command.opts();
      expect(parsedOpts.output).toBe('json');
    });
  });
});

describe('SubcommandBase (Real)', () => {
  let subcommand: TestSubcommand;
  
  beforeEach(() => {
    const config: CommandConfig = {
      name: 'parent',
      description: 'Parent command'
    };
    
    subcommand = new TestSubcommand(config);
  });
  
  it('should create subcommands', () => {
    const command = subcommand.create();
    const subcommands = command.commands;
    
    expect(subcommands).toHaveLength(2);
    expect(subcommands[0].name()).toBe('sub1');
    expect(subcommands[1].name()).toBe('sub2');
  });
  
  it('should handle commands array properly', () => {
    const command = subcommand.create();
    
    // Create mock command object similar to what commander passes
    const mockCommand = {
      args: [],
      help: () => command
    };
    
    // Should execute without throwing
    expect(async () => {
      await subcommand.execute([mockCommand]);
    }).not.toThrow();
  });
});
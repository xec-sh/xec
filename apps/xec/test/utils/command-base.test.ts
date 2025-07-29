import { Command } from 'commander';
import * as clack from '@clack/prompts';
import { it, jest, expect, describe, beforeEach } from '@jest/globals';

import { BaseCommand, CommandConfig, SubcommandBase } from '../../src/utils/command-base.js';

// Mock clack
jest.mock('@clack/prompts', () => ({
  spinner: jest.fn(() => ({
    start: jest.fn(),
    stop: jest.fn()
  })),
  log: {
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  },
  intro: jest.fn(),
  outro: jest.fn(),
  confirm: jest.fn(),
  text: jest.fn(),
  select: jest.fn(),
  multiselect: jest.fn()
}));

// Mock OutputFormatter
jest.mock('../../src/utils/output-formatter.js', () => ({
  OutputFormatter: jest.fn().mockImplementation(() => ({
    setFormat: jest.fn(),
    setQuiet: jest.fn(),
    setVerbose: jest.fn(),
    output: jest.fn(),
    table: jest.fn()
  }))
}));

// Mock error handler
jest.mock('../../src/utils/error-handler.js', () => ({
  handleError: jest.fn()
}));

// Test implementation of BaseCommand
class TestCommand extends BaseCommand {
  executeCallCount = 0;
  lastArgs: any[] = [];
  
  async execute(args: any[]): Promise<void> {
    this.executeCallCount++;
    this.lastArgs = args;
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

describe('BaseCommand', () => {
  let testCommand: TestCommand;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
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
    
    it('should add arguments', () => {
      const command = testCommand.create();
      expect(command.usage()).toContain('<input>');
    });
    
    it('should add examples to help text', () => {
      const command = testCommand.create();
      const helpText = command.helpInformation();
      
      expect(helpText).toContain('xec test file.txt');
      expect(helpText).toContain('Test with file');
    });
    
    it('should handle action execution', async () => {
      const command = testCommand.create();
      
      // Simulate command execution
      await command.parseAsync(['node', 'test', 'input.txt', '--output', 'json'], { from: 'node' });
      
      expect(testCommand.executeCallCount).toBe(1);
    });
    
    it('should validate options when validator is provided', async () => {
      const validateOptions = jest.fn();
      const config: CommandConfig = {
        name: 'validate-test',
        description: 'Test validation',
        validateOptions
      };
      
      const cmd = new TestCommand(config);
      const command = cmd.create();
      
      await command.parseAsync(['node', 'validate-test'], { from: 'node' });
      
      expect(validateOptions).toHaveBeenCalled();
    });
    
    it('should inherit parent options', async () => {
      const parentCommand = new Command();
      parentCommand.option('-v, --verbose', 'Verbose output');
      parentCommand.option('-q, --quiet', 'Quiet output');
      
      const command = testCommand.create();
      parentCommand.addCommand(command);
      
      await parentCommand.parseAsync(['node', 'test', 'test', 'input.txt', '-v'], { from: 'node' });
      
      expect(testCommand['options'].verbose).toBe(true);
    });
  });
  
  describe('spinner methods', () => {
    it('should start spinner when not quiet', () => {
      testCommand['options'].quiet = false;
      testCommand['startSpinner']('Loading...');
      
      expect(clack.spinner).toHaveBeenCalled();
      expect(mockSpinner.start).toHaveBeenCalledWith('Loading...');
    });
    
    it('should not start spinner when quiet', () => {
      testCommand['options'].quiet = true;
      testCommand['startSpinner']('Loading...');
      
      expect(clack.spinner).not.toHaveBeenCalled();
    });
    
    it('should stop spinner', () => {
      testCommand['spinner'] = mockSpinner;
      testCommand['stopSpinner']('Done');
      
      expect(mockSpinner.stop).toHaveBeenCalledWith('Done');
      expect(testCommand['spinner']).toBeNull();
    });
  });
  
  describe('logging methods', () => {
    it('should log info messages', () => {
      testCommand['options'].quiet = false;
      testCommand['log']('Info message');
      
      expect(clack.log.info).toHaveBeenCalledWith('Info message');
    });
    
    it('should log success messages', () => {
      testCommand['options'].quiet = false;
      testCommand['log']('Success!', 'success');
      
      expect(clack.log.success).toHaveBeenCalledWith('Success!');
    });
    
    it('should log warning messages', () => {
      testCommand['options'].quiet = false;
      testCommand['log']('Warning!', 'warn');
      
      expect(clack.log.warn).toHaveBeenCalledWith('Warning!');
    });
    
    it('should log error messages', () => {
      testCommand['options'].quiet = false;
      testCommand['log']('Error!', 'error');
      
      expect(clack.log.error).toHaveBeenCalledWith('Error!');
    });
    
    it('should not log when quiet', () => {
      testCommand['options'].quiet = true;
      testCommand['log']('Should not appear');
      
      expect(clack.log.info).not.toHaveBeenCalled();
    });
  });
  
  describe('output methods', () => {
    it('should output data', () => {
      const data = { key: 'value' };
      testCommand['output'](data, 'Title');
      
      expect(testCommand['formatter'].output).toHaveBeenCalledWith(data, 'Title');
    });
    
    it('should output table with headers', () => {
      const rows = [
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 }
      ];
      const headers = ['name', 'age'];
      
      testCommand['table'](rows, headers);
      
      expect(testCommand['formatter'].table).toHaveBeenCalledWith({
        columns: [{ header: 'name' }, { header: 'age' }],
        rows: [['John', 30], ['Jane', 25]]
      });
    });
    
    it('should output table without headers', () => {
      const rows = [{ name: 'John', age: 30 }];
      
      testCommand['table'](rows);
      
      expect(testCommand['formatter'].table).toHaveBeenCalledWith({
        columns: [{ header: 'name' }, { header: 'age' }],
        rows: [['John', 30]]
      });
    });
  });
  
  describe('interactive methods', () => {
    it('should confirm with user', async () => {
      (clack.confirm as jest.Mock).mockResolvedValue(true);
      
      const result = await testCommand['confirm']('Continue?', false);
      
      expect(clack.confirm).toHaveBeenCalledWith({
        message: 'Continue?',
        initialValue: false
      });
      expect(result).toBe(true);
    });
    
    it('should return initial value when quiet', async () => {
      testCommand['options'].quiet = true;
      
      const result = await testCommand['confirm']('Continue?', true);
      
      expect(clack.confirm).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });
    
    it('should handle cancelled confirmation', async () => {
      (clack.confirm as jest.Mock).mockResolvedValue(Symbol('cancelled'));
      
      const result = await testCommand['confirm']('Continue?', false);
      
      expect(result).toBe(false);
    });
    
    it('should prompt for text input', async () => {
      (clack.text as jest.Mock).mockResolvedValue('user input');
      
      const result = await testCommand['prompt']('Enter value:', 'default');
      
      expect(clack.text).toHaveBeenCalledWith({
        message: 'Enter value:',
        initialValue: 'default'
      });
      expect(result).toBe('user input');
    });
    
    it('should return default when prompt is cancelled', async () => {
      (clack.text as jest.Mock).mockResolvedValue(Symbol('cancelled'));
      
      const result = await testCommand['prompt']('Enter value:', 'default');
      
      expect(result).toBe('default');
    });
    
    it('should select from options', async () => {
      const options = [
        { value: 'a', label: 'Option A' },
        { value: 'b', label: 'Option B' }
      ];
      (clack.select as jest.Mock).mockResolvedValue('b');
      
      const result = await testCommand['select']('Choose:', options);
      
      expect(clack.select).toHaveBeenCalledWith({
        message: 'Choose:',
        options
      });
      expect(result).toBe('b');
    });
    
    it('should multiselect from options', async () => {
      const options = [
        { value: 'a', label: 'Option A' },
        { value: 'b', label: 'Option B' }
      ];
      (clack.multiselect as jest.Mock).mockResolvedValue(['a', 'b']);
      
      const result = await testCommand['multiselect']('Choose multiple:', options);
      
      expect(clack.multiselect).toHaveBeenCalledWith({
        message: 'Choose multiple:',
        options
      });
      expect(result).toEqual(['a', 'b']);
    });
  });
  
  describe('intro/outro methods', () => {
    it('should show intro', () => {
      testCommand['intro']('Welcome!');
      
      expect(clack.intro).toHaveBeenCalledWith('Welcome!');
    });
    
    it('should show outro', () => {
      testCommand['outro']('Goodbye!');
      
      expect(clack.outro).toHaveBeenCalledWith('Goodbye!');
    });
    
    it('should not show intro/outro when quiet', () => {
      testCommand['options'].quiet = true;
      
      testCommand['intro']('Welcome!');
      testCommand['outro']('Goodbye!');
      
      expect(clack.intro).not.toHaveBeenCalled();
      expect(clack.outro).not.toHaveBeenCalled();
    });
  });
  
  describe('option getters', () => {
    it('should check dry run', () => {
      testCommand['options'].dryRun = true;
      expect(testCommand['isDryRun']()).toBe(true);
      
      testCommand['options'].dryRun = false;
      expect(testCommand['isDryRun']()).toBe(false);
    });
    
    it('should check verbose', () => {
      testCommand['options'].verbose = true;
      expect(testCommand['isVerbose']()).toBe(true);
      
      testCommand['options'].verbose = false;
      expect(testCommand['isVerbose']()).toBe(false);
    });
    
    it('should check quiet', () => {
      testCommand['options'].quiet = true;
      expect(testCommand['isQuiet']()).toBe(true);
      
      testCommand['options'].quiet = false;
      expect(testCommand['isQuiet']()).toBe(false);
    });
  });
});

describe('SubcommandBase', () => {
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
  
  it('should show help when no subcommand is provided', async () => {
    const command = subcommand.create();
    const helpSpy = jest.spyOn(command, 'help').mockImplementation(() => command);
    
    // Execute without subcommand
    const mockCommand = { args: [], help: helpSpy };
    await subcommand.execute([mockCommand]);
    
    expect(helpSpy).toHaveBeenCalled();
  });
});
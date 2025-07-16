import path from 'path';
import { Command } from 'commander';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import configCommand from '../../src/commands/config.js';

const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockStat = jest.fn();
const mockMkdir = jest.fn();
const mockHomedir = jest.fn();

jest.mock('fs/promises', () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  stat: mockStat,
  mkdir: mockMkdir
}));
jest.mock('os', () => ({
  homedir: mockHomedir
}));
jest.mock('@inquirer/prompts', () => ({
  input: jest.fn(),
  select: jest.fn(),
  confirm: jest.fn()
}));

describe('config command', () => {
  let program: Command;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  const mockConfigPath = path.join('/mock/home', '.xec', 'config.json');

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    mockHomedir.mockReturnValue('/mock/home');
    
    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath === mockConfigPath) {
        return Buffer.from(JSON.stringify({
          version: '1.0.0',
          defaults: {
            shell: '/bin/bash',
            timeout: 30000,
            verbose: false
          }
        }));
      }
      throw new Error('File not found');
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should register config command with subcommands', () => {
    const parentProgram = new Command();
    configCommand(parentProgram);
    const cmd = parentProgram.commands.find(c => c.name() === 'config');
    expect(cmd).toBeDefined();
    expect(cmd?.name()).toBe('config');
    expect(cmd?.description()).toContain('configuration');
    
    const subcommands = cmd?.commands.map(c => c.name()) || [];
    expect(subcommands).toContain('get');
    expect(subcommands).toContain('set');
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('init');
  });

  it('should get a specific config value', async () => {
    configCommand(program);
    
    await program.parseAsync(['config', 'get', 'defaults.shell'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalledWith('/bin/bash');
  });

  it('should set a config value', async () => {
    configCommand(program);
    
    const writeFileSpy = mockWriteFile;
    mockMkdir.mockResolvedValue(undefined);
    
    await program.parseAsync(['config', 'set', 'defaults.timeout', '60000'], { from: 'user' });
    
    expect(writeFileSpy).toHaveBeenCalledWith(
      mockConfigPath,
      expect.stringContaining('"timeout":60000'),
      'utf8'
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Updated defaults.timeout'));
  });

  it('should list all config values', async () => {
    configCommand(program);
    
    await program.parseAsync(['config', 'list'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Configuration'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('shell'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('/bin/bash'));
  });

  it('should initialize config interactively', async () => {
    configCommand(program);
    
    const { input, select, confirm } = await import('@inquirer/prompts');
    (input as jest.Mock).mockResolvedValueOnce('/bin/zsh');
    (input as jest.Mock).mockResolvedValueOnce('45000');
    (confirm as jest.Mock).mockResolvedValueOnce(true);
    
    const writeFileSpy = mockWriteFile;
    mockMkdir.mockResolvedValue(undefined);
    
    await program.parseAsync(['config', 'init'], { from: 'user' });
    
    expect(writeFileSpy).toHaveBeenCalledWith(
      mockConfigPath,
      expect.stringContaining('/bin/zsh'),
      'utf8'
    );
  });

  it('should handle global config flag', async () => {
    configCommand(program);
    
    await program.parseAsync(['config', 'list', '--global'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Global Configuration'));
  });

  it('should validate config values', async () => {
    configCommand(program);
    
    await expect(
      program.parseAsync(['config', 'set', 'defaults.timeout', 'invalid'], { from: 'user' })
    ).rejects.toThrow();
    
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid value'));
  });

  it('should handle missing config file', async () => {
    configCommand(program);
    
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    
    await program.parseAsync(['config', 'list'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No configuration found'));
  });
});
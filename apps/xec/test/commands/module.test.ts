import { Command } from 'commander';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import moduleCommand from '../../src/commands/module.js';

const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockStat = jest.fn();
const mockMkdir = jest.fn();

jest.mock('fs/promises', () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  stat: mockStat,
  mkdir: mockMkdir
}));
jest.mock('@xec-js/core', () => ({
  loadProject: jest.fn().mockResolvedValue({
    name: 'test-project'
  }),
  ModuleRegistry: {
    getInstance: jest.fn().mockReturnValue({
      getAvailableModules: jest.fn().mockReturnValue([
        { name: 'file', version: '1.0.0', description: 'File operations module' },
        { name: 'shell', version: '1.0.0', description: 'Shell command execution' },
        { name: 'template', version: '1.0.0', description: 'Template processing' }
      ]),
      getModule: jest.fn().mockImplementation((name) => ({
        name,
        version: '1.0.0',
        description: 'Module description',
        parameters: {
          path: { type: 'string', required: true },
          mode: { type: 'string', default: '0644' }
        }
      })),
      installModule: jest.fn().mockResolvedValue({ success: true }),
      uninstallModule: jest.fn().mockResolvedValue({ success: true }),
      updateModule: jest.fn().mockResolvedValue({ success: true, version: '1.1.0' }),
      searchModules: jest.fn().mockResolvedValue([
        { name: 'aws-s3', version: '2.0.0', description: 'AWS S3 operations' },
        { name: 'docker-compose', version: '1.5.0', description: 'Docker Compose management' }
      ])
    })
  },
  ModuleLoader: jest.fn(() => ({
    load: jest.fn().mockResolvedValue({
      name: 'custom-module',
      execute: jest.fn()
    })
  })),
  Logger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

describe('module command', () => {
  let program: Command;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation((() => { }) as any);

    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath.toString().includes('module.yaml')) {
        return Buffer.from(`
name: custom-module
version: 1.0.0
description: Custom module
parameters:
  path:
    type: string
    required: true
`);
      }
      throw new Error('File not found');
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should register module command with subcommands', () => {
    const parentProgram = new Command();
    moduleCommand(parentProgram);
    const cmd = parentProgram.commands.find(c => c.name() === 'module');
    expect(cmd).toBeDefined();
    expect(cmd?.name()).toBe('module');
    expect(cmd?.description()).toContain('modules');

    const subcommands = cmd?.commands.map(c => c.name()) || [];
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('info');
    expect(subcommands).toContain('install');
    expect(subcommands).toContain('uninstall');
    expect(subcommands).toContain('update');
    expect(subcommands).toContain('search');
    expect(subcommands).toContain('create');
  });

  it('should list installed modules', async () => {
    moduleCommand(program);

    await program.parseAsync(['module', 'list'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Installed Modules'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('file'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('shell'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('1.0.0'));
  });

  it('should show module information', async () => {
    moduleCommand(program);

    await program.parseAsync(['module', 'info', 'file'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Module Information'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('file'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Parameters'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('path'));
  });

  it('should install a module', async () => {
    moduleCommand(program);

    await program.parseAsync(['module', 'install', 'aws-s3'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Installing module'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Module installed successfully'));
  });

  it('should install module with specific version', async () => {
    moduleCommand(program);

    await program.parseAsync(['module', 'install', 'aws-s3@2.0.0'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('aws-s3@2.0.0'));
  });

  it('should uninstall a module', async () => {
    moduleCommand(program);

    await program.parseAsync(['module', 'uninstall', 'file', '--force'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Module uninstalled'));
  });

  it('should update a module', async () => {
    moduleCommand(program);

    await program.parseAsync(['module', 'update', 'file'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Module updated'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('1.1.0'));
  });

  it('should search for modules', async () => {
    moduleCommand(program);

    await program.parseAsync(['module', 'search', 'aws'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Search Results'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('aws-s3'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('AWS S3 operations'));
  });

  it('should create a new module scaffold', async () => {
    moduleCommand(program);

    const mkdirSpy = mockMkdir;
    const writeFileSpy = mockWriteFile;

    await program.parseAsync(['module', 'create', 'my-module'], { from: 'user' });

    expect(mkdirSpy).toHaveBeenCalledWith(expect.stringContaining('my-module'), { recursive: true });
    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('module.yaml'),
      expect.stringContaining('name: my-module')
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Module scaffold created'));
  });

  it('should validate module dependencies', async () => {
    moduleCommand(program);

    await program.parseAsync(['module', 'validate', 'custom-module.yaml'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Module is valid'));
  });

  it('should handle module installation failures', async () => {
    moduleCommand(program);

    const { ModuleRegistry } = await import('@xec-js/core');
    const mockRegistry = ModuleRegistry.getInstance();
    (mockRegistry.installModule as jest.Mock).mockRejectedValue(new Error('Network error'));

    await expect(
      program.parseAsync(['module', 'install', 'aws-s3'], { from: 'user' })
    ).rejects.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to install'));
  });

  it('should publish module to registry', async () => {
    moduleCommand(program);

    const { ModuleRegistry } = await import('@xec-js/core');
    const mockRegistry = ModuleRegistry.getInstance();
    (mockRegistry as any).publishModule = jest.fn().mockResolvedValue({ success: true, url: 'https://registry.xec.sh/my-module' });

    await program.parseAsync(['module', 'publish', './my-module'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Module published'));
  });
});
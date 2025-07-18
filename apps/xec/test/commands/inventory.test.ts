import { Command } from 'commander';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import inventoryCommand from '../../src/commands/inventory.js';

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
jest.mock('../../src/utils/project.js', () => ({
  getProjectRoot: jest.fn().mockResolvedValue('/mock/project')
}));

jest.mock('@xec-js/core', () => ({
  loadProject: jest.fn().mockResolvedValue({
    inventory: {
      getHosts: jest.fn().mockReturnValue([
        { name: 'web1', host: '192.168.1.10', groups: ['webservers'], tags: ['production'] },
        { name: 'web2', host: '192.168.1.11', groups: ['webservers'], tags: ['production'] },
        { name: 'db1', host: '192.168.1.20', groups: ['databases'], tags: ['production', 'primary'] }
      ]),
      getGroups: jest.fn().mockReturnValue(['webservers', 'databases', 'all']),
      getHost: jest.fn().mockImplementation((name) => ({
        name,
        host: '192.168.1.10',
        user: 'deploy',
        port: 22,
        vars: { env: 'production' }
      })),
      addHost: jest.fn().mockResolvedValue({ success: true }),
      removeHost: jest.fn().mockResolvedValue({ success: true }),
      updateHost: jest.fn().mockResolvedValue({ success: true })
    }
  }),
  InventoryLoader: jest.fn(() => ({
    load: jest.fn().mockResolvedValue({
      hosts: {
        web1: { host: '192.168.1.10' },
        web2: { host: '192.168.1.11' }
      },
      groups: {
        webservers: { hosts: ['web1', 'web2'] }
      }
    })
  })),
  Logger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

describe('inventory command', () => {
  let program: Command;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let exitSpy: any;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath.toString().includes('inventory.yaml')) {
        return Buffer.from(`
hosts:
  web1:
    name: web1
    host: 192.168.1.10
    hostname: 192.168.1.10
    port: 22
    user: admin
    tags: 
      - production
  web2:
    name: web2
    host: 192.168.1.11
    hostname: 192.168.1.11
    port: 22
    user: admin
    tags: 
      - production
  db1:
    name: db1
    host: 192.168.1.20
    hostname: 192.168.1.20
    port: 22
    user: admin
    tags:
      - database
groups:
  webservers:
    name: webservers
    hosts:
      - web1
      - web2
    vars:
      http_port: 80
  databases:
    name: databases
    hosts:
      - db1
    vars:
      db_port: 5432
`);
      }
      throw new Error('File not found');
    });

    // Mock process.exit to prevent tests from exiting
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
      throw new Error(`Process exited with code ${code}`);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    exitSpy?.mockRestore();
  });

  it('should register inventory command with subcommands', () => {
    const parentProgram = new Command();
    inventoryCommand(parentProgram);
    const cmd = parentProgram.commands.find(c => c.name() === 'inventory');
    expect(cmd).toBeDefined();
    expect(cmd?.name()).toBe('inventory');
    expect(cmd?.description()).toContain('inventory');

    const subcommands = cmd?.commands.map(c => c.name()) || [];
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('add');
    expect(subcommands).toContain('remove');
  });

  it('should list all hosts', async () => {
    inventoryCommand(program);

    await program.parseAsync(['inventory', 'list'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Hosts'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('web1'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('192.168.1.10'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('webservers'));
  });

  it('should filter hosts by group', async () => {
    inventoryCommand(program);

    await program.parseAsync(['inventory', 'list', '--groups'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('web1'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('web2'));
    expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('db1'));
  });

  it('should filter hosts by tags', async () => {
    inventoryCommand(program);

    await program.parseAsync(['inventory', 'list', '--tags', 'production'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('web1'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('db1'));
  });

  it('should show detailed host information', async () => {
    inventoryCommand(program);

    await program.parseAsync(['inventory', 'show', 'web1'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Host Details'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('192.168.1.10'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('deploy'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('22'));
  });

  it('should add a new host', async () => {
    inventoryCommand(program);

    await program.parseAsync([
      'inventory', 'add', 'web3',
      '--host', '192.168.1.12',
      '--user', 'deploy',
      '--port', '22',
      '--group', 'webservers',
      '--tag', 'production'
    ], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Host added successfully'));
  });

  it('should remove a host', async () => {
    inventoryCommand(program);

    await program.parseAsync(['inventory', 'remove', 'web1', '--force'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Host removed'));
  });

  it('should edit host properties', async () => {
    inventoryCommand(program);

    await program.parseAsync([
      'inventory', 'edit', 'web1',
      '--user', 'newuser',
      '--port', '2222'
    ], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Host updated'));
  });

  it('should import inventory from file', async () => {
    inventoryCommand(program);

    await program.parseAsync(['inventory', 'import', 'inventory.yaml'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Imported'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('2 hosts'));
  });

  it('should export inventory in different formats', async () => {
    inventoryCommand(program);

    const writeFileSpy = mockWriteFile;

    await program.parseAsync(['inventory', 'list', '--output', 'inventory.json', '--format', 'json'], { from: 'user' });

    expect(writeFileSpy).toHaveBeenCalledWith(
      'inventory.json',
      expect.stringContaining('"web1"')
    );
  });

  it('should validate host connectivity', async () => {
    inventoryCommand(program);

    await program.parseAsync(['inventory', 'validate'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Validating inventory'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('All hosts reachable'));
  });
});
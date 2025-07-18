import { Command } from 'commander';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import stateCommand from '../../src/commands/state.js';

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
  StateManager: jest.fn(() => ({
    getCurrentState: jest.fn().mockResolvedValue({
      version: 3,
      timestamp: new Date('2024-01-01T12:00:00Z'),
      resources: {
        'server-1': { type: 'server', status: 'running' },
        'database-1': { type: 'database', status: 'running' }
      }
    }),
    getStateHistory: jest.fn().mockResolvedValue([
      { version: 3, timestamp: new Date('2024-01-01T12:00:00Z'), action: 'update' },
      { version: 2, timestamp: new Date('2024-01-01T11:00:00Z'), action: 'create' },
      { version: 1, timestamp: new Date('2024-01-01T10:00:00Z'), action: 'init' }
    ]),
    lockState: jest.fn().mockResolvedValue({ lockId: 'lock-123', acquired: true }),
    unlockState: jest.fn().mockResolvedValue({ success: true }),
    pushState: jest.fn().mockResolvedValue({ success: true, version: 4 }),
    pullState: jest.fn().mockResolvedValue({ success: true, version: 4 }),
    diffStates: jest.fn().mockResolvedValue({
      added: ['server-2'],
      removed: [],
      modified: ['database-1']
    }),
    backupState: jest.fn().mockResolvedValue({ path: '/backups/state-backup-123.json' }),
    restoreState: jest.fn().mockResolvedValue({ success: true })
  })),
  Logger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

describe('state command', () => {
  let program: Command;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath.toString().includes('.xec-state')) {
        return Buffer.from(JSON.stringify({
          version: 3,
          resources: {
            'server-1': { type: 'server', status: 'running' }
          }
        }));
      }
      throw new Error('File not found');
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should register state command with subcommands', () => {
    const parentProgram = new Command();
    stateCommand(parentProgram);
    const cmd = parentProgram.commands.find(c => c.name() === 'state');
    expect(cmd).toBeDefined();
    expect(cmd?.name()).toBe('state');
    expect(cmd?.description()).toContain('execution state');

    const subcommands = cmd?.commands.map(c => c.name()) || [];
    expect(subcommands).toContain('show');
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('history');
    expect(subcommands).toContain('export');
    expect(subcommands).toContain('import');
    expect(subcommands).toContain('reset');
    expect(subcommands).toContain('lock');
    expect(subcommands).toContain('unlock');
  });

  it.skip('should show current state', async () => {
    stateCommand(program);

    await program.parseAsync(['state', 'show'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Current State'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Version: 3'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('server-1'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('database-1'));
  });

  it.skip('should list state history', async () => {
    stateCommand(program);

    await program.parseAsync(['state', 'list'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('State History'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Version 3'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('update'));
  });

  it.skip('should lock state', async () => {
    stateCommand(program);

    await program.parseAsync(['state', 'lock', 'mykey'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('State locked'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('lock-123'));
  });

  it.skip('should unlock state', async () => {
    stateCommand(program);

    await program.parseAsync(['state', 'unlock', 'mykey'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('State unlocked'));
  });

  it.skip('should force unlock state', async () => {
    stateCommand(program);

    await program.parseAsync(['state', 'unlock', 'mykey', '--force'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('State unlocked'));
  });

  it.skip('should export state to file', async () => {
    stateCommand(program);

    await program.parseAsync(['state', 'export', 'state.json'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('State exported'));
  });

  it.skip('should import state from file', async () => {
    stateCommand(program);

    await program.parseAsync(['state', 'import', 'state.json'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('State imported'));
  });

  it.skip('should show state history', async () => {
    stateCommand(program);

    await program.parseAsync(['state', 'history'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('State History'));
  });

  it.skip('should reset state', async () => {
    stateCommand(program);

    await program.parseAsync(['state', 'reset', '--force'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('State reset'));
  });

  it.skip('should list state keys', async () => {
    stateCommand(program);

    await program.parseAsync(['state', 'list'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('State Keys'));
  });

  it.skip('should handle state conflicts', async () => {
    stateCommand(program);

    const { StateManager } = await import('@xec-js/core');
    (StateManager as jest.Mock).mockImplementation(() => ({
      pushState: jest.fn().mockRejectedValue(new Error('State conflict: remote state has been modified'))
    } as any));

    await expect(
      program.parseAsync(['state', 'push'], { from: 'user' })
    ).rejects.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('State conflict'));
  });

  it.skip('should migrate state format', async () => {
    stateCommand(program);

    const { StateManager } = await import('@xec-js/core');
    (StateManager as jest.Mock).mockImplementation(() => ({
      migrateState: jest.fn().mockResolvedValue({ success: true, fromVersion: 2, toVersion: 3 })
    } as any));

    await program.parseAsync(['state', 'migrate'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('State migrated'));
  });

  it.skip('should show state with specific key', async () => {
    stateCommand(program);

    await program.parseAsync(['state', 'show', 'server-1'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('State key'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('server-1'));
  });
});
import { Command } from 'commander';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import auditCommand from '../../src/commands/audit.js';

// Mock fs/promises
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockStat = jest.fn();
const mockMkdir = jest.fn();

jest.mock('fs/promises', () => ({
  promises: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    stat: mockStat,
    mkdir: mockMkdir
  },
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  stat: mockStat,
  mkdir: mockMkdir
}));

jest.mock('@xec/core', () => ({
  loadProject: jest.fn(),
  SecurityValidator: jest.fn(() => ({
    validateFile: jest.fn().mockResolvedValue({ isValid: true, issues: [] }),
    validateRecipe: jest.fn().mockResolvedValue({ isValid: true, issues: [] })
  })),
  Logger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

describe('audit command', () => {
  let program: Command;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    program = new Command();
    program.exitOverride(); // Prevent process.exit during tests
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Reset all mocks before each test
    mockWriteFile.mockClear();
    mockWriteFile.mockResolvedValue(undefined);
    
    mockReadFile.mockImplementation(async (filePath) => {
      if (filePath.toString().includes('xec.yaml')) {
        return Buffer.from('name: test-project\nversion: 1.0.0');
      }
      if (filePath.toString().includes('.audit.log')) {
        return Buffer.from('[{"timestamp":"2024-01-01T00:00:00Z","action":"CREATE","resourceType":"file","resourceId":"test.js"}]');
      }
      throw new Error('File not found');
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should register audit command with correct options', () => {
    const parentProgram = new Command();
    auditCommand(parentProgram);
    const cmd = parentProgram.commands.find(c => c.name() === 'audit');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain('audit');
  });

  it('should perform audit show command', async () => {
    auditCommand(program);
    
    await program.parseAsync(['audit', 'show'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should export audit data', async () => {
    auditCommand(program);
    
    const writeFileSpy = mockWriteFile;
    
    await program.parseAsync(['audit', 'export', 'audit-export.json', '--format', 'json'], { from: 'user' });
    
    expect(writeFileSpy).toHaveBeenCalled();
  });

  it('should filter audit logs', async () => {
    auditCommand(program);
    
    await program.parseAsync(['audit', 'show', '--user', 'testuser', '--action', 'CREATE'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    auditCommand(program);
    
    mockReadFile.mockRejectedValue(new Error('Permission denied'));
    
    // The audit show command won't throw, it will just show no logs
    await program.parseAsync(['audit', 'show'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalled();
  });
});
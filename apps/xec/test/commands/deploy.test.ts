import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Command } from 'commander';
import deployCommand from '../../src/commands/deploy.js';

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

jest.mock('@xec/core', () => ({
  loadProject: jest.fn().mockResolvedValue({
    deploy: jest.fn().mockResolvedValue({ success: true, deploymentId: 'test-deploy-123' })
  }),
  Logger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })),
  DeploymentManager: jest.fn(() => ({
    deploy: jest.fn().mockResolvedValue({
      id: 'test-deploy-123',
      status: 'success',
      startTime: new Date(),
      endTime: new Date(),
      target: 'production'
    }),
    rollback: jest.fn().mockResolvedValue({ success: true }),
    getDeployments: jest.fn().mockResolvedValue([
      {
        id: 'deploy-1',
        status: 'success',
        target: 'production',
        timestamp: new Date()
      },
      {
        id: 'deploy-2',
        status: 'failed',
        target: 'staging',
        timestamp: new Date()
      }
    ]),
    getDeployment: jest.fn().mockResolvedValue({
      id: 'deploy-1',
      status: 'success',
      target: 'production',
      tasks: [
        { name: 'build', status: 'completed' },
        { name: 'test', status: 'completed' },
        { name: 'deploy', status: 'completed' }
      ]
    })
  })),
  Task: jest.fn(),
  task: jest.fn(() => ({
    description: jest.fn().mockReturnThis(),
    handler: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({
      name: 'mock-task',
      handler: jest.fn().mockResolvedValue({})
    })
  })),
  Recipe: jest.fn(),
  executeRecipe: jest.fn().mockResolvedValue({ success: true }),
  createExecutionContext: jest.fn().mockResolvedValue({ vars: {} })
}));

const mockSelect = jest.fn();
const mockText = jest.fn();
const mockConfirm = jest.fn();
const mockSpinner = jest.fn(() => ({
  start: jest.fn(),
  stop: jest.fn(),
  message: jest.fn()
}));

jest.mock('@clack/prompts', () => ({
  select: mockSelect,
  text: mockText,
  confirm: mockConfirm,
  spinner: mockSpinner
}));

jest.mock('../utils/recipe.js', () => ({
  loadRecipe: jest.fn().mockResolvedValue({
    id: 'test-recipe',
    name: 'test-recipe',
    tasks: new Map()
  })
}));

jest.mock('../utils/variables.js', () => ({
  parseVariables: jest.fn((vars) => {
    if (!vars) return {};
    const result: Record<string, string> = {};
    const pairs = vars.split(',');
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key && value) result[key] = value;
    }
    return result;
  })
}));

describe('deploy command', () => {
  let program: Command;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Reset mocks
    mockSelect.mockReset();
    mockText.mockReset();
    mockConfirm.mockReset();
    mockSpinner.mockReset();
    mockSpinner.mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
      message: jest.fn()
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should register deploy command with correct options', () => {
    const parentProgram = new Command();
    deployCommand(parentProgram);
    const cmd = parentProgram.commands.find(c => c.name() === 'deploy');
    expect(cmd).toBeDefined();
    expect(cmd?.name()).toBe('deploy');
    expect(cmd?.description()).toContain('Deploy');
    
    const options = cmd?.options.map(opt => opt.long) || [];
    expect(options).toContain('--target');
    expect(options).toContain('--dry-run');
    expect(options).toContain('--force');
    expect(options).toContain('--pattern');
    expect(options).toContain('--rollback');
  });

  it('should deploy recipe interactively', async () => {
    mockSelect.mockResolvedValueOnce('test-recipe'); // selectRecipe
    mockSelect.mockResolvedValueOnce('blue-green'); // selectDeploymentPattern
    mockText.mockResolvedValueOnce('production'); // target
    mockConfirm.mockResolvedValueOnce(true); // confirm deployment
    
    deployCommand(program);
    
    await program.parseAsync(['deploy'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Deployment Plan'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✓'));
  });

  it('should deploy with force option', async () => {
    mockSelect.mockResolvedValueOnce('blue-green'); // selectDeploymentPattern
    mockText.mockResolvedValueOnce('production'); // target
    
    deployCommand(program);
    
    await program.parseAsync(['deploy', 'my-recipe', '--force'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Deployment Plan'));
    expect(mockConfirm).not.toHaveBeenCalled(); // Should skip confirmation with --force
  });

  it('should handle deployment with pattern', async () => {
    mockText.mockResolvedValueOnce('production'); // target
    mockConfirm.mockResolvedValueOnce(true); // confirm
    
    deployCommand(program);
    
    await program.parseAsync(['deploy', 'my-recipe', '--pattern', 'blue-green'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Deployment Plan'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('blue-green'));
  });

  it('should rollback deployment', async () => {
    mockSelect.mockResolvedValueOnce('blue-green'); // selectDeploymentPattern
    mockText.mockResolvedValueOnce('production'); // target
    mockConfirm.mockResolvedValueOnce(true); // confirm
    
    deployCommand(program);
    
    await program.parseAsync(['deploy', 'my-recipe', '--rollback'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Rollback'));
  });

  it('should deploy to specified target', async () => {
    mockSelect.mockResolvedValueOnce('blue-green'); // selectDeploymentPattern
    mockConfirm.mockResolvedValueOnce(true); // confirm
    
    deployCommand(program);
    
    await program.parseAsync(['deploy', 'my-recipe', '--target', 'production'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Deployment Plan'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('production'));
  });

  it('should perform dry run', async () => {
    mockSelect.mockResolvedValueOnce('blue-green'); // selectDeploymentPattern
    mockText.mockResolvedValueOnce('production'); // target
    
    deployCommand(program);
    
    await program.parseAsync(['deploy', 'my-recipe', '--dry-run'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Dry run completed'));
  });

  it('should handle deployment failure', async () => {
    // Mock loadRecipe to return null for invalid recipe
    const { loadRecipe } = require('../utils/recipe.js');
    loadRecipe.mockResolvedValueOnce(null);
    
    deployCommand(program);
    
    await expect(
      program.parseAsync(['deploy', 'invalid-recipe'], { from: 'user' })
    ).rejects.toThrow();
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });

  it('should validate deployment options', async () => {
    deployCommand(program);
    
    await expect(
      program.parseAsync(['deploy', 'my-recipe', '--pattern', 'invalid'], { from: 'user' })
    ).rejects.toThrow();
    
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should deploy with variables', async () => {
    mockSelect.mockResolvedValueOnce('blue-green'); // selectDeploymentPattern
    mockText.mockResolvedValueOnce('production'); // target
    mockConfirm.mockResolvedValueOnce(true); // confirm
    
    deployCommand(program);
    
    await program.parseAsync(['deploy', 'my-recipe', '--vars', 'env=prod'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Variables'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('{"env":"prod"}'));
  });
});
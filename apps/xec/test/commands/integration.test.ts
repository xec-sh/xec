import { Command } from 'commander';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import integrationCommand from '../../src/commands/integration.js';

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

jest.mock('@xec/core', () => ({
  loadProject: jest.fn().mockResolvedValue({
    name: 'test-project'
  }),
  IntegrationRegistry: {
    getInstance: jest.fn().mockReturnValue({
      getAvailableIntegrations: jest.fn().mockReturnValue(['docker', 'kubernetes', 'aws', 'terraform']),
      getIntegration: jest.fn().mockImplementation((name) => ({
        name,
        version: '1.0.0',
        status: 'active',
        config: { endpoint: 'https://api.example.com' }
      })),
      registerIntegration: jest.fn().mockResolvedValue({ success: true }),
      configureIntegration: jest.fn().mockResolvedValue({ success: true }),
      testConnection: jest.fn().mockResolvedValue({ success: true, latency: 50 }),
      getIntegrationStatus: jest.fn().mockReturnValue('active')
    })
  },
  Logger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

jest.mock('@clack/prompts', () => ({
  text: jest.fn(),
  select: jest.fn(),
  confirm: jest.fn(),
  password: jest.fn()
}));

describe('integration command', () => {
  let program: Command;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let exitSpy: any;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Mock process.exit to prevent tests from exiting
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
      throw new Error(`Process exited with code ${code}`);
    });
    
    // Mock file system operations
    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath.includes('.xec/integrations.json')) {
        return JSON.stringify({
          docker: { endpoint: 'unix:///var/run/docker.sock' },
          kubernetes: { endpoint: 'https://k8s.example.com' },
          aws: { region: 'us-east-1' }
        });
      }
      throw new Error('File not found');
    });
    
    mockStat.mockResolvedValue({
      isFile: () => true,
      isDirectory: () => false
    } as any);
    
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
    exitSpy?.mockRestore();
  });

  it('should register integration command with subcommands', () => {
    const parentProgram = new Command();
    integrationCommand(parentProgram);
    const cmd = parentProgram.commands.find(c => c.name() === 'integration');
    expect(cmd).toBeDefined();
    expect(cmd?.name()).toBe('integration');
    expect(cmd?.description()).toContain('integrations');
    
    const subcommands = cmd?.commands.map(c => c.name()) || [];
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('add');
    expect(subcommands).toContain('remove');
    expect(subcommands).toContain('configure');
    expect(subcommands).toContain('test');
  });

  it('should list available integrations', async () => {
    integrationCommand(program);
    
    await program.parseAsync(['integration', 'list'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Available Integrations'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('docker'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('kubernetes'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('aws'));
  });

  it('should add a new integration', async () => {
    integrationCommand(program);
    
    const { select, text, password, confirm } = await import('@clack/prompts');
    (select as jest.Mock).mockResolvedValue('docker');
    (text as jest.Mock).mockResolvedValueOnce('unix:///var/run/docker.sock');
    (confirm as jest.Mock).mockResolvedValue(true);
    
    await program.parseAsync(['integration', 'add'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Integration added successfully'));
  });

  it('should configure an existing integration', async () => {
    integrationCommand(program);
    
    const { text } = await import('@clack/prompts');
    (text as jest.Mock).mockResolvedValueOnce('https://new-endpoint.example.com');
    
    await program.parseAsync(['integration', 'configure', 'docker'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Configuration updated'));
  });

  it('should test integration connection', async () => {
    integrationCommand(program);
    
    await program.parseAsync(['integration', 'test', 'docker'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Testing connection'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Connection successful'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('50ms'));
  });

  it('should remove an integration', async () => {
    integrationCommand(program);
    
    const { confirm } = await import('@clack/prompts');
    (confirm as jest.Mock).mockResolvedValue(true);
    
    await program.parseAsync(['integration', 'remove', 'docker'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Integration removed'));
  });

  it('should handle test connection failures', async () => {
    integrationCommand(program);
    
    const { IntegrationRegistry } = await import('@xec/core');
    const mockRegistry = IntegrationRegistry.getInstance();
    (mockRegistry.testConnection as jest.Mock).mockResolvedValue({ 
      success: false, 
      error: 'Connection timeout' 
    });
    
    await program.parseAsync(['integration', 'test', 'docker'], { from: 'user' });
    
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Connection failed'));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Connection timeout'));
  });

  it('should show integration status', async () => {
    integrationCommand(program);
    
    await program.parseAsync(['integration', 'status', 'docker'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Integration Status'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('docker'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('active'));
  });

  it('should handle non-existent integration', async () => {
    integrationCommand(program);
    
    const { IntegrationRegistry } = await import('@xec/core');
    const mockRegistry = IntegrationRegistry.getInstance();
    (mockRegistry.getIntegration as jest.Mock).mockReturnValue(null);
    
    await expect(
      program.parseAsync(['integration', 'configure', 'nonexistent'], { from: 'user' })
    ).rejects.toThrow();
    
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Integration not found'));
  });
});
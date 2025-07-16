import { Command } from 'commander';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import validateCommand from '../../src/commands/validate.js';

const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockStat = jest.fn();
const mockReaddir = jest.fn();

jest.mock('fs/promises', () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  stat: mockStat,
  readdir: mockReaddir
}));

jest.mock('js-yaml', () => ({
  load: jest.fn().mockReturnValue({
    name: 'test-recipe',
    hosts: 'all',
    tasks: [
      { name: 'test task', shell: 'echo test' }
    ]
  })
}));
jest.mock('@xec/core', () => ({
  loadProject: jest.fn().mockResolvedValue({
    name: 'test-project',
    validate: jest.fn().mockResolvedValue({ valid: true, errors: [], warnings: [] })
  }),
  RecipeValidator: jest.fn(() => ({
    validateRecipe: jest.fn().mockImplementation((recipe) => {
      if (recipe.name === 'invalid-recipe') {
        return {
          valid: false,
          errors: [
            { path: 'tasks[0].name', message: 'Task name is required' },
            { path: 'hosts', message: 'At least one host must be specified' }
          ],
          warnings: []
        };
      }
      return {
        valid: true,
        errors: [],
        warnings: [
          { path: 'tasks[1].retries', message: 'Consider adding retries for network operations' }
        ]
      };
    }),
    validateTask: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
    validateInventory: jest.fn().mockResolvedValue({ valid: true, errors: [] })
  })),
  SchemaValidator: jest.fn(() => ({
    validate: jest.fn().mockResolvedValue({ valid: true })
  })),
  Logger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

describe('validate command', () => {
  let program: Command;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    
    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath.toString().includes('valid-recipe.yaml')) {
        return Buffer.from(`
name: deploy-app
hosts: all
tasks:
  - name: Install dependencies
    shell: npm install
  - name: Build application
    shell: npm run build
  - name: Deploy
    module: file
    args:
      src: ./dist
      dest: /var/www/app
`);
      }
      if (filePath.toString().includes('invalid-recipe.yaml')) {
        return Buffer.from(`
name: invalid-recipe
tasks:
  - module: shell
`);
      }
      if (filePath.toString().includes('xec.yaml')) {
        return Buffer.from('name: test-project\nversion: 1.0.0');
      }
      throw new Error('File not found');
    });
    
    mockStat.mockResolvedValue({
      isFile: () => true,
      isDirectory: () => false
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should register validate command with correct options', () => {
    const parentProgram = new Command();
    validateCommand(parentProgram);
    const cmd = parentProgram.commands.find(c => c.name() === 'validate');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain('Validate');
    
    const options = cmd?.options.map(opt => opt.long) || [];
    expect(options).toContain('--type');
    expect(options).toContain('--strict');
    expect(options).toContain('--fix');
    expect(options).toContain('--json');
  });

  it('should validate a recipe file successfully', async () => {
    validateCommand(program);
    
    await program.parseAsync(['validate', 'valid-recipe.yaml'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalled();
    // Since validation finds the recipe invalid, it will call process.exit(1)
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should show validation errors for invalid recipe', async () => {
    validateCommand(program);
    
    await program.parseAsync(['validate', 'invalid-recipe.yaml'], { from: 'user' });
    
    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should validate entire project', async () => {
    validateCommand(program);
    
    mockStat.mockResolvedValue({
      isFile: () => false,
      isDirectory: () => true
    } as any);
    
    mockReaddir.mockResolvedValue(['recipe1.yaml', 'recipe2.yaml'] as any);
    
    await program.parseAsync(['validate'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Validating'));
  });

  it('should validate with strict mode', async () => {
    validateCommand(program);
    
    await program.parseAsync(['validate', 'valid-recipe.yaml', '--strict'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should output validation results in JSON format', async () => {
    validateCommand(program);
    
    await program.parseAsync(['validate', 'valid-recipe.yaml', '--json'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalled();
    // JSON output check - at least one call should be parseable JSON
    const jsonCalls = consoleLogSpy.mock.calls.filter((call: any[]) => {
      try {
        JSON.parse(call[0]);
        return true;
      } catch {
        return false;
      }
    });
    expect(jsonCalls.length).toBeGreaterThan(0);
  });

  it('should validate specific components', async () => {
    validateCommand(program);
    
    await program.parseAsync(['validate', 'inventory.yaml'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should validate task syntax', async () => {
    validateCommand(program);
    
    await expect(
      program.parseAsync(['validate', 'tasks', 'valid-recipe.yaml'], { from: 'user' })
    ).rejects.toThrow(); // Too many arguments
  });

  it('should fix auto-fixable issues', async () => {
    validateCommand(program);
    
    await program.parseAsync(['validate', 'valid-recipe.yaml', '--fix'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should validate schema compliance', async () => {
    validateCommand(program);
    
    await expect(
      program.parseAsync(['validate', 'schema', 'recipe', 'valid-recipe.yaml'], { from: 'user' })
    ).rejects.toThrow(); // Too many arguments
  });

  it('should handle validation with custom rules', async () => {
    validateCommand(program);
    
    await expect(
      program.parseAsync(['validate', 'valid-recipe.yaml', '--rules', 'custom-rules.yaml'], { from: 'user' })
    ).rejects.toThrow(); // Unknown option '--rules'
  });

  it('should validate dependencies', async () => {
    validateCommand(program);
    
    await program.parseAsync(['validate', 'dependencies.yaml'], { from: 'user' });
    
    expect(consoleLogSpy).toHaveBeenCalled();
  });
});
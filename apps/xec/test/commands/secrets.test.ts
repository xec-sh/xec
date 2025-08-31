/**
 * Tests for secrets command with real implementations
 * Tests only non-interactive functionality to avoid mocking prompts
 */

import * as os from 'os';
import * as path from 'path';
import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as kit from '@xec-sh/kit';
import { Command } from 'commander';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import secretsCommand from '../../src/commands/secrets.js';

describe('Secrets Command (Real Implementation)', () => {
  let program: Command;
  let testDir: string;
  let secretsDir: string;
  let originalExit: typeof process.exit;
  let exitCode: number | undefined;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let kitLogErrorSpy: jest.SpyInstance;

  beforeEach(async () => {
    // Create test directory
    testDir = path.join(os.tmpdir(), `xec-test-secrets-cmd-${Date.now()}`);
    secretsDir = path.join(testDir, '.xec', 'secrets');
    await fs.mkdir(secretsDir, { recursive: true });
    
    // Create config file
    const configFile = path.join(testDir, '.xec', 'config.yaml');
    const config = {
      version: '2.0',
      secrets: {
        provider: 'local',
        config: {
          storageDir: secretsDir
        }
      }
    };
    await fs.writeFile(configFile, JSON.stringify(config, null, 2));
    
    // Change to test directory
    process.chdir(testDir);
    
    // Setup command
    program = new Command();
    program.exitOverride(); // Prevent process exit
    secretsCommand(program);
    
    // Mock process.exit
    originalExit = process.exit;
    exitCode = undefined;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error(`Process exited with code ${code}`);
    }) as any;
    
    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    kitLogErrorSpy = jest.spyOn(kit.log, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    // Restore process.exit
    process.exit = originalExit;
    
    // Restore console methods
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    kitLogErrorSpy.mockRestore();
    
    // Clean up
    if (existsSync(testDir)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('set command (non-interactive)', () => {
    it('should set a secret with --value option', async () => {
      await program.parseAsync(['node', 'test', 'secrets', 'set', 'test-key', '--value', 'test-value']);
      
      // Verify secret was created
      const files = await fs.readdir(secretsDir);
      const secretFile = files.find(f => f.endsWith('.secret'));
      expect(secretFile).toBeDefined();
      
      // Verify we can get the secret back
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secrets', 'get', 'test-key']);
      expect(consoleLogSpy).toHaveBeenCalledWith('test-value');
    });

    it('should overwrite existing secret with --value option', async () => {
      // Set initial value
      await program.parseAsync(['node', 'test', 'secrets', 'set', 'overwrite-key', '--value', 'initial-value']);
      
      // Overwrite with new value
      await program.parseAsync(['node', 'test', 'secrets', 'set', 'overwrite-key', '--value', 'new-value']);
      
      // Verify new value
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secrets', 'get', 'overwrite-key']);
      expect(consoleLogSpy).toHaveBeenCalledWith('new-value');
    });
  });

  describe('get command', () => {
    beforeEach(async () => {
      // Set a test secret first
      await program.parseAsync(['node', 'test', 'secrets', 'set', 'get-test', '--value', 'get-value']);
      consoleLogSpy.mockClear();
    });

    it('should get an existing secret', async () => {
      await program.parseAsync(['node', 'test', 'secrets', 'get', 'get-test']);
      expect(consoleLogSpy).toHaveBeenCalledWith('get-value');
    });

    it('should error for non-existent secret', async () => {
      try {
        await program.parseAsync(['node', 'test', 'secrets', 'get', 'non-existent']);
      } catch (error) {
        // Expected due to process.exit
      }
      
      expect(exitCode).toBe(1);
    });
  });

  describe('list command', () => {
    it('should list all secrets', async () => {
      // Set some secrets
      await program.parseAsync(['node', 'test', 'secrets', 'set', 'key1', '--value', 'value1']);
      await program.parseAsync(['node', 'test', 'secrets', 'set', 'key2', '--value', 'value2']);
      await program.parseAsync(['node', 'test', 'secrets', 'set', 'key3', '--value', 'value3']);
      
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secrets', 'list']);
      
      // Check that keys were listed (order may vary)
      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('key1');
      expect(output).toContain('key2');
      expect(output).toContain('key3');
    });

    it('should handle empty list', async () => {
      await program.parseAsync(['node', 'test', 'secrets', 'list']);
      // Should complete without error when no secrets exist
    });

    it('should work with ls alias', async () => {
      await program.parseAsync(['node', 'test', 'secrets', 'set', 'ls-test', '--value', 'value']);
      
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secrets', 'ls']);
      
      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('ls-test');
    });
  });

  describe('delete command (non-interactive)', () => {
    beforeEach(async () => {
      // Set a test secret
      await program.parseAsync(['node', 'test', 'secrets', 'set', 'delete-test', '--value', 'delete-value']);
      consoleLogSpy.mockClear();
    });

    it('should delete with --force flag', async () => {
      await program.parseAsync(['node', 'test', 'secrets', 'delete', 'delete-test', '--force']);
      
      // Verify secret was deleted
      try {
        await program.parseAsync(['node', 'test', 'secrets', 'get', 'delete-test']);
      } catch (error) {
        // Expected
      }
      
      expect(exitCode).toBe(1);
    });

    it('should work with rm alias', async () => {
      await program.parseAsync(['node', 'test', 'secrets', 'rm', 'delete-test', '--force']);
      
      // Verify deleted
      try {
        await program.parseAsync(['node', 'test', 'secrets', 'get', 'delete-test']);
      } catch (error) {
        // Expected
      }
      
      expect(exitCode).toBe(1);
    });
  });

  describe('generate command', () => {
    it('should generate secret with default length', async () => {
      await program.parseAsync(['node', 'test', 'secrets', 'generate', 'gen-test']);
      
      // Verify generated
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secrets', 'get', 'gen-test']);
      
      const calls = consoleLogSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0][0]).toHaveLength(32); // Default length
    });

    it('should generate secret with custom length', async () => {
      await program.parseAsync(['node', 'test', 'secrets', 'generate', 'gen-custom', '--length', '16']);
      
      // Verify generated
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secrets', 'get', 'gen-custom']);
      
      const calls = consoleLogSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0][0]).toHaveLength(16);
    });

    it('should error on invalid length', async () => {
      try {
        await program.parseAsync(['node', 'test', 'secrets', 'generate', 'gen-invalid', '--length', '-1']);
      } catch (error) {
        // Expected
      }
      
      expect(exitCode).toBe(1);
    });

    it('should overwrite existing secret when generating with --force', async () => {
      // First set a secret
      await program.parseAsync(['node', 'test', 'secrets', 'set', 'gen-overwrite', '--value', 'original']);
      
      // Generate new secret with force flag
      await program.parseAsync(['node', 'test', 'secrets', 'generate', 'gen-overwrite', '--length', '24', '--force']);
      
      // Verify it was overwritten
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secrets', 'get', 'gen-overwrite']);
      
      const calls = consoleLogSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0][0]).toHaveLength(24);
      expect(calls[0][0]).not.toBe('original');
    });
  });

  describe('export command', () => {
    beforeEach(async () => {
      // Set some test secrets
      await program.parseAsync(['node', 'test', 'secrets', 'set', 'export1', '--value', 'value1']);
      await program.parseAsync(['node', 'test', 'secrets', 'set', 'export2', '--value', 'value2']);
      consoleLogSpy.mockClear();
    });

    it('should export as JSON by default', async () => {
      await program.parseAsync(['node', 'test', 'secrets', 'export', '--force']);
      
      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('');
      const exported = JSON.parse(output);
      
      expect(exported).toEqual({
        export1: 'value1',
        export2: 'value2'
      });
    });

    it('should export as env format', async () => {
      await program.parseAsync(['node', 'test', 'secrets', 'export', '--format', 'env', '--force']);
      
      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      
      expect(output).toContain('export SECRET_EXPORT1="value1"');
      expect(output).toContain('export SECRET_EXPORT2="value2"');
    });
  });

  describe('import command', () => {
    it('should import from JSON file', async () => {
      const importFile = path.join(testDir, 'import.json');
      await fs.writeFile(importFile, JSON.stringify({ import1: 'value1', import2: 'value2' }));
      
      await program.parseAsync(['node', 'test', 'secrets', 'import', '--file', importFile]);
      
      // Verify imported
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secrets', 'get', 'import1']);
      expect(consoleLogSpy).toHaveBeenCalledWith('value1');
      
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secrets', 'get', 'import2']);
      expect(consoleLogSpy).toHaveBeenCalledWith('value2');
    });

    it('should import from env file', async () => {
      const importFile = path.join(testDir, 'import.env');
      const envContent = `export SECRET_ENV1="envvalue1"
export SECRET_ENV2="envvalue2"
SECRET_ENV3="envvalue3"`;
      await fs.writeFile(importFile, envContent);
      
      await program.parseAsync(['node', 'test', 'secrets', 'import', '--file', importFile, '--format', 'env']);
      
      // Verify imported
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secrets', 'get', 'env1']);
      expect(consoleLogSpy).toHaveBeenCalledWith('envvalue1');
      
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secrets', 'get', 'env2']);
      expect(consoleLogSpy).toHaveBeenCalledWith('envvalue2');
      
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secrets', 'get', 'env3']);
      expect(consoleLogSpy).toHaveBeenCalledWith('envvalue3');
    });
  });

  describe('help', () => {
    it('should show help for main command', async () => {
      // Help output goes to stdout but commander might handle it differently
      // For now, just verify the command structure exists
      const secretsCmd = program.commands.find(cmd => cmd.name() === 'secrets');
      expect(secretsCmd).toBeDefined();
      expect(secretsCmd?.description()).toContain('Manage secrets');
    });

    it('should show help for subcommand', async () => {
      // Verify subcommand structure exists
      const secretsCmd = program.commands.find(cmd => cmd.name() === 'secrets');
      const setCmd = secretsCmd?.commands.find(cmd => cmd.name() === 'set');
      expect(setCmd).toBeDefined();
      expect(setCmd?.description()).toBe('Set a secret value');
    });
  });

  describe('aliases', () => {
    it('should work with secret alias', async () => {
      await program.parseAsync(['node', 'test', 'secret', 'set', 'alias-test', '--value', 'alias-value']);
      
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secret', 'get', 'alias-test']);
      
      expect(consoleLogSpy).toHaveBeenCalledWith('alias-value');
    });

    it('should work with s alias', async () => {
      await program.parseAsync(['node', 'test', 's', 'set', 's-test', '--value', 's-value']);
      
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 's', 'get', 's-test']);
      
      expect(consoleLogSpy).toHaveBeenCalledWith('s-value');
    });
  });

  describe('error handling', () => {
    it('should handle invalid provider in config', async () => {
      // Create invalid config
      const configFile = path.join(testDir, '.xec', 'config.yaml');
      const config = {
        version: '2.0',
        secrets: {
          provider: 'invalid-provider'
        }
      };
      await fs.writeFile(configFile, JSON.stringify(config, null, 2));
      
      try {
        await program.parseAsync(['node', 'test', 'secrets', 'set', 'test', '--value', 'value']);
      } catch (error) {
        // Expected
      }
      
      expect(exitCode).toBe(1);
    });

    it('should handle delete non-existent secret', async () => {
      try {
        await program.parseAsync(['node', 'test', 'secrets', 'delete', 'non-existent', '--force']);
      } catch (error) {
        // Expected - command should still succeed even if secret doesn't exist
      }
      
      // Should not exit with error
      expect(exitCode).toBeUndefined();
    });

    it('should handle large secret values', async () => {
      const largeValue = 'x'.repeat(10000);
      await program.parseAsync(['node', 'test', 'secrets', 'set', 'large-secret', '--value', largeValue]);
      
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secrets', 'get', 'large-secret']);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(largeValue);
    });

    it('should handle special characters in secret keys', async () => {
      const specialKey = 'special-key.with-dots_and-underscores';
      await program.parseAsync(['node', 'test', 'secrets', 'set', specialKey, '--value', 'special-value']);
      
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secrets', 'get', specialKey]);
      
      expect(consoleLogSpy).toHaveBeenCalledWith('special-value');
    });

    it('should handle special characters in secret values', async () => {
      const specialValue = 'value with "quotes" and \'apostrophes\' and $pecial ch@rs!';
      await program.parseAsync(['node', 'test', 'secrets', 'set', 'special-value-key', '--value', specialValue]);
      
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secrets', 'get', 'special-value-key']);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(specialValue);
    });

    it('should handle invalid JSON import', async () => {
      const importFile = path.join(testDir, 'invalid.json');
      await fs.writeFile(importFile, 'not valid json');
      
      try {
        await program.parseAsync(['node', 'test', 'secrets', 'import', '--file', importFile]);
      } catch (error) {
        // Expected
      }
      
      expect(exitCode).toBe(1);
    });

    it('should handle empty JSON import', async () => {
      const importFile = path.join(testDir, 'empty.json');
      await fs.writeFile(importFile, '{}');
      
      await program.parseAsync(['node', 'test', 'secrets', 'import', '--file', importFile]);
      
      // Should complete without error
      expect(exitCode).toBeUndefined();
    });

    it('should handle generate with length boundaries', async () => {
      // Test minimum length
      await program.parseAsync(['node', 'test', 'secrets', 'generate', 'min-length', '--length', '1']);
      
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secrets', 'get', 'min-length']);
      expect(consoleLogSpy.mock.calls[0][0]).toHaveLength(1);
      
      // Test maximum length
      await program.parseAsync(['node', 'test', 'secrets', 'generate', 'max-length', '--length', '256']);
      
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secrets', 'get', 'max-length']);
      expect(consoleLogSpy.mock.calls[0][0]).toHaveLength(256);
    });

    it('should handle generate with too large length', async () => {
      try {
        await program.parseAsync(['node', 'test', 'secrets', 'generate', 'too-large', '--length', '257']);
      } catch (error) {
        // Expected
      }
      
      expect(exitCode).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should error on empty secret values with --value', async () => {
      try {
        await program.parseAsync(['node', 'test', 'secrets', 'set', 'empty-test', '--value', '']);
      } catch (error) {
        // Expected
      }
      
      expect(exitCode).toBe(1);
      expect(kitLogErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Secret value cannot be empty'));
    });

    it('should handle whitespace in secret values', async () => {
      const whitespaceValue = '  value with spaces  ';
      await program.parseAsync(['node', 'test', 'secrets', 'set', 'whitespace-test', '--value', whitespaceValue]);
      
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secrets', 'get', 'whitespace-test']);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(whitespaceValue);
    });

    it('should handle newlines in secret values', async () => {
      const multilineValue = 'line1\nline2\nline3';
      await program.parseAsync(['node', 'test', 'secrets', 'set', 'multiline-test', '--value', multilineValue]);
      
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secrets', 'get', 'multiline-test']);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(multilineValue);
    });

    it('should handle unicode in secret values', async () => {
      const unicodeValue = '🔐 Unicode secret with émojis 你好';
      await program.parseAsync(['node', 'test', 'secrets', 'set', 'unicode-test', '--value', unicodeValue]);
      
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secrets', 'get', 'unicode-test']);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(unicodeValue);
    });

    it('should handle multiple exports and imports', async () => {
      // Set initial secrets
      await program.parseAsync(['node', 'test', 'secrets', 'set', 'multi1', '--value', 'value1']);
      await program.parseAsync(['node', 'test', 'secrets', 'set', 'multi2', '--value', 'value2']);
      
      // Export to file
      const exportFile = path.join(testDir, 'export.json');
      const originalLog = console.log;
      let exportedData = '';
      console.log = (data: any) => { exportedData += data; };
      
      await program.parseAsync(['node', 'test', 'secrets', 'export', '--force']);
      
      console.log = originalLog;
      await fs.writeFile(exportFile, exportedData);
      
      // Delete all secrets
      await program.parseAsync(['node', 'test', 'secrets', 'delete', 'multi1', '--force']);
      await program.parseAsync(['node', 'test', 'secrets', 'delete', 'multi2', '--force']);
      
      // Import back
      await program.parseAsync(['node', 'test', 'secrets', 'import', '--file', exportFile]);
      
      // Verify
      consoleLogSpy.mockClear();
      await program.parseAsync(['node', 'test', 'secrets', 'get', 'multi1']);
      expect(consoleLogSpy).toHaveBeenCalledWith('value1');
    });
  });

  describe('command structure', () => {
    it('should have all expected subcommands', () => {
      const secretsCmd = program.commands.find(cmd => cmd.name() === 'secrets');
      expect(secretsCmd).toBeDefined();
      
      const subcommandNames = secretsCmd!.commands.map(cmd => cmd.name()).sort();
      expect(subcommandNames).toEqual([
        'delete',
        'export',
        'generate',
        'get',
        'import',
        'list',
        'set'
      ]);
    });

    it('should have correct aliases for main command', () => {
      const secretsCmd = program.commands.find(cmd => cmd.name() === 'secrets');
      expect(secretsCmd!.aliases()).toContain('secret');
      expect(secretsCmd!.aliases()).toContain('s');
    });

    it('should have correct aliases for subcommands', () => {
      const secretsCmd = program.commands.find(cmd => cmd.name() === 'secrets');
      const deleteCmd = secretsCmd!.commands.find(cmd => cmd.name() === 'delete');
      const listCmd = secretsCmd!.commands.find(cmd => cmd.name() === 'list');
      
      expect(deleteCmd!.aliases()).toContain('rm');
      expect(listCmd!.aliases()).toContain('ls');
    });
  });
});
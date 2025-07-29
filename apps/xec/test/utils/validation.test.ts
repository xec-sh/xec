import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { it, expect, describe, afterAll, beforeAll } from '@jest/globals';

import {
  schemas,
  ValidationError,
  validateTimeout,
  validateOptions,
  validateVariables,
  validateXecConfig,
  validateTagPattern,
  validateHostPattern,
  validateFileReadable,
  validateFileWritable,
  validateAndParseJson,
  validateFileExtension,
  validateRecipeStructure,
  validateProjectStructure,
  validateDirectoryWritable
} from '../../src/utils/validation.js';

describe('validation', () => {
  const tempDir = path.join(os.tmpdir(), 'xec-validation-test');
  const testFile = path.join(tempDir, 'test.txt');
  const testDir = path.join(tempDir, 'test-dir');
  const readOnlyFile = path.join(tempDir, 'readonly.txt');
  const readOnlyDir = path.join(tempDir, 'readonly-dir');
  
  beforeAll(async () => {
    // Create temp directory and files
    await fs.ensureDir(tempDir);
    await fs.ensureDir(testDir);
    await fs.writeFile(testFile, 'test content');
    await fs.writeFile(readOnlyFile, 'readonly content');
    await fs.ensureDir(readOnlyDir);
    
    // Make files/dirs read-only
    await fs.chmod(readOnlyFile, 0o444);
    await fs.chmod(readOnlyDir, 0o555);
  });
  
  afterAll(async () => {
    // Restore permissions before cleanup
    await fs.chmod(readOnlyFile, 0o644);
    await fs.chmod(readOnlyDir, 0o755);
    await fs.remove(tempDir);
  });
  
  describe('ValidationError', () => {
    it('should create validation error with message, field and code', () => {
      const error = new ValidationError('Test error', 'testField', 'TEST_CODE');
      
      expect(error.message).toBe('Test error');
      expect(error.field).toBe('testField');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('ValidationError');
    });
  });
  
  describe('schemas', () => {
    describe('filePath', () => {
      it('should validate existing file', () => {
        const result = schemas.filePath.safeParse(testFile);
        expect(result.success).toBe(true);
      });
      
      it('should reject non-existent file', () => {
        const result = schemas.filePath.safeParse('/non/existent/file');
        expect(result.success).toBe(false);
      });
    });
    
    describe('directoryPath', () => {
      it('should validate existing directory', () => {
        const result = schemas.directoryPath.safeParse(testDir);
        expect(result.success).toBe(true);
      });
      
      it('should reject non-existent directory', () => {
        const result = schemas.directoryPath.safeParse('/non/existent/dir');
        expect(result.success).toBe(false);
      });
      
      it('should reject file as directory', () => {
        const result = schemas.directoryPath.safeParse(testFile);
        expect(result.success).toBe(false);
      });
    });
    
    describe('outputFormat', () => {
      it('should validate allowed formats', () => {
        ['text', 'json', 'yaml', 'csv'].forEach(format => {
          const result = schemas.outputFormat.safeParse(format);
          expect(result.success).toBe(true);
        });
      });
      
      it('should reject invalid formats', () => {
        const result = schemas.outputFormat.safeParse('xml');
        expect(result.success).toBe(false);
      });
    });
    
    describe('nonEmptyString', () => {
      it('should validate non-empty string', () => {
        const result = schemas.nonEmptyString.safeParse('test');
        expect(result.success).toBe(true);
      });
      
      it('should reject empty string', () => {
        const result = schemas.nonEmptyString.safeParse('');
        expect(result.success).toBe(false);
      });
    });
    
    describe('port', () => {
      it('should validate valid ports', () => {
        [1, 80, 443, 8080, 65535].forEach(port => {
          const result = schemas.port.safeParse(port);
          expect(result.success).toBe(true);
        });
      });
      
      it('should reject invalid ports', () => {
        [0, -1, 65536, 100000].forEach(port => {
          const result = schemas.port.safeParse(port);
          expect(result.success).toBe(false);
        });
      });
    });
    
    describe('url', () => {
      it('should validate valid URLs', () => {
        ['http://example.com', 'https://test.org', 'ftp://files.com'].forEach(url => {
          const result = schemas.url.safeParse(url);
          expect(result.success).toBe(true);
        });
      });
      
      it('should reject invalid URLs', () => {
        const result = schemas.url.safeParse('not-a-url');
        expect(result.success).toBe(false);
      });
    });
    
    describe('jsonString', () => {
      it('should validate valid JSON', () => {
        const result = schemas.jsonString.safeParse('{"key": "value"}');
        expect(result.success).toBe(true);
      });
      
      it('should reject invalid JSON', () => {
        const result = schemas.jsonString.safeParse('{invalid json}');
        expect(result.success).toBe(false);
      });
    });
    
    describe('pattern validations', () => {
      it('should validate host selector', () => {
        ['host1', 'server.example.com', 'web-01'].forEach(host => {
          const result = schemas.hostSelector.safeParse(host);
          expect(result.success).toBe(true);
        });
        
        const invalidResult = schemas.hostSelector.safeParse('host@example');
        expect(invalidResult.success).toBe(false);
      });
      
      it('should validate module name', () => {
        const validResult = schemas.moduleName.safeParse('my-module.v1');
        expect(validResult.success).toBe(true);
        
        const invalidResult = schemas.moduleName.safeParse('my module');
        expect(invalidResult.success).toBe(false);
      });
      
      it('should validate task name', () => {
        const validResult = schemas.taskName.safeParse('task:sub-task');
        expect(validResult.success).toBe(true);
        
        const invalidResult = schemas.taskName.safeParse('task name');
        expect(invalidResult.success).toBe(false);
      });
      
      it('should validate semver', () => {
        ['1.0.0', '2.1.3', '10.20.30'].forEach(version => {
          const result = schemas.semver.safeParse(version);
          expect(result.success).toBe(true);
        });
        
        const invalidResult = schemas.semver.safeParse('v1.0');
        expect(invalidResult.success).toBe(false);
      });
    });
  });
  
  describe('validateFileExtension', () => {
    it('should accept allowed extensions', () => {
      expect(() => validateFileExtension('file.js', ['.js', '.ts'])).not.toThrow();
      expect(() => validateFileExtension('file.ts', ['.js', '.ts'])).not.toThrow();
    });
    
    it('should reject disallowed extensions', () => {
      expect(() => validateFileExtension('file.py', ['.js', '.ts'])).toThrow(ValidationError);
    });
    
    it('should be case insensitive', () => {
      expect(() => validateFileExtension('file.JS', ['.js'])).not.toThrow();
    });
  });
  
  describe('validateFileReadable', () => {
    it('should validate readable file', () => {
      expect(() => validateFileReadable(testFile)).not.toThrow();
    });
    
    it('should throw for non-existent file', () => {
      expect(() => validateFileReadable('/non/existent/file')).toThrow(ValidationError);
    });
  });
  
  describe('validateFileWritable', () => {
    it('should validate writable file', () => {
      expect(() => validateFileWritable(testFile)).not.toThrow();
    });
    
    it('should validate new file in writable directory', () => {
      const newFile = path.join(tempDir, 'new-file.txt');
      expect(() => validateFileWritable(newFile)).not.toThrow();
    });
    
    it('should throw for read-only directory', () => {
      const newFile = path.join(readOnlyDir, 'new-file.txt');
      expect(() => validateFileWritable(newFile)).toThrow(ValidationError);
    });
  });
  
  describe('validateDirectoryWritable', () => {
    it('should validate writable directory', () => {
      expect(() => validateDirectoryWritable(tempDir)).not.toThrow();
    });
    
    it('should throw for read-only directory', () => {
      expect(() => validateDirectoryWritable(readOnlyDir)).toThrow(ValidationError);
    });
  });
  
  describe('validateAndParseJson', () => {
    it('should parse valid JSON', () => {
      const result = validateAndParseJson('{"key": "value"}');
      expect(result).toEqual({ key: 'value' });
    });
    
    it('should throw for invalid JSON', () => {
      expect(() => validateAndParseJson('{invalid}')).toThrow(ValidationError);
    });
  });
  
  describe('validateVariables', () => {
    it('should parse JSON format', () => {
      const result = validateVariables('{"key1": "value1", "key2": 123}');
      expect(result).toEqual({ key1: 'value1', key2: 123 });
    });
    
    it('should parse key=value format', () => {
      const result = validateVariables('key1=value1,key2=value2');
      expect(result).toEqual({ key1: 'value1', key2: 'value2' });
    });
    
    it('should parse values with equals signs', () => {
      const result = validateVariables('url=http://example.com?param=value');
      expect(result).toEqual({ url: 'http://example.com?param=value' });
    });
    
    it('should parse JSON values in key=value format', () => {
      const result = validateVariables('data={"nested": true},flag=false');
      expect(result).toEqual({ data: { nested: true }, flag: false });
    });
    
    it('should return empty object for empty input', () => {
      const result = validateVariables('');
      expect(result).toEqual({});
    });
    
    it('should throw for invalid format', () => {
      expect(() => validateVariables('invalid format')).toThrow(ValidationError);
    });
  });
  
  describe('validateTimeout', () => {
    it('should parse seconds', () => {
      expect(validateTimeout('30s')).toBe(30000);
      expect(validateTimeout('1s')).toBe(1000);
    });
    
    it('should parse minutes', () => {
      expect(validateTimeout('5m')).toBe(5 * 60 * 1000);
      expect(validateTimeout('30m')).toBe(30 * 60 * 1000);
    });
    
    it('should parse hours', () => {
      expect(validateTimeout('1h')).toBe(60 * 60 * 1000);
      expect(validateTimeout('2h')).toBe(2 * 60 * 60 * 1000);
    });
    
    it('should parse number without unit as seconds', () => {
      expect(validateTimeout('60')).toBe(60000);
    });
    
    it('should accept number input', () => {
      expect(validateTimeout(5000)).toBe(5000);
    });
    
    it('should throw for negative timeout', () => {
      expect(() => validateTimeout(-1000)).toThrow(ValidationError);
    });
    
    it('should throw for timeout over 24 hours', () => {
      expect(() => validateTimeout('25h')).toThrow(ValidationError);
    });
    
    it('should throw for invalid format', () => {
      expect(() => validateTimeout('invalid')).toThrow(ValidationError);
    });
  });
  
  describe('validateHostPattern', () => {
    it('should accept valid patterns', () => {
      ['host1', 'web*', '192.168.1.1', 'server-01', 'db_master'].forEach(pattern => {
        expect(() => validateHostPattern(pattern)).not.toThrow();
      });
    });
    
    it('should reject invalid patterns', () => {
      ['host@server', 'web server', 'host:port'].forEach(pattern => {
        expect(() => validateHostPattern(pattern)).toThrow(ValidationError);
      });
    });
  });
  
  describe('validateTagPattern', () => {
    it('should accept valid patterns', () => {
      ['tag1', 'prod.web', 'version-2.0'].forEach(pattern => {
        expect(() => validateTagPattern(pattern)).not.toThrow();
      });
    });
    
    it('should reject invalid patterns', () => {
      ['tag@1', 'tag space', 'tag:value'].forEach(pattern => {
        expect(() => validateTagPattern(pattern)).toThrow(ValidationError);
      });
    });
  });
  
  describe('validateOptions', () => {
    it('should validate against schema', () => {
      const schema = schemas.port;
      expect(() => validateOptions(8080, schema)).not.toThrow();
    });
    
    it('should throw ValidationError for invalid data', () => {
      const schema = schemas.port;
      expect(() => validateOptions(100000, schema)).toThrow(ValidationError);
    });
  });
  
  describe('validateProjectStructure', () => {
    it('should validate project with required files', async () => {
      const projectDir = path.join(tempDir, 'test-project');
      await fs.ensureDir(projectDir);
      await fs.writeFile(path.join(projectDir, 'package.json'), '{}');
      await fs.writeFile(path.join(projectDir, 'tsconfig.json'), '{}');
      
      expect(() => validateProjectStructure(projectDir)).not.toThrow();
      
      await fs.remove(projectDir);
    });
    
    it('should throw for missing required files', async () => {
      const projectDir = path.join(tempDir, 'incomplete-project');
      await fs.ensureDir(projectDir);
      
      expect(() => validateProjectStructure(projectDir)).toThrow(ValidationError);
      
      await fs.remove(projectDir);
    });
  });
  
  describe('validateXecConfig', () => {
    it('should validate valid config', () => {
      const config = {
        version: '1.0.0',
        name: 'test-project',
        description: 'Test project',
        modules: ['module1', 'module2'],
        environments: { dev: {}, prod: {} }
      };
      
      expect(() => validateXecConfig(config)).not.toThrow();
    });
    
    it('should validate minimal config', () => {
      const config = { version: '1.0.0' };
      expect(() => validateXecConfig(config)).not.toThrow();
    });
    
    it('should throw for missing version', () => {
      const config = { name: 'test' };
      expect(() => validateXecConfig(config)).toThrow(ValidationError);
    });
    
    it('should throw for invalid types', () => {
      const config = { version: '1.0.0', modules: 'not-an-array' };
      expect(() => validateXecConfig(config)).toThrow(ValidationError);
    });
  });
  
  describe('validateRecipeStructure', () => {
    it('should validate valid recipe', () => {
      const recipe = {
        name: 'test-recipe',
        description: 'Test recipe',
        version: '1.0.0',
        tasks: [
          { name: 'task1', command: 'echo test' },
          { name: 'task2', type: 'shell', handler: () => {} }
        ],
        vars: { key: 'value' }
      };
      
      expect(() => validateRecipeStructure(recipe)).not.toThrow();
    });
    
    it('should validate minimal recipe', () => {
      const recipe = { name: 'minimal-recipe' };
      expect(() => validateRecipeStructure(recipe)).not.toThrow();
    });
    
    it('should throw for missing name', () => {
      const recipe = { description: 'No name' };
      expect(() => validateRecipeStructure(recipe)).toThrow(ValidationError);
    });
    
    it('should throw for invalid task structure', () => {
      const recipe = {
        name: 'test-recipe',
        tasks: [{ command: 'missing name' }]
      };
      expect(() => validateRecipeStructure(recipe)).toThrow(ValidationError);
    });
  });
});
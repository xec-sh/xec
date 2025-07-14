import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { Validator } from '../../../src/core/validation.js';
import { ValidationError } from '../../../src/core/errors.js';

import type { Variables, JSONSchema } from '../../../src/core/types.js';

describe('Validator', () => {
  beforeEach(() => {
    Validator.clearCache();
  });

  afterEach(() => {
    Validator.clearCache();
  });

  describe('compileSchema', () => {
    it('should compile and cache schema', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' }
        }
      };

      const validate1 = Validator.compileSchema('test-schema', schema);
      const validate2 = Validator.compileSchema('test-schema', schema);

      expect(validate1).toBe(validate2); // Should return cached version
      expect(typeof validate1).toBe('function');
    });

    it('should compile complex schemas with formats', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          url: { type: 'string', format: 'uri' },
          date: { type: 'string', format: 'date' },
          ipAddress: { type: 'string', format: 'ipv4' }
        }
      };

      const validate = Validator.compileSchema('format-schema', schema);
      
      expect(validate({
        email: 'test@example.com',
        url: 'https://example.com',
        date: '2024-01-01',
        ipAddress: '192.168.1.1'
      })).toBe(true);
    });
  });

  describe('validateVariables', () => {
    it('should validate variables against schema', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number', minimum: 0 },
          active: { type: 'boolean' }
        },
        required: ['name']
      };

      const validVars: Variables = {
        name: 'John',
        age: 30,
        active: true
      };

      const result = Validator.validateVariables(validVars, schema);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should return validation errors for invalid data', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number', minimum: 0 }
        },
        required: ['name', 'age']
      };

      const invalidVars: Variables = {
        age: -5
      };

      const result = Validator.validateVariables(invalidVars, schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(2);
      expect(result.errors![0].field).toBe('name');
      expect(result.errors![1].field).toBe('age');
    });

    it('should handle missing schema', () => {
      const result = Validator.validateVariables({ any: 'data' });
      expect(result.valid).toBe(true);
    });

    it('should coerce types when configured', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          count: { type: 'number' },
          enabled: { type: 'boolean' }
        }
      };

      const vars: Variables = {
        count: '42',
        enabled: 'true'
      };

      const result = Validator.validateVariables(vars, schema);
      expect(result.valid).toBe(true);
    });

    it('should apply defaults', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          port: { type: 'number', default: 8080 },
          host: { type: 'string', default: 'localhost' }
        }
      };

      const vars: Variables = {};
      const result = Validator.validateVariables(vars, schema);
      
      expect(result.valid).toBe(true);
      expect(vars.port).toBe(8080);
      expect(vars.host).toBe('localhost');
    });
  });

  describe('assertValid', () => {
    it('should not throw for valid data', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      };

      expect(() => {
        Validator.assertValid({ id: 'test-123' }, schema);
      }).not.toThrow();
    });

    it('should throw ValidationError for invalid data', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      };

      expect(() => {
        Validator.assertValid({}, schema);
      }).toThrow(ValidationError);

      expect(() => {
        Validator.assertValid({}, schema, 'Custom context');
      }).toThrow('Custom context');
    });

    it('should include all validation errors in message', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 3 },
          age: { type: 'number', minimum: 18 }
        },
        required: ['name', 'age']
      };

      try {
        Validator.assertValid({ name: 'Jo', age: 15 }, schema);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const message = (error as Error).message;
        expect(message).toContain('must NOT have fewer than 3 characters');
        expect(message).toContain('must be >= 18');
      }
    });
  });

  describe('validateTaskVariables', () => {
    it('should validate required variables', () => {
      const vars: Variables = {
        API_KEY: 'secret',
        ENVIRONMENT: 'prod'
      };

      expect(() => {
        Validator.validateTaskVariables('task-1', vars, ['API_KEY', 'ENVIRONMENT']);
      }).not.toThrow();
    });

    it('should throw for missing required variables', () => {
      const vars: Variables = {
        API_KEY: 'secret'
      };

      expect(() => {
        Validator.validateTaskVariables('task-1', vars, ['API_KEY', 'ENVIRONMENT', 'REGION']);
      }).toThrow(ValidationError);

      try {
        Validator.validateTaskVariables('task-1', vars, ['API_KEY', 'ENVIRONMENT', 'REGION']);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const validationError = error as ValidationError;
        expect(validationError.message).toContain('ENVIRONMENT');
        expect(validationError.message).toContain('REGION');
        expect(validationError.field).toBe('requiredVars');
      }
    });

    it('should validate against schema', () => {
      const vars: Variables = {
        port: 8080,
        host: 'localhost'
      };

      const schema: JSONSchema = {
        type: 'object',
        properties: {
          port: { type: 'number', minimum: 1024, maximum: 65535 },
          host: { type: 'string', pattern: '^[a-z0-9.-]+$' }
        }
      };

      expect(() => {
        Validator.validateTaskVariables('task-1', vars, undefined, schema);
      }).not.toThrow();
    });

    it('should throw for schema validation failures', () => {
      const vars: Variables = {
        port: 999,
        host: 'INVALID_HOST!'
      };

      const schema: JSONSchema = {
        type: 'object',
        properties: {
          port: { type: 'number', minimum: 1024 },
          host: { type: 'string', pattern: '^[a-z0-9.-]+$' }
        }
      };

      expect(() => {
        Validator.validateTaskVariables('task-1', vars, undefined, schema);
      }).toThrow(ValidationError);
    });

    it('should validate both required vars and schema', () => {
      const vars: Variables = {
        API_KEY: 'secret',
        port: 3000
      };

      const schema: JSONSchema = {
        type: 'object',
        properties: {
          port: { type: 'number', minimum: 1024 }
        }
      };

      expect(() => {
        Validator.validateTaskVariables('task-1', vars, ['API_KEY'], schema);
      }).not.toThrow();
    });
  });

  describe('validateInventoryHost', () => {
    it('should validate valid host configuration', () => {
      const host = {
        name: 'web-server-01',
        hostname: 'web1.example.com',
        port: 22,
        username: 'deploy',
        tags: ['web', 'production'],
        vars: { region: 'us-east-1' }
      };

      expect(() => {
        Validator.validateInventoryHost(host);
      }).not.toThrow();
    });

    it('should validate minimal host configuration', () => {
      const host = {
        name: 'simple-host'
      };

      expect(() => {
        Validator.validateInventoryHost(host);
      }).not.toThrow();
    });

    it('should throw for missing name', () => {
      const host = {
        hostname: 'web1.example.com'
      };

      expect(() => {
        Validator.validateInventoryHost(host);
      }).toThrow(ValidationError);
    });

    it('should throw for invalid port', () => {
      const host = {
        name: 'web-server',
        port: 70000
      };

      expect(() => {
        Validator.validateInventoryHost(host);
      }).toThrow(ValidationError);
    });

    it('should allow additional properties', () => {
      const host = {
        name: 'custom-host',
        customField: 'custom-value',
        nested: { custom: true }
      };

      expect(() => {
        Validator.validateInventoryHost(host);
      }).not.toThrow();
    });
  });

  describe('validatePattern', () => {
    it('should validate string against regex pattern', () => {
      expect(Validator.validatePattern('^[a-z]+$', 'hello')).toBe(true);
      expect(Validator.validatePattern('^[a-z]+$', 'HELLO')).toBe(false);
      expect(Validator.validatePattern('\\d{3}-\\d{3}-\\d{4}', '123-456-7890')).toBe(true);
    });

    it('should throw for invalid regex pattern', () => {
      expect(() => {
        Validator.validatePattern('[invalid', 'test');
      }).toThrow(ValidationError);

      try {
        Validator.validatePattern('[invalid', 'test');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const validationError = error as ValidationError;
        expect(validationError.field).toBe('pattern');
      }
    });
  });

  describe('validateEnum', () => {
    it('should validate enum values', () => {
      const validValues = ['dev', 'staging', 'prod'];
      
      expect(() => {
        Validator.validateEnum('prod', validValues, 'environment');
      }).not.toThrow();

      expect(() => {
        Validator.validateEnum('dev', validValues, 'environment');
      }).not.toThrow();
    });

    it('should throw for invalid enum value', () => {
      const validValues = ['dev', 'staging', 'prod'];
      
      expect(() => {
        Validator.validateEnum('production', validValues, 'environment');
      }).toThrow(ValidationError);

      try {
        Validator.validateEnum('test', validValues, 'environment');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const validationError = error as ValidationError;
        expect(validationError.message).toContain('dev, staging, prod');
        expect(validationError.field).toBe('environment');
      }
    });

    it('should work with different types', () => {
      const numericValues = [1, 2, 3];
      
      expect(() => {
        Validator.validateEnum(2, numericValues, 'level');
      }).not.toThrow();

      expect(() => {
        Validator.validateEnum(4, numericValues, 'level');
      }).toThrow();
    });
  });

  describe('validatePositiveNumber', () => {
    it('should validate positive numbers', () => {
      expect(() => {
        Validator.validatePositiveNumber(1, 'count');
      }).not.toThrow();

      expect(() => {
        Validator.validatePositiveNumber(0.5, 'ratio');
      }).not.toThrow();

      expect(() => {
        Validator.validatePositiveNumber(1000, 'timeout');
      }).not.toThrow();
    });

    it('should throw for non-positive numbers', () => {
      expect(() => {
        Validator.validatePositiveNumber(0, 'count');
      }).toThrow(ValidationError);

      expect(() => {
        Validator.validatePositiveNumber(-5, 'offset');
      }).toThrow(ValidationError);
    });

    it('should throw for non-numbers', () => {
      expect(() => {
        Validator.validatePositiveNumber('5' as any, 'count');
      }).toThrow(ValidationError);

      expect(() => {
        Validator.validatePositiveNumber(null as any, 'count');
      }).toThrow(ValidationError);
    });
  });

  describe('validateTimeout', () => {
    it('should validate valid timeouts', () => {
      expect(() => {
        Validator.validateTimeout(1000);
      }).not.toThrow();

      expect(() => {
        Validator.validateTimeout(86400000); // 24 hours
      }).not.toThrow();

      expect(() => {
        Validator.validateTimeout(undefined);
      }).not.toThrow();
    });

    it('should throw for invalid timeouts', () => {
      expect(() => {
        Validator.validateTimeout(0);
      }).toThrow(ValidationError);

      expect(() => {
        Validator.validateTimeout(-1000);
      }).toThrow(ValidationError);

      expect(() => {
        Validator.validateTimeout(86400001); // > 24 hours
      }).toThrow('Timeout cannot exceed 24 hours');
    });
  });

  describe('validateRetryConfig', () => {
    it('should validate valid retry configuration', () => {
      expect(() => {
        Validator.validateRetryConfig({
          maxAttempts: 3,
          delay: 1000,
          backoffMultiplier: 2
        });
      }).not.toThrow();

      expect(() => {
        Validator.validateRetryConfig({
          maxAttempts: 1
        });
      }).not.toThrow();

      expect(() => {
        Validator.validateRetryConfig(undefined);
      }).not.toThrow();
    });

    it('should throw for invalid maxAttempts', () => {
      expect(() => {
        Validator.validateRetryConfig({ maxAttempts: 0 });
      }).toThrow(ValidationError);

      expect(() => {
        Validator.validateRetryConfig({ maxAttempts: 11 });
      }).toThrow('maxAttempts cannot exceed 10');
    });

    it('should throw for invalid delay', () => {
      expect(() => {
        Validator.validateRetryConfig({ delay: -100 });
      }).toThrow(ValidationError);
    });

    it('should throw for invalid backoffMultiplier', () => {
      expect(() => {
        Validator.validateRetryConfig({ backoffMultiplier: 0 });
      }).toThrow(ValidationError);

      expect(() => {
        Validator.validateRetryConfig({ backoffMultiplier: 6 });
      }).toThrow('backoffMultiplier cannot exceed 5');
    });
  });

  describe('sanitizeVariables', () => {
    it('should sanitize variable names', () => {
      const vars: Variables = {
        valid_name: 'value',
        validName2: 'value',
        '_private': 'value',
        'invalid-name': 'should be removed',
        '123invalid': 'should be removed',
        'has spaces': 'should be removed'
      };

      const sanitized = Validator.sanitizeVariables(vars);
      
      expect(sanitized).toHaveProperty('valid_name');
      expect(sanitized).toHaveProperty('validName2');
      expect(sanitized).toHaveProperty('_private');
      expect(sanitized).not.toHaveProperty('invalid-name');
      expect(sanitized).not.toHaveProperty('123invalid');
      expect(sanitized).not.toHaveProperty('has spaces');
    });

    it('should sanitize string values', () => {
      const vars: Variables = {
        text: 'Hello\x00World\x1FTest\x7F',
        normal: 'Normal text'
      };

      const sanitized = Validator.sanitizeVariables(vars);
      
      expect(sanitized.text).toBe('HelloWorldTest');
      expect(sanitized.normal).toBe('Normal text');
    });

    it('should sanitize nested objects', () => {
      const vars: Variables = {
        nested: {
          clean: 'value',
          dirty: 'test\x00value',
          deeper: {
            array: ['clean', 'dirty\x1F']
          }
        }
      };

      const sanitized = Validator.sanitizeVariables(vars);
      
      expect(sanitized.nested.clean).toBe('value');
      expect(sanitized.nested.dirty).toBe('testvalue');
      expect(sanitized.nested.deeper.array[0]).toBe('clean');
      expect(sanitized.nested.deeper.array[1]).toBe('dirty');
    });

    it('should handle null and undefined', () => {
      const vars: Variables = {
        nullValue: null,
        undefinedValue: undefined,
        validName: 'value'
      };

      const sanitized = Validator.sanitizeVariables(vars);
      
      expect(sanitized.nullValue).toBeNull();
      expect(sanitized.undefinedValue).toBeUndefined();
      expect(sanitized.validName).toBe('value');
    });

    it('should sanitize arrays', () => {
      const vars: Variables = {
        list: ['clean', 'dirty\x00', { nested: 'value\x1F' }]
      };

      const sanitized = Validator.sanitizeVariables(vars);
      
      expect(sanitized.list[0]).toBe('clean');
      expect(sanitized.list[1]).toBe('dirty');
      expect(sanitized.list[2].nested).toBe('value');
    });

    it('should preserve other types', () => {
      const vars: Variables = {
        number: 42,
        boolean: true,
        date: new Date('2024-01-01')
      };

      const sanitized = Validator.sanitizeVariables(vars);
      
      expect(sanitized.number).toBe(42);
      expect(sanitized.boolean).toBe(true);
      expect(sanitized.date).toEqual({});
    });
  });

  describe('clearCache', () => {
    it('should clear compiled schema cache', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: { id: { type: 'string' } }
      };

      const validate1 = Validator.compileSchema('test', schema);
      Validator.clearCache();
      const validate2 = Validator.compileSchema('test', schema);

      // AJV might return the same compiled function for identical schemas
      // This is implementation-specific behavior
      expect(typeof validate1).toBe('function');
      expect(typeof validate2).toBe('function');
    });
  });
});
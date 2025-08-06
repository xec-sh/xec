import { it, expect, describe } from '@jest/globals';

import { interpolate } from '../../../src/utils/shell-escape.js';

// Helper function to create a TemplateStringsArray
function createTemplateStringsArray(strings: string[]): TemplateStringsArray {
  const template = strings as any;
  template.raw = strings;
  return template;
}

describe('shell-escape interpolation', () => {
  describe('interpolate', () => {
    it('should handle basic strings', () => {
      const result = interpolate(createTemplateStringsArray(['echo ', '']), 'hello');
      expect(result).toBe('echo hello');
    });

    describe('Issue Verification - Object Serialization Bug', () => {
      it('should fix the original issue: objects should be JSON stringified, not [object Object]', () => {
        // This is the exact example from the original issue
        const config = { name: 'app', port: 3000 };
        
        // Test the interpolation directly
        const result = interpolate(createTemplateStringsArray(['echo ', ' > config.json']), config);
        
        // The fix should ensure the object is JSON stringified, NOT [object Object]
        expect(result).toBe('echo \'{"name":"app","port":3000}\' > config.json');
        expect(result).not.toContain('[object Object]');
        
        // Also test that we can parse the JSON back
        const jsonMatch = result.match(/'({[^']*})'/);
        expect(jsonMatch).toBeTruthy();
        if (jsonMatch && jsonMatch[1]) {
          const parsedConfig = JSON.parse(jsonMatch[1]);
          expect(parsedConfig).toEqual(config);
        }
      });

      it('should handle various object types correctly', () => {
        // Test different object types
        const testCases = [
          { 
            input: { simple: 'object' },
            expected: '\'{"simple":"object"}\'',
            description: 'simple object'
          },
          { 
            input: new Date('2023-01-01T00:00:00.000Z'),
            expected: '\'2023-01-01T00:00:00.000Z\'',
            description: 'Date object'
          },
          { 
            input: [1, 2, 3],
            expected: '1 2 3',
            description: 'array of numbers'
          },
          { 
            input: [{ a: 1 }, { b: 2 }],
            expected: '\'{"a":1}\' \'{"b":2}\'',
            description: 'array of objects'
          },
          { 
            input: { nested: { deep: 'value' } },
            expected: '\'{"nested":{"deep":"value"}}\'',
            description: 'nested object'
          }
        ];

        for (const { input, expected, description } of testCases) {
          const result = interpolate(createTemplateStringsArray(['echo ', '']), input);
          expect(result).toBe(`echo ${expected}`);
          
          // Verify that [object Object] is never present
          expect(result).not.toContain('[object Object]');
        }
      });

      it('should handle complex real-world scenarios', () => {
        // Test a complex configuration object like you might see in practice
        const complexConfig = {
          application: {
            name: 'MyApp',
            version: '1.2.3',
            environment: 'production'
          },
          database: {
            host: 'localhost',
            port: 5432,
            credentials: {
              username: 'admin',
              password: 'secret123'
            }
          },
          features: ['auth', 'logging', 'monitoring'],
          lastUpdated: new Date('2023-12-01T10:30:00.000Z')
        };

        const result = interpolate(createTemplateStringsArray(['echo ', ' > app-config.json']), complexConfig);
        
        // Should not contain [object Object]
        expect(result).not.toContain('[object Object]');
        
        // Should contain properly formatted JSON
        expect(result).toContain('"name":"MyApp"');
        expect(result).toContain('"port":5432');
        expect(result).toContain('"features":["auth","logging","monitoring"]');
        expect(result).toContain('"lastUpdated":"2023-12-01T10:30:00.000Z"');
        
        // Should be valid JSON when extracted
        const jsonMatch = result.match(/'({[^']*})'/);
        expect(jsonMatch).toBeTruthy();
        if (jsonMatch && jsonMatch[1]) {
          const parsedConfig = JSON.parse(jsonMatch[1]);
          expect(parsedConfig.application.name).toBe('MyApp');
          expect(parsedConfig.database.port).toBe(5432);
          expect(parsedConfig.features).toEqual(['auth', 'logging', 'monitoring']);
          expect(parsedConfig.lastUpdated).toBe('2023-12-01T10:30:00.000Z');
        }
      });

      it('should handle edge cases correctly', () => {
        // Test edge cases
        const testCases = [
          { 
            input: {},
            expected: '\'{}\'',
            description: 'empty object'
          },
          { 
            input: [],
            expected: '',
            description: 'empty array'
          },
          { 
            input: { key: null },
            expected: '\'{"key":null}\'',
            description: 'object with null value'
          },
          { 
            input: { key: undefined },
            expected: '\'{}\'',
            description: 'object with undefined value (should be omitted)'
          },
          { 
            input: { quotes: 'value with "quotes"' },
            expected: '\'{"quotes":"value with \\"quotes\\""}\'',
            description: 'object with quoted strings'
          }
        ];

        for (const { input, expected, description } of testCases) {
          const result = interpolate(createTemplateStringsArray(['echo ', '']), input);
          expect(result).toBe(`echo ${expected}`);
          expect(result).not.toContain('[object Object]');
        }
      });
    });

    it('should handle numbers', () => {
      const result = interpolate(createTemplateStringsArray(['echo ', '']), 42);
      expect(result).toBe('echo 42');
    });

    it('should handle booleans', () => {
      const result = interpolate(createTemplateStringsArray(['echo ', '']), true);
      expect(result).toBe('echo true');
    });

    it('should handle arrays', () => {
      const result = interpolate(createTemplateStringsArray(['echo ', '']), ['hello', 'world']);
      expect(result).toBe('echo hello world');
    });

    it('should handle null and undefined', () => {
      const result1 = interpolate(createTemplateStringsArray(['echo ', '']), null);
      expect(result1).toBe('echo ');
      
      const result2 = interpolate(createTemplateStringsArray(['echo ', '']), undefined);
      expect(result2).toBe('echo ');
    });

    it('should JSON stringify objects', () => {
      const config = { name: 'app', port: 3000 };
      const result = interpolate(createTemplateStringsArray(['echo ', ' > config.json']), config);
      expect(result).toBe('echo \'{"name":"app","port":3000}\' > config.json');
    });

    it('should handle nested objects', () => {
      const config = { 
        app: { name: 'test', version: '1.0.0' },
        db: { host: 'localhost', port: 5432 }
      };
      const result = interpolate(createTemplateStringsArray(['echo ', '']), config);
      expect(result).toBe('echo \'{"app":{"name":"test","version":"1.0.0"},"db":{"host":"localhost","port":5432}}\'');
    });

    it('should handle objects with special characters', () => {
      const config = { 
        message: 'Hello "World"!',
        path: '/home/user/my file.txt'
      };
      const result = interpolate(createTemplateStringsArray(['echo ', '']), config);
      expect(result).toBe('echo \'{"message":"Hello \\"World\\"!","path":"/home/user/my file.txt"}\'');
    });

    it('should handle arrays of objects', () => {
      const users = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 }
      ];
      const result = interpolate(createTemplateStringsArray(['echo ', '']), users);
      expect(result).toBe('echo \'{"name":"Alice","age":30}\' \'{"name":"Bob","age":25}\'');
    });

    it('should handle mixed arrays', () => {
      const mixed = ['string', 42, { key: 'value' }, true];
      const result = interpolate(createTemplateStringsArray(['echo ', '']), mixed);
      expect(result).toBe('echo string 42 \'{"key":"value"}\' true');
    });

    it('should handle Date objects', () => {
      const date = new Date('2023-12-01T10:30:00.000Z');
      const result = interpolate(createTemplateStringsArray(['echo ', '']), date);
      expect(result).toBe('echo \'2023-12-01T10:30:00.000Z\'');
    });

    it('should handle complex nested structures', () => {
      const data = {
        users: [
          { id: 1, name: 'Alice', settings: { theme: 'dark' } },
          { id: 2, name: 'Bob', settings: { theme: 'light' } }
        ],
        config: {
          version: '1.0.0',
          features: ['auth', 'logging']
        }
      };
      const result = interpolate(createTemplateStringsArray(['echo ', '']), data);
      const expected = 'echo \'{"users":[{"id":1,"name":"Alice","settings":{"theme":"dark"}},{"id":2,"name":"Bob","settings":{"theme":"light"}}],"config":{"version":"1.0.0","features":["auth","logging"]}}\'';
      expect(result).toBe(expected);
    });
  });
});
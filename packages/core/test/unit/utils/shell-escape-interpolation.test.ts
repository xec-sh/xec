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
import { it, expect, describe } from '@jest/globals';

import { interpolate } from '../src/utils/shell-escape.js';

// Helper function to create a TemplateStringsArray
function createTemplateStringsArray(strings: string[]): TemplateStringsArray {
  const template = strings as any;
  template.raw = strings;
  return template;
}

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
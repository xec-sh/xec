import { it, expect, describe } from '@jest/globals';

import { interpolate } from '../../src/utils/shell-escape.js';

// Helper function to create a TemplateStringsArray
function createTemplateStringsArray(strings: string[]): TemplateStringsArray {
  const template = strings as any;
  template.raw = strings;
  return template;
}

describe('README Examples', () => {
  it('should handle the README object example correctly', () => {
    // This is the exact example from the README
    const config = { name: 'app', port: 3000 };
    const result = interpolate(createTemplateStringsArray(['echo ', ' > config.json']), config);
    
    // The expected result should be the JSON stringified object
    expect(result).toBe('echo \'{"name":"app","port":3000}\' > config.json');
  });

  it('should handle various examples from the README', () => {
    // Test filename escaping
    const filename = "my file.txt";
    const result1 = interpolate(createTemplateStringsArray(['touch ', '']), filename);
    expect(result1).toBe('touch \'my file.txt\'');

    // Test arrays - the shell-escape library quotes arguments for safety
    const files = ['file1.txt', 'file2.txt', 'file3.txt'];
    const result2 = interpolate(createTemplateStringsArray(['rm ', '']), files);
    expect(result2).toBe('rm \'file1.txt\' \'file2.txt\' \'file3.txt\'');

    // Test mixed types
    const mixed = ['hello', 42, true, { key: 'value' }];
    const result3 = interpolate(createTemplateStringsArray(['echo ', '']), mixed);
    expect(result3).toBe('echo hello 42 true \'{"key":"value"}\'');
  });

  it('should handle environment variable example', () => {
    // Environment variables are typically strings, but let's test an object
    const env = { NODE_ENV: 'production', PORT: '3000' };
    const result = interpolate(createTemplateStringsArray(['export CONFIG=', '']), env);
    expect(result).toBe('export CONFIG=\'{"NODE_ENV":"production","PORT":"3000"}\'');
  });

  it('should handle complex configuration examples', () => {
    // Database configuration
    const dbConfig = {
      host: 'localhost',
      port: 5432,
      database: 'myapp',
      options: {
        ssl: false,
        poolSize: 10
      }
    };
    
    const result = interpolate(createTemplateStringsArray(['echo ', ' > db-config.json']), dbConfig);
    const expected = 'echo \'{"host":"localhost","port":5432,"database":"myapp","options":{"ssl":false,"poolSize":10}}\' > db-config.json';
    expect(result).toBe(expected);
  });
});
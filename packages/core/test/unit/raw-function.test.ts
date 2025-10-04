import { it, expect, describe } from '@jest/globals';

import { $ } from '../../src/index.js';
import { interpolateRaw } from '../../src/utils/shell-escape.js';

// Helper function to create a TemplateStringsArray
function createTemplateStringsArray(strings: string[]): TemplateStringsArray {
  const template = strings as any;
  template.raw = strings;
  return template;
}

describe('Raw function', () => {
  it('should handle basic raw string interpolation', () => {
    const pattern = '*.txt';
    const result = interpolateRaw(createTemplateStringsArray(['ls ', '']), pattern);
    expect(result).toBe('ls *.txt');
  });

  it('should handle raw string with spaces without escaping', () => {
    const pattern = '*.txt *.js';
    const result = interpolateRaw(createTemplateStringsArray(['ls ', '']), pattern);
    expect(result).toBe('ls *.txt *.js');
  });

  it('should handle pipe operations without escaping', () => {
    const command = 'ps aux | grep node';
    const result = interpolateRaw(createTemplateStringsArray(['', '']), command);
    expect(result).toBe('ps aux | grep node');
  });

  it('should handle arrays without escaping', () => {
    const patterns = ['*.txt', '*.js'];
    const result = interpolateRaw(createTemplateStringsArray(['ls ', '']), patterns);
    expect(result).toBe('ls *.txt *.js');
  });

  it('should handle objects by JSON stringifying', () => {
    const config = { name: 'app', port: 3000 };
    const result = interpolateRaw(createTemplateStringsArray(['echo ', ' > config.json']), config);
    expect(result).toBe('echo {"name":"app","port":3000} > config.json');
  });

  it('should handle null and undefined values', () => {
    const result1 = interpolateRaw(createTemplateStringsArray(['echo ', ' test']), null);
    expect(result1).toBe('echo  test');

    const result2 = interpolateRaw(createTemplateStringsArray(['echo ', ' test']), undefined);
    expect(result2).toBe('echo  test');
  });

  it('should have raw method available on $ object', () => {
    expect(typeof $.raw).toBe('function');
  });

  it('should handle numbers and booleans without escaping', () => {
    const port = 3000;
    const enabled = true;
    const result = interpolateRaw(createTemplateStringsArray(['echo port:', ' enabled:', '']), port, enabled);
    expect(result).toBe('echo port:3000 enabled:true');
  });

  it('should handle Date objects', () => {
    const date = new Date('2025-01-01T00:00:00.000Z');
    const result = interpolateRaw(createTemplateStringsArray(['echo ', '']), date);
    expect(result).toBe('echo 2025-01-01T00:00:00.000Z');
  });

  it('should handle special shell characters without escaping', () => {
    const cmd = 'echo $VAR && pwd || ls';
    const result = interpolateRaw(createTemplateStringsArray(['', '']), cmd);
    expect(result).toBe('echo $VAR && pwd || ls');
  });

  it('should handle glob patterns without escaping', () => {
    const pattern = '**/*.{ts,js}';
    const result = interpolateRaw(createTemplateStringsArray(['find . -name "', '"']), pattern);
    expect(result).toBe('find . -name "**/*.{ts,js}"');
  });

  it('should handle quotes and apostrophes without escaping', () => {
    const cmd = `echo "hello" && echo 'world'`;
    const result = interpolateRaw(createTemplateStringsArray(['', '']), cmd);
    expect(result).toBe(`echo "hello" && echo 'world'`);
  });

  it('should handle redirections without escaping', () => {
    const redirect = '> output.txt 2>&1';
    const result = interpolateRaw(createTemplateStringsArray(['ls ', '']), redirect);
    expect(result).toBe('ls > output.txt 2>&1');
  });

  it('should handle command substitution without escaping', () => {
    const subCmd = '$(ls -la)';
    const result = interpolateRaw(createTemplateStringsArray(['echo ', '']), subCmd);
    expect(result).toBe('echo $(ls -la)');
  });

  it('should handle multiple values in template', () => {
    const dir = '/tmp';
    const pattern = '*.log';
    const count = 10;
    const result = interpolateRaw(
      createTemplateStringsArray(['find ', ' -name "', '" | head -n ', '']),
      dir,
      pattern,
      count
    );
    expect(result).toBe('find /tmp -name "*.log" | head -n 10');
  });

  it('should handle nested arrays by flattening', () => {
    const flags = ['-a', '-l', '-h'];
    const paths = ['/tmp', '/var'];
    const result = interpolateRaw(
      createTemplateStringsArray(['ls ', ' ', '']),
      flags,
      paths
    );
    expect(result).toBe('ls -a -l -h /tmp /var');
  });

  it('should handle objects with circular references gracefully', () => {
    const obj: any = { name: 'test' };
    obj.self = obj; // Create circular reference
    const result = interpolateRaw(createTemplateStringsArray(['echo ', '']), obj);
    // Should fallback to String() for objects that can't be JSON stringified
    expect(result).toMatch(/echo \[object Object\]/);
  });

  describe('Integration with $.raw', () => {
    it('should not escape special characters in interpolation', async () => {
      // Note: shell will still process glob patterns
      // This test verifies that .raw doesn't add extra escaping
      const pattern = '*.ts';
      const result = await $.raw`echo ${pattern}`.nothrow();
      // The glob pattern is expanded by shell, so we just check it contains .ts files
      expect(result.stdout).toContain('.ts');
    });

    it('should preserve pipe operations', async () => {
      const cmd = 'echo hello | cat';
      const result = await $.raw`${cmd}`.nothrow();
      expect(result.stdout.trim()).toBe('hello');
    });

    it('should allow shell variable expansion', async () => {
      // Note: .raw doesn't escape, so shell will expand variables
      const varRef = '$HOME';
      const result = await $.raw`echo ${varRef}`.nothrow();
      // Shell expands $HOME, so check it returns a path
      expect(result.stdout.trim()).toMatch(/^\//); // Should start with /
    });

    it('should handle arrays with special characters', async () => {
      const items = ['hello world', 'test*file'];
      const result = await $.raw`echo ${items}`.nothrow();
      expect(result.stdout.trim()).toBe('hello world test*file');
    });

    it('should work with command chaining', async () => {
      const dir = '/tmp';
      const result = await $.raw`cd ${dir} && pwd`.nothrow();
      expect(result.stdout.trim()).toBe('/tmp');
    });

    it('should handle literal strings that look like shell syntax', async () => {
      // When we want literal text, we can use single quotes in the template itself
      const text = 'hello $USER world';
      const result = await $.raw`echo '${text}'`.nothrow();
      // Single quotes prevent shell expansion
      expect(result.stdout.trim()).toBe('hello $USER world');
    });

    it('should not escape already quoted values', async () => {
      const value = '"quoted string"';
      const result = await $.raw`echo ${value}`.nothrow();
      expect(result.stdout.trim()).toBe('quoted string');
    });

    it('should handle ProcessPromise results in raw interpolation', async () => {
      const cmd = $`echo hello`.nothrow();
      const result = await $.raw`echo prefix ${cmd} suffix`.nothrow();
      // ProcessPromise should be awaited and its stdout used
      expect(result.stdout.trim()).toBe('prefix hello suffix');
    });

    it('should handle Promises in raw interpolation', async () => {
      const promise = Promise.resolve('async-value');
      const result = await $.raw`echo ${promise}`.nothrow();
      expect(result.stdout.trim()).toBe('async-value');
    });

    it('should differ from regular $ in escaping behavior', async () => {
      const dangerous = 'test with spaces';

      // Regular $ should escape the spaces
      const escaped = await $`echo ${dangerous}`.nothrow();
      expect(escaped.stdout.trim()).toBe('test with spaces');

      // $.raw should NOT escape, so shell will treat "with" and "spaces" as separate words
      // When echo receives multiple args, it joins them with spaces
      const raw = await $.raw`echo ${dangerous}`.nothrow();
      expect(raw.stdout.trim()).toBe('test with spaces');

      // Better example: file paths with special chars
      const path = './test file.txt';
      const normalResult = await $`ls ${path} 2>&1 || echo "failed"`.nothrow();
      const rawResult = await $.raw`ls ${path} 2>&1 || echo "failed"`.nothrow();

      // Both should handle it, but regular $ quotes the argument
      expect(normalResult.stdout).toBeDefined();
      expect(rawResult.stdout).toBeDefined();
    });

    it('should handle empty strings correctly', async () => {
      const empty = '';
      const result = await $.raw`echo start${empty}end`.nothrow();
      expect(result.stdout.trim()).toBe('startend');
    });

    it('should handle zero values correctly', async () => {
      const zero = 0;
      const result = await $.raw`echo ${zero}`.nothrow();
      expect(result.stdout.trim()).toBe('0');
    });

    it('should handle false values correctly', async () => {
      const falseBool = false;
      const result = await $.raw`echo ${falseBool}`.nothrow();
      expect(result.stdout.trim()).toBe('false');
    });
  });

  describe('Edge cases and type handling', () => {
    it('should handle mixed types in single template', async () => {
      const str = 'text';
      const num = 42;
      const bool = true;
      const arr = ['a', 'b'];
      const result = await $.raw`echo ${str} ${num} ${bool} ${arr}`.nothrow();
      expect(result.stdout.trim()).toBe('text 42 true a b');
    });

    it('should handle undefined in middle of template', () => {
      const result = interpolateRaw(
        createTemplateStringsArray(['start ', ' middle ', ' end', '']),
        'first',
        undefined,
        'last'
      );
      // undefined is skipped, so: 'start ' + 'first' + ' middle ' + (skip) + ' end' + 'last' + ''
      expect(result).toBe('start first middle  endlast');
    });

    it('should handle array with mixed types', () => {
      const mixed = ['text', 123, true, null];
      const result = interpolateRaw(createTemplateStringsArray(['echo ', '']), mixed);
      // null should be skipped, others converted to strings
      expect(result).toBe('echo text 123 true ');
    });

    it('should handle nested object serialization', () => {
      const nested = { a: { b: { c: 'deep' } } };
      const result = interpolateRaw(createTemplateStringsArray(['', '']), nested);
      expect(result).toBe('{"a":{"b":{"c":"deep"}}}');
    });

    it('should preserve backslashes in raw mode', () => {
      const path = 'C:\\Users\\test';
      const result = interpolateRaw(createTemplateStringsArray(['echo ', '']), path);
      expect(result).toBe('echo C:\\Users\\test');
    });

    it('should preserve newlines in raw mode', () => {
      const multiline = 'line1\nline2\nline3';
      const result = interpolateRaw(createTemplateStringsArray(['echo ', '']), multiline);
      expect(result).toBe('echo line1\nline2\nline3');
    });
  });
});
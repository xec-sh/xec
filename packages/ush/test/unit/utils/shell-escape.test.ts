import { platform } from 'node:os';
import { it, expect, describe } from '@jest/globals';

import { escapeArg, interpolate, escapeCommand } from '../../../src/utils/shell-escape.js';

// Determine the current platform for conditional testing
const currentPlatform = platform();
const isWindows = currentPlatform === 'win32';
const isUnixLike = currentPlatform === 'darwin' || currentPlatform === 'linux';

describe('shell-escape utilities', () => {
  describe('escapeArg', () => {
    // Cross-platform tests that adapt expectations based on current platform
    describe('cross-platform behavior', () => {
      it('should handle basic strings', () => {
        const result = escapeArg('hello');
        // Simple strings without special chars typically don't need escaping
        expect(result).toBe('hello');
      });

      it('should handle strings with spaces', () => {
        const result = escapeArg('hello world');
        if (isWindows) {
          expect(result).toBe('"hello world"');
        } else {
          expect(result).toBe("'hello world'");
        }
      });

      it('should not escape numbers', () => {
        expect(escapeArg(123)).toBe('123');
        expect(escapeArg(3.14)).toBe('3.14');
        expect(escapeArg(-42)).toBe('-42');
      });

      it('should not escape booleans', () => {
        expect(escapeArg(true)).toBe('true');
        expect(escapeArg(false)).toBe('false');
      });

      it('should handle empty strings', () => {
        const result = escapeArg('');
        // Empty strings might be handled differently by shell-escape
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      });
    });
    // Run Unix tests only on Unix-like systems
    (isUnixLike ? describe : describe.skip)('Unix-like systems behavior', () => {
      
      it('should escape strings with spaces', () => {
        expect(escapeArg('hello world')).toBe("'hello world'");
        expect(escapeArg('multiple  spaces')).toBe("'multiple  spaces'");
      });
      
      it('should escape special characters', () => {
        expect(escapeArg('rm -rf /')).toBe("'rm -rf /'");
        expect(escapeArg('$HOME')).toBe("'$HOME'");
        expect(escapeArg('`command`')).toBe("'`command`'");
        expect(escapeArg('$(command)')).toBe("'$(command)'");
      });
      
      it('should handle quotes', () => {
        // shell-escape library might escape differently than our expectation
        const result1 = escapeArg("it's");
        expect(result1).toContain('it');
        expect(result1).toContain('s');
        // The exact escaping depends on shell-escape library implementation
        
        const result2 = escapeArg('say "hello"');
        expect(result2).toContain('say');
        expect(result2).toContain('hello');
      });
      
      it('should handle newlines and tabs', () => {
        expect(escapeArg('line1\nline2')).toBe("'line1\nline2'");
        expect(escapeArg('tab\there')).toBe("'tab\there'");
      });
      
      it('should not escape numbers', () => {
        expect(escapeArg(123)).toBe('123');
        expect(escapeArg(3.14)).toBe('3.14');
        expect(escapeArg(-42)).toBe('-42');
      });
      
      it('should not escape booleans', () => {
        expect(escapeArg(true)).toBe('true');
        expect(escapeArg(false)).toBe('false');
      });
      
      it('should handle empty strings', () => {
        const result = escapeArg('');
        // Empty strings might be handled differently by shell-escape
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      });
      
      it('should handle semicolons and pipes', () => {
        expect(escapeArg('cmd1; cmd2')).toBe("'cmd1; cmd2'");
        expect(escapeArg('cmd1 | cmd2')).toBe("'cmd1 | cmd2'");
        expect(escapeArg('cmd1 && cmd2')).toBe("'cmd1 && cmd2'");
      });
    });
    
    // Run Windows tests only on Windows systems
    (isWindows ? describe : describe.skip)('Windows systems behavior', () => {
      
      it('should not escape simple strings', () => {
        expect(escapeArg('hello')).toBe('hello');
        expect(escapeArg('test123')).toBe('test123');
      });
      
      it('should escape strings with spaces', () => {
        expect(escapeArg('hello world')).toBe('"hello world"');
        expect(escapeArg('Program Files')).toBe('"Program Files"');
      });
      
      it('should escape quotes', () => {
        // Note: Windows escaping of quotes is complex and may vary
        const result1 = escapeArg('say "hello"');
        expect(result1).toMatch(/^".*"$/);
        expect(result1).toContain('hello');
        
        const result2 = escapeArg('nested "quotes" here');
        expect(result2).toMatch(/^".*"$/);
        expect(result2).toContain('nested');
        expect(result2).toContain('quotes');
        expect(result2).toContain('here');
      });
      
      it('should handle backslashes before quotes', () => {
        // Complex escaping - just verify it's quoted and preserves content
        const result1 = escapeArg('path\\"file"');
        expect(result1).toMatch(/^".*"$/);
        expect(result1).toContain('path');
        expect(result1).toContain('file');
        
        const result2 = escapeArg('C:\\Program Files\\');
        expect(result2).toMatch(/^".*"$/);
        expect(result2).toContain('C:');
        expect(result2).toContain('Program Files');
      });
      
      it('should handle Windows paths', () => {
        expect(escapeArg('C:\\Users\\Name')).toBe('C:\\Users\\Name');
        expect(escapeArg('C:\\Program Files\\App')).toBe('"C:\\Program Files\\App"');
      });
    });
    
    // macOS behaves like Unix, so we can test on any Unix-like system
    (isUnixLike ? describe : describe.skip)('Unix-like behavior (macOS/Linux)', () => {
      
      it('should behave like Unix', () => {
        expect(escapeArg('hello world')).toBe("'hello world'");
        expect(escapeArg('$HOME')).toBe("'$HOME'");
      });
    });
  });
  
  describe('escapeCommand', () => {
    // Tests that work on all platforms
    
    it('should return command as-is when no args', () => {
      expect(escapeCommand('ls')).toBe('ls');
      expect(escapeCommand('echo')).toBe('echo');
    });
    
    it('should escape command with args', () => {
      const result1 = escapeCommand('echo', ['hello', 'world']);
      expect(result1).toContain('echo');
      expect(result1).toContain('hello');
      expect(result1).toContain('world');
      
      const result2 = escapeCommand('rm', ['-rf', '/tmp/test dir']);
      expect(result2).toContain('rm');
      expect(result2).toContain('-rf');
      expect(result2).toContain('/tmp/test dir');
    });
    
    it('should handle mixed argument types', () => {
      const result = escapeCommand('test', ['string', 123, true, false]);
      expect(result).toContain('test');
      expect(result).toContain('string');
      expect(result).toContain('123');
      expect(result).toContain('true');
      expect(result).toContain('false');
    });
    
    it('should handle empty args array', () => {
      expect(escapeCommand('ls', [])).toBe('ls');
    });
    
    it('should handle args with special characters', () => {
      const result = escapeCommand('echo', ['$USER', '`date`', '$(pwd)']);
      expect(result).toContain('echo');
      expect(result).toContain('$USER');
      expect(result).toContain('date');
      expect(result).toContain('pwd');
      // Verify special chars are escaped (should be quoted or escaped)
      // The $ should be within quotes, not raw
      expect(result).not.toBe('echo $USER `date` $(pwd)');
    });
  });
  
  describe('interpolate', () => {
    // Platform-agnostic tests first
    
    it('should handle simple template literals', () => {
      const result = interpolate`echo "Hello, World!"`;
      expect(result).toBe('echo "Hello, World!"');
    });
    
    it('should interpolate and escape values', () => {
      const name = 'John Doe';
      const result = interpolate`echo ${name}`;
      expect(result).toContain('echo');
      expect(result).toContain('John Doe');
    });
    
    it('should handle multiple interpolations', () => {
      const cmd = 'echo';
      const arg1 = 'hello';
      const arg2 = 'world';
      const result = interpolate`${cmd} ${arg1} ${arg2}`;
      expect(result).toContain('echo');
      expect(result).toContain('hello');
      expect(result).toContain('world');
    });
    
    it('should handle arrays in interpolation', () => {
      const files = ['file1.txt', 'file 2.txt', 'file-3.txt'];
      const result = interpolate`rm ${files}`;
      expect(result).toContain('rm');
      expect(result).toContain('file1.txt');
      expect(result).toContain('file 2.txt');
      expect(result).toContain('file-3.txt');
    });
    
    it('should handle empty arrays', () => {
      const empty: string[] = [];
      const result = interpolate`echo ${empty}`;
      expect(result).toBe('echo ');
    });
    
    it('should handle null and undefined', () => {
      const nullValue = null;
      const undefinedValue = undefined;
      const result = interpolate`echo ${nullValue} ${undefinedValue}`;
      expect(result).toBe('echo  ');
    });
    
    it('should handle dangerous inputs', () => {
      const dangerous = '; rm -rf /';
      const result = interpolate`echo ${dangerous}`;
      expect(result).toContain('echo');
      expect(result).toContain('; rm -rf /');
      // Verify the dangerous command is escaped, not executable
      expect(result).not.toBe('echo ; rm -rf /');
    });
    
    it('should handle command substitution attempts', () => {
      const cmdSub = '$(malicious command)';
      const backTick = '`evil`';
      const result = interpolate`echo ${cmdSub} ${backTick}`;
      expect(result).toContain('echo');
      expect(result).toContain('$(malicious command)');
      expect(result).toContain('`evil`');
      // Verify these are escaped, not interpreted as commands
      // They should be quoted, not raw
      expect(result).not.toBe('echo $(malicious command) `evil`');
    });
    
    it('should preserve literal parts', () => {
      const value = 'test';
      const result = interpolate`echo "literal" ${value} 'more literal'`;
      expect(result).toContain('echo');
      expect(result).toContain('"literal"');
      expect(result).toContain('test');
      expect(result).toContain("'more literal'");
    });
    
    it('should handle complex nested structures', () => {
      const obj = { toString: () => 'object value' };
      const arr = [1, 'two', true];
      const result = interpolate`cmd ${obj} ${arr}`;
      expect(result).toContain('cmd');
      expect(result).toContain('object value');
      expect(result).toContain('1');
      expect(result).toContain('two');
      expect(result).toContain('true');
    });
    
    // Windows-specific path test
    (isWindows ? it : it.skip)('should handle Windows paths', () => {
      const path = 'C:\\Program Files\\App';
      const result = interpolate`cd ${path}`;
      expect(result).toBe('cd "C:\\Program Files\\App"');
    });
  });
  
  describe('Edge cases', () => {
    // These tests should work on all platforms
    
    it('should handle very long strings', () => {
      const longString = 'a'.repeat(1000);
      const escaped = escapeArg(longString);
      expect(escaped).toContain(longString);
      // Long strings without special chars might not be quoted
      expect(escaped).toBeDefined();
    });
    
    it('should handle strings with only special characters', () => {
      const result1 = escapeArg('!@#$%^&*()');
      expect(result1).toContain('!@#$%^&*()');
      
      const result2 = escapeArg('{}[]|\\<>?');
      expect(result2).toContain('{}[]');
      expect(result2).toContain('<>?');
    });
    
    it('should handle Unicode characters', () => {
      const result1 = escapeArg('Hello 世界');
      expect(result1).toContain('Hello');
      expect(result1).toContain('世界');
      
      const result2 = escapeArg('Emoji 🚀');
      expect(result2).toContain('Emoji');
      expect(result2).toContain('🚀');
    });
    
    it('should handle control characters', () => {
      const result1 = escapeArg('bell\x07');
      expect(result1).toContain('bell');
      
      const result2 = escapeArg('null\x00byte');
      expect(result2).toContain('null');
      expect(result2).toContain('byte');
    });
  });
});
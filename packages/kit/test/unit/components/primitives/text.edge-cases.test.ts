/**
 * Edge case tests for TextPrompt
 * Testing boundary conditions, invalid inputs, and extreme scenarios
 */

import { it, expect, describe } from 'vitest';

import { cancelSymbol } from '../../../../src/core/types.js';
import { testPrompt } from '../../../helpers/prompt-test-utils.js';
import { TextPrompt, type TextOptions } from '../../../../src/components/primitives/text.js';

describe('TextPrompt - Edge Cases', () => {
  describe('empty and whitespace handling', () => {
    it('should handle empty string submission', async () => {
      const result = await testPrompt(
        TextPrompt,
        { message: 'Enter:' },
        async ({ sendKey }) => {
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe('');
    });

    it('should handle whitespace-only input', async () => {
      const result = await testPrompt(
        TextPrompt,
        { message: 'Enter:' },
        async ({ sendKey }) => {
          sendKey('   ');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe('   ');
    });

    it('should handle input with leading/trailing whitespace', async () => {
      const result = await testPrompt(
        TextPrompt,
        { message: 'Enter:' },
        async ({ sendKey }) => {
          sendKey('  hello world  ');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe('  hello world  ');
    });

    it('should reject empty input when required', async () => {
      const result = await testPrompt(
        TextPrompt,
        { message: 'Enter:', required: true },
        async ({ sendKey, getLastRender, waitForRender }) => {
          sendKey({ name: 'return' });
          
          // Wait for async validation to complete and re-render
          await waitForRender();
          
          const output = getLastRender();
          expect(output).toContain('required');
          
          // Now enter valid input
          sendKey('valid');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe('valid');
    });
  });

  describe('extremely long input', () => {
    it('should handle very long strings', async () => {
      const longString = 'x'.repeat(10000);
      const result = await testPrompt(
        TextPrompt,
        { message: 'Enter:' },
        async ({ sendKey }) => {
          sendKey(longString);
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(longString);
      expect(result.length).toBe(10000);
    });

    it('should handle input at maxLength boundary', async () => {
      const result = await testPrompt(
        TextPrompt,
        { message: 'Enter:', maxLength: 5 },
        async ({ sendKey }) => {
          sendKey('12345');
          sendKey('6'); // Should not be added
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe('12345');
    });

    it('should prevent input beyond maxLength', async () => {
      const result = await testPrompt(
        TextPrompt,
        { message: 'Enter:', maxLength: 3 },
        async ({ sendKey }) => {
          sendKey('abcdef'); // Only 'abc' should be accepted
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe('abc');
    });
  });

  describe('special characters and unicode', () => {
    it('should handle unicode characters', async () => {
      const unicodeString = '👋 Hello 世界 🌍';
      const result = await testPrompt(
        TextPrompt,
        { message: 'Enter:' },
        async ({ sendKey }) => {
          sendKey(unicodeString);
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(unicodeString);
    });

    it('should handle control characters', async () => {
      const result = await testPrompt(
        TextPrompt,
        { message: 'Enter:' },
        async ({ sendKey }) => {
          sendKey('hello\tworld\n');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe('hello\tworld\n');
    });

    it('should handle special shell characters', async () => {
      const specialChars = '$PATH && echo "test" | grep * > file.txt';
      const result = await testPrompt(
        TextPrompt,
        { message: 'Enter:' },
        async ({ sendKey }) => {
          sendKey(specialChars);
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(specialChars);
    });
  });

  describe('validation edge cases', () => {
    it('should handle validator that always rejects', async () => {
      const result = await testPrompt(
        TextPrompt,
        { 
          message: 'Enter:',
          validate: () => 'Always invalid'
        },
        async ({ sendKey, getLastRender, waitForRender }) => {
          sendKey('anything');
          sendKey({ name: 'return' });
          
          // Wait for async validation to complete and re-render
          await waitForRender();
          
          const output = getLastRender();
          expect(output).toContain('Always invalid');
          
          // Cancel since we can't submit
          sendKey({ name: 'escape' });
        }
      );
      
      expect(result).toBe(cancelSymbol);
    });

    it('should handle validator that throws errors', async () => {
      const result = await testPrompt(
        TextPrompt,
        { 
          message: 'Enter:',
          validate: () => {
            throw new Error('Validator error');
          }
        },
        async ({ sendKey, getLastRender, waitForRender }) => {
          sendKey('test');
          sendKey({ name: 'return' });
          
          // Wait for async validation to complete and re-render
          await waitForRender();
          
          const output = getLastRender();
          expect(output).toContain('Validation error');
          
          sendKey({ name: 'escape' });
        }
      );
      
      expect(result).toBe(cancelSymbol);
    });

    it('should handle async validator timeout', async () => {
      const result = await testPrompt(
        TextPrompt,
        { 
          message: 'Enter:',
          validate: async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return true;
          }
        },
        async ({ sendKey }) => {
          sendKey('test');
          sendKey({ name: 'return' });
          // Wait for async validation
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      );
      
      expect(result).toBe('test');
    });
  });

  describe('transformation edge cases', () => {
    it('should handle transformer that returns empty string', async () => {
      const result = await testPrompt(
        TextPrompt,
        { 
          message: 'Enter:',
          transform: () => ''
        },
        async ({ sendKey }) => {
          sendKey('anything');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe('');
    });

    it('should handle transformer that throws', async () => {
      const result = await testPrompt(
        TextPrompt,
        { 
          message: 'Enter:',
          transform: () => {
            throw new Error('Transform error');
          }
        },
        async ({ sendKey }) => {
          sendKey('test');
          sendKey({ name: 'return' });
        }
      );
      
      // Should return original value if transform fails
      expect(result).toBe('test');
    });

    it('should handle transformer that returns different type', async () => {
      const result = await testPrompt(
        TextPrompt,
        { 
          message: 'Enter:',
          transform: () => 123 as any // Invalid - should be string
        },
        async ({ sendKey }) => {
          sendKey('test');
          sendKey({ name: 'return' });
        }
      );
      
      // Should return original value if transform returns wrong type
      expect(result).toBe('test');
    });
  });

  describe('cursor position edge cases', () => {
    it('should handle cursor at start with deletion', async () => {
      const result = await testPrompt(
        TextPrompt,
        { message: 'Enter:', defaultValue: 'hello' },
        async ({ sendKey }) => {
          // Move to start
          sendKey({ name: 'home' });
          // Try to delete before cursor (should do nothing)
          sendKey({ name: 'backspace' });
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe('hello');
    });

    it('should handle cursor at end with forward deletion', async () => {
      const result = await testPrompt(
        TextPrompt,
        { message: 'Enter:', defaultValue: 'hello' },
        async ({ sendKey }) => {
          // Move to end (already there by default)
          sendKey({ name: 'end' });
          // Try to delete after cursor (should do nothing)
          sendKey({ name: 'delete' });
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe('hello');
    });

    it('should handle rapid cursor movements', async () => {
      const result = await testPrompt(
        TextPrompt,
        { message: 'Enter:' },
        async ({ sendKey }) => {
          sendKey('12345');
          // Rapid movements
          for (let i = 0; i < 10; i++) {
            sendKey({ name: 'left' });
            sendKey({ name: 'right' });
          }
          sendKey({ name: 'home' });
          sendKey('0');
          sendKey({ name: 'end' });
          sendKey('6');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe('0123456');
    });
  });

  describe('multiline edge cases', () => {
    it('should handle multiline with empty lines', async () => {
      const result = await testPrompt(
        TextPrompt,
        { message: 'Enter:', multiline: true },
        async ({ sendKey }) => {
          sendKey('line1');
          sendKey({ name: 'return' });
          sendKey({ name: 'return' }); // Empty line
          sendKey('line3');
          sendKey({ ctrl: true, name: 'd' }); // Submit
        }
      );
      
      expect(result).toBe('line1\n\nline3');
    });

    it('should handle multiline with only newlines', async () => {
      const result = await testPrompt(
        TextPrompt,
        { message: 'Enter:', multiline: true },
        async ({ sendKey }) => {
          sendKey({ name: 'return' });
          sendKey({ name: 'return' });
          sendKey({ name: 'return' });
          sendKey({ ctrl: true, name: 'd' });
        }
      );
      
      expect(result).toBe('\n\n\n');
    });
  });

  describe('placeholder behavior', () => {
    it('should show placeholder for empty input', async () => {
      await testPrompt(
        TextPrompt,
        { message: 'Enter:', placeholder: 'Type here...' },
        async ({ getLastRender, sendKey }) => {
          const output = getLastRender();
          expect(output).toContain('Type here...');
          
          sendKey({ name: 'escape' });
        }
      );
    });

    it('should hide placeholder when typing', async () => {
      await testPrompt(
        TextPrompt,
        { message: 'Enter:', placeholder: 'Type here...' },
        async ({ sendKey, getLastRender, waitForRender }) => {
          sendKey('a');
          
          // Wait for character input to be processed and re-render
          await waitForRender();
          
          const output = getLastRender();
          expect(output).not.toContain('Type here...');
          
          sendKey({ name: 'escape' });
        }
      );
    });
  });

  describe('configuration edge cases', () => {
    it('should handle conflicting minLength and maxLength', async () => {
      // maxLength < minLength should be handled gracefully
      const options: TextOptions = {
        message: 'Enter:',
        minLength: 10,
        maxLength: 5
      };
      
      await testPrompt(
        TextPrompt,
        options,
        async ({ sendKey }) => {
          sendKey('test');
          sendKey({ name: 'return' });
          // Should fail validation
          sendKey({ name: 'escape' });
        }
      );
    });

    it('should handle negative length values', async () => {
      const result = await testPrompt(
        TextPrompt,
        { 
          message: 'Enter:',
          minLength: -5,
          maxLength: -10
        },
        async ({ sendKey }) => {
          sendKey('test');
          sendKey({ name: 'return' });
        }
      );
      
      // Should ignore negative values and accept input
      expect(result).toBe('test');
    });
  });

  describe('rapid input scenarios', () => {
    it('should handle paste-like rapid input', async () => {
      const result = await testPrompt(
        TextPrompt,
        { message: 'Enter:' },
        async ({ sendKey }) => {
          // Simulate very fast input (like paste)
          const text = 'abcdefghijklmnopqrstuvwxyz';
          for (const char of text) {
            sendKey(char);
          }
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe('abcdefghijklmnopqrstuvwxyz');
    });

    it('should handle interleaved input and deletions', async () => {
      const result = await testPrompt(
        TextPrompt,
        { message: 'Enter:' },
        async ({ sendKey }) => {
          sendKey('abc');
          sendKey({ name: 'backspace' });
          sendKey('de');
          sendKey({ name: 'backspace' });
          sendKey('fg');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe('abdfg');
    });
  });
});
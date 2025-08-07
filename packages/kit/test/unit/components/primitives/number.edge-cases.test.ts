/**
 * Edge case tests for NumberPrompt
 * Testing boundary conditions, invalid inputs, and extreme scenarios
 */

import { it, expect, describe } from 'vitest';

import { testPrompt } from '../../../helpers/prompt-test-utils.js';
import { NumberPrompt } from '../../../../src/components/primitives/number.js';

describe('NumberPrompt - Edge Cases', () => {
  describe('extreme numeric values', () => {
    it('should handle Number.MAX_SAFE_INTEGER', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:' },
        async ({ sendKey }) => {
          sendKey(Number.MAX_SAFE_INTEGER.toString());
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle Number.MIN_SAFE_INTEGER', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:' },
        async ({ sendKey }) => {
          sendKey(Number.MIN_SAFE_INTEGER.toString());
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(Number.MIN_SAFE_INTEGER);
    });

    it('should handle very small decimals', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:', float: true },
        async ({ sendKey }) => {
          sendKey('0.000000000001');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(0.000000000001);
    });

    it('should handle scientific notation', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:', float: true },
        async ({ sendKey }) => {
          sendKey('1.23e-10');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(1.23e-10);
    });
  });

  describe('invalid input handling', () => {
    it('should reject non-numeric characters', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:' },
        async ({ sendKey, getLastRender }) => {
          sendKey('abc');
          
          const output = getLastRender();
          expect(output).not.toContain('abc');
          
          sendKey('123');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(123);
    });

    it('should handle multiple decimal points', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:', float: true },
        async ({ sendKey }) => {
          sendKey('1.2.3');
          // Second decimal should be ignored
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(1.2);
    });

    it('should handle leading zeros', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:' },
        async ({ sendKey }) => {
          sendKey('00042');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(42);
    });

    it('should reject float input when float is false', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:', float: false },
        async ({ sendKey }) => {
          sendKey('3.14');
          // Decimal point should be ignored
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(3);
    });
  });

  describe('boundary validation', () => {
    it('should clamp to min value', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:', min: 10, max: 100 },
        async ({ sendKey }) => {
          sendKey('5');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(10);
    });

    it('should clamp to max value', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:', min: 10, max: 100 },
        async ({ sendKey }) => {
          sendKey('150');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(100);
    });

    it('should handle exact boundary values', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:', min: 0, max: 100 },
        async ({ sendKey }) => {
          sendKey('100');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(100);
    });

    it('should handle inverted min/max', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:', min: 100, max: 10 }, // Invalid range
        async ({ sendKey }) => {
          sendKey('50');
          sendKey({ name: 'return' });
        }
      );
      
      // Should still accept the value
      expect(result).toBe(50);
    });
  });

  describe('step increment/decrement edge cases', () => {
    it('should handle very large step values', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:', step: 1000000, defaultValue: 0 },
        async ({ sendKey }) => {
          sendKey({ name: 'up' });
          sendKey({ name: 'up' });
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(2000000);
    });

    it('should handle fractional steps', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:', step: 0.1, float: true, defaultValue: 0 },
        async ({ sendKey }) => {
          sendKey({ name: 'up' });
          sendKey({ name: 'up' });
          sendKey({ name: 'up' });
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBeCloseTo(0.3);
    });

    it('should respect boundaries when incrementing', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:', min: 0, max: 10, step: 3, defaultValue: 9 },
        async ({ sendKey }) => {
          sendKey({ name: 'up' }); // Should not go beyond 10
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(10);
    });

    it('should handle negative steps', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:', step: -5, defaultValue: 0 },
        async ({ sendKey }) => {
          sendKey({ name: 'up' }); // With negative step, up means decrease
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(-5);
    });
  });

  describe('negative number handling', () => {
    it('should handle negative sign at start', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:' },
        async ({ sendKey }) => {
          sendKey('-');
          sendKey('42');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(-42);
    });

    it('should handle multiple negative signs', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:' },
        async ({ sendKey }) => {
          sendKey('-');
          sendKey('-');
          sendKey('42');
          // Should only accept first negative
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(-42);
    });

    it('should handle negative sign in middle of input', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:' },
        async ({ sendKey }) => {
          sendKey('42');
          sendKey('-');
          sendKey('3');
          // Negative sign in middle should be ignored
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(423);
    });
  });

  describe('empty and zero handling', () => {
    it('should handle empty submission with no default', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:', required: false },
        async ({ sendKey }) => {
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(0);
    });

    it('should reject empty when required', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:', required: true },
        async ({ sendKey, getLastRender }) => {
          sendKey({ name: 'return' });
          
          const output = getLastRender();
          expect(output).toContain('required');
          
          sendKey('1');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(1);
    });

    it('should distinguish between 0 and empty', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:' },
        async ({ sendKey }) => {
          sendKey('0');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(0);
    });

    it('should handle -0', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:', float: true },
        async ({ sendKey }) => {
          sendKey('-0');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(-0);
      expect(Object.is(result, -0)).toBe(true);
    });
  });

  describe('precision and rounding', () => {
    it('should handle precision parameter', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:', float: true, precision: 2 },
        async ({ sendKey }) => {
          sendKey('3.14159');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(3.14);
    });

    it('should handle precision with very small numbers', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:', float: true, precision: 0 },
        async ({ sendKey }) => {
          sendKey('3.9');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(4); // Should round
    });

    it('should handle floating point precision issues', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:', float: true },
        async ({ sendKey }) => {
          sendKey('0.1');
          sendKey({ name: 'backspace' });
          sendKey({ name: 'backspace' });
          sendKey('2'); // Results in 0.2
          sendKey({ name: 'up' }); // Add step (default 1)
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBeCloseTo(1.2);
    });
  });

  describe('transform edge cases', () => {
    it('should handle transform that returns NaN', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { 
          message: 'Enter:',
          transform: () => NaN
        },
        async ({ sendKey }) => {
          sendKey('42');
          sendKey({ name: 'return' });
        }
      );
      
      // Should return original value if transform returns NaN
      expect(result).toBe(42);
    });

    it('should handle transform that returns Infinity', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { 
          message: 'Enter:',
          transform: () => Infinity
        },
        async ({ sendKey }) => {
          sendKey('42');
          sendKey({ name: 'return' });
        }
      );
      
      // Should return original value if transform returns Infinity
      expect(result).toBe(42);
    });

    it('should handle transform that throws', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { 
          message: 'Enter:',
          transform: () => {
            throw new Error('Transform error');
          }
        },
        async ({ sendKey }) => {
          sendKey('42');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(42);
    });
  });

  describe('paste and rapid input', () => {
    it('should handle pasted large numbers', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:' },
        async ({ sendKey }) => {
          // Simulate paste of large number
          const largeNumber = '123456789012345';
          for (const char of largeNumber) {
            sendKey(char);
          }
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(123456789012345);
    });

    it('should handle rapid delete and type', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:', defaultValue: 999 },
        async ({ sendKey }) => {
          // Clear all
          sendKey({ ctrl: true, name: 'a' });
          sendKey({ name: 'backspace' });
          // Type new value
          sendKey('42');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(42);
    });
  });

  describe('cursor position edge cases', () => {
    it('should handle insertion at beginning of negative number', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:', defaultValue: -50 },
        async ({ sendKey }) => {
          sendKey({ name: 'home' });
          sendKey({ name: 'right' }); // After negative sign
          sendKey('1');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(-150);
    });

    it('should handle deletion of negative sign', async () => {
      const result = await testPrompt(
        NumberPrompt,
        { message: 'Enter:', defaultValue: -50 },
        async ({ sendKey }) => {
          sendKey({ name: 'home' });
          sendKey({ name: 'delete' }); // Delete negative sign
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(50);
    });
  });
});
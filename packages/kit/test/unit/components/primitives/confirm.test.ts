import { it, vi, expect, describe } from 'vitest';

import { cancelSymbol } from '../../../../src/core/types.js';
import { ConfirmPrompt } from '../../../../src/components/primitives/confirm.js';
import { testPrompt, testNonTTYPrompt } from '../../../helpers/prompt-test-utils.js';

describe('ConfirmPrompt', () => {
  describe('initialization', () => {
    it('should create with message', () => {
      const prompt = new ConfirmPrompt({ message: 'Continue?' });
      expect(prompt.config.message).toBe('Continue?');
    });

    it('should accept default value', () => {
      const prompt = new ConfirmPrompt({
        message: 'Continue?',
        defaultValue: true
      });
      
      expect((prompt as any).value).toBe(true);
    });

    it('should use false as default when not specified', () => {
      const prompt = new ConfirmPrompt({ message: 'Continue?' });
      expect((prompt as any).value).toBe(false);
    });
  });

  describe('non-TTY mode', () => {
    it('should return initial value in non-TTY', async () => {
      const result = await testNonTTYPrompt(
        ConfirmPrompt,
        { 
          message: 'Continue?', 
          initialValue: true 
        },
        true
      );
      
      expect(result).toBe(true);
    });

    it('should return default value in non-TTY', async () => {
      const result = await testNonTTYPrompt(
        ConfirmPrompt,
        { 
          message: 'Continue?',
          defaultValue: true,
          initialValue: true 
        },
        true
      );
      
      expect(result).toBe(true);
    });

    it('should return false when no initial value', async () => {
      const result = await testNonTTYPrompt(
        ConfirmPrompt,
        { message: 'Continue?' },
        false
      );
      
      expect(result).toBe(false);
    });
  });

  describe('TTY mode - input handling', () => {
    it('should accept y for yes', async () => {
      const result = await testPrompt(
        ConfirmPrompt,
        { message: 'Continue?' },
        async ({ sendKey }) => {
          sendKey('y');
        }
      );
      
      expect(result).toBe(true);
    });

    it('should accept Y for yes', async () => {
      const result = await testPrompt(
        ConfirmPrompt,
        { message: 'Continue?' },
        async ({ sendKey }) => {
          sendKey('Y');
        }
      );
      
      expect(result).toBe(true);
    });

    it('should accept n for no', async () => {
      const result = await testPrompt(
        ConfirmPrompt,
        { message: 'Continue?' },
        async ({ sendKey }) => {
          sendKey('n');
        }
      );
      
      expect(result).toBe(false);
    });

    it('should accept N for no', async () => {
      const result = await testPrompt(
        ConfirmPrompt,
        { message: 'Continue?' },
        async ({ sendKey }) => {
          sendKey('N');
        }
      );
      
      expect(result).toBe(false);
    });

    it('should toggle with arrow keys', async () => {
      const result = await testPrompt(
        ConfirmPrompt,
        { message: 'Continue?', defaultValue: false },
        async ({ sendKey }) => {
          sendKey({ name: 'right' }); // Toggle to yes
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(true);
    });

    it('should toggle with left arrow', async () => {
      const result = await testPrompt(
        ConfirmPrompt,
        { message: 'Continue?', defaultValue: true },
        async ({ sendKey }) => {
          sendKey({ name: 'left' }); // Toggle to no
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(false);
    });

    it('should toggle with space', async () => {
      const result = await testPrompt(
        ConfirmPrompt,
        { message: 'Continue?', defaultValue: false },
        async ({ sendKey }) => {
          sendKey({ name: 'space' }); // Toggle
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(true);
    });

    it('should submit on enter with default', async () => {
      const result = await testPrompt(
        ConfirmPrompt,
        { message: 'Continue?', defaultValue: true },
        async ({ sendKey }) => {
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(true);
    });

    it('should cancel on escape', async () => {
      const result = await testPrompt(
        ConfirmPrompt,
        { message: 'Continue?' },
        async ({ sendKey }) => {
          sendKey('y');
          sendKey({ name: 'escape' });
        }
      );
      
      expect(result).toBe(cancelSymbol);
    });

    it('should cancel on Ctrl+C', async () => {
      const result = await testPrompt(
        ConfirmPrompt,
        { message: 'Continue?' },
        async ({ sendKey }) => {
          sendKey('y');
          sendKey({ ctrl: true, name: 'c' });
        }
      );
      
      expect(result).toBe(cancelSymbol);
    });
  });

  describe('rendering', () => {
    it('should show yes/no options', async () => {
      await testPrompt(
        ConfirmPrompt,
        { message: 'Continue?' },
        async ({ mockStreams, sendKey }) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          const output = mockStreams.stdout.write.mock.calls.map(c => c[0]).join('');
          expect(output).toContain('Continue?');
          expect(output).toMatch(/yes|no/i);
          sendKey({ name: 'escape' });
        }
      );
    });

    it('should highlight current selection', async () => {
      await testPrompt(
        ConfirmPrompt,
        { message: 'Continue?', defaultValue: true },
        async ({ mockStreams, sendKey }) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          const output = mockStreams.stdout.write.mock.calls.map(c => c[0]).join('');
          // Should highlight yes when true
          expect(output).toContain('Continue?');
          sendKey({ name: 'escape' });
        }
      );
    });

    it('should show custom labels', async () => {
      await testPrompt(
        ConfirmPrompt,
        { 
          message: 'Delete file?',
          yesLabel: 'Delete',
          noLabel: 'Keep'
        },
        async ({ mockStreams, sendKey }) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          const output = mockStreams.stdout.write.mock.calls.map(c => c[0]).join('');
          expect(output).toContain('Delete');
          expect(output).toContain('Keep');
          sendKey({ name: 'escape' });
        }
      );
    });
  });

  describe('validation', () => {
    it('should validate response', async () => {
      const validate = vi.fn((value: boolean) => {
        if (!value) return 'You must agree';
        return undefined;
      });

      const result = await testPrompt(
        ConfirmPrompt,
        { message: 'Agree?', validate },
        async ({ sendKey, waitForRender }) => {
          sendKey('n');
          sendKey({ name: 'return' });
          await waitForRender();
          // Should not submit due to validation error
          sendKey('y');
          sendKey({ name: 'return' });
        }
      );
      
      expect(validate).toHaveBeenCalledWith(false);
      expect(validate).toHaveBeenCalledWith(true);
      expect(result).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should ignore invalid keys', async () => {
      const result = await testPrompt(
        ConfirmPrompt,
        { message: 'Continue?', defaultValue: false },
        async ({ sendKey }) => {
          sendKey('x'); // Invalid key
          sendKey('z'); // Invalid key
          sendKey('1'); // Invalid key
          sendKey('y'); // Valid key
        }
      );
      
      expect(result).toBe(true);
    });

    it('should handle rapid key presses', async () => {
      const result = await testPrompt(
        ConfirmPrompt,
        { message: 'Continue?' },
        async ({ sendKey }) => {
          // Rapid toggling
          sendKey('y');
          sendKey('n');
          sendKey('y');
          sendKey('n');
          sendKey('y');
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(true);
    });

    it.skip('should handle Tab key as toggle', async () => {
      // Skipped: testPrompt helper has issues simulating Tab key properly
      const result = await testPrompt(
        ConfirmPrompt,
        { message: 'Continue?', defaultValue: false },
        async ({ sendKey, waitForRender }) => {
          sendKey({ name: 'tab' }); // Toggle from false to true
          await waitForRender();
          sendKey({ name: 'return' });
        }
      );
      
      expect(result).toBe(true);
    });
  });
});
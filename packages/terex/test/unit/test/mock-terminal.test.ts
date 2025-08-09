import { it, expect, describe, beforeEach } from 'vitest';

import { MockTerminal } from '../../../src/test/mock-terminal.js';

describe('MockTerminal', () => {
  let mockTerminal: MockTerminal;

  beforeEach(() => {
    mockTerminal = new MockTerminal();
  });

  describe('Initialization', () => {
    it('should create mock terminal with default dimensions', () => {
      expect(mockTerminal).toBeInstanceOf(MockTerminal);
      expect(mockTerminal.columns).toBe(80);
      expect(mockTerminal.rows).toBe(24);
      expect(mockTerminal.isTTY).toBe(true);
    });

    it('should create mock terminal with custom dimensions', () => {
      const customTerminal = new MockTerminal(120, 30);
      expect(customTerminal.columns).toBe(120);
      expect(customTerminal.rows).toBe(30);
    });

    it('should initialize with empty buffer', () => {
      expect(mockTerminal.getOutput()).toBe('');
      expect(mockTerminal.getLines()).toEqual([]);
    });
  });

  describe('Writing Output', () => {
    it('should write text to buffer', () => {
      mockTerminal.write('Hello, World!');
      expect(mockTerminal.getOutput()).toBe('Hello, World!');
    });

    it('should append text to existing buffer', () => {
      mockTerminal.write('Hello');
      mockTerminal.write(' World');
      expect(mockTerminal.getOutput()).toBe('Hello World');
    });

    it('should handle newlines correctly', () => {
      mockTerminal.write('Line 1\n');
      mockTerminal.write('Line 2\n');
      
      const lines = mockTerminal.getLines();
      expect(lines).toEqual(['Line 1', 'Line 2', '']);
      expect(mockTerminal.getOutput()).toBe('Line 1\nLine 2\n');
    });

    it('should handle empty writes', () => {
      mockTerminal.write('');
      expect(mockTerminal.getOutput()).toBe('');
    });

    it('should handle null/undefined writes gracefully', () => {
      expect(() => {
        mockTerminal.write(null as any);
        mockTerminal.write(undefined as any);
      }).not.toThrow();
    });
  });

  describe('Buffer Management', () => {
    beforeEach(() => {
      mockTerminal.write('Test content\nMultiple lines\nMore text');
    });

    it('should get complete output', () => {
      const output = mockTerminal.getOutput();
      expect(output).toBe('Test content\nMultiple lines\nMore text');
    });

    it('should get output as lines array', () => {
      const lines = mockTerminal.getLines();
      expect(lines).toEqual(['Test content', 'Multiple lines', 'More text']);
    });

    it('should clear buffer', () => {
      mockTerminal.clear();
      expect(mockTerminal.getOutput()).toBe('');
      expect(mockTerminal.getLines()).toEqual([]);
    });

    it('should get last N lines', () => {
      const lastLines = mockTerminal.getLastLines(2);
      expect(lastLines).toEqual(['Multiple lines', 'More text']);
    });

    it('should handle request for more lines than available', () => {
      const lastLines = mockTerminal.getLastLines(10);
      expect(lastLines).toEqual(['Test content', 'Multiple lines', 'More text']);
    });

    it('should return empty array for zero lines requested', () => {
      const lastLines = mockTerminal.getLastLines(0);
      expect(lastLines).toEqual([]);
    });
  });

  describe('Cursor Positioning', () => {
    it('should handle cursor positioning escape sequences', () => {
      mockTerminal.write('\x1b[5;10HHello');
      
      // Mock terminal should still capture the output
      expect(mockTerminal.getOutput()).toContain('Hello');
    });

    it('should handle clear screen escape sequences', () => {
      mockTerminal.write('Initial content');
      mockTerminal.write('\x1b[2J'); // Clear screen
      mockTerminal.write('After clear');
      
      expect(mockTerminal.getOutput()).toContain('After clear');
    });

    it('should handle home cursor escape sequence', () => {
      mockTerminal.write('\x1b[HHome position');
      expect(mockTerminal.getOutput()).toContain('Home position');
    });
  });

  describe('ANSI Color Codes', () => {
    it('should preserve color codes in output', () => {
      const coloredText = '\x1b[31mRed text\x1b[0m';
      mockTerminal.write(coloredText);
      expect(mockTerminal.getOutput()).toBe(coloredText);
    });

    it('should handle multiple color codes', () => {
      mockTerminal.write('\x1b[31mRed\x1b[0m ');
      mockTerminal.write('\x1b[32mGreen\x1b[0m ');
      mockTerminal.write('\x1b[34mBlue\x1b[0m');
      
      expect(mockTerminal.getOutput()).toContain('\x1b[31mRed\x1b[0m');
      expect(mockTerminal.getOutput()).toContain('\x1b[32mGreen\x1b[0m');
      expect(mockTerminal.getOutput()).toContain('\x1b[34mBlue\x1b[0m');
    });

    it('should handle background colors', () => {
      const bgColorText = '\x1b[41mRed background\x1b[0m';
      mockTerminal.write(bgColorText);
      expect(mockTerminal.getOutput()).toBe(bgColorText);
    });

    it('should handle text formatting', () => {
      const formattedText = '\x1b[1mBold\x1b[0m \x1b[3mItalic\x1b[0m \x1b[4mUnderline\x1b[0m';
      mockTerminal.write(formattedText);
      expect(mockTerminal.getOutput()).toBe(formattedText);
    });
  });

  describe('Special Characters', () => {
    it('should handle tab characters', () => {
      mockTerminal.write('Before\tAfter');
      expect(mockTerminal.getOutput()).toBe('Before\tAfter');
    });

    it('should handle carriage return', () => {
      mockTerminal.write('Line 1\r\nLine 2');
      expect(mockTerminal.getOutput()).toBe('Line 1\r\nLine 2');
    });

    it('should handle Unicode characters', () => {
      mockTerminal.write('Unicode: ★ ♥ ♦ ♣ ♠');
      expect(mockTerminal.getOutput()).toBe('Unicode: ★ ♥ ♦ ♣ ♠');
    });

    it('should handle box drawing characters', () => {
      mockTerminal.write('┌─┐\n│ │\n└─┘');
      expect(mockTerminal.getOutput()).toBe('┌─┐\n│ │\n└─┘');
    });
  });

  describe('Terminal Properties', () => {
    it('should have default TTY properties', () => {
      expect(mockTerminal.isTTY).toBe(true);
      expect(mockTerminal.columns).toBe(80);
      expect(mockTerminal.rows).toBe(24);
    });

    it('should allow setting custom dimensions', () => {
      mockTerminal.resize(100, 50);
      expect(mockTerminal.columns).toBe(100);
      expect(mockTerminal.rows).toBe(50);
    });

    it('should handle window resize events', () => {
      let resizeEventFired = false;
      mockTerminal.on('resize', () => {
        resizeEventFired = true;
      });

      mockTerminal.resize(120, 30);
      expect(resizeEventFired).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle writing large amounts of text', () => {
      const largeText = 'A'.repeat(10000);
      expect(() => mockTerminal.write(largeText)).not.toThrow();
      expect(mockTerminal.getOutput().length).toBe(10000);
    });

    it('should handle rapid successive writes', () => {
      expect(() => {
        for (let i = 0; i < 1000; i++) {
          mockTerminal.write(`Line ${i}\n`);
        }
      }).not.toThrow();

      const lines = mockTerminal.getLines();
      expect(lines.length).toBe(1001); // 1000 lines + empty line at end
    });

    it('should handle mixed content types', () => {
      expect(() => {
        mockTerminal.write('Text ');
        mockTerminal.write(123 as any); // Should handle number
        mockTerminal.write(' More text');
      }).not.toThrow();

      expect(mockTerminal.getOutput()).toContain('Text');
      expect(mockTerminal.getOutput()).toContain('More text');
    });
  });

  describe('Utility Methods', () => {
    it('should provide line count', () => {
      mockTerminal.write('Line 1\nLine 2\nLine 3');
      expect(mockTerminal.getLineCount()).toBe(3);
    });

    it('should check if output contains text', () => {
      mockTerminal.write('Hello World\nSecond Line');
      
      expect(mockTerminal.contains('Hello')).toBe(true);
      expect(mockTerminal.contains('World')).toBe(true);
      expect(mockTerminal.contains('Second')).toBe(true);
      expect(mockTerminal.contains('NotFound')).toBe(false);
    });

    it('should find line containing text', () => {
      mockTerminal.write('First Line\nSecond Line\nThird Line');
      
      expect(mockTerminal.findLine('Second')).toBe(1);
      expect(mockTerminal.findLine('Third')).toBe(2);
      expect(mockTerminal.findLine('NotFound')).toBe(-1);
    });

    it('should get buffer length', () => {
      const text = 'Hello World';
      mockTerminal.write(text);
      expect(mockTerminal.getBufferLength()).toBe(text.length);
    });
  });

  describe('Event Simulation', () => {
    it('should simulate key events', () => {
      let keyEventReceived: any = null;
      mockTerminal.on('keypress', (str, key) => {
        keyEventReceived = { str, key };
      });

      mockTerminal.simulateKeypress('a', { name: 'a' });
      expect(keyEventReceived).toEqual({
        str: 'a',
        key: { name: 'a' }
      });
    });

    it('should simulate special key events', () => {
      let keyEventReceived: any = null;
      mockTerminal.on('keypress', (str, key) => {
        keyEventReceived = key;
      });

      mockTerminal.simulateKeypress('\r', { name: 'enter' });
      expect(keyEventReceived.name).toBe('enter');
    });

    it('should simulate control key combinations', () => {
      let keyEventReceived: any = null;
      mockTerminal.on('keypress', (str, key) => {
        keyEventReceived = key;
      });

      mockTerminal.simulateKeypress('\x03', { name: 'c', ctrl: true });
      expect(keyEventReceived.ctrl).toBe(true);
      expect(keyEventReceived.name).toBe('c');
    });
  });

  describe('Performance', () => {
    it('should handle writing performance efficiently', () => {
      const startTime = performance.now();
      
      for (let i = 0; i < 1000; i++) {
        mockTerminal.write(`Performance test line ${i}\n`);
      }
      
      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should handle large buffer reads efficiently', () => {
      // Fill buffer with large amount of data
      for (let i = 0; i < 1000; i++) {
        mockTerminal.write(`Data line ${i}\n`);
      }

      const startTime = performance.now();
      const output = mockTerminal.getOutput();
      const lines = mockTerminal.getLines();
      const endTime = performance.now();

      expect(output.length).toBeGreaterThan(0);
      expect(lines.length).toBe(1001); // 1000 lines + empty
      expect(endTime - startTime).toBeLessThan(50); // Should read quickly
    });
  });

  describe('Integration with Components', () => {
    it('should work with component render output', () => {
      const mockRenderOutput = {
        lines: ['Component Line 1', 'Component Line 2', 'Component Line 3'],
        cursor: { x: 5, y: 1 }
      };

      // Simulate writing component output
      mockRenderOutput.lines.forEach(line => {
        mockTerminal.write(line + '\n');
      });

      const lines = mockTerminal.getLines();
      expect(lines.slice(0, 3)).toEqual([
        'Component Line 1',
        'Component Line 2', 
        'Component Line 3'
      ]);
    });

    it('should handle styled component output', () => {
      // Simulate writing styled text from components
      mockTerminal.write('\x1b[1mBold Title\x1b[0m\n');
      mockTerminal.write('\x1b[36mCyan content\x1b[0m\n');
      mockTerminal.write('\x1b[41mRed background\x1b[0m\n');

      const output = mockTerminal.getOutput();
      expect(output).toContain('\x1b[1mBold Title\x1b[0m');
      expect(output).toContain('\x1b[36mCyan content\x1b[0m');
      expect(output).toContain('\x1b[41mRed background\x1b[0m');
    });
  });
});
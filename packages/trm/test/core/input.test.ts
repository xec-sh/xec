/**
 * Input tests
 * Tests for input system implementation
 */

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { InputImpl } from '../../src/core/input.js';
import { MouseButton, MouseAction } from '../../src/types.js';

import type { Input, TerminalStream } from '../../src/types.js';

// Mock ansi module
vi.mock('../../src/core/ansi.js', () => ({
  ansi: {
    mouseEnableAll: vi.fn(() => '\x1b[?1003h'),
    mouseEnableSGR: vi.fn(() => '\x1b[?1006h'),
    mouseDisableAll: vi.fn(() => '\x1b[?1003l'),
    mouseDisableSGR: vi.fn(() => '\x1b[?1006l'),
    bracketedPasteEnable: vi.fn(() => '\x1b[?2004h'),
    bracketedPasteDisable: vi.fn(() => '\x1b[?2004l'),
    focusTrackingEnable: vi.fn(() => '\x1b[?1004h'),
    focusTrackingDisable: vi.fn(() => '\x1b[?1004l')
  }
}));

describe('Input', () => {
  let input: Input;
  let mockStream: TerminalStream;
  let stdinData: Uint8Array[] = [];

  beforeEach(() => {
    stdinData = [];
    
    mockStream = {
      stdin: {
        async *[Symbol.asyncIterator] () {
          for (const data of stdinData) {
            yield data;
          }
        }
      },
      stdout: {
        write: vi.fn()
      },
      stderr: {
        write: vi.fn()
      },
      write: vi.fn(),
      writeLine: vi.fn(),
      writeError: vi.fn(),
      rows: 24,
      cols: 80,
      isTTY: true,
      colorDepth: 24,
      setRawMode: vi.fn(),
      isRaw: false,
      useAlternateBuffer: vi.fn(),
      clearScreen: vi.fn(),
      platform: {
        runtime: 'node',
        os: 'linux',
        terminal: 'xterm'
      },
      encoding: 'utf8',
      flush: vi.fn()
    } as any;
    
    input = new InputImpl(mockStream);
  });

  afterEach(() => {
    input.close();
    vi.clearAllMocks();
  });

  describe('Creation', () => {
    it('should create input with default state', () => {
      expect(input).toBeDefined();
      expect(input.mouseEnabled).toBe(false);
      expect(input.keyboardEnabled).toBe(true);
      expect(input.bracketedPasteEnabled).toBe(false);
      expect(input.focusTrackingEnabled).toBe(false);
    });
  });

  describe('Feature Control', () => {
    describe('Mouse', () => {
      it('should enable mouse', () => {
        input.enableMouse();
        
        expect(input.mouseEnabled).toBe(true);
        expect(mockStream.write).toHaveBeenCalledWith('\x1b[?1003h');
        expect(mockStream.write).toHaveBeenCalledWith('\x1b[?1006h');
      });

      it('should not enable mouse twice', () => {
        input.enableMouse();
        vi.clearAllMocks();
        
        input.enableMouse();
        
        expect(mockStream.write).not.toHaveBeenCalled();
      });

      it('should disable mouse', () => {
        input.enableMouse();
        vi.clearAllMocks();
        
        input.disableMouse();
        
        expect(input.mouseEnabled).toBe(false);
        expect(mockStream.write).toHaveBeenCalledWith('\x1b[?1003l');
        expect(mockStream.write).toHaveBeenCalledWith('\x1b[?1006l');
      });

      it('should not disable mouse if not enabled', () => {
        input.disableMouse();
        
        expect(mockStream.write).not.toHaveBeenCalled();
      });
    });

    describe('Keyboard', () => {
      it('should enable keyboard', () => {
        input.disableKeyboard();
        input.enableKeyboard();
        
        expect(input.keyboardEnabled).toBe(true);
      });

      it('should disable keyboard', () => {
        input.disableKeyboard();
        
        expect(input.keyboardEnabled).toBe(false);
      });
    });

    describe('Bracketed Paste', () => {
      it('should enable bracketed paste', () => {
        input.enableBracketedPaste();
        
        expect(input.bracketedPasteEnabled).toBe(true);
        expect(mockStream.write).toHaveBeenCalledWith('\x1b[?2004h');
      });

      it('should not enable bracketed paste twice', () => {
        input.enableBracketedPaste();
        vi.clearAllMocks();
        
        input.enableBracketedPaste();
        
        expect(mockStream.write).not.toHaveBeenCalled();
      });

      it('should disable bracketed paste', () => {
        input.enableBracketedPaste();
        vi.clearAllMocks();
        
        input.disableBracketedPaste();
        
        expect(input.bracketedPasteEnabled).toBe(false);
        expect(mockStream.write).toHaveBeenCalledWith('\x1b[?2004l');
      });

      it('should not disable bracketed paste if not enabled', () => {
        input.disableBracketedPaste();
        
        expect(mockStream.write).not.toHaveBeenCalled();
      });
    });

    describe('Focus Tracking', () => {
      it('should enable focus tracking', () => {
        input.enableFocusTracking();
        
        expect(input.focusTrackingEnabled).toBe(true);
        expect(mockStream.write).toHaveBeenCalledWith('\x1b[?1004h');
      });

      it('should not enable focus tracking twice', () => {
        input.enableFocusTracking();
        vi.clearAllMocks();
        
        input.enableFocusTracking();
        
        expect(mockStream.write).not.toHaveBeenCalled();
      });

      it('should disable focus tracking', () => {
        input.enableFocusTracking();
        vi.clearAllMocks();
        
        input.disableFocusTracking();
        
        expect(input.focusTrackingEnabled).toBe(false);
        expect(mockStream.write).toHaveBeenCalledWith('\x1b[?1004l');
      });

      it('should not disable focus tracking if not enabled', () => {
        input.disableFocusTracking();
        
        expect(mockStream.write).not.toHaveBeenCalled();
      });
    });
  });

  describe('Event Parsing', () => {
    describe('Key Events', () => {
      it('should parse regular characters', async () => {
        stdinData = [new TextEncoder().encode('abc')];
        
        const events = [];
        for await (const event of input.events) {
          events.push(event);
          if (events.length === 3) break;
        }
        
        expect(events).toHaveLength(3);
        expect(events[0]).toMatchObject({
          type: 'key',
          key: 'a',
          sequence: 'a',
          isSpecial: false
        });
        expect(events[1]).toMatchObject({
          type: 'key',
          key: 'b',
          sequence: 'b',
          isSpecial: false
        });
        expect(events[2]).toMatchObject({
          type: 'key',
          key: 'c',
          sequence: 'c',
          isSpecial: false
        });
      });

      it('should parse special keys', async () => {
        stdinData = [
          new TextEncoder().encode('\x1b'), // Escape
          new TextEncoder().encode('\r'),   // Enter
          new TextEncoder().encode('\t'),   // Tab
          new TextEncoder().encode('\x7f')  // Backspace
        ];
        
        const events = [];
        for await (const event of input.events) {
          events.push(event);
          if (events.length === 4) break;
        }
        
        expect(events[0]).toMatchObject({
          type: 'key',
          key: 'Escape',
          isSpecial: true
        });
        expect(events[1]).toMatchObject({
          type: 'key',
          key: 'Enter',
          isSpecial: true
        });
        expect(events[2]).toMatchObject({
          type: 'key',
          key: 'Tab',
          isSpecial: true
        });
        expect(events[3]).toMatchObject({
          type: 'key',
          key: 'Backspace',
          isSpecial: true
        });
      });

      it('should parse arrow keys', async () => {
        stdinData = [
          new TextEncoder().encode('\x1b[A'), // Up
          new TextEncoder().encode('\x1b[B'), // Down
          new TextEncoder().encode('\x1b[C'), // Right
          new TextEncoder().encode('\x1b[D')  // Left
        ];
        
        const events = [];
        for await (const event of input.events) {
          events.push(event);
          if (events.length === 4) break;
        }
        
        expect(events[0]).toMatchObject({
          type: 'key',
          key: 'ArrowUp',
          isSpecial: true
        });
        expect(events[1]).toMatchObject({
          type: 'key',
          key: 'ArrowDown',
          isSpecial: true
        });
        expect(events[2]).toMatchObject({
          type: 'key',
          key: 'ArrowRight',
          isSpecial: true
        });
        expect(events[3]).toMatchObject({
          type: 'key',
          key: 'ArrowLeft',
          isSpecial: true
        });
      });

      it('should parse function keys', async () => {
        stdinData = [
          new TextEncoder().encode('\x1b[11~'), // F1
          new TextEncoder().encode('\x1b[12~'), // F2
          new TextEncoder().encode('\x1b[23~'), // F11
          new TextEncoder().encode('\x1b[24~')  // F12
        ];
        
        const events = [];
        for await (const event of input.events) {
          events.push(event);
          if (events.length === 4) break;
        }
        
        expect(events[0]).toMatchObject({
          type: 'key',
          key: 'F1',
          isSpecial: true
        });
        expect(events[1]).toMatchObject({
          type: 'key',
          key: 'F2',
          isSpecial: true
        });
        expect(events[2]).toMatchObject({
          type: 'key',
          key: 'F11',
          isSpecial: true
        });
        expect(events[3]).toMatchObject({
          type: 'key',
          key: 'F12',
          isSpecial: true
        });
      });

      it('should parse control combinations', async () => {
        stdinData = [
          new TextEncoder().encode('\x01'), // Ctrl+A
          new TextEncoder().encode('\x03'), // Ctrl+C
          new TextEncoder().encode('\x1a')  // Ctrl+Z
        ];
        
        const events = [];
        for await (const event of input.events) {
          events.push(event);
          if (events.length === 3) break;
        }
        
        expect(events[0]).toMatchObject({
          type: 'key',
          key: 'a',
          ctrl: true
        });
        expect(events[1]).toMatchObject({
          type: 'key',
          key: 'c',
          ctrl: true
        });
        expect(events[2]).toMatchObject({
          type: 'key',
          key: 'z',
          ctrl: true
        });
      });

      it('should parse alt combinations', async () => {
        stdinData = [
          new TextEncoder().encode('\x1ba'), // Alt+a
          new TextEncoder().encode('\x1bz')  // Alt+z
        ];
        
        const events = [];
        for await (const event of input.events) {
          events.push(event);
          if (events.length === 2) break;
        }
        
        expect(events[0]).toMatchObject({
          type: 'key',
          key: 'a',
          alt: true
        });
        expect(events[1]).toMatchObject({
          type: 'key',
          key: 'z',
          alt: true
        });
      });

      it('should parse modified arrow keys', async () => {
        stdinData = [
          new TextEncoder().encode('\x1b[1;5C'), // Ctrl+Right
          new TextEncoder().encode('\x1b[1;3A'), // Alt+Up
          new TextEncoder().encode('\x1b[1;2B')  // Shift+Down
        ];
        
        const events = [];
        for await (const event of input.events) {
          events.push(event);
          if (events.length === 3) break;
        }
        
        expect(events[0]).toMatchObject({
          type: 'key',
          key: 'ArrowRight',
          ctrl: true
        });
        expect(events[1]).toMatchObject({
          type: 'key',
          key: 'ArrowUp',
          alt: true
        });
        expect(events[2]).toMatchObject({
          type: 'key',
          key: 'ArrowDown',
          shift: true
        });
      });

      it('should filter disabled keyboard events', async () => {
        input.disableKeyboard();
        stdinData = [new TextEncoder().encode('abc')];
        
        const events = [];
        const timeout = setTimeout(() => {
          // Force exit after timeout
        }, 100);
        
        for await (const event of input.events) {
          events.push(event);
          if (events.length > 0) break;
        }
        
        clearTimeout(timeout);
        expect(events).toHaveLength(0);
      });
    });

    describe('Mouse Events', () => {
      it('should parse SGR mouse press', async () => {
        input.enableMouse();
        stdinData = [
          new TextEncoder().encode('\x1b[<0;10;5M') // Left click at (10, 5)
        ];
        
        const events = [];
        for await (const event of input.events) {
          events.push(event);
          if (events.length === 1) break;
        }
        
        expect(events[0]).toMatchObject({
          type: 'mouse',
          x: 9,
          y: 4,
          button: MouseButton.Left,
          action: MouseAction.Press
        });
      });

      it('should parse SGR mouse release', async () => {
        input.enableMouse();
        stdinData = [
          new TextEncoder().encode('\x1b[<0;10;5m') // Left release at (10, 5)
        ];
        
        const events = [];
        for await (const event of input.events) {
          events.push(event);
          if (events.length === 1) break;
        }
        
        expect(events[0]).toMatchObject({
          type: 'mouse',
          x: 9,
          y: 4,
          button: MouseButton.Left,
          action: MouseAction.Release
        });
      });

      it('should parse SGR mouse move', async () => {
        input.enableMouse();
        stdinData = [
          new TextEncoder().encode('\x1b[<32;20;10M') // Move to (20, 10)
        ];
        
        const events = [];
        for await (const event of input.events) {
          events.push(event);
          if (events.length === 1) break;
        }
        
        expect(events[0]).toMatchObject({
          type: 'mouse',
          x: 19,
          y: 9,
          action: MouseAction.Move
        });
      });

      it('should parse SGR scroll events', async () => {
        input.enableMouse();
        stdinData = [
          new TextEncoder().encode('\x1b[<64;10;5M'), // Scroll up
          new TextEncoder().encode('\x1b[<65;10;5M')  // Scroll down
        ];
        
        const events = [];
        for await (const event of input.events) {
          events.push(event);
          if (events.length === 2) break;
        }
        
        expect(events[0]).toMatchObject({
          type: 'mouse',
          button: MouseButton.ScrollUp,
          action: MouseAction.ScrollUp
        });
        expect(events[1]).toMatchObject({
          type: 'mouse',
          button: MouseButton.ScrollDown,
          action: MouseAction.ScrollDown
        });
      });

      it('should parse mouse with modifiers', async () => {
        input.enableMouse();
        stdinData = [
          new TextEncoder().encode('\x1b[<4;10;5M'),  // Shift+Left
          new TextEncoder().encode('\x1b[<8;10;5M'),  // Alt+Left
          new TextEncoder().encode('\x1b[<16;10;5M')  // Ctrl+Left
        ];
        
        const events = [];
        for await (const event of input.events) {
          events.push(event);
          if (events.length === 3) break;
        }
        
        expect(events[0]).toMatchObject({
          type: 'mouse',
          shift: true
        });
        expect(events[1]).toMatchObject({
          type: 'mouse',
          alt: true
        });
        expect(events[2]).toMatchObject({
          type: 'mouse',
          ctrl: true
        });
      });

      it('should filter disabled mouse events', async () => {
        // Mouse is disabled by default
        stdinData = [
          new TextEncoder().encode('\x1b[<0;10;5M')
        ];
        
        const events = [];
        const timeout = setTimeout(() => {
          // Force exit after timeout
        }, 100);
        
        for await (const event of input.events) {
          events.push(event);
          if (events.length > 0) break;
        }
        
        clearTimeout(timeout);
        expect(events).toHaveLength(0);
      });
    });

    describe('Paste Events', () => {
      it('should parse bracketed paste', async () => {
        input.enableBracketedPaste();
        stdinData = [
          new TextEncoder().encode('\x1b[200~Hello, World!\x1b[201~')
        ];
        
        const events = [];
        for await (const event of input.events) {
          events.push(event);
          if (events.length === 1) break;
        }
        
        expect(events[0]).toMatchObject({
          type: 'paste',
          data: 'Hello, World!',
          bracketed: true
        });
      });

      it('should handle multi-line paste', async () => {
        input.enableBracketedPaste();
        stdinData = [
          new TextEncoder().encode('\x1b[200~Line 1\nLine 2\nLine 3\x1b[201~')
        ];
        
        const events = [];
        for await (const event of input.events) {
          events.push(event);
          if (events.length === 1) break;
        }
        
        expect(events[0]).toMatchObject({
          type: 'paste',
          data: 'Line 1\nLine 2\nLine 3',
          bracketed: true
        });
      });

      it('should handle paste split across chunks', async () => {
        input.enableBracketedPaste();
        stdinData = [
          new TextEncoder().encode('\x1b[200~Hello'),
          new TextEncoder().encode(', '),
          new TextEncoder().encode('World!\x1b[201~')
        ];
        
        const events = [];
        for await (const event of input.events) {
          events.push(event);
          if (events.length === 1) break;
        }
        
        expect(events[0]).toMatchObject({
          type: 'paste',
          data: 'Hello, World!',
          bracketed: true
        });
      });
    });

    describe('Focus Events', () => {
      it('should parse focus in event', async () => {
        input.enableFocusTracking();
        stdinData = [
          new TextEncoder().encode('\x1b[I')
        ];
        
        const events = [];
        for await (const event of input.events) {
          events.push(event);
          if (events.length === 1) break;
        }
        
        expect(events[0]).toMatchObject({
          type: 'focus',
          focused: true
        });
      });

      it('should parse focus out event', async () => {
        input.enableFocusTracking();
        stdinData = [
          new TextEncoder().encode('\x1b[O')
        ];
        
        const events = [];
        for await (const event of input.events) {
          events.push(event);
          if (events.length === 1) break;
        }
        
        expect(events[0]).toMatchObject({
          type: 'focus',
          focused: false
        });
      });
    });
  });

  describe('Raw Stream', () => {
    it('should provide raw input stream', async () => {
      const testData = new TextEncoder().encode('test data');
      stdinData = [testData];
      
      const chunks = [];
      for await (const chunk of input.stream) {
        chunks.push(chunk);
        if (chunks.length === 1) break;
      }
      
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual(testData);
    });

    it('should handle Node.js ReadStream fallback', async () => {
      // Mock stdin as Node.js ReadStream
      const nodeStdin = {
        once: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('test')), 0);
          }
        })
      };
      
      mockStream.stdin = nodeStdin as any;
      input = new InputImpl(mockStream);
      
      const chunks = [];
      const timeout = setTimeout(() => {
        // Force exit after collecting data
      }, 100);
      
      for await (const chunk of input.stream) {
        chunks.push(chunk);
        if (chunks.length === 1) break;
      }
      
      clearTimeout(timeout);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual(new Uint8Array([116, 101, 115, 116])); // 'test'
    });
  });

  describe('Lifecycle', () => {
    it('should close input and disable features', () => {
      input.enableMouse();
      input.enableBracketedPaste();
      input.enableFocusTracking();
      vi.clearAllMocks();
      
      input.close();
      
      expect(mockStream.write).toHaveBeenCalledWith('\x1b[?1003l');
      expect(mockStream.write).toHaveBeenCalledWith('\x1b[?1006l');
      expect(mockStream.write).toHaveBeenCalledWith('\x1b[?2004l');
      expect(mockStream.write).toHaveBeenCalledWith('\x1b[?1004l');
    });

    it('should stop processing events after close', async () => {
      input.close();
      stdinData = [new TextEncoder().encode('test')];
      
      const events = [];
      const timeout = setTimeout(() => {
        // Force exit after timeout
      }, 100);
      
      for await (const event of input.events) {
        events.push(event);
        if (events.length > 0) break;
      }
      
      clearTimeout(timeout);
      expect(events).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle incomplete escape sequences', async () => {
      stdinData = [
        new TextEncoder().encode('\x1b['), // Incomplete sequence
        new TextEncoder().encode('A')       // Complete it
      ];
      
      const events = [];
      for await (const event of input.events) {
        events.push(event);
        if (events.length === 1) break;
      }
      
      expect(events[0]).toMatchObject({
        type: 'key',
        key: 'ArrowUp'
      });
    });

    it('should handle invalid escape sequences', async () => {
      stdinData = [
        new TextEncoder().encode('\x1b[999999999999999999Z') // Invalid sequence
      ];
      
      const events = [];
      const timeout = setTimeout(() => {
        // Force exit after timeout
      }, 100);
      
      for await (const event of input.events) {
        events.push(event);
        if (events.length > 0) break;
      }
      
      clearTimeout(timeout);
      // Should skip invalid sequences
      expect(events).toHaveLength(0);
    });

    it('should handle SS3 escape sequences', async () => {
      stdinData = [
        new TextEncoder().encode('\x1bOA'), // SS3 Up arrow
        new TextEncoder().encode('\x1bOP')  // SS3 F1
      ];
      
      const events = [];
      for await (const event of input.events) {
        events.push(event);
        if (events.length === 2) break;
      }
      
      expect(events[0]).toMatchObject({
        type: 'key',
        key: 'ArrowUp'
      });
      expect(events[1]).toMatchObject({
        type: 'key',
        key: 'F1'
      });
    });

    it('should handle null character', async () => {
      stdinData = [
        new TextEncoder().encode('\x00') // Null character
      ];
      
      const events = [];
      for await (const event of input.events) {
        events.push(event);
        if (events.length === 1) break;
      }
      
      expect(events[0]).toMatchObject({
        type: 'key',
        key: 'Null',
        isSpecial: true
      });
    });

    it('should handle special key sequences', async () => {
      stdinData = [
        new TextEncoder().encode('\x1b[1~'),  // Home
        new TextEncoder().encode('\x1b[2~'),  // Insert
        new TextEncoder().encode('\x1b[3~'),  // Delete
        new TextEncoder().encode('\x1b[4~'),  // End
        new TextEncoder().encode('\x1b[5~'),  // PageUp
        new TextEncoder().encode('\x1b[6~')   // PageDown
      ];
      
      const events = [];
      for await (const event of input.events) {
        events.push(event);
        if (events.length === 6) break;
      }
      
      expect(events[0]).toMatchObject({ key: 'Home' });
      expect(events[1]).toMatchObject({ key: 'Insert' });
      expect(events[2]).toMatchObject({ key: 'Delete' });
      expect(events[3]).toMatchObject({ key: 'End' });
      expect(events[4]).toMatchObject({ key: 'PageUp' });
      expect(events[5]).toMatchObject({ key: 'PageDown' });
    });

    it('should handle mixed input types', async () => {
      input.enableMouse();
      input.enableBracketedPaste();
      
      stdinData = [
        new TextEncoder().encode('a'),                           // Regular key
        new TextEncoder().encode('\x1b[A'),                     // Arrow key
        new TextEncoder().encode('\x1b[<0;10;5M'),             // Mouse click
        new TextEncoder().encode('\x1b[200~test\x1b[201~')     // Paste
      ];
      
      const events = [];
      for await (const event of input.events) {
        events.push(event);
        if (events.length === 4) break;
      }
      
      expect(events[0].type).toBe('key');
      expect(events[1].type).toBe('key');
      expect(events[2].type).toBe('mouse');
      expect(events[3].type).toBe('paste');
    });
  });
});
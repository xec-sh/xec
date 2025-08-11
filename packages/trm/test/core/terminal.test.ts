/**
 * Terminal tests
 * Tests for the main terminal implementation
 */

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { ColorDepth, CursorShape } from '../../src/types.js';
import { TerminalImpl, createTerminal } from '../../src/core/terminal.js';

import type { Terminal, TerminalState, TerminalOptions } from '../../src/types.js';

// Mock modules
vi.mock('../../src/core/platform.js', () => ({
  initPlatform: vi.fn().mockResolvedValue(undefined),
  detectRuntime: vi.fn().mockReturnValue('node'),
  detectOS: vi.fn().mockReturnValue('linux'),
  detectTerminal: vi.fn().mockReturnValue('xterm')
}));

vi.mock('../../src/core/stream.js', () => ({
  createTerminalStream: vi.fn(() => ({
    stdin: {
      [Symbol.asyncIterator]: vi.fn(() => ({
        next: vi.fn().mockResolvedValue({ done: true })
      }))
    },
    stdout: {
      write: vi.fn(),
      on: vi.fn(),
      off: vi.fn()
    },
    stderr: {
      write: vi.fn()
    },
    rows: 24,
    cols: 80,
    isTTY: true,
    colorDepth: ColorDepth.TrueColor,
    setRawMode: vi.fn(),
    isRaw: false,
    useAlternateBuffer: vi.fn(() => ({ dispose: vi.fn() })),
    clearScreen: vi.fn(),
    platform: {
      runtime: 'node',
      os: 'linux',
      terminal: 'xterm'
    },
    encoding: 'utf8',
    write: vi.fn(),
    writeLine: vi.fn(),
    writeError: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined)
  }))
}));

describe('Terminal', () => {
  let terminal: Terminal;
  let originalProcess: any;

  beforeEach(() => {
    // Save original process
    originalProcess = global.process;
    
    // Mock process for Node.js specific tests
    global.process = {
      ...originalProcess,
      on: vi.fn(),
      off: vi.fn(),
      stdout: {
        write: vi.fn(),
        on: vi.fn(),
        off: vi.fn()
      },
      stderr: {
        write: vi.fn()
      },
      stdin: {
        setRawMode: vi.fn(),
        on: vi.fn(),
        off: vi.fn()
      }
    };
  });

  afterEach(async () => {
    // Clean up terminal if created
    if (terminal && !terminal.closed) {
      await terminal.close();
    }
    
    // Restore original process
    global.process = originalProcess;
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('Creation', () => {
    it('should create a terminal with default options', () => {
      terminal = createTerminal();
      
      expect(terminal).toBeInstanceOf(TerminalImpl);
      expect(terminal.stream).toBeDefined();
      expect(terminal.screen).toBeDefined();
      expect(terminal.cursor).toBeDefined();
      expect(terminal.colors).toBeDefined();
      expect(terminal.styles).toBeDefined();
      expect(terminal.input).toBeDefined();
      expect(terminal.buffer).toBeDefined();
      expect(terminal.ansi).toBeDefined();
      expect(terminal.events).toBeDefined();
    });

    it('should create a terminal with custom options', () => {
      const options: TerminalOptions = {
        colors: 256,
        rawMode: true,
        alternateBuffer: true,
        mouse: true,
        bracketedPaste: true,
        cursorHidden: true,
        cursorShape: CursorShape.Block,
        focusTracking: true
      };
      
      terminal = createTerminal(options);
      
      expect(terminal).toBeInstanceOf(TerminalImpl);
    });

    it('should handle color depth options correctly', () => {
      // Test with boolean true
      terminal = createTerminal({ colors: true });
      expect(terminal.colors).toBeDefined();
      
      // Test with boolean false
      terminal = createTerminal({ colors: false });
      expect(terminal.colors).toBeDefined();
      
      // Test with number
      terminal = createTerminal({ colors: 256 });
      expect(terminal.colors).toBeDefined();
    });

    it('should create terminal without options', () => {
      terminal = new TerminalImpl();
      
      expect(terminal).toBeInstanceOf(TerminalImpl);
      expect(terminal.stream).toBeDefined();
    });
  });

  describe('Initialization', () => {
    beforeEach(() => {
      terminal = createTerminal();
    });

    it('should initialize terminal', async () => {
      expect(terminal.initialized).toBe(false);
      
      await terminal.init();
      
      expect(terminal.initialized).toBe(true);
    });

    it('should not initialize twice', async () => {
      await terminal.init();
      expect(terminal.initialized).toBe(true);
      
      // Second init should be a no-op
      await terminal.init();
      expect(terminal.initialized).toBe(true);
    });

    it('should set raw mode if requested', async () => {
      terminal = createTerminal({ rawMode: true });
      
      await terminal.init();
      
      expect(terminal.stream.setRawMode).toHaveBeenCalledWith(true);
    });

    it('should use alternate buffer if requested', async () => {
      terminal = createTerminal({ alternateBuffer: true });
      
      await terminal.init();
      
      expect(terminal.stream.useAlternateBuffer).toHaveBeenCalled();
    });

    it('should hide cursor if requested', async () => {
      terminal = createTerminal({ cursorHidden: true });
      const hideSpy = vi.spyOn(terminal.cursor, 'hide');
      
      await terminal.init();
      
      expect(hideSpy).toHaveBeenCalled();
    });

    it('should set cursor shape if specified', async () => {
      terminal = createTerminal({ cursorShape: CursorShape.Bar });
      const setShapeSpy = vi.spyOn(terminal.cursor, 'setShape');
      
      await terminal.init();
      
      expect(setShapeSpy).toHaveBeenCalledWith(CursorShape.Bar);
    });

    it('should enable mouse if requested', async () => {
      terminal = createTerminal({ mouse: true });
      const enableMouseSpy = vi.spyOn(terminal.input, 'enableMouse');
      
      await terminal.init();
      
      expect(enableMouseSpy).toHaveBeenCalled();
    });

    it('should enable bracketed paste if requested', async () => {
      terminal = createTerminal({ bracketedPaste: true });
      const enablePasteSpy = vi.spyOn(terminal.input, 'enableBracketedPaste');
      
      await terminal.init();
      
      expect(enablePasteSpy).toHaveBeenCalled();
    });

    it('should enable focus tracking if requested', async () => {
      terminal = createTerminal({ focusTracking: true });
      const enableFocusSpy = vi.spyOn(terminal.input, 'enableFocusTracking');
      
      await terminal.init();
      
      expect(enableFocusSpy).toHaveBeenCalled();
    });

    it('should emit resize event on initialization', async () => {
      const resizeSpy = vi.fn();
      terminal.events.on('resize', resizeSpy);
      
      await terminal.init();
      
      expect(resizeSpy).toHaveBeenCalledWith(24, 80);
    });

    it('should setup resize handler for Node.js', async () => {
      await terminal.init();
      
      expect(process.on).toHaveBeenCalledWith('SIGWINCH', expect.any(Function));
    });
  });

  describe('Lifecycle', () => {
    beforeEach(() => {
      terminal = createTerminal({
        rawMode: true,
        alternateBuffer: true,
        cursorHidden: true
      });
    });

    it('should close terminal properly', async () => {
      await terminal.init();
      expect(terminal.closed).toBe(false);
      
      await terminal.close();
      
      expect(terminal.closed).toBe(true);
    });

    it('should not close twice', async () => {
      await terminal.init();
      await terminal.close();
      expect(terminal.closed).toBe(true);
      
      // Second close should be a no-op
      await terminal.close();
      expect(terminal.closed).toBe(true);
    });

    it('should emit close event', async () => {
      await terminal.init();
      
      const closeSpy = vi.fn();
      terminal.events.on('close', closeSpy);
      
      await terminal.close();
      
      expect(closeSpy).toHaveBeenCalled();
    });

    it('should close input on terminal close', async () => {
      await terminal.init();
      const closeSpy = vi.spyOn(terminal.input, 'close');
      
      await terminal.close();
      
      expect(closeSpy).toHaveBeenCalled();
    });

    it('should show cursor on close', async () => {
      await terminal.init();
      const showSpy = vi.spyOn(terminal.cursor, 'show');
      
      await terminal.close();
      
      expect(showSpy).toHaveBeenCalled();
    });

    it('should disable raw mode on close', async () => {
      await terminal.init();
      terminal.stream.isRaw = true;
      
      await terminal.close();
      
      expect(terminal.stream.setRawMode).toHaveBeenCalledWith(false);
    });

    it('should restore main buffer on close', async () => {
      await terminal.init();
      const disposer = { dispose: vi.fn() };
      (terminal as any).alternateBufferDisposer = disposer;
      
      await terminal.close();
      
      expect(disposer.dispose).toHaveBeenCalled();
    });

    it('should remove resize handler on close', async () => {
      await terminal.init();
      
      await terminal.close();
      
      expect(process.off).toHaveBeenCalledWith('SIGWINCH', expect.any(Function));
    });

    it('should flush output on close', async () => {
      await terminal.init();
      
      await terminal.close();
      
      expect(terminal.stream.flush).toHaveBeenCalled();
    });
  });

  describe('Utilities', () => {
    beforeEach(async () => {
      terminal = createTerminal();
      await terminal.init();
    });

    it('should write data to stream', () => {
      terminal.write('Hello, World!');
      
      expect(terminal.stream.write).toHaveBeenCalledWith('Hello, World!');
    });

    it('should write line to stream', () => {
      terminal.writeLine('Hello, World!');
      
      expect(terminal.stream.writeLine).toHaveBeenCalledWith('Hello, World!');
    });

    it('should write Uint8Array to stream', () => {
      const data = new Uint8Array([65, 66, 67]);
      terminal.write(data);
      
      expect(terminal.stream.write).toHaveBeenCalledWith(data);
    });

    it('should flush stream', async () => {
      await terminal.flush();
      
      expect(terminal.stream.flush).toHaveBeenCalled();
    });

    it('should get terminal size', () => {
      const size = terminal.getSize();
      
      expect(size).toEqual({ rows: 24, cols: 80 });
    });
  });

  describe('State Management', () => {
    beforeEach(async () => {
      terminal = createTerminal();
      await terminal.init();
    });

    it('should save terminal state', () => {
      const state = terminal.saveState();
      
      expect(state).toHaveProperty('cursorPosition');
      expect(state).toHaveProperty('cursorVisible');
      expect(state).toHaveProperty('cursorShape');
      expect(state).toHaveProperty('alternateBuffer');
      expect(state).toHaveProperty('rawMode');
      expect(state).toHaveProperty('mouseEnabled');
    });

    it('should restore cursor position', () => {
      const state: TerminalState = {
        cursorPosition: { x: 10 as any, y: 5 as any },
        cursorVisible: true,
        cursorShape: CursorShape.Block,
        alternateBuffer: false,
        rawMode: false,
        mouseEnabled: false
      };
      
      const moveToSpy = vi.spyOn(terminal.cursor, 'moveTo');
      
      terminal.restoreState(state);
      
      expect(moveToSpy).toHaveBeenCalledWith(10, 5);
    });

    it('should restore cursor visibility', () => {
      const showSpy = vi.spyOn(terminal.cursor, 'show');
      const hideSpy = vi.spyOn(terminal.cursor, 'hide');
      
      // Test showing cursor
      terminal.restoreState({
        cursorPosition: { x: 0 as any, y: 0 as any },
        cursorVisible: true,
        cursorShape: CursorShape.Block,
        alternateBuffer: false,
        rawMode: false,
        mouseEnabled: false
      });
      
      expect(showSpy).toHaveBeenCalled();
      
      // Test hiding cursor
      terminal.restoreState({
        cursorPosition: { x: 0 as any, y: 0 as any },
        cursorVisible: false,
        cursorShape: CursorShape.Block,
        alternateBuffer: false,
        rawMode: false,
        mouseEnabled: false
      });
      
      expect(hideSpy).toHaveBeenCalled();
    });

    it('should restore cursor shape', () => {
      const setShapeSpy = vi.spyOn(terminal.cursor, 'setShape');
      
      terminal.restoreState({
        cursorPosition: { x: 0 as any, y: 0 as any },
        cursorVisible: true,
        cursorShape: CursorShape.Underline,
        alternateBuffer: false,
        rawMode: false,
        mouseEnabled: false
      });
      
      expect(setShapeSpy).toHaveBeenCalledWith(CursorShape.Underline);
    });

    it('should restore raw mode', () => {
      terminal.stream.isRaw = false;
      
      terminal.restoreState({
        cursorPosition: { x: 0 as any, y: 0 as any },
        cursorVisible: true,
        cursorShape: CursorShape.Block,
        alternateBuffer: false,
        rawMode: true,
        mouseEnabled: false
      });
      
      expect(terminal.stream.setRawMode).toHaveBeenCalledWith(true);
    });

    it('should restore mouse state', () => {
      const enableMouseSpy = vi.spyOn(terminal.input, 'enableMouse');
      const disableMouseSpy = vi.spyOn(terminal.input, 'disableMouse');
      
      // Test enabling mouse
      // Mock the mouseEnabled getter to return false
      Object.defineProperty(terminal.input, 'mouseEnabled', {
        get: () => false,
        configurable: true
      });
      
      terminal.restoreState({
        cursorPosition: { x: 0 as any, y: 0 as any },
        cursorVisible: true,
        cursorShape: CursorShape.Block,
        alternateBuffer: false,
        rawMode: false,
        mouseEnabled: true
      });
      
      expect(enableMouseSpy).toHaveBeenCalled();
      
      // Test disabling mouse
      // Mock the mouseEnabled getter to return true
      Object.defineProperty(terminal.input, 'mouseEnabled', {
        get: () => true,
        configurable: true
      });
      
      terminal.restoreState({
        cursorPosition: { x: 0 as any, y: 0 as any },
        cursorVisible: true,
        cursorShape: CursorShape.Block,
        alternateBuffer: false,
        rawMode: false,
        mouseEnabled: false
      });
      
      expect(disableMouseSpy).toHaveBeenCalled();
    });
  });

  describe('Event Handling', () => {
    beforeEach(async () => {
      terminal = createTerminal();
      await terminal.init();
    });

    it('should handle resize events', async () => {
      const resizeSpy = vi.fn();
      terminal.events.on('resize', resizeSpy);
      
      // Simulate resize event
      const resizeHandler = (process.on as any).mock.calls.find(
        (call: any[]) => call[0] === 'SIGWINCH'
      )?.[1];
      
      if (resizeHandler) {
        resizeHandler();
      }
      
      // Allow event to propagate
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(resizeSpy).toHaveBeenCalled();
    });

    it('should handle stdout resize events', async () => {
      const resizeSpy = vi.fn();
      terminal.events.on('resize', resizeSpy);
      
      // Simulate stdout resize event
      const resizeHandler = (terminal.stream.stdout as any).on.mock.calls.find(
        (call: any[]) => call[0] === 'resize'
      )?.[1];
      
      if (resizeHandler) {
        resizeHandler();
      }
      
      // Allow event to propagate
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(resizeSpy).toHaveBeenCalled();
    });

    it('should emit key events', async () => {
      const keySpy = vi.fn();
      terminal.events.on('key', keySpy);
      
      // Simulate key event from input
      const keyEvent = {
        type: 'key' as const,
        key: 'a',
        code: 'KeyA',
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
        repeat: false,
        timestamp: Date.now(),
        isSpecial: false,
        preventDefault: vi.fn(),
        defaultPrevented: false
      };
      
      // Mock the internal input processing by directly accessing the private property
      const originalEvents = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(terminal.input), 'events');
      if (originalEvents) {
        Object.defineProperty(terminal.input, 'events', {
          get() {
            return {
              async *[Symbol.asyncIterator] () {
                yield keyEvent;
              }
            };
          },
          configurable: true
        });
      }
      
      // Restart input processing
      (terminal as any).startInputProcessing();
      
      // Allow event to propagate
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(keySpy).toHaveBeenCalledWith(keyEvent);
      
      // Restore original descriptor
      if (originalEvents) {
        Object.defineProperty(terminal.input, 'events', originalEvents);
      }
    });

    it('should emit mouse events', async () => {
      const mouseSpy = vi.fn();
      terminal.events.on('mouse', mouseSpy);
      
      // Simulate mouse event from input
      const mouseEvent = {
        type: 'mouse' as const,
        x: 10 as any,
        y: 5 as any,
        button: 0,
        action: 'click' as const,
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
        timestamp: Date.now()
      };
      
      // Mock the internal input processing by directly accessing the private property
      const originalEvents = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(terminal.input), 'events');
      if (originalEvents) {
        Object.defineProperty(terminal.input, 'events', {
          get() {
            return {
              async *[Symbol.asyncIterator] () {
                yield mouseEvent;
              }
            };
          },
          configurable: true
        });
      }
      
      // Restart input processing
      (terminal as any).startInputProcessing();
      
      // Allow event to propagate
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mouseSpy).toHaveBeenCalledWith(mouseEvent);
      
      // Restore original descriptor
      if (originalEvents) {
        Object.defineProperty(terminal.input, 'events', originalEvents);
      }
    });

    it('should emit paste events', async () => {
      const pasteSpy = vi.fn();
      terminal.events.on('paste', pasteSpy);
      
      // Simulate paste event from input
      const pasteEvent = {
        type: 'paste' as const,
        text: 'Hello, World!',
        timestamp: Date.now()
      };
      
      // Mock the internal input processing by directly accessing the private property
      const originalEvents = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(terminal.input), 'events');
      if (originalEvents) {
        Object.defineProperty(terminal.input, 'events', {
          get() {
            return {
              async *[Symbol.asyncIterator] () {
                yield pasteEvent;
              }
            };
          },
          configurable: true
        });
      }
      
      // Restart input processing
      (terminal as any).startInputProcessing();
      
      // Allow event to propagate
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(pasteSpy).toHaveBeenCalledWith(pasteEvent);
      
      // Restore original descriptor
      if (originalEvents) {
        Object.defineProperty(terminal.input, 'events', originalEvents);
      }
    });

    it('should emit focus events', async () => {
      const focusSpy = vi.fn();
      terminal.events.on('focus', focusSpy);
      
      // Simulate focus event from input
      const focusEvent = {
        type: 'focus' as const,
        focused: true
      };
      
      // Mock the internal input processing by directly accessing the private property
      const originalEvents = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(terminal.input), 'events');
      if (originalEvents) {
        Object.defineProperty(terminal.input, 'events', {
          get() {
            return {
              async *[Symbol.asyncIterator] () {
                yield focusEvent;
              }
            };
          },
          configurable: true
        });
      }
      
      // Restart input processing
      (terminal as any).startInputProcessing();
      
      // Allow event to propagate
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(focusSpy).toHaveBeenCalledWith(true);
      
      // Restore original descriptor
      if (originalEvents) {
        Object.defineProperty(terminal.input, 'events', originalEvents);
      }
    });

    it('should emit blur events', async () => {
      const blurSpy = vi.fn();
      terminal.events.on('blur', blurSpy);
      
      // Simulate blur event from input
      const blurEvent = {
        type: 'focus' as const,
        focused: false
      };
      
      // Mock the internal input processing by directly accessing the private property
      const originalEvents = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(terminal.input), 'events');
      if (originalEvents) {
        Object.defineProperty(terminal.input, 'events', {
          get() {
            return {
              async *[Symbol.asyncIterator] () {
                yield blurEvent;
              }
            };
          },
          configurable: true
        });
      }
      
      // Restart input processing
      (terminal as any).startInputProcessing();
      
      // Allow event to propagate
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(blurSpy).toHaveBeenCalled();
      
      // Restore original descriptor
      if (originalEvents) {
        Object.defineProperty(terminal.input, 'events', originalEvents);
      }
    });

    it('should emit data events', async () => {
      const dataSpy = vi.fn();
      terminal.events.on('data', dataSpy);
      
      const data = new Uint8Array([65, 66, 67]);
      
      // Mock the internal input processing by directly accessing the private property
      const originalStream = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(terminal.input), 'stream');
      if (originalStream) {
        Object.defineProperty(terminal.input, 'stream', {
          get() {
            return {
              async *[Symbol.asyncIterator] () {
                yield data;
              }
            };
          },
          configurable: true
        });
      }
      
      // Restart input processing
      (terminal as any).startInputProcessing();
      
      // Allow event to propagate
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(dataSpy).toHaveBeenCalledWith(data);
      
      // Restore original descriptor
      if (originalStream) {
        Object.defineProperty(terminal.input, 'stream', originalStream);
      }
    });

    it('should emit error events on input error', async () => {
      const errorSpy = vi.fn();
      terminal.events.on('error', errorSpy);
      
      const error = new Error('Input error');
      
      // Mock the internal input processing by directly accessing the private property
      const originalEvents = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(terminal.input), 'events');
      if (originalEvents) {
        Object.defineProperty(terminal.input, 'events', {
          get() {
            return {
              async *[Symbol.asyncIterator] () {
                throw error;
              }
            };
          },
          configurable: true
        });
      }
      
      // Restart input processing
      (terminal as any).startInputProcessing();
      
      // Allow event to propagate
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(errorSpy).toHaveBeenCalledWith(error);
      
      // Restore original descriptor
      if (originalEvents) {
        Object.defineProperty(terminal.input, 'events', originalEvents);
      }
    });

    it('should not emit error events when closed', async () => {
      const errorSpy = vi.fn();
      terminal.events.on('error', errorSpy);
      
      // Close terminal
      await terminal.close();
      
      const error = new Error('Input error');
      
      // Mock the internal input processing by directly accessing the private property
      const originalEvents = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(terminal.input), 'events');
      if (originalEvents) {
        Object.defineProperty(terminal.input, 'events', {
          get() {
            return {
              async *[Symbol.asyncIterator] () {
                throw error;
              }
            };
          },
          configurable: true
        });
      }
      
      // Try to restart input processing (should not emit error)
      (terminal as any).startInputProcessing();
      
      // Allow event to propagate
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(errorSpy).not.toHaveBeenCalled();
      
      // Restore original descriptor
      if (originalEvents) {
        Object.defineProperty(terminal.input, 'events', originalEvents);
      }
    });
  });

  describe('Platform Specific', () => {
    it('should handle Bun runtime', async () => {
      // Mock Bun runtime
      terminal = createTerminal();
      terminal.stream.platform.runtime = 'bun';
      
      await terminal.init();
      
      expect(process.on).toHaveBeenCalledWith('SIGWINCH', expect.any(Function));
    });

    it('should handle Deno runtime', async () => {
      // Mock Deno runtime
      terminal = createTerminal();
      terminal.stream.platform.runtime = 'deno';
      
      await terminal.init();
      
      // Should not set up Node.js specific handlers
      expect(process.on).not.toHaveBeenCalledWith('SIGWINCH', expect.any(Function));
    });

    it('should handle browser runtime', async () => {
      // Mock browser runtime
      terminal = createTerminal();
      terminal.stream.platform.runtime = 'browser';
      
      await terminal.init();
      
      // Should not set up Node.js specific handlers
      expect(process.on).not.toHaveBeenCalledWith('SIGWINCH', expect.any(Function));
    });
  });

  describe('Edge Cases', () => {
    it('should handle terminal without stdout.on', async () => {
      terminal = createTerminal();
      terminal.stream.stdout = { write: vi.fn() } as any;
      
      await terminal.init();
      
      // Should not throw
      expect(terminal.initialized).toBe(true);
    });

    it('should handle terminal without stdout.off', async () => {
      terminal = createTerminal();
      terminal.stream.stdout = { 
        write: vi.fn(),
        on: vi.fn()
      } as any;
      
      await terminal.init();
      await terminal.close();
      
      // Should not throw
      expect(terminal.closed).toBe(true);
    });

    it('should handle all terminal options', async () => {
      const options: TerminalOptions = {
        stdin: {} as any,
        stdout: {} as any,
        stderr: {} as any,
        colors: ColorDepth.Extended,
        rawMode: true,
        alternateBuffer: true,
        mouse: 'movement',
        bracketedPaste: true,
        encoding: 'utf8',
        cursorHidden: true,
        cursorShape: CursorShape.BlinkingBar,
        focusTracking: true
      };
      
      terminal = createTerminal(options);
      await terminal.init();
      
      expect(terminal.initialized).toBe(true);
    });

    it('should handle input processing when events iterator completes', async () => {
      terminal = createTerminal();
      
      // Mock the internal input processing by directly accessing the private property
      const originalEvents = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(terminal.input), 'events');
      if (originalEvents) {
        Object.defineProperty(terminal.input, 'events', {
          get() {
            return {
              async *[Symbol.asyncIterator] () {
                // Empty iterator that completes immediately
              }
            };
          },
          configurable: true
        });
      }
      
      await terminal.init();
      
      // Allow event processing to complete
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should not throw
      expect(terminal.initialized).toBe(true);
      
      // Restore original descriptor
      if (originalEvents) {
        Object.defineProperty(terminal.input, 'events', originalEvents);
      }
    });

    it('should handle input stream processing when stream iterator completes', async () => {
      terminal = createTerminal();
      
      // Mock the internal input processing by directly accessing the private property
      const originalStream = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(terminal.input), 'stream');
      if (originalStream) {
        Object.defineProperty(terminal.input, 'stream', {
          get() {
            return {
              async *[Symbol.asyncIterator] () {
                // Empty iterator that completes immediately
              }
            };
          },
          configurable: true
        });
      }
      
      await terminal.init();
      
      // Allow stream processing to complete
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should not throw
      expect(terminal.initialized).toBe(true);
      
      // Restore original descriptor
      if (originalStream) {
        Object.defineProperty(terminal.input, 'stream', originalStream);
      }
    });
  });
});
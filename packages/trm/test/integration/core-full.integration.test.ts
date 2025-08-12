/**
 * Full Core Integration Tests
 * Tests interaction between all core modules
 */

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { ansi } from '../../src/core/ansi.js';
import { InputImpl } from '../../src/core/input.js';
import { ScreenImpl } from '../../src/core/screen.js';
import { CursorImpl } from '../../src/core/cursor.js';
import { TerminalImpl } from '../../src/core/terminal.js';
import { ColorSystem } from '../../src/core/color.js';
import { StylesImpl } from '../../src/core/styles.js';
import { NodeTerminalStream } from '../../src/core/stream.js';
import { TypedEventEmitter } from '../../src/core/events.js';
import { ScreenBufferImpl, BufferManagerImpl } from '../../src/core/buffer.js';
import { isTTY, detectPlatform, getColorSupport, getTerminalSize } from '../../src/core/platform.js';
import { ColorDepth } from '../../src/types.js';

import type { 
  X, 
  Y, 
  Cols,
  Rows,
  KeyEvent,
  MouseEvent,
  TerminalEvents,
  TerminalOptions
} from '../../src/types.js';

describe('Core Full Integration', () => {
  let terminal: TerminalImpl;
  let stream: NodeTerminalStream;
  
  beforeEach(() => {
    // Mock process.stdout/stdin for Node.js environment
    const mockStdout = {
      write: vi.fn((data: any) => true),
      isTTY: true,
      columns: 80,
      rows: 24,
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn()
    };
    
    const mockStdin = {
      setRawMode: vi.fn(),
      isTTY: true,
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn()
    };
    
    vi.stubGlobal('process', {
      ...process,
      stdout: mockStdout,
      stdin: mockStdin,
      platform: 'darwin',
      env: { TERM: 'xterm-256color' },
      on: vi.fn(),
      off: vi.fn(),
      removeListener: vi.fn()
    });
  });
  
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  
  describe('Terminal Integration', () => {
    it('should initialize terminal with all components', async () => {
      const options: TerminalOptions = {
        colors: ColorDepth.TrueColor,
        rawMode: true,
        alternateBuffer: false,
        mouse: true,
        keyboard: true,
        cursorHidden: false
      };
      
      terminal = new TerminalImpl(options);
      await terminal.init();
      
      expect(terminal.initialized).toBe(true);
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
    
    it('should handle full lifecycle', async () => {
      terminal = new TerminalImpl();
      
      // Initialize
      await terminal.init();
      expect(terminal.initialized).toBe(true);
      
      // Use terminal
      terminal.write('Hello World');
      terminal.writeLine('Test Line');
      
      // Get size
      const size = terminal.getSize();
      expect(size.rows).toBeGreaterThan(0);
      expect(size.cols).toBeGreaterThan(0);
      
      // Save and restore state
      const state = terminal.saveState();
      expect(state).toBeDefined();
      
      terminal.restoreState(state);
      
      // Close
      await terminal.close();
      expect(terminal.closed).toBe(true);
    });
  });
  
  describe('Stream Integration', () => {
    it('should create and use terminal stream', () => {
      stream = new NodeTerminalStream();
      
      // Check properties
      expect(stream.isTTY).toBeDefined();
      expect(stream.rows).toBeGreaterThan(0);
      expect(stream.cols).toBeGreaterThan(0);
      expect(stream.colorDepth).toBeDefined();
      expect(stream.platform).toBeDefined();
      expect(stream.encoding).toBe('utf8');
      
      // Write operations
      stream.write('Test');
      stream.writeLine('Line');
      stream.writeError('Error');
      
      // Raw mode
      stream.setRawMode(true);
      expect(stream.isRaw).toBe(true);
      
      stream.setRawMode(false);
      expect(stream.isRaw).toBe(false);
    });
    
    it('should handle alternate buffer', () => {
      stream = new NodeTerminalStream();
      
      const disposable = stream.useAlternateBuffer();
      expect(disposable).toBeDefined();
      
      // Write in alternate buffer
      stream.write('Alternate buffer content');
      
      // Dispose to return to main buffer
      disposable.dispose();
    });
  });
  
  describe('Screen and Cursor Integration', () => {
    it('should coordinate screen and cursor operations', () => {
      stream = new NodeTerminalStream();
      const screen = new ScreenImpl(stream);
      const cursor = new CursorImpl((data) => stream.write(data));
      
      // Clear screen and move cursor
      screen.clear();
      cursor.moveTo(10 as X, 5 as Y);
      
      // Write at position
      screen.writeAt(0 as X, 0 as Y, 'Top Left');
      screen.writeAt(70 as X, 0 as Y, 'Top Right');
      
      // Test scrolling
      screen.scrollUp(1);
      screen.scrollDown(1);
      
      // Set scroll region
      screen.setScrollRegion(5 as Y, 20 as Y);
      screen.resetScrollRegion();
      
      // Cursor operations
      cursor.hide();
      expect(cursor.visible).toBe(false);
      
      cursor.show();
      expect(cursor.visible).toBe(true);
      
      // Save and restore cursor position
      cursor.save();
      cursor.moveTo(20 as X, 10 as Y);
      cursor.restore();
    });
    
    it('should handle complex screen operations', () => {
      stream = new NodeTerminalStream();
      const screen = new ScreenImpl(stream);
      
      // Clear operations
      screen.clearLine(5 as Y);
      screen.clearToEndOfLine(10 as X, 5 as Y);
      screen.clearToStartOfLine(10 as X, 5 as Y);
      screen.clearRect(5 as X, 5 as Y, 10 as Cols, 5 as Rows);
      
      // Write with style
      const style = {
        fg: { type: 'ansi' as const, value: 1 as const },
        bg: { type: 'ansi' as const, value: 4 as const },
        bold: true,
        underline: true
      };
      
      screen.writeAt(0 as X, 0 as Y, 'Styled Text', style);
      screen.writeLineAt(1 as Y, 'Full Line', style);
      
      // Box drawing
      screen.writeBox(10 as X, 5 as Y, 20 as Cols, 10 as Rows, style);
      
      // Bell
      screen.bell();
      screen.visualBell();
      
      // Save and restore
      screen.save();
      screen.clear();
      screen.restore();
    });
  });
  
  describe('Input Integration', () => {
    it('should handle keyboard and mouse input', async () => {
      stream = new NodeTerminalStream();
      const input = new InputImpl(stream);
      
      // Enable features
      input.enableKeyboard();
      expect(input.keyboardEnabled).toBe(true);
      
      input.enableMouse();
      expect(input.mouseEnabled).toBe(true);
      
      input.enableBracketedPaste();
      expect(input.bracketedPasteEnabled).toBe(true);
      
      input.enableFocusTracking();
      expect(input.focusTrackingEnabled).toBe(true);
      
      // Simulate input events
      const events: any[] = [];
      
      // Collect events (would normally be async)
      const eventIterator = input.events[Symbol.asyncIterator]();
      
      // Note: In real scenario, these would come from stdin
      // Here we're just testing the structure
      
      // Disable features
      input.disableKeyboard();
      input.disableMouse();
      input.disableBracketedPaste();
      input.disableFocusTracking();
      
      // Close input
      input.close();
    });
  });
  
  describe('Color System Integration', () => {
    it('should handle all color types and conversions', () => {
      const colors = new ColorSystem(ColorDepth.TrueColor);
      
      // Create colors
      const ansiRed = colors.ansi('red');
      const ansi256Blue = colors.ansi256(21);
      const rgbGreen = colors.rgb(0, 255, 0);
      const hslYellow = colors.hsl(60, 100, 50);
      const hexPurple = colors.hex('#9932cc');
      
      // Conversions
      const converted256 = colors.toAnsi256(rgbGreen);
      expect(converted256.value).toBeGreaterThanOrEqual(0);
      expect(converted256.value).toBeLessThanOrEqual(255);
      
      const convertedRGB = colors.toRGB(ansiRed);
      expect(convertedRGB.r).toBe(170);
      expect(convertedRGB.g).toBe(0);
      expect(convertedRGB.b).toBe(0);
      
      const convertedHSL = colors.toHSL(rgbGreen);
      expect(convertedHSL.h).toBeCloseTo(120, 0);
      
      const hexString = colors.toHex(hexPurple);
      expect(hexString).toBe('#9932cc');
      
      // Escape sequences
      const fgSeq = colors.toForeground(ansiRed);
      expect(fgSeq).toContain('\x1b[');
      
      const bgSeq = colors.toBackground(ansi256Blue);
      expect(bgSeq).toContain('\x1b[');
      
      // Standard colors
      expect(colors.black).toBeDefined();
      expect(colors.red).toBeDefined();
      expect(colors.green).toBeDefined();
      expect(colors.yellow).toBeDefined();
      expect(colors.blue).toBeDefined();
      expect(colors.magenta).toBeDefined();
      expect(colors.cyan).toBeDefined();
      expect(colors.white).toBeDefined();
      expect(colors.gray).toBeDefined();
      
      // Bright variants
      expect(colors.brightRed).toBeDefined();
      expect(colors.brightGreen).toBeDefined();
      
      // Reset sequences
      expect(colors.reset()).toBe('\x1b[39;49m');
      expect(colors.resetForeground()).toBe('\x1b[39m');
      expect(colors.resetBackground()).toBe('\x1b[49m');
    });
    
    it('should handle color depth fallbacks', () => {
      // Test with limited color depth
      const basicColors = new ColorSystem(ColorDepth.Basic);
      const trueColorRed = basicColors.rgb(255, 0, 0);
      
      // Should map to a valid ANSI 256 color
      const fallback = basicColors.toAnsi256(trueColorRed);
      expect(fallback.value).toBeGreaterThanOrEqual(0);
      expect(fallback.value).toBeLessThanOrEqual(255);
      
      // No color support
      const noColors = new ColorSystem(ColorDepth.None);
      const seq = noColors.toForeground(noColors.red);
      expect(seq).toBe(''); // No sequence when colors disabled
    });
  });
  
  describe('Styles Integration', () => {
    it('should apply complex styles with colors', () => {
      const colors = new ColorSystem(ColorDepth.TrueColor);
      const styles = new StylesImpl(colors);
      
      // Create complex style
      const builder = styles.builder()
        .fg(colors.rgb(255, 128, 64))
        .bg(colors.ansi256(100))
        .bold(true)
        .italic(true)
        .underline(true)
        .strikethrough(true)
        .dim(false)
        .inverse(false)
        .hidden(false)
        .blink(true)
        .overline(true);
      
      const style = builder.build();
      const sequence = builder.toString();
      
      expect(sequence).toContain('\x1b['); // Contains escape sequences
      expect(style.fg).toBeDefined();
      expect(style.bg).toBeDefined();
      expect(style.bold).toBe(true);
      
      // Apply style
      const applied = styles.apply(style);
      expect(applied).toContain('\x1b[');
      
      // Merge styles
      const style2 = { bold: false, italic: false };
      const merged = styles.merge(style, style2);
      expect(merged.bold).toBe(false);
      expect(merged.italic).toBe(false);
      
      // Reset sequences
      expect(styles.reset()).toBe('\x1b[0m');
      expect(styles.bold()).toBe('\x1b[1m');
      expect(styles.resetBold()).toBe('\x1b[22m');
    });
  });
  
  describe('Buffer Management Integration', () => {
    it('should handle complex buffer operations', () => {
      stream = new NodeTerminalStream();
      const manager = new BufferManagerImpl(stream);
      
      // Create buffers
      const buffer1 = manager.create(80 as Cols, 24 as Rows);
      const buffer2 = manager.create(80 as Cols, 24 as Rows);
      
      // Write to buffer
      buffer1.writeText(0 as X, 0 as Y, 'Hello World');
      buffer1.writeLine(1 as Y, 'Full line of text');
      
      // Fill operations
      buffer1.fill(' ');
      buffer1.fillRect(10 as X, 5 as Y, 20 as Cols, 10 as Rows, '#');
      
      // Copy between buffers
      buffer1.copyFrom(buffer2, 0 as X, 0 as Y, 0 as X, 0 as Y, 10 as Cols, 5 as Rows);
      
      // Scrolling
      buffer1.scrollUp(1);
      buffer1.scrollDown(1);
      
      // Clone buffer
      const cloned = buffer1.clone();
      expect(cloned.width).toBe(buffer1.width);
      expect(cloned.height).toBe(buffer1.height);
      
      // Get patches
      const patches = manager.diff(buffer1, buffer2);
      expect(Array.isArray(patches)).toBe(true);
      
      // Apply patches
      patches.forEach(patch => {
        manager.applyPatch(buffer2, patch);
      });
      
      // Optimize patches
      const optimized = manager.optimizePatches(patches);
      expect(Array.isArray(optimized)).toBe(true);
      
      // Render to terminal
      manager.render(buffer1);
    });
    
    it('should handle buffer with different content types', () => {
      const buffer = new ScreenBufferImpl(80 as Cols, 24 as Rows);
      
      // Unicode characters
      buffer.writeText(0 as X, 0 as Y, '你好世界'); // Chinese
      buffer.writeText(0 as X, 1 as Y, '🎨🎭🎪'); // Emojis
      buffer.writeText(0 as X, 2 as Y, 'Ñoño'); // Accented
      
      // Tabs and newlines
      buffer.writeText(0 as X, 3 as Y, 'Tab\there\nNew\nLines');
      
      // Get cell info
      const cell = buffer.getCell(0 as X, 0 as Y);
      expect(cell).toBeDefined();
      expect(cell?.char).toBeDefined();
      expect(cell?.width).toBeGreaterThanOrEqual(0);
      
      // Clear operations
      buffer.clearLine(0 as Y);
      buffer.clearRect(0 as X, 0 as Y, 10 as Cols, 5 as Rows);
      buffer.clear();
      
      // Export to array
      const array = buffer.toArray();
      expect(array).toBeDefined();
      expect(array.length).toBe(24); // Height
    });
  });
  
  describe('Event System Integration', () => {
    it('should handle terminal events across components', () => {
      const events = new TypedEventEmitter<TerminalEvents>();
      
      let resizeHandled = false;
      let keyHandled = false;
      let mouseHandled = false;
      
      // Register handlers
      events.on('resize', (rows: Rows, cols: Cols) => {
        resizeHandled = true;
        expect(rows).toBeGreaterThan(0);
        expect(cols).toBeGreaterThan(0);
      });
      
      events.on('key', (event: KeyEvent) => {
        keyHandled = true;
        expect(event.type).toBe('key');
      });
      
      events.on('mouse', (event: MouseEvent) => {
        mouseHandled = true;
        expect(event.type).toBe('mouse');
      });
      
      // Emit events
      events.emit('resize', 30 as Rows, 100 as Cols);
      events.emit('key', {
        type: 'key',
        key: 'a',
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
        isSpecial: false,
        sequence: 'a'
      });
      events.emit('mouse', {
        type: 'mouse',
        x: 10 as X,
        y: 5 as Y,
        button: 0,
        action: 'press' as const,
        ctrl: false,
        alt: false,
        shift: false,
        meta: false
      });
      
      expect(resizeHandled).toBe(true);
      expect(keyHandled).toBe(true);
      expect(mouseHandled).toBe(true);
      
      // Test once
      let onceHandled = false;
      events.once('focus', (focused: boolean) => {
        onceHandled = true;
      });
      
      events.emit('focus', true);
      events.emit('focus', false); // Should not trigger
      
      expect(onceHandled).toBe(true);
      
      // Cleanup
      events.removeAllListeners();
      expect(events.listenerCount('resize')).toBe(0);
    });
  });
  
  describe('Platform Integration', () => {
    it('should detect platform and capabilities', () => {
      const platform = detectPlatform();
      
      expect(platform.runtime).toBeDefined();
      expect(platform.os).toBeDefined();
      expect(platform.terminal).toBeDefined();
      
      // TTY detection
      const tty = isTTY();
      expect(typeof tty).toBe('boolean');
      
      // Color support
      const colorSupport = getColorSupport();
      expect(colorSupport).toBeGreaterThanOrEqual(0);
      expect(colorSupport).toBeLessThanOrEqual(24);
      
      // Terminal size
      const size = getTerminalSize();
      if (size) {
        expect(size.rows).toBeGreaterThan(0);
        expect(size.cols).toBeGreaterThan(0);
      }
    });
  });
  
  describe('ANSI Integration', () => {
    it('should generate correct ANSI sequences', () => {
      // Cursor movement
      expect(ansi.cursorUp()).toBe('\x1b[1A');
      expect(ansi.cursorUp(5)).toBe('\x1b[5A');
      expect(ansi.cursorDown(3)).toBe('\x1b[3B');
      expect(ansi.cursorForward(10)).toBe('\x1b[10C');
      expect(ansi.cursorBack(2)).toBe('\x1b[2D');
      
      // Position
      expect(ansi.cursorPosition(1, 1)).toBe('\x1b[1;1H');
      expect(ansi.cursorColumn(5)).toBe('\x1b[5G');
      
      // Visibility
      expect(ansi.cursorShow()).toBe('\x1b[?25h');
      expect(ansi.cursorHide()).toBe('\x1b[?25l');
      
      // Screen
      expect(ansi.clearScreen()).toBe('\x1b[2J');
      expect(ansi.clearLine()).toBe('\x1b[2K');
      
      // Scrolling
      expect(ansi.scrollUp()).toBe('\x1b[1S');
      expect(ansi.scrollDown()).toBe('\x1b[1T');
      
      // Styles
      expect(ansi.reset()).toBe('\x1b[0m');
      expect(ansi.bold()).toBe('\x1b[1m');
      expect(ansi.italic()).toBe('\x1b[3m');
      expect(ansi.underline()).toBe('\x1b[4m');
      
      // Custom sequences
      expect(ansi.csi('5', 'n')).toBe('\x1b[5n');
      expect(ansi.osc('0;Title')).toBe('\x1b]0;Title\x07');
      expect(ansi.dcs('test')).toBe('\x1bPtest\x1b\\');
    });
  });
  
  describe('Complex Workflow Integration', () => {
    it('should handle complete terminal application workflow', async () => {
      // Initialize terminal
      const terminal = new TerminalImpl({
        colors: ColorDepth.TrueColor,
        rawMode: true,
        mouse: true
      });
      
      await terminal.init();
      
      // Setup screen with colors and styles
      const { screen, cursor, colors, styles, buffer } = terminal;
      
      // Clear and prepare screen
      screen.clear();
      cursor.hide();
      
      // Draw header
      const headerStyle = styles.builder()
        .fg(colors.white)
        .bg(colors.blue)
        .bold(true)
        .build();
      
      screen.writeLineAt(0 as Y, ' Terminal Application v1.0 '.padEnd(80), headerStyle);
      
      // Draw content area with box
      screen.writeBox(
        0 as X, 
        2 as Y, 
        80 as Cols, 
        20 as Rows,
        { fg: colors.green }
      );
      
      // Write content
      cursor.moveTo(2 as X, 3 as Y);
      terminal.write('Welcome to the application!');
      
      // Create status line
      const statusStyle = styles.builder()
        .fg(colors.black)
        .bg(colors.cyan)
        .build();
      
      screen.writeLineAt(
        23 as Y,
        ' Ready | F1: Help | F10: Exit '.padEnd(80),
        statusStyle
      );
      
      // Create buffer for animation
      const animBuffer = buffer.create(10 as Cols, 1 as Rows);
      const frames = ['[    ]', '[=   ]', '[==  ]', '[=== ]', '[====]'];
      
      // Simulate animation frames
      for (const frame of frames) {
        animBuffer.writeLine(0 as Y, frame);
        buffer.render(animBuffer, 35 as X, 12 as Y);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Show cursor and restore
      cursor.show();
      cursor.moveTo(2 as X, 4 as Y);
      
      // Save state
      const state = terminal.saveState();
      expect(state.cursorPosition).toBeDefined();
      expect(state.cursorVisible).toBe(true);
      
      // Cleanup
      await terminal.close();
    });
  });
});
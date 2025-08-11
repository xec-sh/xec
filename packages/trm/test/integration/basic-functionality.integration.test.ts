/**
 * Basic Functionality Integration Tests
 * Tests core functionality without external dependencies
 */

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { ansi } from '../../src/core/ansi.js';
import { ColorDepth } from '../../src/types.js';
import { Screen } from '../../src/core/screen.js';
import { Cursor } from '../../src/core/cursor.js';
import { ColorSystem } from '../../src/core/color.js';
import { StylesImpl } from '../../src/core/styles.js';
import { TerminalImpl } from '../../src/core/terminal.js';
import { ScreenBufferImpl } from '../../src/core/buffer.js';
import { NodeTerminalStream } from '../../src/core/stream.js';

import type { 
  X,
  Y,
  Cols,
  Rows
} from '../../src/types.js';

describe('Basic Functionality Integration', () => {
  let mockStdout: any;
  let mockStderr: any;
  let mockStdin: any;
  
  beforeEach(() => {
    // Create mock streams
    mockStdout = {
      write: vi.fn((data: any) => true),
      isTTY: true,
      columns: 80,
      rows: 24,
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn()
    };
    
    mockStderr = {
      write: vi.fn((data: any) => true),
      isTTY: true,
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn()
    };
    
    mockStdin = {
      setRawMode: vi.fn(),
      isTTY: true,
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn()
    };
    
    // Stub global process
    vi.stubGlobal('process', {
      ...process,
      stdout: mockStdout,
      stderr: mockStderr,
      stdin: mockStdin,
      platform: 'darwin',
      env: { TERM: 'xterm-256color' }
    });
  });
  
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  
  describe('Terminal Stream', () => {
    it('should write to stdout', () => {
      const stream = new NodeTerminalStream();
      
      stream.write('Hello World');
      expect(mockStdout.write).toHaveBeenCalledWith('Hello World');
      
      stream.writeLine('Test Line');
      expect(mockStdout.write).toHaveBeenCalledWith('Test Line\n');
      
      stream.writeError('Error Message');
      expect(mockStderr.write).toHaveBeenCalledWith('Error Message');
    });
    
    it('should report terminal properties', () => {
      const stream = new NodeTerminalStream();
      
      expect(stream.isTTY).toBe(true);
      expect(stream.rows).toBe(24);
      expect(stream.cols).toBe(80);
      expect(stream.colorDepth).toBeGreaterThan(0);
      expect(stream.platform).toBeDefined();
    });
    
    it('should handle raw mode', () => {
      const stream = new NodeTerminalStream();
      
      stream.setRawMode(true);
      expect(mockStdin.setRawMode).toHaveBeenCalledWith(true);
      expect(stream.isRaw).toBe(true);
      
      stream.setRawMode(false);
      expect(mockStdin.setRawMode).toHaveBeenCalledWith(false);
      expect(stream.isRaw).toBe(false);
    });
  });
  
  describe('Screen Operations', () => {
    it('should clear screen', () => {
      const stream = new NodeTerminalStream();
      const screen = new Screen(stream);
      
      screen.clear();
      expect(mockStdout.write).toHaveBeenCalledWith(ansi.clearScreen());
      expect(mockStdout.write).toHaveBeenCalledWith(ansi.cursorPosition(1, 1));
    });
    
    it('should write at position', () => {
      const stream = new NodeTerminalStream();
      const screen = new Screen(stream);
      
      screen.writeAt(10 as X, 5 as Y, 'Test');
      
      // Should position cursor and write text
      expect(mockStdout.write).toHaveBeenCalledWith(ansi.cursorPosition(6, 11)); // 1-indexed
      expect(mockStdout.write).toHaveBeenCalledWith('Test');
    });
    
    it('should draw boxes', () => {
      const stream = new NodeTerminalStream();
      const screen = new Screen(stream);
      
      screen.writeBox(0 as X, 0 as Y, 10 as Cols, 5 as Rows);
      
      // Should draw box corners and lines
      const calls = mockStdout.write.mock.calls.map(call => call[0]);
      const output = calls.join('');
      
      expect(output).toContain('┌'); // Top-left corner
      expect(output).toContain('┐'); // Top-right corner
      expect(output).toContain('└'); // Bottom-left corner
      expect(output).toContain('┘'); // Bottom-right corner
      expect(output).toContain('─'); // Horizontal line
      expect(output).toContain('│'); // Vertical line
    });
  });
  
  describe('Cursor Operations', () => {
    it('should move cursor', () => {
      const stream = new NodeTerminalStream();
      const cursor = new Cursor(stream);
      
      cursor.moveTo(20 as X, 10 as Y);
      expect(mockStdout.write).toHaveBeenCalledWith(ansi.cursorPosition(11, 21));
      
      cursor.moveUp(5);
      expect(mockStdout.write).toHaveBeenCalledWith(ansi.cursorUp(5));
      
      cursor.moveDown(3);
      expect(mockStdout.write).toHaveBeenCalledWith(ansi.cursorDown(3));
      
      cursor.moveRight(10);
      expect(mockStdout.write).toHaveBeenCalledWith(ansi.cursorForward(10));
      
      cursor.back(2);
      expect(mockStdout.write).toHaveBeenCalledWith(ansi.cursorBack(2));
    });
    
    it('should control cursor visibility', () => {
      const stream = new NodeTerminalStream();
      const cursor = new Cursor(stream);
      
      cursor.hide();
      expect(mockStdout.write).toHaveBeenCalledWith(ansi.cursorHide());
      expect(cursor.visible).toBe(false);
      
      cursor.show();
      expect(mockStdout.write).toHaveBeenCalledWith(ansi.cursorShow());
      expect(cursor.visible).toBe(true);
    });
    
    it('should save and restore position', () => {
      const stream = new NodeTerminalStream();
      const cursor = new Cursor(stream);
      
      cursor.save();
      expect(mockStdout.write).toHaveBeenCalledWith(ansi.cursorSave());
      
      cursor.restore();
      expect(mockStdout.write).toHaveBeenCalledWith(ansi.cursorRestore());
    });
  });
  
  describe('Color System', () => {
    it('should create basic colors', () => {
      const colors = new ColorSystem(ColorDepth.Basic);
      
      const red = colors.ansi('red');
      expect(red.type).toBe('ansi');
      expect(red.value).toBe(1);
      
      const blue = colors.ansi('blue');
      expect(blue.type).toBe('ansi');
      expect(blue.value).toBe(4);
    });
    
    it('should create 256 colors', () => {
      const colors = new ColorSystem(ColorDepth.Ansi256);
      
      const color = colors.ansi256(123);
      expect(color.type).toBe('ansi256');
      expect(color.value).toBe(123);
      
      const grayscale = colors.grayscale(0.5);
      expect(grayscale.type).toBe('ansi256');
      expect(grayscale.value).toBeGreaterThanOrEqual(232);
      expect(grayscale.value).toBeLessThanOrEqual(255);
    });
    
    it('should create true colors', () => {
      const colors = new ColorSystem(ColorDepth.TrueColor);
      
      const rgb = colors.rgb(255, 128, 0);
      expect(rgb.type).toBe('rgb');
      expect(rgb.r).toBe(255);
      expect(rgb.g).toBe(128);
      expect(rgb.b).toBe(0);
      
      const hex = colors.hex('#ff8000');
      expect(hex.type).toBe('rgb');
      expect(hex.r).toBe(255);
      expect(hex.g).toBe(128);
      expect(hex.b).toBe(0);
    });
    
    it('should generate escape sequences', () => {
      const colors = new ColorSystem(ColorDepth.TrueColor);
      
      const red = colors.rgb(255, 0, 0);
      const fgSeq = colors.toForeground(red);
      expect(fgSeq).toBe('\x1b[38;2;255;0;0m');
      
      const bgSeq = colors.toBackground(red);
      expect(bgSeq).toBe('\x1b[48;2;255;0;0m');
      
      const reset = colors.reset();
      expect(reset).toBe('\x1b[39;49m');
    });
  });
  
  describe('Styles', () => {
    it('should build complex styles', () => {
      const colors = new ColorSystem(ColorDepth.TrueColor);
      const styles = new StylesImpl(colors);
      
      const style = styles.builder()
        .fg(colors.rgb(255, 255, 255))
        .bg(colors.rgb(0, 0, 128))
        .bold(true)
        .italic(true)
        .underline(true)
        .build();
      
      expect(style.fg).toBeDefined();
      expect(style.bg).toBeDefined();
      expect(style.bold).toBe(true);
      expect(style.italic).toBe(true);
      expect(style.underline).toBe(true);
      
      const sequence = styles.apply(style);
      expect(sequence).toContain('\x1b['); // Contains escape sequences
    });
    
    it('should merge styles', () => {
      const colors = new ColorSystem(ColorDepth.TrueColor);
      const styles = new StylesImpl(colors);
      
      const style1 = {
        fg: colors.red,
        bold: true
      };
      
      const style2 = {
        bg: colors.blue,
        italic: true
      };
      
      const merged = styles.merge(style1, style2);
      expect(merged.fg).toEqual(colors.red);
      expect(merged.bg).toEqual(colors.blue);
      expect(merged.bold).toBe(true);
      expect(merged.italic).toBe(true);
    });
  });
  
  describe('Buffer Operations', () => {
    it('should write to buffer', () => {
      const buffer = new ScreenBufferImpl(80 as Cols, 24 as Rows);
      
      buffer.writeText(0 as X, 0 as Y, 'Hello World');
      
      const cell = buffer.getCell(0 as X, 0 as Y);
      expect(cell?.char).toBe('H');
      
      const cell2 = buffer.getCell(6 as X, 0 as Y);
      expect(cell2?.char).toBe('W');
    });
    
    it('should fill buffer', () => {
      const buffer = new ScreenBufferImpl(10 as Cols, 5 as Rows);
      
      buffer.fill('#');
      
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 10; x++) {
          const cell = buffer.getCell(x as X, y as Y);
          expect(cell?.char).toBe('#');
        }
      }
    });
    
    it('should fill rectangles', () => {
      const buffer = new ScreenBufferImpl(20 as Cols, 10 as Rows);
      
      buffer.fillRect(5 as X, 2 as Y, 10 as Cols, 5 as Rows, '*');
      
      // Check inside rectangle
      const inside = buffer.getCell(7 as X, 4 as Y);
      expect(inside?.char).toBe('*');
      
      // Check outside rectangle
      const outside = buffer.getCell(2 as X, 2 as Y);
      expect(outside?.char).toBe(' ');
    });
    
    it('should clear areas', () => {
      const buffer = new ScreenBufferImpl(20 as Cols, 10 as Rows);
      
      // Fill first
      buffer.fill('#');
      
      // Clear line
      buffer.clearLine(3 as Y);
      
      for (let x = 0; x < 20; x++) {
        const cell = buffer.getCell(x as X, 3 as Y);
        expect(cell?.char).toBe(' ');
      }
      
      // Clear rectangle
      buffer.clearRect(5 as X, 5 as Y, 10 as Cols, 3 as Rows);
      
      const cleared = buffer.getCell(7 as X, 6 as Y);
      expect(cleared?.char).toBe(' ');
      
      const notCleared = buffer.getCell(2 as X, 6 as Y);
      expect(notCleared?.char).toBe('#');
    });
  });
  
  describe('ANSI Sequences', () => {
    it('should generate cursor sequences', () => {
      expect(ansi.cursorUp()).toBe('\x1b[1A');
      expect(ansi.cursorUp(5)).toBe('\x1b[5A');
      expect(ansi.cursorDown(3)).toBe('\x1b[3B');
      expect(ansi.cursorForward(10)).toBe('\x1b[10C');
      expect(ansi.cursorBack(2)).toBe('\x1b[2D');
      expect(ansi.cursorPosition(5, 10)).toBe('\x1b[5;10H');
    });
    
    it('should generate screen sequences', () => {
      expect(ansi.clearScreen()).toBe('\x1b[2J');
      expect(ansi.clearLine()).toBe('\x1b[2K');
      expect(ansi.clearToEndOfLine()).toBe('\x1b[0K');
      expect(ansi.clearToStartOfLine()).toBe('\x1b[1K');
    });
    
    it('should generate style sequences', () => {
      expect(ansi.reset()).toBe('\x1b[0m');
      expect(ansi.bold()).toBe('\x1b[1m');
      expect(ansi.italic()).toBe('\x1b[3m');
      expect(ansi.underline()).toBe('\x1b[4m');
      expect(ansi.strikethrough()).toBe('\x1b[9m');
    });
    
    it('should generate color sequences', () => {
      expect(ansi.fg(1)).toBe('\x1b[31m'); // Red
      expect(ansi.bg(4)).toBe('\x1b[44m'); // Blue
      expect(ansi.fg256(123)).toBe('\x1b[38;5;123m');
      expect(ansi.bg256(200)).toBe('\x1b[48;5;200m');
      expect(ansi.fgRGB(255, 128, 0)).toBe('\x1b[38;2;255;128;0m');
      expect(ansi.bgRGB(0, 128, 255)).toBe('\x1b[48;2;0;128;255m');
    });
  });
  
  describe('Complete Workflow', () => {
    it('should handle complete terminal session', async () => {
      const terminal = new TerminalImpl({
        colors: ColorDepth.TrueColor,
        rawMode: false,
        mouse: false
      });
      
      await terminal.init();
      
      // Clear screen
      terminal.clear();
      
      // Write styled header
      const headerStyle = terminal.styles.builder()
        .fg(terminal.colors.white)
        .bg(terminal.colors.blue)
        .bold(true)
        .build();
      
      terminal.screen.writeLineAt(0 as Y, ' Application Header '.padEnd(80), headerStyle);
      
      // Write content
      terminal.cursor.moveTo(0 as X, 2 as Y);
      terminal.write('Welcome to the application!\n');
      terminal.write('This is a test of the terminal functionality.\n');
      
      // Draw a box
      terminal.screen.writeBox(5 as X, 5 as Y, 30 as Cols, 10 as Rows);
      
      // Write inside box
      terminal.screen.writeAt(7 as X, 7 as Y, 'Box Content');
      
      // Test buffer operations
      const buffer = terminal.buffer.create(20 as Cols, 5 as Rows);
      buffer.writeText(0 as X, 0 as Y, 'Buffer Test');
      terminal.buffer.render(buffer, 40 as X, 10 as Y);
      
      // Check that methods were called
      expect(mockStdout.write).toHaveBeenCalled();
      
      await terminal.close();
    });
  });
});
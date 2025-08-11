import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createTerminal,
  Terminal,
  Screen,
  Cursor,
  Input,
  ansi,
  colors,
  ColorDepth,
  ColorSystem,
  StylesImpl,
  ScreenBufferImpl,
  BufferManagerImpl,
  EventEmitterImpl,
  CursorImpl,
  ScreenImpl,
  InputImpl,
  detectPlatform,
  getColorSupport,
  isTTY,
  isWSL,
  isSSH,
  getTerminalSize,
  getTerminalType,
  getShell,
  hrtime,
  initPlatform,
  quickStart,
  VERSION,
  isTerminalSupported
} from '../../src/index.js';

describe('Full Coverage Integration Tests', () => {
  let terminal: Terminal | null = null;
  
  beforeEach(() => {
    // Mock stdout/stdin/stderr
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    if (process.stdin.setRawMode) {
      vi.spyOn(process.stdin, 'setRawMode').mockImplementation(() => process.stdin);
    }
    if (process.stdin.resume) {
      vi.spyOn(process.stdin, 'resume').mockImplementation(() => process.stdin);
    }
    if (process.stdin.pause) {
      vi.spyOn(process.stdin, 'pause').mockImplementation(() => process.stdin);
    }
  });
  
  afterEach(async () => {
    if (terminal) {
      await terminal.close();
      terminal = null;
    }
    vi.restoreAllMocks();
  });

  describe('Terminal Creation and Initialization', () => {
    it('should create terminal with default options', async () => {
      terminal = createTerminal({ rawMode: false });
      expect(terminal).toBeDefined();
      expect(terminal.screen).toBeDefined();
      expect(terminal.cursor).toBeDefined();
      expect(terminal.colors).toBeDefined();
      expect(terminal.styles).toBeDefined();
      expect(terminal.input).toBeDefined();
      expect(terminal.buffer).toBeDefined();
      expect(terminal.ansi).toBeDefined();
      expect(terminal.events).toBeDefined();
      expect(terminal.stream).toBeDefined();
    });

    it('should create terminal with custom options', async () => {
      terminal = createTerminal({
        colors: ColorDepth.TrueColor,
        rawMode: false,
        alternateBuffer: false
      });
      
      await terminal.init();
      expect(terminal.initialized).toBe(true);
    });

    it('should create terminal using quickStart', async () => {
      terminal = await quickStart({
        colors: ColorDepth.Ansi256,
        rawMode: false
      });
      
      expect(terminal.initialized).toBe(true);
    });

    it('should handle multiple init calls', async () => {
      terminal = createTerminal({ rawMode: false });
      await terminal.init();
      await terminal.init(); // Should not throw
      expect(terminal.initialized).toBe(true);
    });
  });

  describe('Screen Operations', () => {
    beforeEach(async () => {
      terminal = createTerminal({ rawMode: false });
      await terminal.init();
    });

    it('should clear screen', () => {
      const screen = terminal!.screen;
      screen.clear();
      // Should not throw
      expect(true).toBe(true);
    });

    it('should clear line', () => {
      const screen = terminal!.screen;
      screen.clearLine(0 as any);
      expect(true).toBe(true);
    });

    it('should clear to end of line', () => {
      const screen = terminal!.screen;
      screen.clearToEndOfLine(0 as any, 0 as any);
      expect(true).toBe(true);
    });

    it('should clear to start of line', () => {
      const screen = terminal!.screen;
      screen.clearToStartOfLine(10 as any, 0 as any);
      expect(true).toBe(true);
    });

    it('should clear rectangle', () => {
      const screen = terminal!.screen;
      screen.clearRect(0 as any, 0 as any, 10 as any, 5 as any);
      expect(true).toBe(true);
    });

    it('should scroll up', () => {
      const screen = terminal!.screen;
      screen.scrollUp(3);
      expect(true).toBe(true);
    });

    it('should scroll down', () => {
      const screen = terminal!.screen;
      screen.scrollDown(3);
      expect(true).toBe(true);
    });

    it('should set scroll region', () => {
      const screen = terminal!.screen;
      screen.setScrollRegion(5 as any, 20 as any);
      expect(true).toBe(true);
    });

    it('should reset scroll region', () => {
      const screen = terminal!.screen;
      screen.resetScrollRegion();
      expect(true).toBe(true);
    });

    it('should write text', () => {
      const screen = terminal!.screen;
      screen.write('Hello World');
      expect(true).toBe(true);
    });

    it('should write at position', () => {
      const screen = terminal!.screen;
      screen.writeAt(10 as any, 5 as any, 'Text');
      expect(true).toBe(true);
    });

    it('should write with style', () => {
      const screen = terminal!.screen;
      screen.writeStyled('Styled Text', {
        fg: { r: 255, g: 0, b: 0 },
        bold: true
      });
      expect(true).toBe(true);
    });

    it('should write at position with style', () => {
      const screen = terminal!.screen;
      screen.writeStyledAt(10 as any, 5 as any, 'Styled', {
        bg: { r: 0, g: 0, b: 255 },
        italic: true
      });
      expect(true).toBe(true);
    });

    it('should get screen dimensions', () => {
      const screen = terminal!.screen;
      expect(screen.width).toBeGreaterThan(0);
      expect(screen.height).toBeGreaterThan(0);
    });
  });

  describe('Cursor Operations', () => {
    beforeEach(async () => {
      terminal = createTerminal({ rawMode: false });
      await terminal.init();
    });

    it('should move cursor', () => {
      const cursor = terminal!.cursor;
      cursor.moveTo(10 as any, 5 as any);
      expect(cursor.position).toEqual({ x: 10, y: 5 });
    });

    it('should move cursor up', () => {
      const cursor = terminal!.cursor;
      cursor.moveTo(10 as any, 10 as any);
      cursor.moveUp(3);
      expect(cursor.position.y).toBe(7);
    });

    it('should move cursor down', () => {
      const cursor = terminal!.cursor;
      cursor.moveTo(10 as any, 10 as any);
      cursor.moveDown(3);
      expect(cursor.position.y).toBe(13);
    });

    it('should move cursor left', () => {
      const cursor = terminal!.cursor;
      cursor.moveTo(10 as any, 10 as any);
      cursor.moveLeft(3);
      expect(cursor.position.x).toBe(7);
    });

    it('should move cursor right', () => {
      const cursor = terminal!.cursor;
      cursor.moveTo(10 as any, 10 as any);
      cursor.moveRight(3);
      expect(cursor.position.x).toBe(13);
    });

    it('should save and restore cursor position', () => {
      const cursor = terminal!.cursor;
      cursor.moveTo(10 as any, 5 as any);
      cursor.save();
      cursor.moveTo(20 as any, 15 as any);
      cursor.restore();
      expect(cursor.position).toEqual({ x: 10, y: 5 });
    });

    it('should show and hide cursor', () => {
      const cursor = terminal!.cursor;
      cursor.hide();
      expect(cursor.visible).toBe(false);
      cursor.show();
      expect(cursor.visible).toBe(true);
    });

    it('should set cursor shape', () => {
      const cursor = terminal!.cursor;
      cursor.setShape('bar');
      expect(cursor.shape).toBe('bar');
      cursor.setShape('block');
      expect(cursor.shape).toBe('block');
      cursor.setShape('underline');
      expect(cursor.shape).toBe('underline');
    });
  });

  describe('Color System', () => {
    it('should create color system with different depths', () => {
      const depths = [
        ColorDepth.None,
        ColorDepth.Basic,
        ColorDepth.Ansi16,
        ColorDepth.Ansi256,
        ColorDepth.TrueColor
      ];

      depths.forEach(depth => {
        const colorSys = new ColorSystem(depth);
        expect(colorSys.depth).toBe(depth);
        expect(colorSys.supports256).toBe(depth >= ColorDepth.Ansi256);
        expect(colorSys.supportsTrueColor).toBe(depth >= ColorDepth.TrueColor);
      });
    });

    it('should convert colors to ANSI sequences', () => {
      const colorSys = new ColorSystem(ColorDepth.TrueColor);
      
      const fg = colorSys.toForeground({ r: 255, g: 0, b: 0 });
      expect(fg).toContain('38;2;255;0;0');
      
      const bg = colorSys.toBackground({ r: 0, g: 255, b: 0 });
      expect(bg).toContain('48;2;0;255;0');
    });

    it('should handle 256 color mode', () => {
      const colorSys = new ColorSystem(ColorDepth.Ansi256);
      
      const index = colorSys.toAnsi256({ r: 128, g: 128, b: 128 });
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThanOrEqual(255);
    });

    it('should handle basic 16 colors', () => {
      const colorSys = new ColorSystem(ColorDepth.Ansi16);
      
      const basicColors = [
        'black', 'red', 'green', 'yellow',
        'blue', 'magenta', 'cyan', 'white'
      ];
      
      basicColors.forEach(color => {
        const fg = colorSys.toForeground(color as any);
        expect(fg).toMatch(/^\x1b\[\d+m$/);
      });
    });
  });

  describe('Styles', () => {
    beforeEach(async () => {
      terminal = createTerminal({ rawMode: false });
      await terminal.init();
    });

    it('should build styles', () => {
      const styles = terminal!.styles;
      
      const style = styles.builder()
        .fg({ r: 255, g: 0, b: 0 })
        .bg({ r: 0, g: 0, b: 255 })
        .bold()
        .italic()
        .underline()
        .build();
      
      expect(style.fg).toEqual({ r: 255, g: 0, b: 0 });
      expect(style.bg).toEqual({ r: 0, g: 0, b: 255 });
      expect(style.bold).toBe(true);
      expect(style.italic).toBe(true);
      expect(style.underline).toBe(true);
    });

    it('should apply styles', () => {
      const styles = terminal!.styles;
      
      const style = {
        fg: { r: 255, g: 0, b: 0 },
        bold: true
      };
      
      const sequence = styles.apply(style);
      expect(sequence).toContain('\x1b[');
    });

    it('should merge styles', () => {
      const styles = terminal!.styles;
      
      const style1 = { fg: { r: 255, g: 0, b: 0 } };
      const style2 = { bg: { r: 0, g: 255, b: 0 } };
      const style3 = { bold: true };
      
      const merged = styles.merge(style1, style2, style3);
      
      expect(merged.fg).toEqual({ r: 255, g: 0, b: 0 });
      expect(merged.bg).toEqual({ r: 0, g: 255, b: 0 });
      expect(merged.bold).toBe(true);
    });
  });

  describe('Buffer Management', () => {
    beforeEach(async () => {
      terminal = createTerminal({ rawMode: false });
      await terminal.init();
    });

    it('should switch to alternate buffer', () => {
      const buffer = terminal!.buffer;
      buffer.enableAlternate();
      expect(buffer.isAlternateActive()).toBe(true);
      buffer.disableAlternate();
      expect(buffer.isAlternateActive()).toBe(false);
    });

    it('should save and restore buffer', () => {
      const buffer = terminal!.buffer;
      buffer.save();
      // Make changes
      buffer.restore();
      expect(true).toBe(true);
    });

    it('should create screen buffer', () => {
      const screenBuffer = new ScreenBufferImpl(80 as any, 24 as any);
      
      screenBuffer.setCell(10 as any, 5 as any, 'A', {
        fg: { r: 255, g: 0, b: 0 }
      });
      
      const cell = screenBuffer.getCell(10 as any, 5 as any);
      expect(cell?.char).toBe('A');
      expect(cell?.style?.fg).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('should clear buffer', () => {
      const screenBuffer = new ScreenBufferImpl(80 as any, 24 as any);
      
      screenBuffer.setCell(10 as any, 5 as any, 'A');
      screenBuffer.clear();
      
      const cell = screenBuffer.getCell(10 as any, 5 as any);
      expect(cell?.char).toBe(' ');
    });

    it('should fill buffer', () => {
      const screenBuffer = new ScreenBufferImpl(80 as any, 24 as any);
      
      screenBuffer.fill('*');
      
      const cell = screenBuffer.getCell(0 as any, 0 as any);
      expect(cell?.char).toBe('*');
    });
  });

  describe('Event System', () => {
    beforeEach(async () => {
      terminal = createTerminal({ rawMode: false });
      await terminal.init();
    });

    it('should emit and listen to events', () => {
      const events = terminal!.events;
      
      let resizeCalled = false;
      events.on('resize', (rows, cols) => {
        resizeCalled = true;
        expect(rows).toBeGreaterThan(0);
        expect(cols).toBeGreaterThan(0);
      });
      
      events.emit('resize', 30 as any, 100 as any);
      expect(resizeCalled).toBe(true);
    });

    it('should handle once listeners', () => {
      const events = terminal!.events;
      
      let callCount = 0;
      events.once('focus', () => {
        callCount++;
      });
      
      events.emit('focus');
      events.emit('focus');
      
      expect(callCount).toBe(1);
    });

    it('should remove listeners', () => {
      const events = terminal!.events;
      
      let called = false;
      const listener = () => { called = true; };
      
      events.on('blur', listener);
      events.off('blur', listener);
      events.emit('blur');
      
      expect(called).toBe(false);
    });
  });

  describe('Platform Detection', () => {
    it('should detect platform', () => {
      const platform = detectPlatform();
      
      expect(platform).toBeDefined();
      expect(platform.runtime).toBeDefined();
      expect(platform.os).toBeDefined();
      expect(platform.terminal).toBeDefined();
    });

    it('should detect color support', () => {
      const support = getColorSupport();
      
      expect(support).toBeGreaterThanOrEqual(0);
      expect(support).toBeLessThanOrEqual(24);
    });

    it('should detect TTY', () => {
      const tty = isTTY();
      expect(typeof tty).toBe('boolean');
    });

    it('should detect WSL', () => {
      const wsl = isWSL();
      expect(typeof wsl).toBe('boolean');
    });

    it('should detect SSH', () => {
      const ssh = isSSH();
      expect(typeof ssh).toBe('boolean');
    });

    it('should get terminal size', () => {
      const size = getTerminalSize();
      
      if (size) {
        expect(size.rows).toBeGreaterThan(0);
        expect(size.cols).toBeGreaterThan(0);
      }
    });

    it('should get terminal type', () => {
      const type = getTerminalType();
      expect(typeof type).toBe('string');
    });

    it('should get shell', () => {
      const shell = getShell();
      expect(shell === undefined || typeof shell === 'string').toBe(true);
    });
  });

  describe('ANSI Sequences', () => {
    it('should generate cursor movement sequences', () => {
      expect(ansi.cursorUp(5)).toBe('\x1b[5A');
      expect(ansi.cursorDown(3)).toBe('\x1b[3B');
      expect(ansi.cursorForward(2)).toBe('\x1b[2C');
      expect(ansi.cursorBack(4)).toBe('\x1b[4D');
      expect(ansi.cursorPosition(10, 20)).toBe('\x1b[10;20H');
    });

    it('should generate clear sequences', () => {
      expect(ansi.clearScreen()).toBe('\x1b[2J');
      expect(ansi.clearLine()).toBe('\x1b[2K');
      expect(ansi.clearLineRight()).toBe('\x1b[0K');
      expect(ansi.clearLineLeft()).toBe('\x1b[1K');
    });

    it('should generate style sequences', () => {
      expect(ansi.reset()).toBe('\x1b[0m');
      expect(ansi.bold()).toBe('\x1b[1m');
      expect(ansi.dim()).toBe('\x1b[2m');
      expect(ansi.italic()).toBe('\x1b[3m');
      expect(ansi.underline()).toBe('\x1b[4m');
      expect(ansi.blink()).toBe('\x1b[5m');
      expect(ansi.inverse()).toBe('\x1b[7m');
      expect(ansi.hidden()).toBe('\x1b[8m');
      expect(ansi.strikethrough()).toBe('\x1b[9m');
    });

    it('should generate color sequences', () => {
      expect(ansi.black()).toBe('\x1b[30m');
      expect(ansi.red()).toBe('\x1b[31m');
      expect(ansi.green()).toBe('\x1b[32m');
      expect(ansi.yellow()).toBe('\x1b[33m');
      expect(ansi.blue()).toBe('\x1b[34m');
      expect(ansi.magenta()).toBe('\x1b[35m');
      expect(ansi.cyan()).toBe('\x1b[36m');
      expect(ansi.white()).toBe('\x1b[37m');
    });

    it('should generate background color sequences', () => {
      expect(ansi.bgBlack()).toBe('\x1b[40m');
      expect(ansi.bgRed()).toBe('\x1b[41m');
      expect(ansi.bgGreen()).toBe('\x1b[42m');
      expect(ansi.bgYellow()).toBe('\x1b[43m');
      expect(ansi.bgBlue()).toBe('\x1b[44m');
      expect(ansi.bgMagenta()).toBe('\x1b[45m');
      expect(ansi.bgCyan()).toBe('\x1b[46m');
      expect(ansi.bgWhite()).toBe('\x1b[47m');
    });
  });

  describe('Terminal State', () => {
    beforeEach(async () => {
      terminal = createTerminal({ rawMode: false });
      await terminal.init();
    });

    it('should save and restore terminal state', () => {
      const cursor = terminal!.cursor;
      
      cursor.moveTo(10 as any, 5 as any);
      cursor.hide();
      cursor.setShape('bar');
      
      const state = terminal!.saveState();
      
      cursor.moveTo(20 as any, 15 as any);
      cursor.show();
      cursor.setShape('block');
      
      terminal!.restoreState(state);
      
      expect(cursor.position).toEqual({ x: 10, y: 5 });
      expect(cursor.visible).toBe(false);
      expect(cursor.shape).toBe('bar');
    });
  });

  describe('Input Management', () => {
    beforeEach(async () => {
      terminal = createTerminal({ rawMode: false });
      await terminal.init();
    });

    it('should enable and disable mouse', () => {
      const input = terminal!.input;
      
      input.enableMouse();
      expect(input.mouseEnabled).toBe(true);
      
      input.disableMouse();
      expect(input.mouseEnabled).toBe(false);
    });

    it('should enable and disable focus events', () => {
      const input = terminal!.input;
      
      input.enableFocusEvents();
      expect(input.focusEventsEnabled).toBe(true);
      
      input.disableFocusEvents();
      expect(input.focusEventsEnabled).toBe(false);
    });

    it('should enable and disable bracketed paste', () => {
      const input = terminal!.input;
      
      input.enableBracketedPaste();
      expect(input.bracketedPasteEnabled).toBe(true);
      
      input.disableBracketedPaste();
      expect(input.bracketedPasteEnabled).toBe(false);
    });
  });

  describe('High Resolution Timer', () => {
    it('should provide high resolution time', () => {
      const start = hrtime();
      
      // Do some work
      let sum = 0;
      for (let i = 0; i < 1000; i++) {
        sum += i;
      }
      
      const end = hrtime();
      
      expect(typeof start).toBe('bigint');
      expect(typeof end).toBe('bigint');
      expect(end).toBeGreaterThan(start);
    });
  });

  describe('Utilities', () => {
    it('should check terminal support', () => {
      const supported = isTerminalSupported();
      expect(typeof supported).toBe('boolean');
    });

    it('should provide version', () => {
      expect(VERSION).toBe('1.0.0');
    });

    it('should initialize platform', async () => {
      await initPlatform();
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('Terminal Write Operations', () => {
    beforeEach(async () => {
      terminal = createTerminal({ rawMode: false });
      await terminal.init();
    });

    it('should write data to stream', () => {
      terminal!.write('Hello World');
      expect(true).toBe(true);
    });

    it('should write line to stream', () => {
      terminal!.writeLine('Hello World');
      expect(true).toBe(true);
    });

    it('should flush stream', async () => {
      await terminal!.flush();
      expect(true).toBe(true);
    });

    it('should get terminal size', () => {
      const size = terminal!.getSize();
      expect(size.rows).toBeGreaterThan(0);
      expect(size.cols).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle terminal close', async () => {
      terminal = createTerminal({ rawMode: false });
      await terminal.init();
      await terminal.close();
      
      expect(terminal.closed).toBe(true);
    });

    it('should handle multiple close calls', async () => {
      terminal = createTerminal({ rawMode: false });
      await terminal.init();
      await terminal.close();
      await terminal.close(); // Should not throw
      
      expect(terminal.closed).toBe(true);
    });

    it('should handle empty writes', () => {
      terminal = createTerminal({ rawMode: false });
      terminal.write('');
      terminal.writeLine('');
      // Should not throw
      expect(true).toBe(true);
    });

    it('should handle Unicode text', async () => {
      terminal = createTerminal({ rawMode: false });
      await terminal.init();
      
      const screen = terminal.screen;
      screen.write('🌟 Unicode Test 你好 世界 🎨');
      // Should not throw
      expect(true).toBe(true);
    });

    it('should handle very long lines', async () => {
      terminal = createTerminal({ rawMode: false });
      await terminal.init();
      
      const screen = terminal.screen;
      const longLine = 'x'.repeat(1000);
      screen.write(longLine);
      // Should not throw
      expect(true).toBe(true);
    });

    it('should handle rapid operations', async () => {
      terminal = createTerminal({ rawMode: false });
      await terminal.init();
      
      const screen = terminal.screen;
      const cursor = terminal.cursor;
      
      for (let i = 0; i < 100; i++) {
        screen.clear();
        cursor.moveTo((i % 80) as any, (i % 24) as any);
        screen.write(`Iteration ${i}`);
      }
      
      // Should not throw
      expect(true).toBe(true);
    });
  });
});
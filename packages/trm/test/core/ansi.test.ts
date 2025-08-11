import { it, expect, describe } from 'vitest';

import { ANSISequences } from '../../src/core/ansi.js';
import { MouseMode, CursorShape } from '../../src/types.js';

describe('ANSI', () => {
  const ansi = new ANSISequences();

  describe('Cursor Movement', () => {
    it('should generate cursor up sequence', () => {
      expect(ansi.cursorUp()).toBe('\x1b[1A');
      expect(ansi.cursorUp(5)).toBe('\x1b[5A');
    });

    it('should generate cursor down sequence', () => {
      expect(ansi.cursorDown()).toBe('\x1b[1B');
      expect(ansi.cursorDown(3)).toBe('\x1b[3B');
    });

    it('should generate cursor forward sequence', () => {
      expect(ansi.cursorForward()).toBe('\x1b[1C');
      expect(ansi.cursorForward(10)).toBe('\x1b[10C');
    });

    it('should generate cursor back sequence', () => {
      expect(ansi.cursorBack()).toBe('\x1b[1D');
      expect(ansi.cursorBack(2)).toBe('\x1b[2D');
    });

    it('should generate cursor position sequence', () => {
      expect(ansi.cursorPosition(1, 1)).toBe('\x1b[1;1H');
      expect(ansi.cursorPosition(10, 20)).toBe('\x1b[10;20H');
    });

    it('should generate cursor home sequence', () => {
      expect(ansi.cursorHome()).toBe('\x1b[H');
    });

    it('should generate cursor next line sequence', () => {
      expect(ansi.cursorNextLine()).toBe('\x1b[1E');
      expect(ansi.cursorNextLine(3)).toBe('\x1b[3E');
    });

    it('should generate cursor previous line sequence', () => {
      expect(ansi.cursorPreviousLine()).toBe('\x1b[1F');
      expect(ansi.cursorPreviousLine(2)).toBe('\x1b[2F');
    });

    it('should generate cursor horizontal absolute sequence', () => {
      expect(ansi.cursorHorizontalAbsolute(1)).toBe('\x1b[1G');
      expect(ansi.cursorHorizontalAbsolute(50)).toBe('\x1b[50G');
    });
  });

  describe('Cursor Visibility', () => {
    it('should generate cursor show sequence', () => {
      expect(ansi.cursorShow()).toBe('\x1b[?25h');
    });

    it('should generate cursor hide sequence', () => {
      expect(ansi.cursorHide()).toBe('\x1b[?25l');
    });
  });

  describe('Cursor Shape', () => {
    it('should generate cursor shape sequences', () => {
      expect(ansi.cursorShape(CursorShape.Block)).toBe('\x1b[0 q');
      expect(ansi.cursorShape(CursorShape.Underline)).toBe('\x1b[1 q');
      expect(ansi.cursorShape(CursorShape.Bar)).toBe('\x1b[2 q');
      expect(ansi.cursorShape(CursorShape.BlinkingBlock)).toBe('\x1b[3 q');
      expect(ansi.cursorShape(CursorShape.BlinkingUnderline)).toBe('\x1b[4 q');
      expect(ansi.cursorShape(CursorShape.BlinkingBar)).toBe('\x1b[5 q');
    });
  });

  describe('Screen Clearing', () => {
    it('should generate clear screen sequence', () => {
      expect(ansi.clearScreen()).toBe('\x1b[2J');
    });

    it('should generate clear line sequence', () => {
      expect(ansi.clearLine()).toBe('\x1b[2K');
    });

    it('should generate clear to end of line sequence', () => {
      expect(ansi.clearToEndOfLine()).toBe('\x1b[0K');
    });

    it('should generate clear to start of line sequence', () => {
      expect(ansi.clearToStartOfLine()).toBe('\x1b[1K');
    });

    it('should generate clear from cursor down sequence', () => {
      expect(ansi.clearFromCursorDown()).toBe('\x1b[0J');
    });

    it('should generate clear from cursor up sequence', () => {
      expect(ansi.clearFromCursorUp()).toBe('\x1b[1J');
    });
  });

  describe('Scrolling', () => {
    it('should generate scroll up sequence', () => {
      expect(ansi.scrollUp()).toBe('\x1b[1S');
      expect(ansi.scrollUp(5)).toBe('\x1b[5S');
    });

    it('should generate scroll down sequence', () => {
      expect(ansi.scrollDown()).toBe('\x1b[1T');
      expect(ansi.scrollDown(3)).toBe('\x1b[3T');
    });

    it('should generate set scroll region sequence', () => {
      expect(ansi.setScrollRegion(1, 24)).toBe('\x1b[1;24r');
      expect(ansi.setScrollRegion(5, 20)).toBe('\x1b[5;20r');
    });

    it('should reset scroll region', () => {
      expect(ansi.resetScrollRegion()).toBe('\x1b[r');
    });
  });

  describe('Alternative Buffer', () => {
    it('should generate alternate buffer enable sequence', () => {
      expect(ansi.alternateBufferEnable()).toBe('\x1b[?1049h');
    });

    it('should generate alternate buffer disable sequence', () => {
      expect(ansi.alternateBufferDisable()).toBe('\x1b[?1049l');
    });
  });

  describe('Mouse Support', () => {
    it('should generate mouse enable sequences', () => {
      expect(ansi.mouseEnable()).toBe('\x1b[?1000h');
      expect(ansi.mouseEnable(MouseMode.Click)).toBe('\x1b[?1000h');
      expect(ansi.mouseEnable(MouseMode.Drag)).toBe('\x1b[?1002h');
      expect(ansi.mouseEnable(MouseMode.Movement)).toBe('\x1b[?1003h');
    });

    it('should generate mouse disable sequence', () => {
      expect(ansi.mouseDisable()).toBe('\x1b[?1000l\x1b[?1002l\x1b[?1003l');
    });
  });

  describe('Bracketed Paste', () => {
    it('should generate bracketed paste enable sequence', () => {
      expect(ansi.bracketedPasteEnable()).toBe('\x1b[?2004h');
    });

    it('should generate bracketed paste disable sequence', () => {
      expect(ansi.bracketedPasteDisable()).toBe('\x1b[?2004l');
    });
  });

  describe('Custom Sequences', () => {
    it('should generate CSI sequence', () => {
      expect(ansi.csi('2', 'J')).toBe('\x1b[2J');
      expect(ansi.csi('1;1', 'H')).toBe('\x1b[1;1H');
    });

    it('should generate OSC sequence', () => {
      expect(ansi.osc('0;Hello')).toBe('\x1b]0;Hello\x07');
      expect(ansi.osc('2;Title')).toBe('\x1b]2;Title\x07');
    });

    it('should generate DCS sequence', () => {
      expect(ansi.dcs('$q"p')).toBe('\x1bP$q"p\x1b\\');
    });
  });

  describe('Save/Restore', () => {
    it('should generate save cursor sequence', () => {
      expect(ansi.saveCursor()).toBe('\x1b7');
    });

    it('should generate restore cursor sequence', () => {
      expect(ansi.restoreCursor()).toBe('\x1b8');
    });

    it('should generate save screen sequence', () => {
      expect(ansi.saveScreen()).toBe('\x1b[?47h');
    });

    it('should generate restore screen sequence', () => {
      expect(ansi.restoreScreen()).toBe('\x1b[?47l');
    });
  });

  describe('Text Formatting', () => {
    it('should generate reset sequence', () => {
      expect(ansi.reset()).toBe('\x1b[0m');
    });

    it('should generate bold sequence', () => {
      expect(ansi.bold()).toBe('\x1b[1m');
    });

    it('should generate dim sequence', () => {
      expect(ansi.dim()).toBe('\x1b[2m');
    });

    it('should generate italic sequence', () => {
      expect(ansi.italic()).toBe('\x1b[3m');
    });

    it('should generate underline sequence', () => {
      expect(ansi.underline()).toBe('\x1b[4m');
    });

    it('should generate blink sequence', () => {
      expect(ansi.blink()).toBe('\x1b[5m');
    });

    it('should generate inverse sequence', () => {
      expect(ansi.inverse()).toBe('\x1b[7m');
    });

    it('should generate hidden sequence', () => {
      expect(ansi.hidden()).toBe('\x1b[8m');
    });

    it('should generate strikethrough sequence', () => {
      expect(ansi.strikethrough()).toBe('\x1b[9m');
    });
  });

  describe('Colors', () => {
    it('should generate foreground color sequences', () => {
      expect(ansi.fgColor(0)).toBe('\x1b[30m');
      expect(ansi.fgColor(7)).toBe('\x1b[37m');
      expect(ansi.fgColor256(100)).toBe('\x1b[38;5;100m');
      expect(ansi.fgColorRGB(255, 0, 128)).toBe('\x1b[38;2;255;0;128m');
    });

    it('should generate background color sequences', () => {
      expect(ansi.bgColor(0)).toBe('\x1b[40m');
      expect(ansi.bgColor(7)).toBe('\x1b[47m');
      expect(ansi.bgColor256(100)).toBe('\x1b[48;5;100m');
      expect(ansi.bgColorRGB(255, 0, 128)).toBe('\x1b[48;2;255;0;128m');
    });
  });

  describe('Other Functions', () => {
    it('should generate bell sequence', () => {
      expect(ansi.bell()).toBe('\x07');
    });

    it('should generate title sequence', () => {
      expect(ansi.title('My Terminal')).toBe('\x1b]0;My Terminal\x07');
    });

    it('should generate hyperlink sequence', () => {
      expect(ansi.hyperlink('https://example.com', 'Example')).toBe(
        '\x1b]8;;https://example.com\x07Example\x1b]8;;\x07'
      );
    });

    it('should generate erase in display sequence', () => {
      expect(ansi.eraseInDisplay(0)).toBe('\x1b[0J');
      expect(ansi.eraseInDisplay(1)).toBe('\x1b[1J');
      expect(ansi.eraseInDisplay(2)).toBe('\x1b[2J');
      expect(ansi.eraseInDisplay(3)).toBe('\x1b[3J');
    });

    it('should generate erase in line sequence', () => {
      expect(ansi.eraseInLine(0)).toBe('\x1b[0K');
      expect(ansi.eraseInLine(1)).toBe('\x1b[1K');
      expect(ansi.eraseInLine(2)).toBe('\x1b[2K');
    });

    it('should generate soft reset sequence', () => {
      expect(ansi.softReset()).toBe('\x1b[!p');
    });
  });
});
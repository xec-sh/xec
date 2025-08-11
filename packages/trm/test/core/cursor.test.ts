/**
 * Cursor tests
 * Tests for cursor management implementation
 */

import { it, vi, expect, describe, beforeEach } from 'vitest';

import { CursorShape } from '../../src/types.js';
import { CursorImpl } from '../../src/core/cursor.js';

import type { X, Y, Cursor } from '../../src/types.js';

// Mock ansi module
vi.mock('../../src/core/ansi.js', () => ({
  ansi: {
    cursorPosition: vi.fn((row: number, col: number) => `\x1b[${row};${col}H`),
    cursorUp: vi.fn((n: number) => `\x1b[${n}A`),
    cursorDown: vi.fn((n: number) => `\x1b[${n}B`),
    cursorForward: vi.fn((n: number) => `\x1b[${n}C`),
    cursorBack: vi.fn((n: number) => `\x1b[${n}D`),
    cursorColumn: vi.fn((col: number) => `\x1b[${col}G`),
    cursorNextLine: vi.fn((n: number) => `\x1b[${n}E`),
    cursorPreviousLine: vi.fn((n: number) => `\x1b[${n}F`),
    cursorShow: vi.fn(() => '\x1b[?25h'),
    cursorHide: vi.fn(() => '\x1b[?25l'),
    cursorShape: vi.fn((shape: CursorShape) => {
      const codes = {
        [CursorShape.Block]: '\x1b[1 q',
        [CursorShape.Underline]: '\x1b[3 q',
        [CursorShape.Bar]: '\x1b[5 q',
        [CursorShape.BlinkingBlock]: '\x1b[0 q',
        [CursorShape.BlinkingUnderline]: '\x1b[4 q',
        [CursorShape.BlinkingBar]: '\x1b[6 q'
      };
      return codes[shape] || '\x1b[0 q';
    }),
    cursorBlink: vi.fn((enable: boolean) => enable ? '\x1b[?12h' : '\x1b[?12l'),
    cursorSave: vi.fn(() => '\x1b7'),
    cursorRestore: vi.fn(() => '\x1b8'),
    cursorSavePosition: vi.fn(() => '\x1b[s'),
    cursorRestorePosition: vi.fn(() => '\x1b[u'),
    getCursorPosition: vi.fn(() => '\x1b[6n')
  }
}));

describe('Cursor', () => {
  let cursor: Cursor;
  let writeOutput: vi.Mock;

  beforeEach(() => {
    writeOutput = vi.fn();
    cursor = new CursorImpl(writeOutput);
    vi.clearAllMocks();
  });

  describe('Creation', () => {
    it('should create cursor with default state', () => {
      expect(cursor).toBeDefined();
      expect(cursor.position).toEqual({ x: 0, y: 0 });
      expect(cursor.visible).toBe(true);
      expect(cursor.shape).toBe(CursorShape.Block);
      expect(cursor.blinking).toBe(true);
    });
  });

  describe('Position Movement', () => {
    describe('moveTo', () => {
      it('should move cursor to absolute position', () => {
        cursor.moveTo(10 as X, 5 as Y);
        
        expect(cursor.position).toEqual({ x: 10, y: 5 });
        expect(writeOutput).toHaveBeenCalledWith('\x1b[6;11H');
      });

      it('should handle zero position', () => {
        cursor.moveTo(0 as X, 0 as Y);
        
        expect(cursor.position).toEqual({ x: 0, y: 0 });
        expect(writeOutput).toHaveBeenCalledWith('\x1b[1;1H');
      });

      it('should handle large positions', () => {
        cursor.moveTo(999 as X, 999 as Y);
        
        expect(cursor.position).toEqual({ x: 999, y: 999 });
        expect(writeOutput).toHaveBeenCalledWith('\x1b[1000;1000H');
      });
    });

    describe('moveUp', () => {
      it('should move cursor up by specified lines', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveUp(3);
        
        expect(cursor.position).toEqual({ x: 10, y: 7 });
        expect(writeOutput).toHaveBeenCalledWith('\x1b[3A');
      });

      it('should not move beyond top boundary', () => {
        cursor.moveTo(10 as X, 2 as Y);
        vi.clearAllMocks();
        
        cursor.moveUp(5);
        
        expect(cursor.position).toEqual({ x: 10, y: 0 });
        expect(writeOutput).toHaveBeenCalledWith('\x1b[5A');
      });

      it('should handle zero lines', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveUp(0);
        
        expect(cursor.position).toEqual({ x: 10, y: 10 });
        expect(writeOutput).not.toHaveBeenCalled();
      });

      it('should handle negative lines', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveUp(-5);
        
        expect(cursor.position).toEqual({ x: 10, y: 10 });
        expect(writeOutput).not.toHaveBeenCalled();
      });
    });

    describe('moveDown', () => {
      it('should move cursor down by specified lines', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveDown(3);
        
        expect(cursor.position).toEqual({ x: 10, y: 13 });
        expect(writeOutput).toHaveBeenCalledWith('\x1b[3B');
      });

      it('should handle zero lines', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveDown(0);
        
        expect(cursor.position).toEqual({ x: 10, y: 10 });
        expect(writeOutput).not.toHaveBeenCalled();
      });

      it('should handle negative lines', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveDown(-5);
        
        expect(cursor.position).toEqual({ x: 10, y: 10 });
        expect(writeOutput).not.toHaveBeenCalled();
      });

      it('should handle large movements', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveDown(100);
        
        expect(cursor.position).toEqual({ x: 10, y: 110 });
        expect(writeOutput).toHaveBeenCalledWith('\x1b[100B');
      });
    });

    describe('moveLeft', () => {
      it('should move cursor left by specified columns', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveLeft(3);
        
        expect(cursor.position).toEqual({ x: 7, y: 10 });
        expect(writeOutput).toHaveBeenCalledWith('\x1b[3D');
      });

      it('should not move beyond left boundary', () => {
        cursor.moveTo(2 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveLeft(5);
        
        expect(cursor.position).toEqual({ x: 0, y: 10 });
        expect(writeOutput).toHaveBeenCalledWith('\x1b[5D');
      });

      it('should handle zero columns', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveLeft(0);
        
        expect(cursor.position).toEqual({ x: 10, y: 10 });
        expect(writeOutput).not.toHaveBeenCalled();
      });

      it('should handle negative columns', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveLeft(-5);
        
        expect(cursor.position).toEqual({ x: 10, y: 10 });
        expect(writeOutput).not.toHaveBeenCalled();
      });
    });

    describe('moveRight', () => {
      it('should move cursor right by specified columns', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveRight(3);
        
        expect(cursor.position).toEqual({ x: 13, y: 10 });
        expect(writeOutput).toHaveBeenCalledWith('\x1b[3C');
      });

      it('should handle zero columns', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveRight(0);
        
        expect(cursor.position).toEqual({ x: 10, y: 10 });
        expect(writeOutput).not.toHaveBeenCalled();
      });

      it('should handle negative columns', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveRight(-5);
        
        expect(cursor.position).toEqual({ x: 10, y: 10 });
        expect(writeOutput).not.toHaveBeenCalled();
      });

      it('should handle large movements', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveRight(100);
        
        expect(cursor.position).toEqual({ x: 110, y: 10 });
        expect(writeOutput).toHaveBeenCalledWith('\x1b[100C');
      });
    });

    describe('moveToColumn', () => {
      it('should move cursor to specific column', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveToColumn(20 as X);
        
        expect(cursor.position).toEqual({ x: 20, y: 10 });
        expect(writeOutput).toHaveBeenCalledWith('\x1b[21G');
      });

      it('should handle zero column', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveToColumn(0 as X);
        
        expect(cursor.position).toEqual({ x: 0, y: 10 });
        expect(writeOutput).toHaveBeenCalledWith('\x1b[1G');
      });
    });

    describe('moveToNextLine', () => {
      it('should move to next line', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveToNextLine();
        
        expect(cursor.position).toEqual({ x: 0, y: 11 });
        expect(writeOutput).toHaveBeenCalledWith('\x1b[1E');
      });

      it('should move multiple lines', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveToNextLine(3);
        
        expect(cursor.position).toEqual({ x: 0, y: 13 });
        expect(writeOutput).toHaveBeenCalledWith('\x1b[3E');
      });

      it('should handle zero lines', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveToNextLine(0);
        
        expect(cursor.position).toEqual({ x: 10, y: 10 });
        expect(writeOutput).not.toHaveBeenCalled();
      });

      it('should handle negative lines', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveToNextLine(-5);
        
        expect(cursor.position).toEqual({ x: 10, y: 10 });
        expect(writeOutput).not.toHaveBeenCalled();
      });
    });

    describe('moveToPreviousLine', () => {
      it('should move to previous line', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveToPreviousLine();
        
        expect(cursor.position).toEqual({ x: 0, y: 9 });
        expect(writeOutput).toHaveBeenCalledWith('\x1b[1F');
      });

      it('should move multiple lines', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveToPreviousLine(3);
        
        expect(cursor.position).toEqual({ x: 0, y: 7 });
        expect(writeOutput).toHaveBeenCalledWith('\x1b[3F');
      });

      it('should not move beyond top boundary', () => {
        cursor.moveTo(10 as X, 2 as Y);
        vi.clearAllMocks();
        
        cursor.moveToPreviousLine(5);
        
        expect(cursor.position).toEqual({ x: 0, y: 0 });
        expect(writeOutput).toHaveBeenCalledWith('\x1b[5F');
      });

      it('should handle zero lines', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveToPreviousLine(0);
        
        expect(cursor.position).toEqual({ x: 10, y: 10 });
        expect(writeOutput).not.toHaveBeenCalled();
      });

      it('should handle negative lines', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.moveToPreviousLine(-5);
        
        expect(cursor.position).toEqual({ x: 10, y: 10 });
        expect(writeOutput).not.toHaveBeenCalled();
      });
    });
  });

  describe('Position Queries', () => {
    it('should get current position synchronously', () => {
      cursor.moveTo(15 as X, 20 as Y);
      
      const position = cursor.position;
      
      expect(position).toEqual({ x: 15, y: 20 });
    });

    it('should get position asynchronously', async () => {
      cursor.moveTo(25 as X, 30 as Y);
      vi.clearAllMocks();
      
      const position = await cursor.getPosition();
      
      expect(position).toEqual({ x: 25, y: 30 });
      expect(writeOutput).toHaveBeenCalledWith('\x1b[6n');
    });

    it('should return copy of position', () => {
      cursor.moveTo(10 as X, 10 as Y);
      
      const pos1 = cursor.position;
      const pos2 = cursor.position;
      
      expect(pos1).not.toBe(pos2);
      expect(pos1).toEqual(pos2);
    });
  });

  describe('Visibility', () => {
    it('should show cursor', () => {
      cursor.hide();
      vi.clearAllMocks();
      
      cursor.show();
      
      expect(cursor.visible).toBe(true);
      expect(writeOutput).toHaveBeenCalledWith('\x1b[?25h');
    });

    it('should hide cursor', () => {
      cursor.hide();
      
      expect(cursor.visible).toBe(false);
      expect(writeOutput).toHaveBeenCalledWith('\x1b[?25l');
    });

    it('should track visibility state', () => {
      expect(cursor.visible).toBe(true);
      
      cursor.hide();
      expect(cursor.visible).toBe(false);
      
      cursor.show();
      expect(cursor.visible).toBe(true);
    });
  });

  describe('Shape', () => {
    it('should set block cursor shape', () => {
      cursor.setShape(CursorShape.Block);
      
      expect(cursor.shape).toBe(CursorShape.Block);
      expect(writeOutput).toHaveBeenCalledWith('\x1b[1 q');
    });

    it('should set underline cursor shape', () => {
      cursor.setShape(CursorShape.Underline);
      
      expect(cursor.shape).toBe(CursorShape.Underline);
      expect(writeOutput).toHaveBeenCalledWith('\x1b[3 q');
    });

    it('should set bar cursor shape', () => {
      cursor.setShape(CursorShape.Bar);
      
      expect(cursor.shape).toBe(CursorShape.Bar);
      expect(writeOutput).toHaveBeenCalledWith('\x1b[5 q');
    });

    it('should set blinking block cursor shape', () => {
      cursor.setShape(CursorShape.BlinkingBlock);
      
      expect(cursor.shape).toBe(CursorShape.BlinkingBlock);
      expect(writeOutput).toHaveBeenCalledWith('\x1b[0 q');
    });

    it('should set blinking underline cursor shape', () => {
      cursor.setShape(CursorShape.BlinkingUnderline);
      
      expect(cursor.shape).toBe(CursorShape.BlinkingUnderline);
      expect(writeOutput).toHaveBeenCalledWith('\x1b[4 q');
    });

    it('should set blinking bar cursor shape', () => {
      cursor.setShape(CursorShape.BlinkingBar);
      
      expect(cursor.shape).toBe(CursorShape.BlinkingBar);
      expect(writeOutput).toHaveBeenCalledWith('\x1b[6 q');
    });
  });

  describe('Blinking', () => {
    it('should enable cursor blinking', () => {
      cursor.disableBlink();
      vi.clearAllMocks();
      
      cursor.enableBlink();
      
      expect(cursor.blinking).toBe(true);
      expect(writeOutput).toHaveBeenCalledWith('\x1b[?12h');
    });

    it('should disable cursor blinking', () => {
      cursor.disableBlink();
      
      expect(cursor.blinking).toBe(false);
      expect(writeOutput).toHaveBeenCalledWith('\x1b[?12l');
    });

    it('should track blinking state', () => {
      expect(cursor.blinking).toBe(true);
      
      cursor.disableBlink();
      expect(cursor.blinking).toBe(false);
      
      cursor.enableBlink();
      expect(cursor.blinking).toBe(true);
    });
  });

  describe('Save/Restore', () => {
    describe('save/restore', () => {
      it('should save and restore cursor position', () => {
        cursor.moveTo(10 as X, 20 as Y);
        vi.clearAllMocks();
        
        cursor.save();
        expect(writeOutput).toHaveBeenCalledWith('\x1b7');
        
        cursor.moveTo(30 as X, 40 as Y);
        vi.clearAllMocks();
        
        cursor.restore();
        
        expect(cursor.position).toEqual({ x: 10, y: 20 });
        expect(writeOutput).toHaveBeenCalledWith('\x1b8');
      });

      it('should handle restore without save', () => {
        cursor.moveTo(10 as X, 20 as Y);
        vi.clearAllMocks();
        
        cursor.restore();
        
        expect(cursor.position).toEqual({ x: 10, y: 20 });
        expect(writeOutput).toHaveBeenCalledWith('\x1b8');
      });

      it('should overwrite previous save', () => {
        cursor.moveTo(10 as X, 20 as Y);
        cursor.save();
        
        cursor.moveTo(30 as X, 40 as Y);
        cursor.save();
        
        cursor.moveTo(50 as X, 60 as Y);
        cursor.restore();
        
        expect(cursor.position).toEqual({ x: 30, y: 40 });
      });
    });

    describe('push/pop', () => {
      it('should push and pop cursor position', () => {
        cursor.moveTo(10 as X, 20 as Y);
        vi.clearAllMocks();
        
        cursor.push();
        expect(writeOutput).toHaveBeenCalledWith('\x1b[s');
        
        cursor.moveTo(30 as X, 40 as Y);
        vi.clearAllMocks();
        
        cursor.pop();
        
        expect(cursor.position).toEqual({ x: 10, y: 20 });
        expect(writeOutput).toHaveBeenCalledWith('\x1b[u');
      });

      it('should handle multiple push/pop operations', () => {
        cursor.moveTo(10 as X, 20 as Y);
        cursor.push();
        
        cursor.moveTo(30 as X, 40 as Y);
        cursor.push();
        
        cursor.moveTo(50 as X, 60 as Y);
        cursor.push();
        
        cursor.pop();
        expect(cursor.position).toEqual({ x: 50, y: 60 });
        
        cursor.pop();
        expect(cursor.position).toEqual({ x: 30, y: 40 });
        
        cursor.pop();
        expect(cursor.position).toEqual({ x: 10, y: 20 });
      });

      it('should handle pop with empty stack', () => {
        cursor.moveTo(10 as X, 20 as Y);
        vi.clearAllMocks();
        
        cursor.pop();
        
        expect(cursor.position).toEqual({ x: 10, y: 20 });
        expect(writeOutput).not.toHaveBeenCalled();
      });

      it('should maintain stack across multiple operations', () => {
        cursor.moveTo(10 as X, 10 as Y);
        cursor.push();
        
        cursor.moveTo(20 as X, 20 as Y);
        cursor.push();
        
        cursor.moveTo(30 as X, 30 as Y);
        
        // Use save/restore (should not affect stack)
        cursor.save();
        cursor.moveTo(40 as X, 40 as Y);
        cursor.restore();
        
        // Stack should still work
        cursor.pop();
        expect(cursor.position).toEqual({ x: 20, y: 20 });
        
        cursor.pop();
        expect(cursor.position).toEqual({ x: 10, y: 10 });
      });
    });
  });

  describe('Utilities', () => {
    describe('reset', () => {
      it('should reset cursor to default state', () => {
        // Change all properties
        cursor.moveTo(50 as X, 60 as Y);
        cursor.hide();
        cursor.setShape(CursorShape.Bar);
        cursor.disableBlink();
        cursor.save();
        cursor.push();
        cursor.push();
        
        vi.clearAllMocks();
        
        cursor.reset();
        
        expect(cursor.position).toEqual({ x: 0, y: 0 });
        expect(cursor.visible).toBe(true);
        expect(cursor.shape).toBe(CursorShape.Block);
        expect(cursor.blinking).toBe(true);
        
        // Should send reset commands
        expect(writeOutput).toHaveBeenCalledWith('\x1b[?25h'); // Show
        expect(writeOutput).toHaveBeenCalledWith('\x1b[?12h'); // Blink
        expect(writeOutput).toHaveBeenCalledWith('\x1b[1 q'); // Block shape
        expect(writeOutput).toHaveBeenCalledWith('\x1b[1;1H'); // Position 0,0
      });

      it('should clear saved position on reset', () => {
        cursor.moveTo(10 as X, 20 as Y);
        cursor.save();
        
        cursor.reset();
        cursor.restore();
        
        // Should stay at reset position since saved position was cleared
        expect(cursor.position).toEqual({ x: 0, y: 0 });
      });

      it('should clear position stack on reset', () => {
        cursor.moveTo(10 as X, 20 as Y);
        cursor.push();
        cursor.moveTo(30 as X, 40 as Y);
        cursor.push();
        
        cursor.reset();
        
        // Pop should do nothing since stack was cleared
        cursor.pop();
        expect(cursor.position).toEqual({ x: 0, y: 0 });
      });
    });

    describe('updatePosition', () => {
      it('should update internal position tracking', () => {
        cursor.updatePosition(25 as X, 35 as Y);
        
        expect(cursor.position).toEqual({ x: 25, y: 35 });
        expect(writeOutput).not.toHaveBeenCalled();
      });

      it('should only update internal state', () => {
        cursor.moveTo(10 as X, 10 as Y);
        vi.clearAllMocks();
        
        cursor.updatePosition(20 as X, 30 as Y);
        
        expect(cursor.position).toEqual({ x: 20, y: 30 });
        expect(writeOutput).not.toHaveBeenCalled();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid position changes', () => {
      for (let i = 0; i < 100; i++) {
        cursor.moveTo(i as X, i as Y);
      }
      
      expect(cursor.position).toEqual({ x: 99, y: 99 });
      expect(writeOutput).toHaveBeenCalledTimes(100);
    });

    it('should handle save/restore with updatePosition', () => {
      cursor.moveTo(10 as X, 20 as Y);
      cursor.save();
      
      cursor.updatePosition(30 as X, 40 as Y);
      cursor.restore();
      
      // Should restore to saved position, not updated position
      expect(cursor.position).toEqual({ x: 10, y: 20 });
    });

    it('should handle all cursor shapes', () => {
      const shapes = [
        CursorShape.Block,
        CursorShape.Underline,
        CursorShape.Bar,
        CursorShape.BlinkingBlock,
        CursorShape.BlinkingUnderline,
        CursorShape.BlinkingBar
      ];
      
      shapes.forEach(shape => {
        cursor.setShape(shape);
        expect(cursor.shape).toBe(shape);
      });
      
      expect(writeOutput).toHaveBeenCalledTimes(shapes.length);
    });

    it('should handle negative coordinates in moveTo', () => {
      // TypeScript would normally prevent this, but test defensive programming
      cursor.moveTo(-10 as X, -20 as Y);
      
      expect(cursor.position).toEqual({ x: -10, y: -20 });
      // Terminal will handle negative values
      expect(writeOutput).toHaveBeenCalledWith('\x1b[-19;-9H');
    });

    it('should maintain independent save and stack states', () => {
      cursor.moveTo(10 as X, 10 as Y);
      cursor.save();
      
      cursor.moveTo(20 as X, 20 as Y);
      cursor.push();
      
      cursor.moveTo(30 as X, 30 as Y);
      cursor.push();
      
      cursor.moveTo(40 as X, 40 as Y);
      
      // Restore from save (not stack)
      cursor.restore();
      expect(cursor.position).toEqual({ x: 10, y: 10 });
      
      // Pop from stack (should still work)
      cursor.pop();
      expect(cursor.position).toEqual({ x: 30, y: 30 });
      
      cursor.pop();
      expect(cursor.position).toEqual({ x: 20, y: 20 });
    });

    it('should handle very large position values', () => {
      const maxX = 9999 as X;
      const maxY = 9999 as Y;
      
      cursor.moveTo(maxX, maxY);
      
      expect(cursor.position).toEqual({ x: maxX, y: maxY });
      expect(writeOutput).toHaveBeenCalledWith('\x1b[10000;10000H');
    });
  });
});
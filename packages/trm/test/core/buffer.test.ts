import { it, expect, describe, beforeEach } from 'vitest';

import { Cell, BoxStyle, LineStyle } from '../../src/types';
import { Buffer, ScreenBuffer } from '../../src/core/buffer';

describe('Buffer', () => {
  let buffer: Buffer;

  beforeEach(() => {
    buffer = new Buffer();
  });

  describe('Buffer Creation', () => {
    it('should create a screen buffer with specified dimensions', () => {
      const screenBuffer = buffer.create(80 as any, 24 as any);
      
      expect(screenBuffer.width).toBe(80);
      expect(screenBuffer.height).toBe(24);
    });

    it('should initialize front and back buffers', () => {
      expect(buffer.frontBuffer).toBeDefined();
      expect(buffer.backBuffer).toBeDefined();
      expect(buffer.frontBuffer).not.toBe(buffer.backBuffer);
    });
  });

  describe('Buffer Flipping', () => {
    it('should swap front and back buffers', () => {
      const initialFront = buffer.frontBuffer;
      const initialBack = buffer.backBuffer;
      
      buffer.flip();
      
      expect(buffer.frontBuffer).toBe(initialBack);
      expect(buffer.backBuffer).toBe(initialFront);
    });
  });

  describe('Buffer Diffing', () => {
    it('should detect no changes between identical buffers', () => {
      const buffer1 = buffer.create(10 as any, 10 as any);
      const buffer2 = buffer.create(10 as any, 10 as any);
      
      const patches = buffer.diff(buffer1, buffer2);
      
      expect(patches).toHaveLength(0);
    });

    it('should detect changes between different buffers', () => {
      const buffer1 = buffer.create(10 as any, 10 as any);
      const buffer2 = buffer.create(10 as any, 10 as any);
      
      buffer1.setCell(5 as any, 5 as any, 'A');
      buffer2.setCell(5 as any, 5 as any, 'B');
      
      const patches = buffer.diff(buffer1, buffer2);
      
      expect(patches.length).toBeGreaterThan(0);
      expect(patches[0].x).toBe(5);
      expect(patches[0].y).toBe(5);
    });

    it('should handle multiple changes', () => {
      const buffer1 = buffer.create(10 as any, 10 as any);
      const buffer2 = buffer.create(10 as any, 10 as any);
      
      buffer1.setCell(1 as any, 1 as any, 'A');
      buffer2.setCell(1 as any, 1 as any, 'B');
      
      buffer1.setCell(5 as any, 5 as any, 'C');
      buffer2.setCell(5 as any, 5 as any, 'D');
      
      const patches = buffer.diff(buffer1, buffer2);
      
      expect(patches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Patch Application', () => {
    it('should apply a single patch', () => {
      const screenBuffer = buffer.create(10 as any, 10 as any);
      const patch = {
        x: 5 as any,
        y: 5 as any,
        cells: [{ char: 'X', width: 1 as const }]
      };
      
      buffer.applyPatch(screenBuffer, patch);
      
      const cell = screenBuffer.getCell(5 as any, 5 as any);
      expect(cell?.char).toBe('X');
    });

    it('should apply multiple patches', () => {
      const screenBuffer = buffer.create(10 as any, 10 as any);
      const patches = [
        { x: 1 as any, y: 1 as any, cells: [{ char: 'A', width: 1 as const }] },
        { x: 2 as any, y: 2 as any, cells: [{ char: 'B', width: 1 as const }] },
        { x: 3 as any, y: 3 as any, cells: [{ char: 'C', width: 1 as const }] }
      ];
      
      buffer.applyPatches(screenBuffer, patches);
      
      expect(screenBuffer.getCell(1 as any, 1 as any)?.char).toBe('A');
      expect(screenBuffer.getCell(2 as any, 2 as any)?.char).toBe('B');
      expect(screenBuffer.getCell(3 as any, 3 as any)?.char).toBe('C');
    });
  });
});

describe('ScreenBuffer', () => {
  let screenBuffer: ScreenBuffer;

  beforeEach(() => {
    screenBuffer = new ScreenBuffer(80 as any, 24 as any);
  });

  describe('Cell Operations', () => {
    it('should set and get cells', () => {
      const style = { bold: true };
      
      screenBuffer.setCell(10 as any, 5 as any, 'H', style);
      const retrieved = screenBuffer.getCell(10 as any, 5 as any);
      
      expect(retrieved?.char).toBe('H');
      expect(retrieved?.style).toEqual(style);
    });

    it('should return undefined for out of bounds cells', () => {
      const cell = screenBuffer.getCell(100 as any, 100 as any);
      expect(cell).toBeUndefined();
    });

    it('should handle cells at boundaries', () => {
      screenBuffer.setCell(79 as any, 23 as any, 'E');
      const cell = screenBuffer.getCell(79 as any, 23 as any);
      expect(cell?.char).toBe('E');
      
      screenBuffer.setCell(0 as any, 0 as any, 'F');
      const cornerCell = screenBuffer.getCell(0 as any, 0 as any);
      expect(cornerCell?.char).toBe('F');
    });
  });

  describe('Text Operations', () => {
    it('should write text at specified position', () => {
      screenBuffer.writeText(5 as any, 10 as any, 'Hello');
      
      expect(screenBuffer.getCell(5 as any, 10 as any)?.char).toBe('H');
      expect(screenBuffer.getCell(6 as any, 10 as any)?.char).toBe('e');
      expect(screenBuffer.getCell(7 as any, 10 as any)?.char).toBe('l');
      expect(screenBuffer.getCell(8 as any, 10 as any)?.char).toBe('l');
      expect(screenBuffer.getCell(9 as any, 10 as any)?.char).toBe('o');
    });

    it('should write text with style', () => {
      const style = { foreground: { type: 'ansi' as const, value: 1 as any } };
      screenBuffer.writeText(0 as any, 0 as any, 'Red', style);
      
      const cell = screenBuffer.getCell(0 as any, 0 as any);
      expect(cell?.style).toEqual(style);
    });

    it('should wrap text at buffer edge', () => {
      screenBuffer.writeText(78 as any, 0 as any, 'Test');
      
      expect(screenBuffer.getCell(78 as any, 0 as any)?.char).toBe('T');
      expect(screenBuffer.getCell(79 as any, 0 as any)?.char).toBe('e');
      // 's' and 't' should not be written (out of bounds)
    });

    it('should write a line of text', () => {
      screenBuffer.writeLine(5 as any, 'Line of text');
      
      expect(screenBuffer.getCell(0 as any, 5 as any)?.char).toBe('L');
      expect(screenBuffer.getCell(11 as any, 5 as any)?.char).toBe('t');
    });

    it('should measure text dimensions', () => {
      const dimensions = screenBuffer.measureText('Hello\nWorld');
      
      expect(dimensions.width).toBe(5);
      expect(dimensions.height).toBe(2);
    });

    it('should handle empty text measurement', () => {
      const dimensions = screenBuffer.measureText('');
      
      expect(dimensions.width).toBe(0);
      expect(dimensions.height).toBe(0);
    });

    it('should handle wide characters in text measurement', () => {
      const dimensions = screenBuffer.measureText('你好'); // Chinese characters (typically 2 cells wide)
      
      expect(dimensions.width).toBe(4); // 2 characters * 2 width
      expect(dimensions.height).toBe(1);
    });
  });

  describe('Fill Operations', () => {
    it('should fill a rectangle with specified cell', () => {
      const cell: Cell = { char: '#', width: 1 };
      const rect = {
        x: 10 as any,
        y: 5 as any,
        width: 5 as any,
        height: 3 as any
      };
      
      screenBuffer.fill(rect, cell);
      
      for (let y = 5; y < 8; y++) {
        for (let x = 10; x < 15; x++) {
          expect(screenBuffer.getCell(x as any, y as any)).toEqual(cell);
        }
      }
    });

    it('should handle fill at buffer edges', () => {
      const cell: Cell = { char: '*', width: 1 };
      const rect = {
        x: 75 as any,
        y: 20 as any,
        width: 10 as any, // Extends beyond buffer
        height: 10 as any // Extends beyond buffer
      };
      
      screenBuffer.fill(rect, cell);
      
      expect(screenBuffer.getCell(75 as any, 20 as any)).toEqual(cell);
      expect(screenBuffer.getCell(79 as any, 23 as any)).toEqual(cell);
    });
  });

  describe('Copy Operations', () => {
    it('should copy cells from one area to another', () => {
      // Set up source area
      screenBuffer.setCell(5 as any, 5 as any, 'A');
      screenBuffer.setCell(6 as any, 5 as any, 'B');
      screenBuffer.setCell(5 as any, 6 as any, 'C');
      screenBuffer.setCell(6 as any, 6 as any, 'D');
      
      const src = { x: 5 as any, y: 5 as any, width: 2 as any, height: 2 as any };
      const dst = { x: 10 as any, y: 10 as any };
      
      screenBuffer.copy(src, dst);
      
      expect(screenBuffer.getCell(10 as any, 10 as any)?.char).toBe('A');
      expect(screenBuffer.getCell(11 as any, 10 as any)?.char).toBe('B');
      expect(screenBuffer.getCell(10 as any, 11 as any)?.char).toBe('C');
      expect(screenBuffer.getCell(11 as any, 11 as any)?.char).toBe('D');
    });

    it('should copy from another buffer', () => {
      const source = new ScreenBuffer(80 as any, 24 as any);
      source.setCell(0 as any, 0 as any, 'X');
      
      screenBuffer.copyFrom(source, 0 as any, 0 as any, 10 as any, 10 as any, 1 as any, 1 as any);
      
      expect(screenBuffer.getCell(10 as any, 10 as any)?.char).toBe('X');
    });
  });

  describe('Line Drawing', () => {
    it('should draw horizontal line', () => {
      const style: LineStyle = { char: '-' };
      screenBuffer.drawLine(
        { x: 5 as any, y: 10 as any },
        { x: 10 as any, y: 10 as any },
        style
      );
      
      for (let x = 5; x <= 10; x++) {
        expect(screenBuffer.getCell(x as any, 10 as any)?.char).toBe('-');
      }
    });

    it('should draw vertical line', () => {
      const style: LineStyle = { char: '|' };
      screenBuffer.drawLine(
        { x: 5 as any, y: 5 as any },
        { x: 5 as any, y: 10 as any },
        style
      );
      
      for (let y = 5; y <= 10; y++) {
        expect(screenBuffer.getCell(5 as any, y as any)?.char).toBe('|');
      }
    });

    it('should draw diagonal line', () => {
      const style: LineStyle = { char: '/' };
      screenBuffer.drawLine(
        { x: 5 as any, y: 5 as any },
        { x: 10 as any, y: 10 as any },
        style
      );
      
      // Check some points on the diagonal
      expect(screenBuffer.getCell(5 as any, 5 as any)?.char).toBe('/');
      expect(screenBuffer.getCell(10 as any, 10 as any)?.char).toBe('/');
    });
  });

  describe('Box Drawing', () => {
    it('should draw a simple box', () => {
      const rect = {
        x: 5 as any,
        y: 5 as any,
        width: 5 as any,
        height: 3 as any
      };
      const style: BoxStyle = { type: 'single' };
      
      screenBuffer.drawBox(rect, style);
      
      // Check corners
      expect(screenBuffer.getCell(5 as any, 5 as any)?.char).toBeTruthy();
      expect(screenBuffer.getCell(9 as any, 5 as any)?.char).toBeTruthy();
      expect(screenBuffer.getCell(5 as any, 7 as any)?.char).toBeTruthy();
      expect(screenBuffer.getCell(9 as any, 7 as any)?.char).toBeTruthy();
    });

    it('should draw a filled box', () => {
      const rect = {
        x: 10 as any,
        y: 10 as any,
        width: 3 as any,
        height: 3 as any
      };
      const style: BoxStyle = { type: 'single', fill: true };
      
      screenBuffer.drawBox(rect, style);
      
      // Check interior is filled
      expect(screenBuffer.getCell(11 as any, 11 as any)?.char).toBe(' ');
    });
  });

  describe('Clear Operations', () => {
    it('should clear entire buffer', () => {
      screenBuffer.setCell(10 as any, 10 as any, { char: 'X', width: 1 });
      screenBuffer.setCell(20 as any, 20 as any, { char: 'Y', width: 1 });
      
      screenBuffer.clear();
      
      expect(screenBuffer.getCell(10 as any, 10 as any)?.char).toBe(' ');
      expect(screenBuffer.getCell(20 as any, 20 as any)?.char).toBe(' ');
    });

    it('should clear a rectangle', () => {
      // Fill area first
      for (let y = 5; y < 10; y++) {
        for (let x = 5; x < 10; x++) {
          screenBuffer.setCell(x as any, y as any, { char: '#', width: 1 });
        }
      }
      
      screenBuffer.clearRect(6 as any, 6 as any, 2 as any, 2 as any);
      
      expect(screenBuffer.getCell(6 as any, 6 as any)?.char).toBe(' ');
      expect(screenBuffer.getCell(7 as any, 7 as any)?.char).toBe(' ');
      expect(screenBuffer.getCell(5 as any, 5 as any)?.char).toBe('#');
      expect(screenBuffer.getCell(8 as any, 8 as any)?.char).toBe('#');
    });
  });

  describe('Clone Operations', () => {
    it('should create an independent clone', () => {
      screenBuffer.setCell(10 as any, 10 as any, { char: 'A', width: 1 });
      
      const clone = screenBuffer.clone();
      
      expect(clone.getCell(10 as any, 10 as any)?.char).toBe('A');
      
      // Modify original
      screenBuffer.setCell(10 as any, 10 as any, { char: 'B', width: 1 });
      
      // Clone should be unchanged
      expect(clone.getCell(10 as any, 10 as any)?.char).toBe('A');
    });

    it('should preserve dimensions in clone', () => {
      const clone = screenBuffer.clone();
      
      expect(clone.width).toBe(screenBuffer.width);
      expect(clone.height).toBe(screenBuffer.height);
    });
  });
});
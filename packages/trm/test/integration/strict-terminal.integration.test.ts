/**
 * Strict Terminal Integration Tests
 * Using AAA pattern and real functionality verification
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { it, expect, describe, afterEach, beforeEach } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../fixtures');

describe('Strict Terminal Integration Tests (AAA Pattern)', () => {
  describe('Direct Command Execution Tests', () => {
    it('should execute node script and capture output correctly', () => {
      // Arrange
      const testScript = path.join(fixturesDir, 'test-terminal-app.cjs');
      const expectedOutputs = [
        'TRM Test Application',
        'Red Text',
        'Green Text',
        'Blue Text',
        'Bold Text',
        'Italic Text'
      ];
      
      // Act
      const output = execSync(`node ${testScript}`, {
        encoding: 'utf8',
        timeout: 2000
      });
      
      // Assert - Verify all expected text is present
      expectedOutputs.forEach(expected => {
        expect(output).toContain(expected);
      });
      
      // Assert - Verify ANSI codes are present
      expect(output).toMatch(/\x1b\[\d+m/); // Contains ANSI escape sequences
    });
    
    it('should handle ANSI color codes correctly', () => {
      // Arrange
      const testScript = path.join(fixturesDir, 'test-terminal-app.cjs');
      const colorCodes = {
        red: '\x1b[31m',
        green: '\x1b[32m',
        blue: '\x1b[34m',
        reset: '\x1b[0m',
        bold: '\x1b[1m',
        italic: '\x1b[3m',
        underline: '\x1b[4m'
      };
      
      // Act
      const output = execSync(`node ${testScript}`, {
        encoding: 'utf8',
        timeout: 2000
      });
      
      // Assert - Each color code should be present
      Object.entries(colorCodes).forEach(([name, code]) => {
        expect(output.includes(code)).toBe(true);
      });
    });
  });
  
  describe('Terminal Lifecycle Tests', () => {
    it('should initialize and close terminal properly', async () => {
      // Arrange
      const { TerminalImpl } = await import('../../src/core/terminal.js');
      const terminal = new TerminalImpl({
        mode: 'inline',
        alternateBuffer: false,
        rawMode: false
      });
      
      // Act - Initialize
      await terminal.init();
      
      // Assert - Terminal is initialized
      expect(terminal.initialized).toBe(true);
      expect(terminal.stream).toBeDefined();
      expect(terminal.screen).toBeDefined();
      expect(terminal.cursor).toBeDefined();
      
      // Act - Close
      await terminal.close();
      
      // Assert - Terminal is closed
      expect(terminal.closed).toBe(true);
    });
    
    it('should handle screen operations correctly', async () => {
      // Arrange
      const { TerminalImpl } = await import('../../src/core/terminal.js');
      const { x, y } = await import('../../src/types.js');
      const terminal = new TerminalImpl({ mode: 'inline' });
      
      await terminal.init();
      
      // Act - Write to screen
      terminal.screen.clear();
      terminal.screen.writeAt(x(0), y(0), 'Test Text');
      
      // Assert - Operations complete without error
      // (In a real terminal, this would display text)
      expect(terminal.initialized).toBe(true);
      
      // Clean up
      await terminal.close();
    });
  });
  
  describe('Buffer Management Tests', () => {
    it('should create and manage buffers correctly', async () => {
      // Arrange
      const { BufferManagerImpl } = await import('../../src/core/buffer.js');
      const { cols, rows } = await import('../../src/types.js');
      const bufferManager = new BufferManagerImpl();
      
      // Act - Create buffer
      const buffer = bufferManager.create(cols(80), rows(24));
      
      // Assert - Buffer dimensions are correct
      expect(buffer.width).toBe(80);
      expect(buffer.height).toBe(24);
      
      // Act - Write to buffer
      buffer.writeText(0 as any, 0 as any, 'Test Content');
      
      // Assert - Content is in buffer
      const cells = buffer.toArray();
      expect(cells[0][0].char).toBe('T');
      expect(cells[0][1].char).toBe('e');
      expect(cells[0][2].char).toBe('s');
      expect(cells[0][3].char).toBe('t');
    });
    
    it('should handle buffer flipping correctly', async () => {
      // Arrange
      const { BufferManagerImpl } = await import('../../src/core/buffer.js');
      const { cols, rows, x, y } = await import('../../src/types.js');
      const bufferManager = new BufferManagerImpl();
      
      // Act - Write to back buffer
      bufferManager.backBuffer.writeText(x(0), y(0), 'Back Buffer');
      
      // Assert - Front buffer is still empty
      const frontCells = bufferManager.frontBuffer.toArray();
      expect(frontCells[0][0].char).toBe(' ');
      
      // Act - Flip buffers
      bufferManager.flip();
      
      // Assert - Content is now in front buffer
      const newFrontCells = bufferManager.frontBuffer.toArray();
      expect(newFrontCells[0][0].char).toBe('B');
      expect(newFrontCells[0][1].char).toBe('a');
    });
  });
  
  describe('Color System Tests', () => {
    it('should handle color conversions correctly', async () => {
      // Arrange
      const { ColorSystem } = await import('../../src/core/color.js');
      const { ColorDepth } = await import('../../src/types.js');
      const colorSystem = new ColorSystem(ColorDepth.TrueColor);
      
      // Act - Create colors
      const red = colorSystem.rgb(255, 0, 0);
      const green = colorSystem.hsl(120, 100, 50);
      const blue = colorSystem.hex('#0000FF');
      
      // Assert - Colors are created correctly
      expect(red).toBeDefined();
      expect(green).toBeDefined();
      expect(blue).toBeDefined();
      
      // Act - Convert to ANSI escape sequences
      const redAnsi = colorSystem.toForeground(red);
      const greenAnsi = colorSystem.toForeground(green);
      const blueAnsi = colorSystem.toForeground(blue);
      
      // Assert - ANSI codes are generated (true color format)
      expect(redAnsi).toContain('38;2;255;0;0');
      expect(greenAnsi).toContain('38;2');
      expect(blueAnsi).toContain('38;2;0;0;255');
    });
    
    it('should handle color depth fallbacks correctly', async () => {
      // Arrange
      const { ColorSystem } = await import('../../src/core/color.js');
      const { ColorDepth } = await import('../../src/types.js');
      
      const basicColors = new ColorSystem(ColorDepth.Basic);
      const extendedColors = new ColorSystem(ColorDepth.Extended);
      const trueColors = new ColorSystem(ColorDepth.TrueColor);
      
      // Act - Create same color in different depths
      const color = { r: 200, g: 100, b: 50 };
      
      const basicRgb = basicColors.rgb(color.r, color.g, color.b);
      const extendedRgb = extendedColors.rgb(color.r, color.g, color.b);
      const trueRgb = trueColors.rgb(color.r, color.g, color.b);
      
      const basicAnsi = basicColors.toForeground(basicRgb);
      const extendedAnsi = extendedColors.toForeground(extendedRgb);
      const trueAnsi = trueColors.toForeground(trueRgb);
      
      // Assert - Different ANSI codes for different depths
      expect(basicAnsi).not.toBe(trueAnsi); // Basic should be simpler
      expect(extendedAnsi).not.toBe(trueAnsi); // Extended uses 256 colors
      expect(trueAnsi).toContain('38;2;200;100;50'); // True color has full RGB
    });
  });
  
  describe('Input Handling Tests', () => {
    it('should create and configure input handler correctly', async () => {
      // Arrange
      const { InputImpl } = await import('../../src/core/input.js');
      const { createTerminalStream } = await import('../../src/core/stream.js');
      
      // Create a mock stream for testing
      const stream = createTerminalStream();
      
      // Act - Create input handler
      const input = new InputImpl(stream);
      
      // Assert - Input handler is created correctly
      expect(input).toBeDefined();
      expect(input.keyboardEnabled).toBe(true); // Should be enabled by default
      expect(input.mouseEnabled).toBe(false); // Should be disabled by default
      
      // Act - Enable mouse
      input.enableMouse();
      
      // Assert - Mouse is enabled
      expect(input.mouseEnabled).toBe(true);
      
      // Act - Disable keyboard
      input.disableKeyboard();
      
      // Assert - Keyboard is disabled
      expect(input.keyboardEnabled).toBe(false);
      
      // Clean up
      input.close();
    });
    
    it('should handle input events correctly', async () => {
      // Arrange
      const { InputImpl } = await import('../../src/core/input.js');
      const { createTerminalStream } = await import('../../src/core/stream.js');
      const stream = createTerminalStream();
      const input = new InputImpl(stream);
      
      // Act - Verify input interface
      expect(input.events).toBeDefined();
      expect(input.stream).toBeDefined();
      
      // Assert - Input state is correct
      expect(input.keyboardEnabled).toBe(true);
      expect(input.mouseEnabled).toBe(false);
      expect(input.bracketedPasteEnabled).toBe(false);
      expect(input.focusTrackingEnabled).toBe(false);
      
      // Act - Enable various features
      input.enableMouse();
      input.enableBracketedPaste();
      input.enableFocusTracking();
      
      // Assert - Features are enabled
      expect(input.mouseEnabled).toBe(true);
      expect(input.bracketedPasteEnabled).toBe(true);
      expect(input.focusTrackingEnabled).toBe(true);
      
      // Clean up
      input.close();
    });
  });
});
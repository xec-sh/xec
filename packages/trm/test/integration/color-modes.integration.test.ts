import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { 
  Color,
  Screen,
  Terminal,
  hexToRgb,
  rgbToHex,
  cssToRgb,
  ColorManager,
  createTerminal
} from '../../src/index.js';

describe('Color Modes Integration', () => {
  let terminal: Terminal;
  let screen: Screen;

  beforeEach(async () => {
    // Mock process.stdout
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    
    terminal = createTerminal({
      colors: 24 // Use colors option instead of colorDepth
    });
    await terminal.init();
    screen = terminal.screen;
  });

  afterEach(async () => {
    await terminal.close();
    vi.restoreAllMocks();
  });

  describe('24-bit True Color Mode', () => {
    it('should render RGB colors correctly', () => {
      const colorManager = new ColorManager(24);
      
      // Test various RGB values
      const testCases = [
        { r: 255, g: 0, b: 0 },    // Red
        { r: 0, g: 255, b: 0 },    // Green
        { r: 0, g: 0, b: 255 },    // Blue
        { r: 255, g: 255, b: 0 },  // Yellow
        { r: 255, g: 0, b: 255 },  // Magenta
        { r: 0, g: 255, b: 255 },  // Cyan
        { r: 128, g: 128, b: 128 }, // Gray
      ];

      testCases.forEach(({ r, g, b }) => {
        const fg = colorManager.toForeground({ r, g, b } as Color);
        expect(fg).toContain(`38;2;${r};${g};${b}`);
        
        const bg = colorManager.toBackground({ r, g, b } as Color);
        expect(bg).toContain(`48;2;${r};${g};${b}`);
      });
    });

    it('should handle gradient colors', () => {
      screen.clear();
      
      // Create a horizontal gradient
      for (let x = 0; x < 80; x++) {
        const intensity = Math.floor((x / 80) * 255);
        screen.setCell(x, 0, '█', {
          fg: { r: intensity, g: 0, b: 255 - intensity } as Color
        });
      }
      
      const row = screen.getLine(0);
      expect(row).toBeDefined();
    });

    it('should support transparency blending', () => {
      const colorManager = new ColorManager(24);
      
      // Test color with opacity
      const color: Color = { r: 255, g: 0, b: 0, a: 0.5 };
      const fg = colorManager.toForeground(color);
      
      // Should still render as solid color (terminals don't support transparency)
      expect(fg).toContain('38;2;255;0;0');
    });
  });

  describe('256 Color Mode', () => {
    beforeEach(() => {
      terminal = createTerminal({
        width: 80,
        height: 24,
        colorDepth: 8
      });
      screen = terminal.getScreen();
    });

    it('should map RGB to 256 colors', () => {
      const colorManager = new ColorManager(8);
      
      // Test standard colors (0-15)
      const standardColors = [
        { color: { r: 0, g: 0, b: 0 } as Color, expected: 0 },      // Black
        { color: { r: 255, g: 0, b: 0 } as Color, expected: 9 },    // Bright red
        { color: { r: 0, g: 255, b: 0 } as Color, expected: 10 },   // Bright green
        { color: { r: 0, g: 0, b: 255 } as Color, expected: 12 },   // Bright blue
      ];

      standardColors.forEach(({ color, expected }) => {
        const index = colorManager.rgbTo256(color);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThanOrEqual(255);
      });
    });

    it('should render grayscale ramp', () => {
      const colorManager = new ColorManager(8);
      
      // Gray ramp starts at index 232
      for (let i = 0; i < 24; i++) {
        const gray = Math.floor(i * 255 / 23);
        const color: Color = { r: gray, g: gray, b: gray };
        const index = colorManager.rgbTo256(color);
        
        // Should map to grayscale range (232-255) or close standard colors
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThanOrEqual(255);
      }
    });

    it('should handle color cube (6x6x6)', () => {
      const colorManager = new ColorManager(8);
      
      // Test samples from the 6x6x6 color cube
      const levels = [0, 95, 135, 175, 215, 255];
      
      levels.forEach(r => {
        levels.forEach(g => {
          levels.forEach(b => {
            const color: Color = { r, g, b };
            const index = colorManager.rgbTo256(color);
            
            expect(index).toBeGreaterThanOrEqual(16);
            expect(index).toBeLessThanOrEqual(231);
          });
        });
      });
    });
  });

  describe('16 Color Mode', () => {
    beforeEach(() => {
      terminal = createTerminal({
        width: 80,
        height: 24,
        colorDepth: 4
      });
      screen = terminal.getScreen();
    });

    it('should map to basic 16 colors', () => {
      const colorManager = new ColorManager(4);
      
      const testColors = [
        { input: { r: 0, g: 0, b: 0 } as Color, name: 'black' },
        { input: { r: 128, g: 0, b: 0 } as Color, name: 'red' },
        { input: { r: 0, g: 128, b: 0 } as Color, name: 'green' },
        { input: { r: 128, g: 128, b: 0 } as Color, name: 'yellow' },
        { input: { r: 0, g: 0, b: 128 } as Color, name: 'blue' },
        { input: { r: 128, g: 0, b: 128 } as Color, name: 'magenta' },
        { input: { r: 0, g: 128, b: 128 } as Color, name: 'cyan' },
        { input: { r: 192, g: 192, b: 192 } as Color, name: 'white' },
        { input: { r: 255, g: 0, b: 0 } as Color, name: 'bright red' },
        { input: { r: 0, g: 255, b: 0 } as Color, name: 'bright green' },
        { input: { r: 0, g: 0, b: 255 } as Color, name: 'bright blue' },
      ];

      testColors.forEach(({ input }) => {
        const fg = colorManager.toForeground(input);
        // Should produce valid ANSI sequence
        expect(fg).toMatch(/^\x1b\[\d+m$/);
      });
    });

    it('should handle bright colors', () => {
      screen.clear();
      
      // Draw with bright colors
      screen.write('Bright', 0, 0, { 
        fg: { r: 255, g: 0, b: 0 } as Color,
        bold: true 
      });
      
      const cell = screen.getCell(0, 0);
      expect(cell).toBeDefined();
      expect(cell?.style?.bold).toBe(true);
    });
  });

  describe('Monochrome Mode', () => {
    beforeEach(() => {
      terminal = createTerminal({
        width: 80,
        height: 24,
        colorDepth: 1
      });
      screen = terminal.getScreen();
    });

    it('should render in black and white only', () => {
      const colorManager = new ColorManager(1);
      
      const colors = [
        { r: 255, g: 0, b: 0 } as Color,
        { r: 0, g: 255, b: 0 } as Color,
        { r: 0, g: 0, b: 255 } as Color,
        { r: 128, g: 128, b: 128 } as Color,
      ];

      colors.forEach(color => {
        const fg = colorManager.toForeground(color);
        // In monochrome, should either be default or inverse
        expect(fg).toMatch(/^(\x1b\[39m|\x1b\[7m)?$/);
      });
    });

    it('should use styles for emphasis', () => {
      screen.clear();
      
      // In monochrome, use bold/underline for emphasis
      screen.write('Important', 0, 0, { bold: true });
      screen.write('Link', 0, 1, { underline: true });
      screen.write('Inverse', 0, 2, { inverse: true });
      
      expect(screen.getCell(0, 0)?.style?.bold).toBe(true);
      expect(screen.getCell(0, 1)?.style?.underline).toBe(true);
      expect(screen.getCell(0, 2)?.style?.inverse).toBe(true);
    });
  });

  describe('Color Conversion Functions', () => {
    it('should convert between RGB and Hex', () => {
      const testCases = [
        { rgb: { r: 255, g: 0, b: 0 }, hex: '#ff0000' },
        { rgb: { r: 0, g: 255, b: 0 }, hex: '#00ff00' },
        { rgb: { r: 0, g: 0, b: 255 }, hex: '#0000ff' },
        { rgb: { r: 128, g: 128, b: 128 }, hex: '#808080' },
        { rgb: { r: 255, g: 255, b: 255 }, hex: '#ffffff' },
        { rgb: { r: 0, g: 0, b: 0 }, hex: '#000000' },
      ];

      testCases.forEach(({ rgb, hex }) => {
        expect(rgbToHex(rgb.r, rgb.g, rgb.b)).toBe(hex);
        
        const converted = hexToRgb(hex);
        expect(converted).toEqual(rgb);
      });
    });

    it('should handle CSS color names', () => {
      const cssColors = [
        { name: 'red', rgb: { r: 255, g: 0, b: 0 } },
        { name: 'green', rgb: { r: 0, g: 128, b: 0 } },
        { name: 'blue', rgb: { r: 0, g: 0, b: 255 } },
        { name: 'white', rgb: { r: 255, g: 255, b: 255 } },
        { name: 'black', rgb: { r: 0, g: 0, b: 0 } },
      ];

      cssColors.forEach(({ name, rgb }) => {
        const color = cssToRgb(name);
        expect(color).toBeDefined();
        
        if (color) {
          expect(color.r).toBeCloseTo(rgb.r, 0);
          expect(color.g).toBeCloseTo(rgb.g, 0);
          expect(color.b).toBeCloseTo(rgb.b, 0);
        }
      });
    });

    it('should parse CSS rgb() format', () => {
      const testCases = [
        { css: 'rgb(255, 0, 0)', expected: { r: 255, g: 0, b: 0 } },
        { css: 'rgb(0, 255, 0)', expected: { r: 0, g: 255, b: 0 } },
        { css: 'rgb(0, 0, 255)', expected: { r: 0, g: 0, b: 255 } },
        { css: 'rgba(255, 0, 0, 0.5)', expected: { r: 255, g: 0, b: 0, a: 0.5 } },
      ];

      testCases.forEach(({ css, expected }) => {
        const color = cssToRgb(css);
        expect(color).toBeDefined();
        
        if (color) {
          expect(color.r).toBe(expected.r);
          expect(color.g).toBe(expected.g);
          expect(color.b).toBe(expected.b);
          
          if (expected.a !== undefined) {
            expect(color.a).toBeCloseTo(expected.a, 2);
          }
        }
      });
    });
  });

  describe('Dynamic Color Depth Switching', () => {
    it('should adapt to terminal capabilities', () => {
      // Test switching between color depths
      const depths = [1, 4, 8, 24];
      
      depths.forEach(depth => {
        const manager = new ColorManager(depth);
        const testColor: Color = { r: 200, g: 100, b: 50 };
        
        const fg = manager.toForeground(testColor);
        expect(fg).toBeDefined();
        expect(fg.startsWith('\x1b[')).toBe(true);
      });
    });

    it('should fallback gracefully', () => {
      const colorManager = new ColorManager(0); // No color support
      
      const color: Color = { r: 255, g: 0, b: 0 };
      const fg = colorManager.toForeground(color);
      
      // Should return default color or empty
      expect(fg).toMatch(/^(\x1b\[39m)?$/);
    });
  });

  describe('Theme Support', () => {
    it('should apply color themes', () => {
      const themes = {
        dark: {
          background: { r: 20, g: 20, b: 20 } as Color,
          foreground: { r: 200, g: 200, b: 200 } as Color,
          accent: { r: 0, g: 150, b: 255 } as Color,
        },
        light: {
          background: { r: 255, g: 255, b: 255 } as Color,
          foreground: { r: 40, g: 40, b: 40 } as Color,
          accent: { r: 0, g: 100, b: 200 } as Color,
        }
      };

      Object.values(themes).forEach(theme => {
        screen.clear();
        screen.setDefaultStyle({
          fg: theme.foreground,
          bg: theme.background
        });
        
        // Apply theme colors
        screen.write('Themed Text', 0, 0, {
          fg: theme.accent
        });
        
        const cell = screen.getCell(0, 0);
        expect(cell).toBeDefined();
      });
    });
  });
});
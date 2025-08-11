import { it, expect, describe } from 'vitest';

import { ColorDepth } from '../../src/types.js';
import { ColorSystem } from '../../src/core/color.js';

describe('Colors', () => {
  describe('Color Creation', () => {
    it('should create ANSI colors', () => {
      const colors = new ColorSystem(ColorDepth.Basic);
      const red = colors.ansi(1);
      expect(red).toEqual({ type: 'ansi', value: 1, bright: false });
      
      const brightRed = colors.ansi(1, true);
      expect(brightRed).toEqual({ type: 'ansi', value: 1, bright: true });
    });

    it('should create ANSI 256 colors', () => {
      const colors = new ColorSystem(ColorDepth.Extended);
      const color = colors.ansi256(100);
      expect(color).toEqual({ type: 'ansi256', value: 100 });
    });

    it('should create RGB colors', () => {
      const colors = new ColorSystem(ColorDepth.TrueColor);
      const color = colors.rgb(255, 128, 64);
      expect(color).toEqual({ type: 'rgb', r: 255, g: 128, b: 64 });
      
      const colorWithAlpha = colors.rgb(255, 128, 64, 0.5);
      expect(colorWithAlpha).toEqual({ type: 'rgb', r: 255, g: 128, b: 64, a: 0.5 });
    });

    it('should create HSL colors', () => {
      const colors = new ColorSystem(ColorDepth.TrueColor);
      const color = colors.hsl(180, 50, 50);
      expect(color).toEqual({ type: 'hsl', h: 180, s: 50, l: 50 });
      
      const colorWithAlpha = colors.hsl(180, 50, 50, 0.8);
      expect(colorWithAlpha).toEqual({ type: 'hsl', h: 180, s: 50, l: 50, a: 0.8 });
    });

    it('should parse hex colors', () => {
      const colors = new ColorSystem(ColorDepth.TrueColor);
      const color = colors.hex('#FF8040');
      expect(color.type).toBe('rgb');
      expect(color.r).toBe(255);
      expect(color.g).toBe(128);
      expect(color.b).toBe(64);
    });
  });

  describe('Color Conversion', () => {
    const colors = new ColorSystem(ColorDepth.TrueColor);

    it('should convert hex to RGB', () => {
      const rgb = colors.toRGB('#FF8040' as any);
      expect(rgb).toEqual({ type: 'rgb', r: 255, g: 128, b: 64 });
    });

    it('should convert RGB to HSL', () => {
      const rgb = colors.rgb(255, 0, 0);
      const hsl = colors.toHSL(rgb);
      expect(hsl.type).toBe('hsl');
      expect(hsl.h).toBeCloseTo(0, 0);
      expect(hsl.s).toBeCloseTo(100, 0);
      expect(hsl.l).toBeCloseTo(50, 0);
    });

    it('should convert HSL to RGB', () => {
      const hsl = colors.hsl(0, 100, 50);
      const rgb = colors.toRGB(hsl);
      expect(rgb).toEqual({ type: 'rgb', r: 255, g: 0, b: 0 });
    });

    it('should convert RGB to ANSI 256', () => {
      const rgb = colors.rgb(255, 0, 0);
      const ansi256 = colors.toAnsi256(rgb);
      expect(ansi256.type).toBe('ansi256');
      expect(ansi256.value).toBeGreaterThanOrEqual(0);
      expect(ansi256.value).toBeLessThanOrEqual(255);
    });

    it('should convert RGB to ANSI', () => {
      const rgb = colors.rgb(255, 0, 0);
      const ansi = colors.toAnsi(rgb);
      expect(ansi.type).toBe('ansi');
      expect(ansi.value).toBe(1); // Red
    });

    it('should handle special color values', () => {
      expect(colors.toRGB('transparent' as any)).toEqual({ type: 'rgb', r: 0, g: 0, b: 0, a: 0 });
      expect(colors.toRGB('default' as any)).toEqual({ type: 'rgb', r: 255, g: 255, b: 255 });
    });
  });

  describe('Color Manipulation', () => {
    const colors = new ColorSystem(ColorDepth.TrueColor);

    it('should lighten colors', () => {
      const red = colors.rgb(200, 0, 0);
      const lighter = colors.lighten(red, 20);
      const rgb = colors.toRGB(lighter);
      expect(rgb.r).toBeGreaterThan(200);
    });

    it('should darken colors', () => {
      const red = colors.rgb(200, 50, 50);
      const darker = colors.darken(red, 20);
      const rgb = colors.toRGB(darker);
      expect(rgb.r).toBeLessThan(200);
    });

    it('should saturate colors', () => {
      const color = colors.hsl(180, 50, 50);
      const saturated = colors.saturate(color, 25);
      const hsl = colors.toHSL(saturated);
      expect(hsl.s).toBeGreaterThan(50);
    });

    it('should desaturate colors', () => {
      const color = colors.hsl(180, 50, 50);
      const desaturated = colors.desaturate(color, 25);
      const hsl = colors.toHSL(desaturated);
      expect(hsl.s).toBeLessThan(50);
    });

    it('should rotate hue', () => {
      const color = colors.hsl(180, 50, 50);
      const rotated = colors.rotate(color, 60);
      const hsl = colors.toHSL(rotated);
      expect(hsl.h).toBeCloseTo(240, 0);
    });

    it('should mix colors', () => {
      const red = colors.rgb(255, 0, 0);
      const blue = colors.rgb(0, 0, 255);
      const purple = colors.mix(red, blue, 0.5);
      const rgb = colors.toRGB(purple);
      expect(rgb.r).toBe(128);  // Mixed value is rounded
      expect(rgb.g).toBe(0);
      expect(rgb.b).toBe(128);  // Mixed value is rounded
    });
  });

  describe('Escape Sequences', () => {
    it('should generate foreground color sequences', () => {
      const colors = new ColorSystem(ColorDepth.TrueColor);
      const red = colors.ansi(1);
      expect(colors.toForeground(red)).toBe('\x1b[31m');
      
      const brightRed = colors.ansi(1, true);
      expect(colors.toForeground(brightRed)).toBe('\x1b[91m');
    });

    it('should generate background color sequences', () => {
      const colors = new ColorSystem(ColorDepth.TrueColor);
      const red = colors.ansi(1);
      expect(colors.toBackground(red)).toBe('\x1b[41m');
      
      const brightRed = colors.ansi(1, true);
      expect(colors.toBackground(brightRed)).toBe('\x1b[101m');
    });

    it('should generate 256 color sequences', () => {
      const colors = new ColorSystem(ColorDepth.Extended);
      const color = colors.ansi256(100);
      expect(colors.toForeground(color)).toBe('\x1b[38;5;100m');
      expect(colors.toBackground(color)).toBe('\x1b[48;5;100m');
    });

    it('should generate RGB color sequences', () => {
      const colors = new ColorSystem(ColorDepth.TrueColor);
      const color = colors.rgb(255, 128, 64);
      expect(colors.toForeground(color)).toBe('\x1b[38;2;255;128;64m');
      expect(colors.toBackground(color)).toBe('\x1b[48;2;255;128;64m');
    });

    it('should generate reset sequence', () => {
      const colors = new ColorSystem(ColorDepth.TrueColor);
      expect(colors.reset()).toBe('\x1b[39;49m');
    });
  });

  describe('Color Depth Degradation', () => {
    it('should degrade true color to 256 colors', () => {
      const colors = new ColorSystem(ColorDepth.Extended);
      const rgb = colors.rgb(255, 128, 64);
      const sequence = colors.toForeground(rgb);
      expect(sequence).toContain('\x1b[38;5;'); // 256 color format
    });

    it('should degrade 256 colors to basic ANSI', () => {
      const colors = new ColorSystem(ColorDepth.Basic);
      const color = colors.ansi256(100);
      const sequence = colors.toForeground(color);
      expect(sequence).toMatch(/\x1b\[\d{1,2}m/); // Basic ANSI format
    });

    it('should handle no color support', () => {
      const colors = new ColorSystem(ColorDepth.None);
      const red = colors.rgb(255, 0, 0);
      expect(colors.toForeground(red)).toBe('');
      expect(colors.toBackground(red)).toBe('');
    });
  });

  describe('Standard Colors', () => {
    const colors = new ColorSystem(ColorDepth.TrueColor);

    it('should provide standard ANSI colors', () => {
      expect(colors.black).toEqual({ type: 'ansi', value: 0, bright: false });
      expect(colors.red).toEqual({ type: 'ansi', value: 1, bright: false });
      expect(colors.green).toEqual({ type: 'ansi', value: 2, bright: false });
      expect(colors.yellow).toEqual({ type: 'ansi', value: 3, bright: false });
      expect(colors.blue).toEqual({ type: 'ansi', value: 4, bright: false });
      expect(colors.magenta).toEqual({ type: 'ansi', value: 5, bright: false });
      expect(colors.cyan).toEqual({ type: 'ansi', value: 6, bright: false });
      expect(colors.white).toEqual({ type: 'ansi', value: 7, bright: false });
    });

    it('should provide bright standard colors', () => {
      expect(colors.brightBlack).toEqual({ type: 'ansi', value: 0, bright: true });
      expect(colors.brightRed).toEqual({ type: 'ansi', value: 1, bright: true });
      expect(colors.brightGreen).toEqual({ type: 'ansi', value: 2, bright: true });
      expect(colors.brightYellow).toEqual({ type: 'ansi', value: 3, bright: true });
      expect(colors.brightBlue).toEqual({ type: 'ansi', value: 4, bright: true });
      expect(colors.brightMagenta).toEqual({ type: 'ansi', value: 5, bright: true });
      expect(colors.brightCyan).toEqual({ type: 'ansi', value: 6, bright: true });
      expect(colors.brightWhite).toEqual({ type: 'ansi', value: 7, bright: true });
    });
  });

  describe('Color Validation', () => {
    const colors = new ColorSystem(ColorDepth.TrueColor);

    it('should clamp RGB values', () => {
      const color = colors.rgb(300, -50, 128);
      expect(color).toEqual({ type: 'rgb', r: 255, g: 0, b: 128 });
    });

    it('should clamp HSL values', () => {
      const color = colors.hsl(400, 120, -10);
      expect(color).toEqual({ type: 'hsl', h: 40, s: 100, l: 0 });
    });

    it('should validate ANSI 256 values', () => {
      const color1 = colors.ansi256(-10);
      expect(color1.value).toBe(0);
      
      const color2 = colors.ansi256(300);
      expect(color2.value).toBe(255);
    });

    it('should validate hex colors', () => {
      // Test valid 3-digit hex
      const color1 = colors.hex('#FFF');
      expect(color1.type).toBe('rgb');
      expect(color1.r).toBe(255);
      expect(color1.g).toBe(255);
      expect(color1.b).toBe(255);
      
      // Test valid 6-digit hex
      const color2 = colors.hex('#123456');
      expect(color2.type).toBe('rgb');
      expect(color2.r).toBe(18);
      expect(color2.g).toBe(52);
      expect(color2.b).toBe(86);
      
      // Test without hash
      const color3 = colors.hex('FF0000');
      expect(color3.type).toBe('rgb');
      expect(color3.r).toBe(255);
      expect(color3.g).toBe(0);
      expect(color3.b).toBe(0);
    });
  });
});
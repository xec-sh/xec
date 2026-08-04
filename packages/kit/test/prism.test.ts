/**
 * @vitest-environment node
 */

import { it, expect, describe, afterEach } from 'vitest';

import { createPrism } from '../src/prism/core/prism.js';
import { ColorLevel, detectColorSupport } from '../src/prism/utils/supports.js';

describe('prism', () => {
  describe('enabled option', () => {
    /**
     * Regression: applyStyle only consulted `level`, never `enabled`, so
     * `createPrism({ enabled: false })` (and therefore NO_COLOR handling in
     * createPrism, which works by setting enabled=false) still emitted ANSI
     * codes whenever a color level was detected.
     */
    it('does not emit ANSI codes when enabled is false', () => {
      const p = createPrism({ level: ColorLevel.TrueColor, enabled: false });

      expect(p.red('x')).toBe('x');
      expect(p.bold.underline('x')).toBe('x');
      expect(p.rgb(255, 0, 0)('x')).toBe('x');
    });

    it('emits ANSI codes when enabled is true', () => {
      const p = createPrism({ level: ColorLevel.Basic, enabled: true });

      expect(p.red('x')).toBe('\x1b[31mx\x1b[39m');
    });

    it('visible produces empty output when disabled', () => {
      const p = createPrism({ level: ColorLevel.Basic, enabled: false });

      expect(p.visible.red('secret')).toBe('');
    });
  });

  describe('color channel clamping', () => {
    /**
     * Regression: rgb(300, -5, 12.7) emitted the raw values into the escape
     * sequence (`38;2;300;-5;12.7`), which is not valid ANSI and renders as
     * garbage in real terminals. The spec (prism-spec.md, Error Handling)
     * requires clamping to 255.
     */
    it('clamps out-of-range rgb channels to 0-255 integers', () => {
      const p = createPrism({ level: ColorLevel.TrueColor, enabled: true });

      expect(p.rgb(300, -5, 12.7)('x')).toBe('\x1b[38;2;255;0;13mx\x1b[39m');
      expect(p.bgRgb(300, -5, 12.7)('x')).toBe('\x1b[48;2;255;0;13mx\x1b[49m');
    });

    it('clamps ansi256 codes to 0-255', () => {
      const p = createPrism({ level: ColorLevel.Ansi256, enabled: true });

      expect(p.ansi256(300)('x')).toBe('\x1b[38;5;255mx\x1b[39m');
      expect(p.bgAnsi256(-1)('x')).toBe('\x1b[48;5;0mx\x1b[49m');
    });
  });

  describe('environment detection', () => {
    const saved = {
      NO_COLOR: process.env['NO_COLOR'],
      FORCE_COLOR: process.env['FORCE_COLOR'],
    };

    afterEach(() => {
      if (saved.NO_COLOR === undefined) delete process.env['NO_COLOR'];
      else process.env['NO_COLOR'] = saved.NO_COLOR;
      if (saved.FORCE_COLOR === undefined) delete process.env['FORCE_COLOR'];
      else process.env['FORCE_COLOR'] = saved.FORCE_COLOR;
    });

    it('NO_COLOR disables color detection entirely', () => {
      process.env['NO_COLOR'] = '1';
      delete process.env['FORCE_COLOR'];

      expect(detectColorSupport().level).toBe(ColorLevel.None);
    });

    it('FORCE_COLOR=3 enables truecolor even without a TTY', () => {
      delete process.env['NO_COLOR'];
      process.env['FORCE_COLOR'] = '3';

      expect(detectColorSupport().level).toBe(ColorLevel.TrueColor);
    });
  });

  describe('nesting', () => {
    it('re-opens outer style after a nested style closes', () => {
      const p = createPrism({ level: ColorLevel.Basic, enabled: true });

      const out = p.red(`a ${p.green('b')} c`);
      // after green's close, red must be re-established before " c"
      const afterGreen = out.slice(out.indexOf('\x1b[39m') + 5);
      expect(afterGreen).toContain('\x1b[31m');
      expect(out.endsWith('\x1b[39m')).toBe(true);
    });

    it('re-applies style after line breaks', () => {
      const p = createPrism({ level: ColorLevel.Basic, enabled: true });

      const out = p.red('a\nb');
      expect(out).toBe('\x1b[31ma\x1b[39m\n\x1b[31mb\x1b[39m');
    });
  });
});

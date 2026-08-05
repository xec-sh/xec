/**
 * @vitest-environment node
 */

import { it, expect, describe, afterEach } from 'vitest';

import { prism } from '../src/prism/index.js';
import { createPrism } from '../src/prism/core/prism.js';
import { PrismBuilderInstance } from '../src/prism/core/builder.js';
import { stripAnsi, ansi256ToRgb } from '../src/prism/utils/ansi.js';
import { ColorLevel, clearColorCache, detectColorSupport } from '../src/prism/utils/supports.js';

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

  describe('color transforms', () => {
    const truecolor = () => createPrism({ level: ColorLevel.TrueColor, enabled: true });

    describe('lighten / darken', () => {
      it('lighten shifts HSL lightness up', () => {
        // #ff0000 = hsl(0, 100%, 50%); +0.2 -> l=70% -> rgb(255, 102, 102)
        expect(truecolor().hex('#ff0000').lighten(0.2)('x')).toBe(
          '\x1b[38;2;255;102;102mx\x1b[39m'
        );
      });

      it('darken shifts HSL lightness down', () => {
        // l=50% - 20% = 30% -> rgb(153, 0, 0)
        expect(truecolor().hex('#ff0000').darken(0.2)('x')).toBe('\x1b[38;2;153;0;0mx\x1b[39m');
      });

      it('lightness clamps to 100% and 0%', () => {
        expect(truecolor().hex('#ff0000').lighten(5)('x')).toBe('\x1b[38;2;255;255;255mx\x1b[39m');
        expect(truecolor().hex('#ff0000').darken(5)('x')).toBe('\x1b[38;2;0;0;0mx\x1b[39m');
      });
    });

    describe('saturate / desaturate', () => {
      it('saturate shifts HSL saturation up', () => {
        // rgb(191, 64, 64) = hsl(0, 50%, 50%); +0.5 -> s=100% -> rgb(255, 0, 0)
        expect(truecolor().rgb(191, 64, 64).saturate(0.5)('x')).toBe('\x1b[38;2;255;0;0mx\x1b[39m');
      });

      it('desaturate shifts HSL saturation down', () => {
        // s=50% - 50% = 0% -> gray at l=50% -> rgb(128, 128, 128)
        expect(truecolor().rgb(191, 64, 64).desaturate(0.5)('x')).toBe(
          '\x1b[38;2;128;128;128mx\x1b[39m'
        );
      });

      it('saturation clamps to 100%', () => {
        expect(truecolor().rgb(191, 64, 64).saturate(9)('x')).toBe('\x1b[38;2;255;0;0mx\x1b[39m');
      });
    });

    describe('rotate', () => {
      it('rotates hue by positive degrees', () => {
        expect(truecolor().hex('#ff0000').rotate(120)('x')).toBe('\x1b[38;2;0;255;0mx\x1b[39m');
      });

      it('normalizes negative rotation onto the 0-360 circle', () => {
        expect(truecolor().hex('#ff0000').rotate(-120)('x')).toBe('\x1b[38;2;0;0;255mx\x1b[39m');
      });

      it('wraps rotation beyond 360 degrees', () => {
        expect(truecolor().hex('#ff0000').rotate(480)('x')).toBe(
          truecolor().hex('#ff0000').rotate(120)('x')
        );
      });
    });

    describe('invert', () => {
      it('inverts each channel', () => {
        expect(truecolor().hex('#0000ff').invert()('x')).toBe('\x1b[38;2;255;255;0mx\x1b[39m');
      });

      it('operates on the clamped channels of an out-of-range input', () => {
        // rgb(300, -5, 12.7) clamps to (255, 0, 13); invert -> (0, 255, 242)
        expect(truecolor().rgb(300, -5, 12.7).invert()('x')).toBe('\x1b[38;2;0;255;242mx\x1b[39m');
      });
    });

    describe('grayscale', () => {
      it('converts to luminance-weighted gray (0.299/0.587/0.114)', () => {
        // 0.299 * 255 = 76.245 -> 76
        expect(truecolor().hex('#ff0000').grayscale()('x')).toBe('\x1b[38;2;76;76;76mx\x1b[39m');
        // 0.587 * 255 = 149.685 -> 150
        expect(truecolor().hex('#00ff00').grayscale()('x')).toBe('\x1b[38;2;150;150;150mx\x1b[39m');
      });
    });

    describe('mix', () => {
      it('mixes halfway by default', () => {
        expect(truecolor().hex('#ff0000').mix('#0000ff')('x')).toBe(
          '\x1b[38;2;128;0;128mx\x1b[39m'
        );
      });

      it('accepts an [r, g, b] tuple and a ratio', () => {
        expect(truecolor().hex('#ff0000').mix([0, 0, 255], 0.25)('x')).toBe(
          '\x1b[38;2;191;0;64mx\x1b[39m'
        );
      });

      it('accepts CSS color names', () => {
        expect(truecolor().hex('#000000').mix('white')('x')).toBe(
          '\x1b[38;2;128;128;128mx\x1b[39m'
        );
      });

      it('clamps the ratio to 0-1', () => {
        expect(truecolor().hex('#ff0000').mix('#0000ff', 5)('x')).toBe(
          '\x1b[38;2;0;0;255mx\x1b[39m'
        );
        expect(truecolor().hex('#ff0000').mix('#0000ff', -3)('x')).toBe(
          '\x1b[38;2;255;0;0mx\x1b[39m'
        );
      });

      it('is a no-op for an unparseable target color', () => {
        expect(truecolor().hex('#ff0000').mix('nonsense')('x')).toBe('\x1b[38;2;255;0;0mx\x1b[39m');
      });
    });

    describe('no-op without a transformable foreground color', () => {
      const transforms: Array<[string, (p: PrismBuilderInstance) => PrismBuilderInstance]> = [
        ['mix', (p) => p.mix('#0000ff')],
        ['lighten', (p) => p.lighten(0.2)],
        ['darken', (p) => p.darken(0.2)],
        ['saturate', (p) => p.saturate(0.2)],
        ['desaturate', (p) => p.desaturate(0.2)],
        ['rotate', (p) => p.rotate(120)],
        ['invert', (p) => p.invert()],
        ['grayscale', (p) => p.grayscale()],
      ];

      it.each(transforms)('%s passes text through when no color is set', (_name, apply) => {
        expect(apply(truecolor())('x')).toBe('x');
      });

      it.each(transforms)('%s keeps modifier-only chains unchanged', (_name, apply) => {
        expect(apply(truecolor().bold)('x')).toBe('\x1b[1mx\x1b[22m');
      });

      it.each(transforms)('%s does not touch named 16-colors', (_name, apply) => {
        // .red is rendered by the terminal palette; its RGB is unknown
        expect(apply(truecolor().red)('x')).toBe('\x1b[31mx\x1b[39m');
      });

      it('a named color applied after an RGB color clears the tracked color', () => {
        expect(truecolor().hex('#ff0000').green.lighten(0.2)('x')).toBe(
          '\x1b[38;2;255;0;0m\x1b[32mx\x1b[39m\x1b[39m'
        );
      });

      it('reset clears the tracked color', () => {
        expect(truecolor().hex('#ff0000').reset.lighten(0.2)('x')).toBe(
          '\x1b[38;2;255;0;0m\x1b[0mx\x1b[0m\x1b[39m'
        );
      });

      it('non-finite arguments are a no-op', () => {
        const red = '\x1b[38;2;255;0;0mx\x1b[39m';
        expect(truecolor().hex('#ff0000').lighten(Number.NaN)('x')).toBe(red);
        expect(truecolor().hex('#ff0000').rotate(Infinity)('x')).toBe(red);
        expect(truecolor().hex('#ff0000').mix('#0000ff', Number.NaN)('x')).toBe(red);
        expect(truecolor().hex('#ff0000').mix([0, Number.NaN, 255])('x')).toBe(red);
      });
    });

    describe('interaction with other styles', () => {
      it('transforms the color through a later modifier', () => {
        expect(truecolor().hex('#ff0000').bold.lighten(0.2)('x')).toBe(
          '\x1b[38;2;255;102;102m\x1b[1mx\x1b[22m\x1b[39m'
        );
      });

      it('keeps working when the modifier comes after the transform', () => {
        expect(truecolor().hex('#ff0000').lighten(0.2).bold('x')).toBe(
          '\x1b[38;2;255;102;102m\x1b[1mx\x1b[22m\x1b[39m'
        );
      });

      it('leaves background colors untouched', () => {
        expect(truecolor().hex('#ff0000').bgHex('#0000ff').lighten(0.2)('x')).toBe(
          '\x1b[38;2;255;102;102m\x1b[48;2;0;0;255mx\x1b[49m\x1b[39m'
        );
      });

      it('transforms only the most recent foreground color', () => {
        expect(truecolor().hex('#ff0000').hex('#00ff00').lighten(0.2)('x')).toBe(
          '\x1b[38;2;255;0;0m\x1b[38;2;102;255;102mx\x1b[39m\x1b[39m'
        );
      });

      it('transforms compose', () => {
        expect(truecolor().hex('#ff0000').rotate(120).lighten(0.2)('x')).toBe(
          '\x1b[38;2;102;255;102mx\x1b[39m'
        );
      });

      it('re-opens the transformed color after a nested style closes', () => {
        const p = truecolor();
        const out = p.hex('#ff0000').lighten(0.2)(`a ${p.green('b')} c`);
        expect(out).toContain('\x1b[39m\x1b[38;2;255;102;102m');
        expect(out.endsWith('\x1b[39m')).toBe(true);
      });
    });

    describe('level degradation', () => {
      it('re-encodes the transformed color as 16-color at Basic level', () => {
        const p = createPrism({ level: ColorLevel.Basic, enabled: true });
        // rgb(255, 102, 102) -> bright red (91)
        expect(p.hex('#ff0000').lighten(0.2)('x')).toBe('\x1b[91mx\x1b[39m');
      });

      it('re-encodes the transformed color as 256-color at Ansi256 level', () => {
        const p = createPrism({ level: ColorLevel.Ansi256, enabled: true });
        // rgb(255, 102, 102) -> ansi256 code 210
        expect(p.hex('#ff0000').lighten(0.2)('x')).toBe('\x1b[38;5;210mx\x1b[39m');
      });

      it('transforms colors set via ansi256()', () => {
        const p = createPrism({ level: ColorLevel.Ansi256, enabled: true });
        // code 196 = rgb(255, 0, 0); lighten -> rgb(255, 102, 102) -> code 210
        expect(p.ansi256(196).lighten(0.2)('x')).toBe('\x1b[38;5;210mx\x1b[39m');
      });

      it('emits nothing at level None and when disabled', () => {
        const none = createPrism({ level: ColorLevel.None, enabled: true });
        expect(none.hex('#ff0000').lighten(0.2)('x')).toBe('x');

        const disabled = createPrism({ level: ColorLevel.TrueColor, enabled: false });
        expect(disabled.hex('#ff0000').lighten(0.2)('x')).toBe('x');
      });
    });

    describe('level degradation via FORCE_COLOR', () => {
      const saved = {
        NO_COLOR: process.env['NO_COLOR'],
        FORCE_COLOR: process.env['FORCE_COLOR'],
      };

      afterEach(() => {
        if (saved.NO_COLOR === undefined) delete process.env['NO_COLOR'];
        else process.env['NO_COLOR'] = saved.NO_COLOR;
        if (saved.FORCE_COLOR === undefined) delete process.env['FORCE_COLOR'];
        else process.env['FORCE_COLOR'] = saved.FORCE_COLOR;
        clearColorCache();
      });

      it('FORCE_COLOR=2 downgrades transformed colors to 256 colors', () => {
        delete process.env['NO_COLOR'];
        process.env['FORCE_COLOR'] = '2';
        clearColorCache();

        const p = createPrism();
        expect(p.hex('#ff0000').lighten(0.2)('x')).toBe('\x1b[38;5;210mx\x1b[39m');
      });
    });

    /**
     * Every code block in prism-spec.md must run as written. The blocks
     * with documented outputs are asserted byte-for-byte here; the rest
     * must at least style the text without altering it.
     */
    describe('spec examples', () => {
      it('import block', () => {
        expect(stripAnsi(prism.red('Error'))).toBe('Error');
        expect(stripAnsi(prism.green.bold('Success'))).toBe('Success');
        expect(stripAnsi(prism.bgBlue.white('Info'))).toBe('Info');
        expect(stripAnsi(prism.bold.italic.underline.red('Important'))).toBe('Important');
      });

      it('builder call joins several arguments with a space', () => {
        expect(prism.red('one', 'two')).toBe(prism.red('one two'));
      });

      it('colors-by-value block', () => {
        const lines = [
          prism.rgb(255, 128, 0)('Orange'),
          prism.rgb('#ff8000')('Orange'),
          prism.rgb('rgb(255, 128, 0)')('Orange'),
          prism.hex('#ff8000')('Orange'),
          prism.hsl(30, 100, 50)('Orange'),
          prism.hsv(30, 100, 100)('Orange'),
          prism.css('dodgerblue')('Blue'),
          prism.ansi256(208)('Orange'),
          prism.bgHex('#003366').whiteBright('Label'),
        ];
        for (const line of lines) {
          expect(stripAnsi(line)).toMatch(/^(Orange|Blue|Label)$/);
        }
      });

      it('color transforms block produces the documented colors', () => {
        const p = createPrism({ level: ColorLevel.TrueColor });

        expect(p.hex('#ff0000').lighten(0.2)('text')).toBe('\x1b[38;2;255;102;102mtext\x1b[39m');
        expect(p.hex('#ff0000').darken(0.2)('text')).toBe('\x1b[38;2;153;0;0mtext\x1b[39m');
        expect(p.rgb(191, 64, 64).saturate(0.5)('text')).toBe('\x1b[38;2;255;0;0mtext\x1b[39m');
        expect(p.rgb(191, 64, 64).desaturate(0.5)('text')).toBe(
          '\x1b[38;2;128;128;128mtext\x1b[39m'
        );
        expect(p.hex('#ff0000').rotate(120)('text')).toBe('\x1b[38;2;0;255;0mtext\x1b[39m');
        expect(p.hex('#0000ff').invert()('text')).toBe('\x1b[38;2;255;255;0mtext\x1b[39m');
        expect(p.hex('#ff0000').grayscale()('text')).toBe('\x1b[38;2;76;76;76mtext\x1b[39m');
        expect(p.hex('#ff0000').mix('#0000ff')('text')).toBe('\x1b[38;2;128;0;128mtext\x1b[39m');
        expect(p.hex('#ff0000').mix([0, 0, 255], 0.25)('text')).toBe(
          '\x1b[38;2;191;0;64mtext\x1b[39m'
        );
        expect(p.hex('#ff0000').lighten(0.2).bold('text')).toBe(
          '\x1b[38;2;255;102;102m\x1b[1mtext\x1b[22m\x1b[39m'
        );
      });

      it('nesting block', () => {
        expect(stripAnsi(prism.red(`outer ${prism.blue('inner')} outer again`))).toBe(
          'outer inner outer again'
        );
        expect(createPrism({ level: 1 }).red('a\nb')).toBe('\x1b[31ma\x1b[39m\n\x1b[31mb\x1b[39m');
      });

      it('instances block', () => {
        expect(prism.strip('\x1b[31mred\x1b[39m')).toBe('red');
        expect(prism.stringLength(prism.red('red'))).toBe(3);
        expect(typeof prism.supportsColor()).toBe('boolean');
        expect([0, 1, 2, 3]).toContain(prism.colorLevel());
        expect(typeof prism.create).toBe('function');
        expect(stripAnsi(prism.stderr.red('err'))).toBe('err');
      });
    });

    describe('ansi256ToRgb', () => {
      it('maps the canonical 16-color palette', () => {
        expect(ansi256ToRgb(9)).toEqual({ r: 255, g: 0, b: 0 });
        expect(ansi256ToRgb(15)).toEqual({ r: 255, g: 255, b: 255 });
      });

      it('maps the 6x6x6 color cube', () => {
        expect(ansi256ToRgb(21)).toEqual({ r: 0, g: 0, b: 255 });
        expect(ansi256ToRgb(196)).toEqual({ r: 255, g: 0, b: 0 });
      });

      it('maps the grayscale ramp', () => {
        expect(ansi256ToRgb(232)).toEqual({ r: 8, g: 8, b: 8 });
        expect(ansi256ToRgb(255)).toEqual({ r: 238, g: 238, b: 238 });
      });

      it('clamps out-of-range codes', () => {
        expect(ansi256ToRgb(300)).toEqual(ansi256ToRgb(255));
        expect(ansi256ToRgb(-5)).toEqual(ansi256ToRgb(0));
      });
    });
  });
});

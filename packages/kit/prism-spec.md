# Prism

Prism is the terminal color system of `@xec-sh/kit`: a chainable builder for
ANSI styling in the chalk tradition, with color transforms, terminal
capability detection and zero dependencies. It ships inside the kit package;
it is not published separately.

This document describes what is implemented. The examples run as written;
the color-math examples are asserted byte-for-byte in `test/prism.test.ts`
("spec examples").

## Import

```typescript
import { prism, createPrism, ColorLevel } from '@xec-sh/kit';

prism.red('Error');
prism.green.bold('Success');
prism.bgBlue.white('Info');
prism.bold.italic.underline.red('Important');
```

`prism` is a ready instance bound to stdout capabilities. `createPrism`
builds instances with explicit options (see "Instances").

## Module layout

```
packages/kit/src/prism/
├── core/
│   ├── prism.ts      # createPrism factory, default instance
│   └── builder.ts    # chainable style builder
├── color/
│   ├── spaces.ts     # RGB/HSL/HSV/LAB/LCH/XYZ conversions
│   └── parser.ts     # color string parsing (hex, CSS names, rgb(), hsl())
├── utils/
│   ├── ansi.ts       # ANSI sequences, strip, string length
│   └── supports.ts   # terminal capability detection
└── index.ts          # public exports
```

## The builder

Every chain link is itself callable. Calling it styles the text and returns
a plain string; several arguments are joined with a single space. Styling an
empty string returns an empty string. A style function never throws at
render time: invalid input degrades to a no-op, never to an exception.

```typescript
prism.red('one');
prism.red('one', 'two'); // same as prism.red('one two')
```

### Modifiers

`reset`, `bold`, `dim`, `italic`, `underline`, `overline`, `inverse`,
`hidden`, `strikethrough` — standard SGR attributes, chainable in any order.

`visible` renders its text only when colors are enabled: with colors
disabled (level 0 or `enabled: false`) the styled text becomes an empty
string instead of passing through unstyled.

### Named colors

Foreground: `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`,
`white`, plus `Bright` variants (`redBright`, ...) and the aliases `gray`,
`grey` (both map to `blackBright`).

Background: the same set prefixed with `bg` (`bgRed`, `bgCyanBright`,
`bgGray`, ...).

Named colors emit 4-bit codes; the terminal's own palette decides how they
actually look. For that reason they carry no RGB value and color transforms
do not apply to them (see below).

### Colors by value

| Method                            | Input                          | Notes                                                      |
| --------------------------------- | ------------------------------ | ---------------------------------------------------------- |
| `rgb(r, g, b)` / `bgRgb(r, g, b)` | channels 0-255                 | out-of-range and fractional values clamp to 0-255 integers |
| `rgb(str)` / `bgRgb(str)`         | any parseable color string     | hex, CSS name, `rgb()`/`rgba()`, `hsl()`/`hsla()`          |
| `hex(str)` / `bgHex(str)`         | `#rgb`, `#rrggbb`, `#rrggbbaa` | alpha digits are ignored                                   |
| `hsl(h, s, l)` / `bgHsl(h, s, l)` | h 0-360, s/l 0-100             | converted to RGB                                           |
| `hsv(h, s, v)` / `bgHsv(h, s, v)` | h 0-360, s/v 0-100             | converted to RGB                                           |
| `css(name)` / `bgCss(name)`       | CSS color name                 | same as `rgb(name)`                                        |
| `ansi256(n)` / `bgAnsi256(n)`     | palette code 0-255             | clamped; no-op below level 2                               |

An unparseable string is a no-op: the chain is returned unchanged and the
text renders with whatever styles were already applied.

```typescript
prism.rgb(255, 128, 0)('Orange');
prism.rgb('#ff8000')('Orange');
prism.rgb('rgb(255, 128, 0)')('Orange');
prism.hex('#ff8000')('Orange');
prism.hsl(30, 100, 50)('Orange');
prism.hsv(30, 100, 100)('Orange');
prism.css('dodgerblue')('Blue');
prism.ansi256(208)('Orange');
prism.bgHex('#003366').whiteBright('Label');
```

### Color transforms

Transforms derive a new foreground color from the current one and replace
it in the chain. They apply to the most recent foreground color whose RGB
Prism knows — one set through `rgb`, `hex`, `hsl`, `hsv`, `css` or
`ansi256`. When there is no such color (nothing set yet, a modifier-only
chain, or a named 16-color / `reset` applied last), a transform is a no-op
returning the chain unchanged. Backgrounds are never transformed.

All results clamp to valid ranges; non-finite arguments (`NaN`,
`Infinity`) are no-ops. The transformed color is re-encoded for the active
color level, following the same truecolor → 256 → 16 downgrade path as any
directly set color.

| Transform                 | Meaning                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `mix(color, ratio = 0.5)` | blend toward `color` (any parseable string or `[r, g, b]` tuple); ratio clamps to 0-1: 0 keeps the current color, 1 replaces it |
| `lighten(amount)`         | HSL lightness +amount, on a 0-1 scale                                                                                           |
| `darken(amount)`          | HSL lightness −amount                                                                                                           |
| `saturate(amount)`        | HSL saturation +amount, on a 0-1 scale                                                                                          |
| `desaturate(amount)`      | HSL saturation −amount                                                                                                          |
| `rotate(degrees)`         | hue rotation, wraps around the 0-360 circle                                                                                     |
| `invert()`                | channel-wise inversion (255 − value)                                                                                            |
| `grayscale()`             | luminance-weighted gray (0.299 R + 0.587 G + 0.114 B)                                                                           |

```typescript
const p = createPrism({ level: ColorLevel.TrueColor });

p.hex('#ff0000').lighten(0.2)('text'); // rgb(255, 102, 102)
p.hex('#ff0000').darken(0.2)('text'); // rgb(153, 0, 0)
p.rgb(191, 64, 64).saturate(0.5)('text'); // rgb(255, 0, 0)
p.rgb(191, 64, 64).desaturate(0.5)('text'); // rgb(128, 128, 128)
p.hex('#ff0000').rotate(120)('text'); // rgb(0, 255, 0)
p.hex('#0000ff').invert()('text'); // rgb(255, 255, 0)
p.hex('#ff0000').grayscale()('text'); // rgb(76, 76, 76)
p.hex('#ff0000').mix('#0000ff')('text'); // rgb(128, 0, 128)
p.hex('#ff0000').mix([0, 0, 255], 0.25)('text'); // rgb(191, 0, 64)
p.hex('#ff0000').lighten(0.2).bold('text'); // lightened, then bold
```

Transforms track the full-precision RGB value, not the emitted escape
sequence: at a 16-color level `p.hex('#ff0000').lighten(0.2)` computes
rgb(255, 102, 102) first and only then downgrades it to the nearest 4-bit
code.

## Color levels

```typescript
enum ColorLevel {
  None = 0, // no colors
  Basic = 1, // 16 colors
  Ansi256 = 2, // 256 colors
  TrueColor = 3, // 24-bit
}
```

RGB-valued colors degrade to the active level: truecolor sequences at level
3, the nearest 256-color code at level 2, the nearest 4-bit code at level 1,
and nothing at level 0. `ansi256()` emits its code at levels 2-3 and is a
no-op below. At level 0, or when the instance is disabled, text passes
through unstyled.

`level` is readable and writable on an instance (`p.level = 2`); the value
is shared by all chains derived from that instance. `enabled` is read-only
on the builder and reflects `enabled && level > 0`.

Colors are encoded at the moment they are added to a chain. Lowering the
level afterwards does not re-encode chains that were already built; level 0
still suppresses all output at render time.

## Environment detection

`detectColorSupport(stream)` decides the level, in order:

1. `NO_COLOR` set, or `FORCE_COLOR` = `0`/`false` → None.
2. `FORCE_COLOR` = `1`/`true` → Basic, `2` → Ansi256, `3` → TrueColor.
3. Not a TTY → None, except recognized CI environments (Travis, CircleCI,
   AppVeyor, GitLab CI, GitHub Actions, Buildkite, Drone) → Basic.
4. Windows → Basic (TrueColor when `OS_RELEASE` reports build 14931+).
5. `TERM` heuristics: `*-256color` → Ansi256, upgraded to TrueColor when
   `COLORTERM` is `truecolor`/`24bit` or `TERM_PROGRAM` is iTerm/Hyper/
   vscode; `color|ansi|cygwin|linux` → Basic; `dumb` or unset → None;
   anything else → Basic.

Results are cached per stream (`stdoutColor()`, `stderrColor()`);
`clearColorCache()` resets the cache, which matters in tests that change
the environment.

## Instances

```typescript
const p = createPrism({ level: ColorLevel.Ansi256, enabled: true });
const perr = createPrismStderr();
```

`createPrism(options)` — level defaults to the detected stdout level,
`enabled` defaults to true; `NO_COLOR` or `FORCE_COLOR=0|false` in the
environment force `enabled: false`. `createPrismStderr(options)` detects
from stderr.

The default `prism` instance additionally carries:

```typescript
prism.create(options); // alias of createPrism
prism.stderr; // instance bound to stderr
prism.strip('\x1b[31mred\x1b[39m'); // 'red'
prism.stringLength(prism.red('red')); // 3 — visible length
prism.supportsColor(); // boolean, from stdout detection
prism.colorLevel(); // detected ColorLevel
```

## Nesting and line breaks

Styled strings nest: after an inner style closes, the outer style is
re-opened, including a transformed foreground color. Multiline text is
re-styled per line so the styling survives line-based processing.

```typescript
prism.red(`outer ${prism.blue('inner')} outer again`);
createPrism({ level: 1 }).red('a\nb'); // '\x1b[31ma\x1b[39m\n\x1b[31mb\x1b[39m'
```

## Module exports

Builder and instances: `prism` (default and named), `createPrism`,
`createPrismStderr`, `PrismBuilder`.

Detection: `ColorLevel`, `stdoutColor`, `stderrColor`, `isColorEnabled`,
`getBestColorMethod`.

String utilities: `strip`, `stringLength`, `hasAnsi`.

Parsing: `parseColor`, `isValidColor`, `getCssColor`, `getCssColorNames`.

Conversions (plain functions over `{ r, g, b }`-style objects): `mixRgb`,
`rgbToHsl`, `hslToRgb`, `rgbToHsv`, `hsvToRgb`, `rgbToLab`, `labToRgb`,
`rgbToLch`, `lchToRgb`, `hexToRgb`, `rgbToHex`, `luminance`,
`contrastRatio`.

Types: `PrismOptions`, `PrismInstance`, `PrismUtilities`, `RGB`, `HSL`,
`HSV`, `LAB`, `LCH`.

## Non-goals and open questions

None of the following exists. The list records direction that has been
discussed, not a commitment; nothing here should be read as a promise.

- Gradients, animations, rainbow/pattern effects.
- A theme system (`defineTheme`, semantic styles).
- A tagged template literal API (`` prism`{red Error}` ``).
- Palette generation (complementary/triadic/analogous).
- Color-blindness simulation and automatic contrast selection; the
  `luminance` and `contrastRatio` primitives exist for building such tools.
- `lab()`/`lch()` builder methods; the conversions exist as functions.
- `format`/`batch`/`compile` helpers and a global `configure()`.

---
title: Colors & Theming
description: The prism color builder and the theme that restyles every component at once
---

# Colors & Theming

Two layers: `prism` builds ANSI-colored strings; the theme decides which colors the kit's own components use.

## prism

A chainable color builder with automatic capability detection — truecolor, 256, 16 colors, or none, downsampled to what the terminal supports:

```typescript
import { prism } from '@xec-sh/kit';

console.log(prism.red('Error'));
console.log(prism.bold.cyan('Heading'));
console.log(prism.bgYellow.black(' WARN '));

// Any color model; rendered at the terminal's best level
console.log(prism.hex('#ff0000')('exact red'));
console.log(prism.rgb(0, 255, 0)('green'));
console.log(prism.hsl(200, 100, 50)('blue'));
console.log(prism.css('rebeccapurple')('CSS named color'));
```

### Styles and Colors

- Modifiers: `bold`, `dim`, `italic`, `underline`, `overline`, `inverse`, `hidden`, `strikethrough`, `visible`, `reset`
- Named colors: `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `gray`, plus `*Bright` variants
- Backgrounds: `bgRed`, `bgCyanBright`, `bgHex('#222')`, ...
- Color models: `hex`, `rgb`, `hsl`, `hsv`, `css` — each with a `bg` twin

### Color Math

Transforms apply to the current color of the chain:

```typescript
prism.hex('#3b82f6').lighten(0.2)('lighter blue');
prism.red.desaturate(0.5)('muted red');
```

Available: `mix(color, ratio)`, `lighten`, `darken`, `saturate`, `desaturate`, `rotate(degrees)`, `invert()`, `grayscale()`.

### Detection and Control

Color support is detected per stream; `NO_COLOR` and `FORCE_COLOR=0` disable colors entirely.

```typescript
import { prism, ColorLevel } from '@xec-sh/kit';

prism.colorLevel();          // ColorLevel: None | Basic | Ansi256 | TrueColor
prism.supportsColor();       // boolean
prism.strip(styled);         // remove ANSI codes
prism.stringLength(styled);  // visible length
prism.stderr.red('to stderr');            // instance bound to stderr detection
const forced = prism.create({ level: ColorLevel.TrueColor });
```

## The Theme

Components never name colors — they name roles, and the theme maps roles to colors. Seven roles cover the kit:

| Role | Used for |
|------|----------|
| `accent` | Focus and selection: the active step, the highlighted option |
| `activity` | Motion: spinner frames, progress fill |
| `success` | A completed step, a passing state |
| `warning` | Needs attention, not failed |
| `error` | Failed, cancelled, invalid |
| `info` | Neutral information |
| `muted` | Structure: bars, frames, hints, disabled entries |

The default maps `accent` to cyan and `activity` to magenta over the conventional green/yellow/red status triad.

### Restyling

`updateSettings` merges per role — naming one role does not reset the others:

```typescript
import { prism, updateSettings } from '@xec-sh/kit';

updateSettings({
  theme: {
    accent: prism.green,
    activity: prism.cyan,
  },
});
```

A role is any `(text: string) => string`, so brand colors work directly:

```typescript
updateSettings({ theme: { accent: prism.hex('#22D3EE') } });
```

`DEFAULT_THEME` exports the original mapping; the current one lives at `settings.theme`.

## Global Settings

`updateSettings` also controls prompt behaviour beyond the theme:

```typescript
import { updateSettings } from '@xec-sh/kit';

updateSettings({
  // Extra key aliases for prompt actions (added, never overwritten).
  // Defaults already include vim keys (h/j/k/l) and Escape = cancel.
  aliases: { w: 'up', s: 'down' },

  // Spinner end-state messages
  messages: { cancel: 'Aborted', error: 'Broke' },

  // The vertical guide bar on the left of prompts
  withGuide: false,

  // Date prompt localization
  date: {
    monthNames: ['Januar', 'Februar' /* ... */],
    messages: {
      invalidMonth: 'Es gibt nur 12 Monate',
    },
  },
});
```

Actions: `up`, `down`, `left`, `right`, `space`, `enter`, `cancel`.

## See Also

- [Prompts](./prompts.md)
- [Components](./components.md)
- [Tables](./table.md)

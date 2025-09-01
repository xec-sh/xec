# Prism Color System Specification

## Overview

Prism is an advanced terminal color system for Node.js that provides a comprehensive, intuitive API for styling terminal output. It builds upon the foundation of chalk while introducing powerful new features like gradients, animations, themes, and accessibility tools.

## Core Philosophy

1. **Intuitive API**: Chainable, readable, and predictable
2. **Performance**: Efficient caching and lazy evaluation
3. **Accessibility**: Built-in contrast checking and color blindness simulation
4. **Extensibility**: Plugin system for custom color spaces and effects
5. **Type Safety**: Full TypeScript support with intelligent autocompletion
6. **Zero Dependencies**: Self-contained implementation

## Architecture

### Module Structure

```
packages/kit/src/prism/
├── core/
│   ├── prism.ts           # Main Prism class and factory
│   ├── builder.ts          # Style builder and chaining logic
│   ├── renderer.ts         # ANSI sequence generation
│   └── cache.ts            # Performance optimization cache
├── color/
│   ├── spaces.ts           # Color space conversions (RGB, HSL, HSV, LAB, etc)
│   ├── parser.ts           # Parse color strings (hex, rgb(), hsl(), etc)
│   ├── palette.ts          # Palette generation algorithms
│   └── distance.ts         # Color distance calculations
├── effects/
│   ├── gradient.ts         # Gradient generation
│   ├── animation.ts        # Animation support
│   ├── patterns.ts         # Pattern effects (rainbow, etc)
│   └── transforms.ts       # Color transformations
├── accessibility/
│   ├── contrast.ts         # WCAG contrast checking
│   ├── colorblind.ts       # Color blindness simulation
│   └── readable.ts         # Automatic readable color selection
├── themes/
│   ├── theme.ts            # Theme system
│   ├── presets.ts          # Built-in themes
│   └── generator.ts        # Theme generation from colors
├── utils/
│   ├── ansi.ts            # ANSI escape sequences
│   ├── supports.ts        # Terminal capability detection
│   └── strip.ts           # Remove ANSI codes
└── index.ts               # Public API exports
```

## API Design

### Basic Usage

```typescript
import prism from '@kit/prism';

// Simple colors
prism.red('Error message');
prism.green.bold('Success!');
prism.bgBlue.white('Info');

// Chaining
prism.bold.italic.underline.red('Important');

// Template literals
prism`
  {red Error:} Something went wrong
  {green.bold Success:} Operation completed
  {rgb(255,128,0) Warning:} Check this out
`;
```

### Color Spaces

```typescript
// RGB
prism.rgb(255, 128, 0)('Orange text');
prism.rgb('#FF8000')('Hex orange');
prism.rgb('rgb(255, 128, 0)')('CSS RGB');

// HSL
prism.hsl(30, 100, 50)('HSL orange');
prism.hsl('hsl(30, 100%, 50%)')('CSS HSL');

// HSV/HSB
prism.hsv(30, 100, 100)('HSV orange');

// LAB (perceptually uniform)
prism.lab(65, 28, 67)('LAB orange');

// LCH (cylindrical LAB)
prism.lch(65, 73, 67)('LCH orange');

// Named CSS colors
prism.css('dodgerblue')('CSS color');
prism.css('rebeccapurple')('Another CSS color');
```

### Gradients

```typescript
// Linear gradient
prism.gradient(['red', 'yellow', 'green'])('Rainbow text');
prism.gradient(['#FF0000', '#00FF00'])('Red to green');

// Multi-stop gradient
prism.gradient([
  { color: 'red', position: 0 },
  { color: 'yellow', position: 0.5 },
  { color: 'green', position: 1 },
])('Controlled gradient');

// Gradient modes
prism.gradient(['blue', 'purple'], {
  mode: 'hsl', // Interpolate through HSL space
  easing: 'easeInOut', // Apply easing function
})('Smooth gradient');
```

### Themes

```typescript
// Define a theme
const myTheme = prism.defineTheme({
  error: 'red',
  warning: 'yellow',
  success: 'green',
  info: 'blue',
  primary: '#007ACC',
  secondary: '#6C757D',

  // Semantic styles
  heading: ['bold', 'underline'],
  code: ['dim', 'italic'],

  // Complex styles
  important: {
    color: 'red',
    background: 'yellow',
    modifiers: ['bold', 'underline'],
  },
});

// Use theme
prism.theme(myTheme);
prism.error('Error message');
prism.success('Success message');
prism.heading('Main Title');

// Inline theme usage
prism.useTheme(myTheme).error('Themed error');
```

### Animations

```typescript
// Pulse effect
prism.animate.pulse('red')('Pulsing text');

// Rainbow animation
prism.animate.rainbow()('Rainbow text', {
  speed: 100, // ms per frame
  cycles: 5, // Number of cycles
});

// Custom animation
prism.animate.custom((frame, text) => {
  const intensity = Math.sin(frame * 0.1) * 0.5 + 0.5;
  return prism.rgb(255 * intensity, 0, 0)(text);
})('Custom animation');

// Gradient animation
prism.animate.gradient(['red', 'blue', 'green'], {
  direction: 'horizontal',
  speed: 50,
})('Animated gradient');
```

### Color Transformations

```typescript
// Lighten/Darken
prism.red.lighten(0.2)('Lighter red');
prism.blue.darken(0.3)('Darker blue');

// Saturation
prism.red.saturate(0.5)('More saturated');
prism.green.desaturate(0.5)('Less saturated');

// Rotation (hue shift)
prism.red.rotate(120)('Red rotated to green');

// Opacity (for terminals that support it)
prism.red.alpha(0.5)('Semi-transparent red');

// Mix colors
prism.mix('red', 'blue', 0.5)('Purple');
prism.red.mix('blue', 0.3)('Red with 30% blue');

// Invert
prism.blue.invert()('Inverted blue');

// Grayscale
prism.red.grayscale()('Grayscale red');
```

### Accessibility Features

```typescript
// Contrast checking
prism.contrast('white', 'blue'); // Returns WCAG contrast ratio
prism.readable('blue'); // Returns 'white' or 'black' for best readability

// Auto-contrast
prism.autoContrast('blue')('Auto readable text'); // Automatically picks white or black

// Color blindness simulation
prism.colorblind.protanopia('red')('How protanopes see red');
prism.colorblind.deuteranopia('green')('How deuteranopes see green');
prism.colorblind.tritanopia('blue')('How tritanopes see blue');

// Ensure minimum contrast
prism.ensureContrast(4.5, 'blue', 'white')('Guaranteed readable');
```

### Palette Generation

```typescript
// Generate complementary colors
const palette = prism.palette.complementary('#FF0000');
// Returns: ['#FF0000', '#00FFFF']

// Generate triadic colors
const triadic = prism.palette.triadic('#FF0000');
// Returns: ['#FF0000', '#00FF00', '#0000FF']

// Generate analogous colors
const analogous = prism.palette.analogous('#FF0000', 5);
// Returns 5 analogous colors

// Generate monochromatic palette
const mono = prism.palette.monochromatic('#FF0000', 5);
// Returns 5 shades of red

// Generate from image/theme
const themePalette = prism.palette.fromTheme('ocean');
```

### Advanced Features

```typescript
// Conditional styling
prism.if(process.env.DEBUG, 'yellow')('Debug message');
prism.when(isError).red.bold('Error message');

// Level-based styling (respects color support)
prism.level(3).truecolor(255, 128, 64)('Truecolor');
prism.level(2).ansi256(214)('256 colors');
prism.level(1).yellow('16 colors');

// Nested styles
prism.red(`Red text with ${prism.blue('blue')} inside`);

// Strip ANSI codes
prism.strip(prism.red('text')); // Returns: 'text'

// Get string length (ignoring ANSI codes)
prism.stringLength(prism.red('text')); // Returns: 4

// Clone with different options
const customPrism = prism.create({ level: 2 });

// Format with placeholders
prism.format('Error: {red %s} at {yellow %s}', 'Failed', 'line 10');

// Table coloring
prism.table(
  [
    ['Name', 'Age', 'City'],
    ['John', '25', 'NYC'],
    ['Jane', '30', 'LA'],
  ],
  {
    header: 'bold.underline',
    evenRows: 'dim',
  }
);
```

### Template Literal API

```typescript
// Tagged template literals
prism`
  {red Error:} {bold ${errorMessage}}
  {dim at ${timestamp}}
`;

// Nested templates
prism`
  {green Success!}
  ${details && prism`{dim Details: ${details}}`}
`;

// Complex formatting
prism`
  {gradient(['red', 'yellow']) WARNING}
  {rgb(128,128,128) [${timestamp}]}
  
  {bold Message:} ${message}
  
  {dim Stack trace:}
  ${prism.dim(stackTrace)}
`;
```

### Performance Optimizations

```typescript
// Caching
const redBold = prism.red.bold;
redBold('Cached style'); // Reuses computed style

// Lazy evaluation
const style = prism.red.bold.underline;
// ANSI codes only generated when applied to text

// Batch operations
prism.batch([
  ['red', 'Error'],
  ['yellow', 'Warning'],
  ['green', 'Success'],
]);

// Compile for performance
const compiled = prism.compile('red.bold.underline');
compiled('Fast styled text');
```

### Configuration

```typescript
// Global configuration
prism.configure({
  level: 3, // Force color level
  enabled: true, // Enable/disable globally
  theme: 'dark', // Default theme
  cache: true, // Enable caching
  respectNoColor: true, // Respect NO_COLOR env var
  respectTerminal: true, // Auto-detect terminal capabilities
});

// Instance configuration
const myPrism = prism.create({
  level: 2,
  theme: customTheme,
});

// Environment detection
prism.supportsColor(); // Returns color support level
prism.isColorEnabled(); // Returns true/false
prism.getColorSpace(); // Returns supported color space
```

## Implementation Details

### Color Level Detection

```typescript
enum ColorLevel {
  None = 0, // No colors
  Basic = 1, // 16 colors
  Ansi256 = 2, // 256 colors
  TrueColor = 3, // 16.7 million colors
}
```

### ANSI Escape Sequences

```typescript
// Modifiers
const modifiers = {
  reset: [0, 0],
  bold: [1, 22],
  dim: [2, 22],
  italic: [3, 23],
  underline: [4, 24],
  overline: [53, 55],
  inverse: [7, 27],
  hidden: [8, 28],
  strikethrough: [9, 29],
};

// 16 colors
const colors = {
  black: [30, 39],
  red: [31, 39],
  green: [32, 39],
  yellow: [33, 39],
  blue: [34, 39],
  magenta: [35, 39],
  cyan: [36, 39],
  white: [37, 39],
  // Bright variants
  blackBright: [90, 39],
  redBright: [91, 39],
  // ... etc
};

// 256 colors
`\x1b[38;5;${n}m` // Foreground
`\x1b[48;5;${n}m` // Background
// TrueColor
`\x1b[38;2;${r};${g};${b}m` // Foreground
`\x1b[48;2;${r};${g};${b}m`; // Background
```

### Performance Strategies

1. **Style Caching**: Cache computed ANSI sequences
2. **Lazy Evaluation**: Only compute when text is provided
3. **String Building**: Use efficient string concatenation
4. **Prototype Chain**: Optimize property lookup
5. **Minimal Allocations**: Reuse objects where possible

### Error Handling

```typescript
// Invalid colors
prism.rgb(300, 0, 0); // Clamps to 255
prism.hsl(400, 100, 50); // Wraps hue to 0-360

// Fallbacks
prism.truecolor(255, 128, 0).fallback('yellow')('Orange or yellow');

// Graceful degradation
prism.auto('rgb(255, 128, 0)')('Best available orange');
```

## Migration from picocolors

```typescript
// picocolors
import pc from 'picocolors';
pc.red('text');

// Prism (drop-in replacement)
import prism from '@kit/prism';
prism.red('text');

// Enhanced usage
prism.red.bold('text');
prism.rgb(255, 0, 0)('text');
prism.gradient(['red', 'blue'])('text');
```

## Testing Strategy

1. **Unit Tests**: Each module tested independently
2. **Integration Tests**: Full styling chains
3. **Visual Tests**: Snapshot testing of ANSI output
4. **Performance Tests**: Benchmark against chalk/picocolors
5. **Compatibility Tests**: Various terminal emulators

## Future Enhancements

1. **Terminal UI Integration**: Direct integration with Terex components
2. **Color Schemes**: Import/export popular terminal color schemes
3. **Smart Wrapping**: Preserve styling across line breaks
4. **Emoji Support**: Colored emoji where supported
5. **Web Terminal Support**: Browser-based terminal compatibility
6. **Color Oracle**: AI-powered color suggestions
7. **Streaming Support**: Efficient coloring of streams
8. **Parallel Processing**: Multi-threaded gradient generation

## Examples

### Error Reporter

```typescript
function reportError(error: Error) {
  prism`
    {red.bold ✗ Error:} ${error.message}
    
    {dim Stack trace:}
    ${prism.dim(error.stack)}
    
    {yellow Tip:} Try running with {cyan --verbose} flag
  `;
}
```

### Progress Bar

```typescript
function progressBar(progress: number, width = 40) {
  const filled = Math.round(width * progress);
  const empty = width - filled;

  return prism`
    {green ${'█'.repeat(filled)}}{dim ${'░'.repeat(empty)}} {bold ${Math.round(progress * 100)}%}
  `;
}
```

### Syntax Highlighter

```typescript
function highlight(code: string, lang: string) {
  const tokens = tokenize(code, lang);

  return tokens
    .map((token) => {
      switch (token.type) {
        case 'keyword':
          return prism.magenta(token.value);
        case 'string':
          return prism.green(token.value);
        case 'number':
          return prism.cyan(token.value);
        case 'comment':
          return prism.dim(token.value);
        default:
          return token.value;
      }
    })
    .join('');
}
```

## Performance Benchmarks

Target performance (ops/sec):

- Simple color: > 5,000,000
- Chained styles: > 2,000,000
- Gradient (10 chars): > 500,000
- Template literal: > 1,000,000
- Theme lookup: > 3,000,000

Memory usage:

- Base library: < 1MB
- With cache (1000 styles): < 5MB
- Full theme loaded: < 2MB

## License

MIT

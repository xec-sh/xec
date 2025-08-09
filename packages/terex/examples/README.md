# Terex Examples

This directory contains example applications demonstrating the capabilities of the Terex terminal UI framework.

## 🌈 Plasma Effect Demo

A mesmerizing full-screen plasma effect that showcases:
- **Braille Characters**: High-resolution graphics using Unicode Braille patterns (2x4 pixel per character)
- **TrueColor Support**: 16.7 million colors with smooth gradients
- **Animated Borders**: Rainbow gradient borders that shift and flow
- **Terminal Resize Handling**: Automatically adapts to terminal size changes
- **Smooth Animation**: 30 FPS rendering with customizable speed

### Running the Demo

#### Method 1: Using the Shell Script (Easiest)
```bash
./examples/run-plasma.sh
```

#### Method 2: Direct TypeScript Execution
```bash
npx tsx examples/plasma-demo.ts
```

#### Method 3: Using Node with TypeScript
```bash
npx ts-node --esm examples/plasma-demo.ts
```

### Controls

- **SPACE** - Pause/Resume animation
- **+/-** - Increase/Decrease animation speed
- **Q** - Quit the demo

### Requirements

- **Terminal**: Must run in a real TTY terminal (not piped)
- **Colors**: Works best with TrueColor (24-bit) support
  - Check with: `echo $COLORTERM` (should show "truecolor" or "24bit")
  - Most modern terminals support this (iTerm2, Terminal.app, Windows Terminal, etc.)
- **Font**: Use a font with good Unicode support for best Braille character rendering

### Terminal Compatibility

| Terminal | TrueColor | Braille | Rating |
|----------|-----------|---------|--------|
| iTerm2 (macOS) | ✅ | ✅ | ⭐⭐⭐⭐⭐ |
| Terminal.app (macOS) | ✅ | ✅ | ⭐⭐⭐⭐ |
| Windows Terminal | ✅ | ✅ | ⭐⭐⭐⭐⭐ |
| VS Code Terminal | ✅ | ✅ | ⭐⭐⭐⭐ |
| Alacritty | ✅ | ✅ | ⭐⭐⭐⭐⭐ |
| Kitty | ✅ | ✅ | ⭐⭐⭐⭐⭐ |
| GNOME Terminal | ✅ | ✅ | ⭐⭐⭐⭐ |
| Konsole | ✅ | ✅ | ⭐⭐⭐⭐ |
| xterm | ⚠️ | ✅ | ⭐⭐⭐ |

## Technical Details

### Plasma Algorithm

The plasma effect uses multiple overlapping sine waves to create an interference pattern:

```typescript
v1 = sin(x * 10 + t)
v2 = sin(10 * (x * sin(t/2) + y * cos(t/3)) + t)
v3 = sin(sqrt(100 * (cx² + cy²) + 1) + t)
plasma = (v1 + v2 + v3) / 3
```

### Braille Character Mapping

Each Braille character can represent 8 pixels in a 2x4 grid:
```
[1][4]
[2][5]
[3][6]
[7][8]
```

The Unicode range U+2800 to U+28FF provides all combinations.

### Color Generation

Colors are generated using a time-shifted sine wave palette:
- Red: `0.5 + 0.5 * sin(π * value * 2 + phase)`
- Green: `0.5 + 0.5 * sin(π * value * 2 + phase + 2π/3)`
- Blue: `0.5 + 0.5 * sin(π * value * 2 + phase + 4π/3)`

This creates smooth, psychedelic color transitions.

## Source Files

- `plasma-demo.ts` - Standalone demo using pure ANSI escape codes
- `plasma.ts` - Component-based version using Terex framework
- `run-plasma.sh` - Convenience script to run the demo

## Troubleshooting

### "Not a TTY" Error
The demo must be run in a real terminal, not through a pipe or redirect.

### No Colors / Broken Characters
1. Check terminal color support: `echo $COLORTERM`
2. Try a different terminal emulator
3. Ensure your font supports Unicode Braille characters

### Performance Issues
- Reduce terminal window size
- Use the `-` key to slow down animation
- Close other terminal tabs/windows

## Creating Your Own Effects

The plasma demo provides a template for creating other visual effects:

1. Modify the `plasmaFunction()` to create different patterns
2. Adjust the color palette in `plasmaToColor()`
3. Change the Braille threshold for different densities
4. Experiment with border styles and animations

## License

MIT - See the main package LICENSE file
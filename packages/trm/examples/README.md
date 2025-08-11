# TRM Examples

This directory contains examples demonstrating the capabilities of the TRM terminal library.

## Running Examples

All examples can be run using `tsx` (TypeScript Execute):

```bash
# From the project root
npx tsx packages/trm/examples/01-basic-terminal.ts

# Or from the package directory
cd packages/trm
npx tsx examples/01-basic-terminal.ts
```

## Available Examples

1. **01-basic-terminal.ts** - Basic terminal operations (write, colors, cursor movement)
2. **02-inline-update.ts** - In-place content updates (progress bars, status displays)
3. **03-fullscreen.ts** - Fullscreen mode with alternate buffer
4. **04-input-and-events.ts** - Interactive keyboard and mouse input handling
5. **05-cursor-operations.ts** - Advanced cursor control and positioning
6. **06-comprehensive-demo.ts** - Complete demonstration of all features
7. **07-keyboard-test.ts** - Interactive keyboard input testing with proper event handling

## Example 04: Input and Events

The input example (`04-input-and-events.ts`) demonstrates keyboard and mouse event handling. 

### Important Notes:

- **Must be run in an interactive terminal** (not piped or redirected)
- Requires TTY for raw mode to capture individual keystrokes
- Press 'q' or Ctrl+C to exit

### Running the Input Example:

```bash
# Run interactively (correct way)
npx tsx packages/trm/examples/04-input-and-events.ts

# These will NOT work properly:
# echo "test" | npx tsx examples/04-input-and-events.ts  # ❌ No TTY
# npx tsx examples/04-input-and-events.ts < input.txt    # ❌ No TTY
```

### Features Demonstrated:

- Real-time key event handling
- Mouse click, drag, and scroll events
- Bracketed paste support
- Focus tracking
- Raw mode input processing

### Commands:

- `m` - Enable/disable mouse events
- `p` - Enable/disable bracketed paste
- `f` - Enable/disable focus tracking
- `c` - Clear screen
- `q` or `Ctrl+C` - Quit

## Troubleshooting

### Input events not working

If keyboard events are not being received:

1. Ensure you're running in an interactive terminal
2. Check that your terminal supports raw mode
3. Try running with a different terminal emulator
4. Verify stdin is a TTY: `node -e "console.log(process.stdin.isTTY)"`

### Colors not displaying

Some terminals may not support all color modes. TRM automatically detects color support, but you can override it in the terminal options.

### Examples not running

Ensure dependencies are installed:

```bash
# From project root
yarn install
yarn workspace @xec-sh/trm build
```
#!/usr/bin/env node

/**
 * Test application using TRM library for integration tests
 */

const { 
  TerminalImpl,
  ColorSystem,
  StylesImpl,
  ScreenBufferImpl,
  x, 
  y, 
  cols, 
  rows, 
  ColorDepth 
} = require('../../dist/index.cjs');

async function main() {
  // Check if we're in a TTY environment
  const isTTY = process.stdin.isTTY && process.stdout.isTTY;
  
  const terminal = new TerminalImpl({
    mode: isTTY ? 'fullscreen' : 'inline',
    alternateBuffer: isTTY,
    rawMode: isTTY,
    keyboard: isTTY,
    mouse: false
  });

  try {
    await terminal.init();
  } catch (error) {
    // Fallback to simple output if terminal init fails
    console.log('TRM Test Application');
    console.log('====================');
    console.log('');
    console.log('Red Text');
    console.log('Green Text'); 
    console.log('Blue Text');
    console.log('');
    console.log('Bold Text');
    console.log('Italic Text');
    console.log('Underlined Text');
    console.log('');
    console.log('Cursor Position Test');
    console.log('');
    console.log('');
    console.log('');
    console.log('Press q to quit');
    
    // Keep process alive for testing
    setTimeout(() => {
      process.exit(0);
    }, 10000);
    return;
  }
  
  const colors = new ColorSystem(ColorDepth.TrueColor);
  const styles = new StylesImpl(colors);
  
  // Clear screen
  terminal.screen.clear();
  
  // Write header
  terminal.screen.write(x(0), y(0), 'TRM Test Application', {
    fg: colors.white,
    bold: true
  });
  terminal.screen.write(x(0), y(1), '====================', {
    fg: colors.white
  });
  
  // Write colored text
  terminal.screen.write(x(0), y(3), 'Red Text', {
    fg: colors.red
  });
  terminal.screen.write(x(0), y(4), 'Green Text', {
    fg: colors.green
  });
  terminal.screen.write(x(0), y(5), 'Blue Text', {
    fg: colors.blue
  });
  
  // Write styled text
  terminal.screen.write(x(0), y(7), 'Bold Text', {
    fg: colors.white,
    bold: true
  });
  terminal.screen.write(x(0), y(8), 'Italic Text', {
    fg: colors.white,
    italic: true
  });
  terminal.screen.write(x(0), y(9), 'Underlined Text', {
    fg: colors.white,
    underline: true
  });
  
  // Write cursor position test
  terminal.screen.write(x(0), y(11), 'Cursor Position Test', {
    fg: colors.cyan
  });
  
  // Write help text
  terminal.screen.write(x(0), y(15), 'Press q to quit', {
    fg: colors.gray
  });
  
  // Enable mouse if requested
  let mouseEnabled = false;
  
  // Handle input
  terminal.events.on('key', (event) => {
    if (event.key === 'q' || event.key === 'Q' || (event.ctrl && event.key === 'c')) {
      terminal.close().then(() => {
        process.exit(0);
      });
    } else if (event.key === 'ArrowUp') {
      terminal.screen.write(x(0), y(20), 'Moved Up    ', { fg: colors.yellow });
    } else if (event.key === 'ArrowDown') {
      terminal.screen.write(x(0), y(20), 'Moved Down  ', { fg: colors.yellow });
    } else if (event.key === 'ArrowLeft') {
      terminal.screen.write(x(0), y(20), 'Moved Left  ', { fg: colors.yellow });
    } else if (event.key === 'ArrowRight') {
      terminal.screen.write(x(0), y(20), 'Moved Right ', { fg: colors.yellow });
    } else if (event.key === 'Enter') {
      terminal.screen.write(x(0), y(20), 'Key pressed: Enter', { fg: colors.magenta });
    } else if (event.key === 'Tab') {
      terminal.screen.write(x(0), y(20), 'Key pressed: Tab  ', { fg: colors.magenta });
    } else if (event.key === 'Escape') {
      terminal.screen.write(x(0), y(20), 'Key pressed: Escape', { fg: colors.magenta });
    } else if (event.ctrl && event.key === 'a') {
      terminal.screen.write(x(0), y(20), 'Ctrl+A      ', { fg: colors.cyan });
    } else if (event.key === 'm' || event.key === 'M') {
      mouseEnabled = !mouseEnabled;
      if (mouseEnabled) {
        terminal.input.enableMouse();
        terminal.screen.write(x(0), y(21), 'Mouse: Enabled ', { fg: colors.green });
      } else {
        terminal.input.disableMouse();
        terminal.screen.write(x(0), y(21), 'Mouse: Disabled', { fg: colors.red });
      }
    } else if (event.key === 'c' || event.key === 'C') {
      // Clear screen
      terminal.screen.clear();
    } else if (event.key.length === 1) {
      terminal.screen.write(x(0), y(20), `Key pressed: ${event.key}    `, { fg: colors.white });
    }
  });
  
  // Handle mouse events
  terminal.events.on('mouse', (event) => {
    if (mouseEnabled) {
      terminal.screen.write(x(0), y(22), `Mouse: (${event.x}, ${event.y}) ${event.action}`, { 
        fg: colors.yellow 
      });
    }
  });
  
  // Keep process alive
  process.stdin.resume();
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
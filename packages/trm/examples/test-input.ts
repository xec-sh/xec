#!/usr/bin/env tsx
/**
 * Test input handling
 * Tests that keyboard input is properly processed
 */

import { TerminalImpl } from '../src/core/terminal.js';

async function main() {
  console.log('=== Testing Input Handling ===\n');
  console.log('Starting interactive test...');
  console.log('Press keys to test, Ctrl+C to exit\n');

  // Create terminal in inline mode with raw input
  const terminal = new TerminalImpl({
    mode: 'inline',
    rawMode: true,
    clearOnExit: true,
    cursorHidden: false
  });

  await terminal.init();

  terminal.writeLine('Input test started. Press keys:');
  terminal.writeLine('- Regular keys will be displayed');
  terminal.writeLine('- Arrow keys will show direction');
  terminal.writeLine('- Ctrl+C to exit\n');

  let lineCount = 0;

  // Handle keyboard events
  terminal.events.on('key', (event) => {
    if (event.key === 'c' && event.ctrl) {
      terminal.writeLine('\nExiting...');
      terminal.close();
    } else if (event.name === 'enter') {
      terminal.writeLine('ENTER pressed');
      lineCount++;
    } else if (event.key === ' ') {
      terminal.write('[SPACE]');
    } else if (event.name === 'arrowup') {
      terminal.writeLine('↑ UP arrow');
      lineCount++;
    } else if (event.name === 'arrowdown') {
      terminal.writeLine('↓ DOWN arrow');
      lineCount++;
    } else if (event.name === 'arrowleft') {
      terminal.writeLine('← LEFT arrow');
      lineCount++;
    } else if (event.name === 'arrowright') {
      terminal.writeLine('→ RIGHT arrow');
      lineCount++;
    } else if (event.name === 'tab') {
      terminal.write('[TAB]');
    } else if (event.name === 'backspace') {
      terminal.write('[BACKSPACE]');
    } else if (event.name === 'escape') {
      terminal.writeLine('[ESC]');
      lineCount++;
    } else if (event.char) {
      // Regular character
      terminal.write(`${event.char}`);
    }

    // Clear screen if too many lines
    if (lineCount > 10) {
      terminal.screen.clear();
      terminal.writeLine('Screen cleared. Continue typing:');
      lineCount = 0;
    }
  });

  // Wait for close
  await new Promise<void>((resolve) => {
    terminal.events.once('close', resolve);
  });

  console.log('Test completed.');
}

// Run the test
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
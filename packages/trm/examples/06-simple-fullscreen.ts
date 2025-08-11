#!/usr/bin/env tsx
/**
 * Simple Fullscreen Example
 * Tests basic fullscreen mode with keyboard input
 */

import { x, y } from '../src/types.js';
import { TerminalImpl } from '../src/core/terminal.js';

async function main() {
  // Check if running in TTY
  if (!process.stdin.isTTY) {
    console.error('This application requires an interactive terminal (TTY).');
    process.exit(1);
  }

  const terminal = new TerminalImpl({
    mode: 'fullscreen',
    alternateBuffer: true,
    rawMode: true,
    keyboard: true
  });

  try {
    await terminal.init();

    // Clear and set up screen
    terminal.screen.clear();
    terminal.cursor.hide();

    // Get dimensions
    const width = terminal.stream.cols;
    const height = terminal.stream.rows;

    // Draw header
    terminal.screen.writeAt(x(0), y(0), '='.repeat(width));
    terminal.screen.writeAt(x(Math.floor((width - 20) / 2)), y(1), 'Simple Fullscreen Test');
    terminal.screen.writeAt(x(0), y(2), '='.repeat(width));

    // Instructions
    terminal.screen.writeAt(x(2), y(4), 'Press keys to test input:');
    terminal.screen.writeAt(x(2), y(5), '- q: Quit');
    terminal.screen.writeAt(x(2), y(6), '- Any other key: Display key info');

    // Status area
    terminal.screen.writeAt(x(2), y(8), 'Waiting for input...');

    let lineY = 10;
    let running = true;

    // Main input loop
    for await (const event of terminal.input.events) {
      if (!running) {
        break;
      }
      if (event.type === 'key') {
        // Clear previous message
        terminal.screen.writeAt(x(2), y(8), ' '.repeat(width - 4));

        // Display key info
        const keyInfo = `Key pressed: "${event.key}" (Code: ${event.code}, Ctrl: ${event.ctrl}, Alt: ${event.alt}, Shift: ${event.shift})`;
        terminal.screen.writeAt(x(2), y(8), keyInfo);

        // Log key presses
        if (lineY < height - 2) {
          terminal.screen.writeAt(x(2), y(lineY), `[${new Date().toLocaleTimeString()}] ${keyInfo}`);
          lineY++;
        }

        // Check for quit
        if (event.key === 'q' || event.key === 'Q') {
          running = false;
          break;
        }

        // Also allow Ctrl+C
        if (event.ctrl && (event.key === 'c' || event.key === 'C')) {
          running = false;
          break;
        }
      }
    }

  } catch (error) {
    // Make sure we clean up before showing error
    terminal.cursor.show();
    await terminal.close();
    console.error('Error:', error);
    process.exit(1);
  }

  // Clean up
  terminal.cursor.show();
  await terminal.close();
  console.log('\nExited successfully');
}

// Run the application
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
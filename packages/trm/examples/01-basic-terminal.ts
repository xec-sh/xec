#!/usr/bin/env tsx
/**
 * Example 01: Basic Terminal and Screen Operations
 * Demonstrates basic terminal initialization, screen operations, and cursor control
 */

import { x, y, cols, rows } from '../src/types.js';
import { TerminalImpl } from '../src/core/terminal.js';
import { detectPlatform } from '../src/core/platform.js';

async function main() {
  console.log('=== TRM Core Example: Basic Terminal Operations ===\n');

  // Detect platform
  const platform = detectPlatform();
  console.log('Platform detected:');
  console.log(`  Runtime: ${platform.runtime}`);
  console.log(`  OS: ${platform.os}`);
  console.log(`  Terminal: ${platform.terminal}`);
  console.log(`  Shell: ${platform.shell || 'unknown'}`);
  console.log();

  // Create terminal instance with default settings
  const terminal = new TerminalImpl({
    // Uses inline mode by default - continues from current position
    clearOnExit: false     // Don't clear on exit - leave output visible
  });

  // Initialize terminal
  await terminal.init();
  console.log('Terminal initialized in inline mode');
  console.log(`  Size: ${terminal.stream.cols}x${terminal.stream.rows}`);
  console.log(`  TTY: ${terminal.stream.isTTY}`);
  console.log(`  Color depth: ${terminal.stream.colorDepth}`);
  console.log();

  // Use terminal's screen
  const screen = terminal.screen;

  // Note: We're not clearing the screen in inline mode
  console.log('Writing to terminal without clearing...');

  // Write at specific position
  console.log('Writing text at different positions...');
  screen.writeAt(x(0), y(0), 'Top-left corner');
  screen.writeAt(x(20), y(2), 'Positioned text');
  screen.writeAt(x(0), y(4), 'Line 5 text');

  // Use terminal's cursor
  const cursor = terminal.cursor;

  // Move cursor around
  console.log('Moving cursor...');
  cursor.moveTo(x(10), y(6));
  terminal.stream.write('Cursor moved here');

  // Save and restore cursor position
  cursor.save();
  cursor.moveTo(x(0), y(8));
  terminal.stream.write('Temporary position');
  cursor.restore();
  terminal.stream.write(' <- Back to saved position');

  // Hide and show cursor
  console.log('\nHiding cursor for 2 seconds...');
  cursor.hide();
  await sleep(2000);

  console.log('Showing cursor again...');
  cursor.show();

  // Draw a box using screen
  console.log('\nDrawing a box...');
  const boxX = x(5);
  const boxY = y(12);
  const boxWidth = cols(30);
  const boxHeight = rows(5);

  screen.writeBox(boxX, boxY, boxWidth, boxHeight);

  // Write inside the box
  screen.writeAt(x(7), y(14), 'Text inside the box');

  // Scrolling demonstration
  console.log('\nScrolling demonstration...');
  cursor.moveTo(x(0), y(20));

  for (let i = 0; i < 5; i++) {
    terminal.stream.writeLine(`Scrolling line ${i + 1}`);
    await sleep(500);
  }

  // Clean up
  console.log('\nCleaning up...');
  await terminal.close();
  console.log('Terminal closed');
}

// Helper function for sleep
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the example
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
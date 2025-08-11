#!/usr/bin/env tsx
/**
 * Example 03: Fullscreen Mode
 * Demonstrates fullscreen terminal mode with alternate buffer
 */

import { x, y, cols, rows } from '../src/types.js';
import { TerminalImpl } from '../src/core/terminal.js';

async function main() {
  console.log('=== TRM Core Example: Fullscreen Mode ===\n');
  console.log('This example will switch to fullscreen mode.');
  console.log('Press Enter to continue...');
  
  // Wait for user input
  await waitForEnter();

  // Create terminal in fullscreen mode
  const terminal = new TerminalImpl({
    mode: 'fullscreen',
    // Screen is automatically cleared in fullscreen mode
    alternateBuffer: true,  // Use alternate buffer
    rawMode: true,          // Enable raw mode for full control
    cursorHidden: false     // Show cursor
    // clearOnExit not needed - fullscreen always restores original
  });

  // Initialize terminal (will switch to alternate buffer)
  await terminal.init();

  // Now we're in fullscreen mode
  const screen = terminal.screen;
  const cursor = terminal.cursor;

  // Clear and setup the screen
  screen.clear();

  // Draw a title bar
  screen.writeAt(x(0), y(0), '═'.repeat(terminal.stream.cols));
  const title = ' Fullscreen Terminal Application ';
  const titleX = Math.floor((terminal.stream.cols - title.length) / 2);
  screen.writeAt(x(titleX), y(0), title);

  // Draw some content
  screen.writeAt(x(2), y(2), 'Welcome to fullscreen mode!');
  screen.writeAt(x(2), y(4), 'Features:');
  screen.writeAt(x(4), y(5), '• Alternate buffer (original content preserved)');
  screen.writeAt(x(4), y(6), '• Full screen control');
  screen.writeAt(x(4), y(7), '• Raw mode input');
  
  // Draw a footer
  const footerY = terminal.stream.rows - 2;
  screen.writeAt(x(0), y(footerY), '─'.repeat(terminal.stream.cols));
  screen.writeAt(x(2), y(footerY + 1), 'Press Ctrl+C to exit');

  // Interactive element
  let counter = 0;
  const updateCounter = () => {
    screen.writeAt(x(2), y(10), `Counter: ${counter}  (Press SPACE to increment)`);
  };
  updateCounter();

  // Handle input events
  terminal.events.on('key', (event) => {
    if (event.key === 'c' && event.ctrl) {
      // Exit on Ctrl+C
      terminal.close();
    } else if (event.name === 'space' || event.key === ' ') {
      counter++;
      updateCounter();
    } else if (event.name === 'up') {
      screen.writeAt(x(2), y(12), 'Arrow UP pressed    ');
    } else if (event.name === 'down') {
      screen.writeAt(x(2), y(12), 'Arrow DOWN pressed  ');
    } else if (event.name === 'left') {
      screen.writeAt(x(2), y(12), 'Arrow LEFT pressed  ');
    } else if (event.name === 'right') {
      screen.writeAt(x(2), y(12), 'Arrow RIGHT pressed ');
    } else if (!event.isSpecial) {
      // Regular character key
      screen.writeAt(x(2), y(14), `Key pressed: ${event.key}     `);
    }
  });

  // Wait for terminal to close
  await new Promise<void>((resolve) => {
    terminal.events.once('close', resolve);
  });

  // Clean up - will restore original screen
  await terminal.close();
  
  console.log('\nReturned from fullscreen mode.');
  console.log('Original terminal content was preserved!');
}

// Helper function to wait for Enter key
function waitForEnter(): Promise<void> {
  return new Promise(resolve => {
    process.stdin.once('data', () => resolve());
    process.stdin.resume();
  });
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
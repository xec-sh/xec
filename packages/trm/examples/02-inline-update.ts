#!/usr/bin/env tsx
/**
 * Example 02: In-Place Updates
 * Demonstrates updating output in-place without clearing the screen
 */

import { TerminalImpl } from '../src/core/terminal.js';

async function main() {
  // console.log('=== TRM Core Example: In-Place Updates ===\n');
  // console.log('This example shows updating content in-place without clearing the screen.');
  // console.log('Content above this line will remain visible.\n');

  // Create terminal in inline mode for in-place updates
  const terminal = new TerminalImpl({
    mode: 'inline',      // Explicit for clarity (this is the default)
    clearOnExit: false,    // Clean up the update area when done
    cursorHidden: true    // Hide cursor during updates
  });

  // Initialize terminal
  await terminal.init();

  // Simulate a progress bar
  // console.log('Starting progress...');

  for (let i = 0; i <= 100; i += 5) {
    const progress = createProgressBar(i);
    const status = i < 100 ? 'Processing...' : 'Complete!';

    // Update the output in-place
    terminal.update(`Progress: ${progress} ${i}%\nStatus: ${status}`);

    await sleep(100);
  }

  // Add a final message after completion
  // console.log('\nProgress completed successfully!');

  // Clean up
  await terminal.close();
  // console.log('Terminal closed gracefully.');
}

// Helper function to create a progress bar
function createProgressBar(percent: number): string {
  const width = 30;
  const filled = Math.floor((percent / 100) * width);
  const empty = width - filled;

  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
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
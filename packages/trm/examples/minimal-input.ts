#!/usr/bin/env tsx
/**
 * Minimal example to test input handling
 */

import { TerminalImpl } from '../src/core/terminal.js';

async function main() {
  console.log('=== Minimal Input Test ===\n');
  console.log('This example will only work when run interactively.');
  console.log('Press any key to see it detected. Press "q" to quit.\n');

  // Create terminal with raw mode
  const terminal = new TerminalImpl({
    mode: 'inline',
    rawMode: true,
    cursorHidden: false
  });

  await terminal.init();

  // Handle key events
  terminal.events.on('key', (event) => {
    console.log(`Key detected: "${event.key}" (Special: ${event.isSpecial})`);
    
    if (event.key === 'q') {
      console.log('\nQuitting...');
      terminal.close().then(() => {
        process.exit(0);
      });
    }
  });

  // Keep the process running
  await new Promise(() => {});
}

// Run the example
main().catch(error => {
  console.error('Error:', error);
  console.error('\nNote: This example must be run in an interactive terminal.');
  console.error('It will not work if input is piped or redirected.');
  process.exit(1);
});
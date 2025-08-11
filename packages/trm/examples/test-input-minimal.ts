#!/usr/bin/env tsx
/**
 * Minimal test for input functionality
 */

import { TerminalImpl } from '../src/core/terminal.js';
import type { KeyEvent } from '../src/types.js';

async function main() {
  console.log('=== Minimal Input Test ===');
  console.log('Press any key (or q to quit)...\n');

  const terminal = new TerminalImpl({
    mode: 'inline',
    rawMode: true,
    keyboard: true
  });

  await terminal.init();

  console.log('Terminal initialized, waiting for input...');
  console.log('Raw mode:', terminal.stream.isRaw);

  let count = 0;
  
  // Set up event listener for keyboard events
  terminal.events.on('key', (event: KeyEvent) => {
    console.log('Event:', event);
    count++;
    
    console.log(`Key pressed: "${event.key}" (code: ${event.raw?.charCodeAt(0) || 'N/A'})`);
    
    if (event.key === 'q' || event.key === 'Q') {
      console.log('Quit requested');
      terminal.events.emit('close');
    }
    
    if (count > 10) {
      console.log('Max events reached');
      terminal.events.emit('close');
    }
  });

  // Wait for close signal
  await new Promise<void>((resolve) => {
    terminal.events.once('close', () => {
      resolve();
    });
  });

  await terminal.close();
  console.log('\nTest completed');
}

// Run the test
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
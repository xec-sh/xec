#!/usr/bin/env tsx
/**
 * Debug input handling
 */

import { TerminalImpl } from '../src/core/terminal.js';

async function main() {
  console.log('Starting debug test...');
  
  const terminal = new TerminalImpl({
    mode: 'inline',
    rawMode: false,
    clearOnExit: false
  });

  await terminal.init();
  
  console.log('Terminal initialized');

  // Set a timeout to exit after 2 seconds
  const timeout = setTimeout(() => {
    console.log('Timeout - closing terminal');
    terminal.close();
  }, 2000);

  let dataReceived = false;
  let keyReceived = false;

  // Listen for raw data
  terminal.events.on('data', (data) => {
    dataReceived = true;
    console.log('Data event:', data);
    clearTimeout(timeout);
    terminal.close();
  });

  // Listen for key events
  terminal.events.on('key', (event) => {
    keyReceived = true;
    console.log('Key event:', event);
  });

  // Try to read directly from input stream
  setTimeout(async () => {
    if (!dataReceived && !keyReceived) {
      console.log('No events received, trying direct read...');
      
      // Try to trigger input by writing to stdin
      if (process.stdin.readable) {
        console.log('stdin is readable');
      }
      
      // Check if input processing started
      console.log('Input keyboard enabled:', terminal.input.keyboardEnabled);
    }
  }, 500);

  await new Promise<void>((resolve) => {
    terminal.events.once('close', resolve);
  });

  console.log(`Test completed. Data received: ${dataReceived}, Key received: ${keyReceived}`);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
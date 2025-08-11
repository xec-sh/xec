#!/usr/bin/env tsx
/**
 * Simple input test without raw mode
 */

import { TerminalImpl } from '../src/core/terminal.js';

async function main() {
  const terminal = new TerminalImpl({
    mode: 'inline',
    rawMode: false,  // Don't use raw mode
    clearOnExit: false
  });

  await terminal.init();

  terminal.writeLine('Simple input test (no raw mode)');
  terminal.writeLine('Type and press Enter:');

  let count = 0;

  // Process raw input data
  terminal.events.on('data', (data) => {
    const text = new TextDecoder().decode(data);
    terminal.write(`Received: ${JSON.stringify(text)}\n`);
    count++;
    
    if (text.includes('\x03') || count > 5) {
      terminal.close();
    }
  });

  await new Promise<void>((resolve) => {
    terminal.events.once('close', resolve);
  });

  console.log('Test completed.');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
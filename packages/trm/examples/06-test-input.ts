#!/usr/bin/env tsx
/**
 * Test basic input in inline mode
 */

import { TerminalImpl } from '../src/core/terminal.js';

async function main() {
  const terminal = new TerminalImpl({
    mode: 'inline',
    rawMode: true,
    clearOnExit: false
  });

  try {
    await terminal.init();
    
    terminal.writeLine('Input Test - Press keys to see events, q to quit:');
    terminal.writeLine('');
    
    for await (const event of terminal.input.events) {
      if (event.type === 'key') {
        terminal.writeLine(`Key: "${event.key}" (Code: ${event.code}, Ctrl: ${event.ctrl})`);
        
        if (event.key === 'q' || (event.ctrl && event.key === 'c')) {
          break;
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await terminal.close();
    console.log('\nDone');
  }
}

main().catch(console.error);
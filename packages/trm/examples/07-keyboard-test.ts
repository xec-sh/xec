#!/usr/bin/env tsx
/**
 * Example 07: Keyboard Input Test
 * Demonstrates proper keyboard event handling using terminal.events
 */

import { TerminalImpl } from '../src/core/terminal.js';
import { x, y } from '../src/types.js';
import type { KeyEvent } from '../src/types.js';

async function main() {
  const terminal = new TerminalImpl({
    mode: 'fullscreen',
    alternateBuffer: true,
    rawMode: true,
    keyboard: true,
    cursorHidden: true
  });

  await terminal.init();

  // Clear screen
  terminal.screen.clear();

  // Display instructions
  terminal.screen.writeAt(x(2), y(2), '=== Keyboard Input Test ===');
  terminal.screen.writeAt(x(2), y(4), 'Press any key to see its details');
  terminal.screen.writeAt(x(2), y(5), 'Press "q" or Ctrl+C to quit');
  terminal.screen.writeAt(x(2), y(7), 'Keys pressed:');

  let keyCount = 0;
  let running = true;
  const maxLines = 20;
  const keyHistory: string[] = [];

  // Function to update display
  const updateDisplay = () => {
    // Clear the key history area
    for (let i = 0; i < maxLines; i++) {
      terminal.screen.writeAt(x(2), y(9 + i), ' '.repeat(70));
    }

    // Display key history
    const startIndex = Math.max(0, keyHistory.length - maxLines);
    for (let i = 0; i < Math.min(keyHistory.length, maxLines); i++) {
      const historyIndex = startIndex + i;
      terminal.screen.writeAt(x(2), y(9 + i), keyHistory[historyIndex]);
    }
  };

  // Set up keyboard event handler
  terminal.events.on('key', (event: KeyEvent) => {
    keyCount++;

    // Build event description
    const modifiers: string[] = [];
    if (event.ctrl) modifiers.push('Ctrl');
    if (event.alt) modifiers.push('Alt');
    if (event.shift) modifiers.push('Shift');
    if (event.meta) modifiers.push('Meta');

    const modifierStr = modifiers.length > 0 ? `[${modifiers.join('+')}] ` : '';
    const keyStr = event.name || event.key || '?';
    const codeStr = event.raw ? ` (code: ${event.raw.charCodeAt(0)})` : '';
    
    const description = `${keyCount}: ${modifierStr}${keyStr}${codeStr}`;
    keyHistory.push(description);

    // Update display
    updateDisplay();

    // Check for quit commands
    if (event.key === 'q' || event.key === 'Q' || 
        (event.ctrl && (event.key === 'c' || event.key === 'C'))) {
      running = false;
      terminal.events.emit('close');
    }
  });

  // Set up resize handler
  terminal.events.on('resize', (rows: number, cols: number) => {
    terminal.screen.clear();
    terminal.screen.writeAt(x(2), y(2), '=== Keyboard Input Test ===');
    terminal.screen.writeAt(x(2), y(4), 'Press any key to see its details');
    terminal.screen.writeAt(x(2), y(5), 'Press "q" or Ctrl+C to quit');
    terminal.screen.writeAt(x(2), y(7), 'Keys pressed:');
    terminal.screen.writeAt(x(2), y(30), `Terminal resized to ${cols}x${rows}`);
    updateDisplay();
  });

  // Wait for close signal
  await new Promise<void>((resolve) => {
    terminal.events.once('close', () => {
      resolve();
    });
  });

  // Clean up
  await terminal.close();
  console.log(`\nTest completed. ${keyCount} keys were pressed.`);
}

// Run the application
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
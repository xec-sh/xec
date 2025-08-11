#!/usr/bin/env tsx
/**
 * Example 02: Cursor Control
 * Demonstrates cursor movement, visibility, shapes, and save/restore operations
 */

import { x, y , CursorShape } from '../src/types.js';
import { TerminalImpl } from '../src/core/terminal.js';

async function main() {
  console.log('=== TRM Core Example: Cursor Control ===\n');

  // Create and initialize terminal
  const terminal = new TerminalImpl();
  await terminal.init();

  // Get references to screen and cursor
  const screen = terminal.screen;
  const cursor = terminal.cursor;

  console.log('Demonstrating cursor operations...\n');

  // Clear screen for better visibility
  screen.clear();

  // 1. Basic cursor movement
  console.log('1. Basic cursor movement:');
  cursor.moveTo(x(0), y(0));
  terminal.stream.write('Starting at top-left');
  await sleep(1000);

  cursor.moveTo(x(20), y(5));
  terminal.stream.write('Moved to (20, 5)');
  await sleep(1000);

  // 2. Relative movement
  console.log('\n2. Relative movement:');
  cursor.moveUp(2);
  terminal.stream.write(' <- Moved up 2 lines');
  await sleep(1000);

  cursor.moveDown(4);
  terminal.stream.write(' <- Moved down 4 lines');
  await sleep(1000);

  cursor.moveLeft(10);
  terminal.stream.write('Left 10');
  await sleep(1000);

  cursor.moveRight(20);
  terminal.stream.write('Right 20');
  await sleep(1000);

  // 3. Move to column
  console.log('\n3. Move to column:');
  cursor.moveToColumn(x(0));
  terminal.stream.write('Back to column 0');
  await sleep(1000);

  // 4. Next/Previous line
  console.log('\n4. Next/Previous line:');
  cursor.moveToNextLine();
  terminal.stream.write('Next line (column 0)');
  await sleep(1000);

  cursor.moveToPreviousLine();
  terminal.stream.write('Previous line (column 0)');
  await sleep(1000);

  // 5. Save and restore
  console.log('\n5. Save and restore position:');
  cursor.moveTo(x(10), y(10));
  terminal.stream.write('Position saved here');
  cursor.save();
  await sleep(1000);

  cursor.moveTo(x(30), y(15));
  terminal.stream.write('Temporary position');
  await sleep(1000);

  cursor.restore();
  terminal.stream.write(' <- Restored!');
  await sleep(1000);

  // 6. Multiple save/restore
  console.log('\n6. Multiple save/restore positions:');
  cursor.moveTo(x(5), y(12));
  terminal.stream.write('Position 1');
  cursor.save();
  await sleep(500);

  cursor.moveTo(x(15), y(13));
  terminal.stream.write('Position 2');
  cursor.save();
  await sleep(500);

  cursor.moveTo(x(25), y(14));
  terminal.stream.write('Position 3');
  await sleep(1000);

  cursor.restore();
  terminal.stream.write(' <- Restored to 2');
  await sleep(1000);

  cursor.restore();
  terminal.stream.write(' <- Restored to 1');
  await sleep(1000);

  // 7. Cursor visibility
  console.log('\n7. Cursor visibility:');
  cursor.moveTo(x(0), y(16));
  terminal.stream.write('Hiding cursor for 2 seconds...');
  cursor.hide();
  await sleep(2000);

  terminal.stream.write(' Now showing again');
  cursor.show();
  await sleep(1000);

  // 8. Cursor shapes
  console.log('\n8. Cursor shapes:');
  cursor.moveTo(x(0), y(18));

  terminal.stream.write('Block cursor: ');
  cursor.setShape(CursorShape.Block);
  await sleep(1500);

  terminal.stream.write(' Underline cursor: ');
  cursor.setShape(CursorShape.Underline);
  await sleep(1500);

  terminal.stream.write(' Bar cursor: ');
  cursor.setShape(CursorShape.Bar);
  await sleep(1500);

  // Reset to block
  cursor.setShape(CursorShape.Block);

  // 9. Blinking control
  console.log('\n9. Cursor blinking:');
  cursor.moveTo(x(0), y(20));
  
  terminal.stream.write('Disabling blink...');
  cursor.disableBlink();
  await sleep(2000);

  terminal.stream.write(' Enabling blink...');
  cursor.enableBlink();
  await sleep(2000);

  // 10. Get position (async)
  console.log('\n10. Getting cursor position:');
  cursor.moveTo(x(15), y(22));
  const position = await cursor.getPosition();
  terminal.stream.write(`Current position: (${position.x}, ${position.y})`);
  await sleep(1000);

  // Also show synchronous position tracking
  const syncPos = cursor.position;
  cursor.moveTo(x(0), y(23));
  terminal.stream.write(`Tracked position: (${syncPos.x}, ${syncPos.y})`);

  // Clean up
  console.log('\n\nCleaning up...');
  // Reset cursor to default state
  cursor.show();
  cursor.setShape(CursorShape.Block);
  cursor.enableBlink();
  cursor.moveTo(x(0), y(25));
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
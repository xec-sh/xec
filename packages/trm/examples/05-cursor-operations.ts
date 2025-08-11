#!/usr/bin/env tsx
/**
 * Example 05: Advanced Cursor Operations
 * Demonstrates cursor movement, shapes, and advanced positioning
 */

import { ansi } from '../src/core/ansi.js';
import { CursorImpl } from '../src/core/cursor.js';
import { ColorSystem } from '../src/core/color.js';
import { x, y, ColorDepth } from '../src/types.js';
import { TerminalImpl } from '../src/core/terminal.js';

import { CursorShape } from '../src/types.js';
import type { Point } from '../src/types.js';

async function main() {
  console.log('=== TRM Core Example: Advanced Cursor Operations ===\n');

  const terminal = new TerminalImpl();
  await terminal.init();

  const cursor = new CursorImpl((data) => terminal.stream.write(data));
  const colors = new ColorSystem(ColorDepth.Extended);

  // Get terminal dimensions
  const width = terminal.stream.cols;
  const height = terminal.stream.rows;

  console.log(`Terminal size: ${width}x${height}\n`);

  // Example 1: Basic cursor movement
  console.log('Basic cursor movement:');

  cursor.moveTo(x(5), y(3));
  terminal.stream.write('Position (5, 3)');

  cursor.moveRight(10);
  terminal.stream.write(' -> Moved right by 10');

  cursor.moveLeft(5);
  cursor.moveDown(2);
  terminal.stream.write('\n     Moved left 5, down 2');

  // Example 2: Relative movement
  console.log('\n\nRelative movement:');

  cursor.moveTo(x(10), y(8));
  terminal.stream.write('Start');
  await sleep(500);

  cursor.moveUp(2);
  terminal.stream.write('Up 2');
  await sleep(500);

  cursor.moveDown(4);
  terminal.stream.write('Down 4');
  await sleep(500);

  cursor.moveLeft(5);
  terminal.stream.write('Left 5');
  await sleep(500);

  cursor.moveRight(10);
  terminal.stream.write('Right 10');

  // Example 3: Save and restore positions
  console.log('\n\nSave/restore positions:');

  cursor.moveTo(x(5), y(14));
  terminal.stream.write('Original position');
  // Note: position property may not be available, using save/restore instead

  cursor.save();

  cursor.moveTo(x(30), y(14));
  terminal.stream.write('Temporary position 1');
  await sleep(1000);

  cursor.moveTo(x(30), y(15));
  terminal.stream.write('Temporary position 2');
  await sleep(1000);

  cursor.restore();
  terminal.stream.write(' <- Restored!');

  // Example 4: Cursor shapes
  console.log('\n\nCursor shapes (if supported):');

  const shapes: CursorShape[] = [
    CursorShape.Block,
    CursorShape.Underline,
    CursorShape.Bar,
    CursorShape.BlinkingBlock,
    CursorShape.BlinkingUnderline,
    CursorShape.BlinkingBar
  ];

  for (const shape of shapes) {
    cursor.moveTo(x(5), y(18));
    cursor.setShape(shape);
    terminal.stream.write(`Cursor shape: ${CursorShape[shape].padEnd(15)}`);
    await sleep(1500);
  }

  // Reset to default
  cursor.setShape(CursorShape.Block);

  // Example 5: Drawing patterns with cursor
  console.log('\n\nDrawing patterns:');

  // Draw a square
  const squareStart = { x: x(10), y: y(22) };
  const squareSize = 10;

  cursor.moveTo(squareStart.x, squareStart.y);

  // Top line
  for (let i = 0; i < squareSize; i++) {
    terminal.stream.write('-');
  }

  // Right line
  for (let i = 1; i < squareSize; i++) {
    cursor.moveDown(1);
    cursor.moveLeft(1);
    terminal.stream.write('|');
  }

  // Bottom line
  for (let i = 1; i < squareSize; i++) {
    cursor.moveLeft(2);
    terminal.stream.write('-');
  }

  // Left line
  for (let i = 1; i < squareSize - 1; i++) {
    cursor.moveUp(1);
    cursor.moveRight(1);
    terminal.stream.write('|');
  }

  // Example 6: Animated cursor trail
  console.log('\n\nAnimated cursor trail:');

  const trailY = y(32);
  const trailLength = 20;
  const trailChars = ['█', '▓', '▒', '░'];

  for (let step = 0; step < trailLength + trailChars.length; step++) {
    // Clear previous trail
    cursor.moveTo(x(5), trailY);
    terminal.stream.write(' '.repeat(trailLength + 5));

    // Draw trail
    cursor.moveTo(x(5), trailY);
    for (let i = 0; i < trailLength; i++) {
      const pos = step - i;
      if (pos >= 0 && pos < trailChars.length) {
        terminal.stream.write(colors.toForeground(colors.ansi256(240 + pos * 5)) + trailChars[pos]);
      } else if (pos >= trailChars.length) {
        terminal.stream.write(' ');
      }
    }

    await sleep(100);
  }

  // Example 7: Cursor visibility control
  console.log('\n\nCursor visibility:');

  cursor.moveTo(x(5), y(35));
  terminal.stream.write('Hiding cursor in 2 seconds...');
  await sleep(2000);

  cursor.hide();
  terminal.stream.write(' Hidden! (wait 3 seconds)');
  await sleep(3000);

  cursor.show();
  terminal.stream.write(' Visible again!');

  // Example 8: Position tracking
  console.log('\n\nPosition tracking:');

  const positions: Point[] = [
    { x: x(10), y: y(38) },
    { x: x(25), y: y(38) },
    { x: x(40), y: y(38) },
    { x: x(25), y: y(39) },
    { x: x(10), y: y(39) }
  ];

  for (const pos of positions) {
    cursor.moveTo(pos.x, pos.y);
    terminal.stream.write(`(${pos.x},${pos.y})`);
    await sleep(500);
  }

  // Example 9: Cursor constraints
  console.log('\n\nCursor constraints:');

  // Try to move beyond screen boundaries
  cursor.moveTo(x(999), y(999));
  
  cursor.moveTo(x(5), y(42));
  terminal.stream.write(`Attempted to move to (999, 999), cursor should be at boundary`);

  // Example 10: Complex navigation pattern
  console.log('\n\nComplex navigation:');

  const centerX = Math.floor(width / 2);
  const centerY = 44;
  const radius = 8;

  // Draw a circle pattern
  for (let angle = 0; angle < 360; angle += 15) {
    const radians = (angle * Math.PI) / 180;
    const circleX = x(Math.round(centerX + radius * Math.cos(radians)));
    const circleY = y(Math.round(centerY + radius * Math.sin(radians) / 2)); // Adjust for terminal aspect ratio

    cursor.moveTo(circleX, circleY);
    terminal.stream.write('*');
    await sleep(50);
  }

  // Return to center
  cursor.moveTo(x(centerX), y(centerY));
  terminal.stream.write(colors.toForeground(colors.red) + '◉' + ansi.reset());

  // Clean up
  console.log('\n\nCleaning up...');
  cursor.show();
  cursor.setShape(CursorShape.Block);
  cursor.moveTo(x(0), y(height - 2));

  await terminal.close();
  console.log('Done!');
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
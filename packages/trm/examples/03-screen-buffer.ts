#!/usr/bin/env tsx
/**
 * Example 03: Screen Buffer Management
 * Demonstrates double buffering and efficient screen updates
 */

import { ColorSystem } from '../src/core/color.js';
import { StylesImpl } from '../src/core/styles.js';
import { TerminalImpl } from '../src/core/terminal.js';
import { BufferManagerImpl } from '../src/core/buffer.js';
import { x, y, cols, rows, ColorDepth } from '../src/types.js';


async function main() {
  console.log('=== TRM Core Example: Screen Buffer Management ===\n');

  const terminal = new TerminalImpl();
  await terminal.init();

  const colors = new ColorSystem(ColorDepth.Extended);
  const styles = new StylesImpl(colors);

  // Create buffer manager
  const bufferManager = new BufferManagerImpl(terminal.stream);

  // Get terminal size
  const width = terminal.stream.cols;
  const height = terminal.stream.rows;

  console.log(`Creating buffers for ${width}x${height} terminal\n`);

  // Create screen buffers
  const buffer1 = bufferManager.create(width, height);
  const buffer2 = bufferManager.create(width, height);

  // Example 1: Basic text writing
  console.log('Writing text to buffer...');
  buffer1.writeText(x(5), y(2), 'Hello from Buffer!', {
    fg: colors.green,
    bold: true
  });

  buffer1.writeLine(y(4), 'This is a full line of text', {
    fg: colors.cyan
  });

  // Example 2: Drawing boxes manually
  console.log('Drawing boxes manually...');

  // Draw a simple box using characters
  const boxX = 10;
  const boxY = 6;
  const boxWidth = 30;
  const boxHeight = 5;

  // Top border
  buffer1.setCell(x(boxX), y(boxY), '╔', { fg: colors.blue });
  for (let i = 1; i < boxWidth - 1; i++) {
    buffer1.setCell(x(boxX + i), y(boxY), '═', { fg: colors.blue });
  }
  buffer1.setCell(x(boxX + boxWidth - 1), y(boxY), '╗', { fg: colors.blue });

  // Side borders
  for (let j = 1; j < boxHeight - 1; j++) {
    buffer1.setCell(x(boxX), y(boxY + j), '║', { fg: colors.blue });
    buffer1.setCell(x(boxX + boxWidth - 1), y(boxY + j), '║', { fg: colors.blue });
  }

  // Bottom border
  buffer1.setCell(x(boxX), y(boxY + boxHeight - 1), '╚', { fg: colors.blue });
  for (let i = 1; i < boxWidth - 1; i++) {
    buffer1.setCell(x(boxX + i), y(boxY + boxHeight - 1), '═', { fg: colors.blue });
  }
  buffer1.setCell(x(boxX + boxWidth - 1), y(boxY + boxHeight - 1), '╝', { fg: colors.blue });

  // Example 3: Drawing lines manually
  console.log('Drawing lines manually...');

  // Horizontal line
  for (let i = 5; i < 35; i++) {
    buffer1.setCell(x(i), y(15), '=', { fg: colors.yellow });
  }

  // Diagonal line (approximate)
  for (let i = 0; i < 20; i++) {
    const xPos = 5 + i;
    const yPos = 17 + Math.floor(i * 0.25);
    if (xPos < width && yPos < height) {
      buffer1.setCell(x(xPos), y(yPos), '*', { fg: colors.red });
    }
  }

  // Example 4: Fill operations
  console.log('Fill operations...');
  buffer1.fillRect(x(50), y(2), cols(15), rows(3), '░', {
    fg: colors.gray
  });

  // Example 5: Copy buffer content manually
  console.log('Copying buffer regions manually...');

  // Copy content from one buffer to another
  for (let j = 0; j < 5; j++) {
    for (let i = 0; i < 30; i++) {
      const cell = buffer1.getCell(x(10 + i), y(6 + j));
      if (cell) {
        buffer2.setCell(x(5 + i), y(2 + j), cell.char, cell.style);
      }
    }
  }

  // Make some changes to buffer2
  buffer2.writeText(x(10), y(10), 'Modified text', {
    fg: colors.brightRed,
    bold: true
  });

  // Example 6: Scrolling effect manually
  console.log('Demonstrating scrolling effect...');

  // Fill buffer with numbered lines
  for (let i = 0; i < 10; i++) {
    buffer1.writeLine(y(i), `Line ${i + 1}: Some scrollable content here`, {
      fg: colors.ansi256(240 + i)
    });
  }

  // Render to terminal
  console.log('\nRendering buffer to terminal...');
  bufferManager.render(buffer1);

  // Wait a bit
  await sleep(2000);

  // Example 7: Double buffering animation
  console.log('\nDouble buffering animation...');

  let frame = 0;
  const animationFrames = 10;

  for (let i = 0; i < animationFrames; i++) {
    // Clear back buffer
    bufferManager.backBuffer.clear();

    // Draw animation frame
    const animX = x(10 + i * 3);
    const animY = y(12);

    bufferManager.backBuffer.writeText(animX, animY, '▓▓▓', {
      fg: colors.hsl(i * 36, 100, 50)  // Rainbow colors
    });

    // Draw frame counter
    bufferManager.backBuffer.writeText(x(5), y(24), `Frame: ${frame + 1}/${animationFrames}`, {
      fg: colors.white
    });

    // Flip buffers
    bufferManager.flip();

    // Render front buffer
    bufferManager.render(bufferManager.frontBuffer);

    frame++;
    await sleep(200);
  }

  // Example 8: Pattern fills
  console.log('\nPattern fills...');

  const patterns = ['█', '▓', '▒', '░'];
  for (let p = 0; p < patterns.length; p++) {
    bufferManager.backBuffer.fillRect(
      x(5 + p * 10),
      y(20),
      cols(8),
      rows(4),
      patterns[p],
      { fg: colors.ansi256(240 + p * 5) }
    );
  }

  bufferManager.flip();
  bufferManager.render(bufferManager.frontBuffer);
  await sleep(2000);

  // Example 9: Cell-by-cell manipulation
  console.log('\nCell manipulation...');

  // Create a gradient effect
  for (let j = 0; j < 5; j++) {
    for (let i = 0; i < 40; i++) {
      const brightness = Math.floor((i / 40) * 255);
      bufferManager.backBuffer.setCell(
        x(10 + i),
        y(26 + j),
        '▓',
        { fg: colors.rgb(brightness, brightness, brightness) }
      );
    }
  }

  bufferManager.flip();
  bufferManager.render(bufferManager.frontBuffer);
  await sleep(2000);

  // Example 10: Clear operations
  console.log('\nClear operations...');

  // Clear a rectangular area
  bufferManager.backBuffer.clearRect(x(15), y(10), cols(30), rows(5));
  bufferManager.backBuffer.writeText(x(20), y(12), 'Cleared area', {
    fg: colors.yellow
  });

  bufferManager.flip();
  bufferManager.render(bufferManager.frontBuffer);
  await sleep(2000);

  // Clean up
  console.log('\nCleaning up...');
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
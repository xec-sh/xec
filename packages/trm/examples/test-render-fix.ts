#!/usr/bin/env tsx
/**
 * Test script to verify buffer rendering with colors and styles
 */

import { ColorSystem } from '../src/core/color.js';
import { BufferManagerImpl } from '../src/core/buffer.js';
import { createTerminalStream } from '../src/core/stream.js';
import { x, y, cols, rows, ColorDepth } from '../src/types.js';

async function testRenderFix() {
  console.log('Testing buffer rendering with colors and styles...\n');
  
  // Create a terminal stream
  const stream = createTerminalStream();
  
  // Create buffer manager with actual terminal dimensions
  const bufferManager = new BufferManagerImpl(stream);
  
  // Create a color system
  const colors = new ColorSystem(ColorDepth.TrueColor);
  
  // Get terminal dimensions
  const width = stream.cols;
  const height = Math.min(stream.rows, 10); // Use only 10 rows for test
  
  console.log(`Terminal dimensions: ${width}x${stream.rows}`);
  console.log(`Using test area: ${width}x${height}\n`);
  
  // Create a test buffer
  const buffer = bufferManager.create(width as any, height as any);
  
  // Test 1: Write text with different foreground colors
  buffer.writeText(x(2), y(0), 'Color Test:', { fg: colors.white, bold: true });
  
  buffer.writeText(x(2), y(1), 'Red', { fg: colors.red });
  buffer.writeText(x(10), y(1), 'Green', { fg: colors.green });
  buffer.writeText(x(18), y(1), 'Blue', { fg: colors.blue });
  buffer.writeText(x(26), y(1), 'Yellow', { fg: colors.yellow });
  
  // Test 2: Background colors
  buffer.writeText(x(2), y(2), 'Background:', { fg: colors.white, bold: true });
  
  buffer.fillRect(x(2), y(3), cols(6), rows(1), ' ', { bg: colors.red });
  buffer.writeText(x(3), y(3), 'Red', { fg: colors.white, bg: colors.red });
  
  buffer.fillRect(x(10), y(3), cols(8), rows(1), ' ', { bg: colors.green });
  buffer.writeText(x(11), y(3), 'Green', { fg: colors.black, bg: colors.green });
  
  buffer.fillRect(x(20), y(3), cols(7), rows(1), ' ', { bg: colors.blue });
  buffer.writeText(x(21), y(3), 'Blue', { fg: colors.white, bg: colors.blue });
  
  // Test 3: Text styles
  buffer.writeText(x(2), y(4), 'Styles:', { fg: colors.white, bold: true });
  
  buffer.writeText(x(2), y(5), 'Bold', { fg: colors.white, bold: true });
  buffer.writeText(x(10), y(5), 'Italic', { fg: colors.white, italic: true });
  buffer.writeText(x(20), y(5), 'Underline', { fg: colors.white, underline: true });
  buffer.writeText(x(32), y(5), 'Strike', { fg: colors.white, strikethrough: true });
  
  // Test 4: RGB colors (if supported)
  if (stream.colorDepth >= ColorDepth.TrueColor) {
    buffer.writeText(x(2), y(6), 'RGB Gradient:', { fg: colors.white, bold: true });
    
    const gradientWidth = Math.min(60, width - 4);
    for (let i = 0; i < gradientWidth; i++) {
      const hue = (i * 360) / gradientWidth;
      const color = colors.hsl(hue, 100, 50);
      buffer.writeText(x(2 + i), y(7), '█', { fg: color });
    }
  }
  
  // Test 5: 256 colors (if supported)
  if (stream.colorDepth >= ColorDepth.Extended) {
    buffer.writeText(x(2), y(8), '256 Colors:', { fg: colors.white, bold: true });
    
    for (let i = 0; i < Math.min(32, width - 4); i++) {
      const colorIndex = 16 + i * 6; // Sample from the 256 color palette
      const color = colors.ansi256(colorIndex);
      buffer.writeText(x(2 + i), y(9), '■', { fg: color });
    }
  }
  
  // Render the buffer
  console.log('Rendering buffer with colors and styles...\n');
  bufferManager.render(buffer, x(0), y(0));
  
  // Move cursor below the test area
  stream.write(`\x1b[${height + 2};1H`);
  
  console.log('\nTest complete! You should see:');
  console.log('1. Colored text (Red, Green, Blue, Yellow)');
  console.log('2. Colored backgrounds');
  console.log('3. Text styles (Bold, Italic, Underline, Strikethrough)');
  if (stream.colorDepth >= ColorDepth.TrueColor) {
    console.log('4. RGB color gradient');
  }
  if (stream.colorDepth >= ColorDepth.Extended) {
    console.log('5. 256 color samples');
  }
  
  console.log(`\nTerminal color depth: ${ColorDepth[stream.colorDepth]}`);
}

// Run the test
testRenderFix().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
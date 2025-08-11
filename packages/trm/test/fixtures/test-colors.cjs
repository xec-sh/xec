#!/usr/bin/env node

/**
 * Color test application for integration testing
 */

const { createTerminal, ColorSystem, ColorDepth, x, y } = require('../../dist/index.cjs');

async function main() {
  const terminal = createTerminal({
    mode: 'inline',
    colors: true
  });
  
  await terminal.init();
  
  // Create color system
  const colors = new ColorSystem(ColorDepth.TrueColor);
  
  // Create buffer manager
  const buffer = terminal.buffer.create(80, 10);
  
  // Test basic colors
  console.log('=== Color Test ===');
  
  // Write colored text using the buffer
  buffer.writeText(x(0), y(0), 'Red Text', { fg: colors.red });
  buffer.writeText(x(0), y(1), 'Green Text', { fg: colors.green });
  buffer.writeText(x(0), y(2), 'Blue Text', { fg: colors.blue });
  buffer.writeText(x(0), y(3), 'Yellow Text', { fg: colors.yellow });
  
  // Test backgrounds
  buffer.writeText(x(0), y(4), 'White on Blue', { 
    fg: colors.white, 
    bg: colors.blue 
  });
  
  // Test RGB colors
  const customColor = colors.rgb(128, 64, 192);
  buffer.writeText(x(0), y(5), 'Custom RGB', { fg: customColor });
  
  // Test 256 colors
  const color256 = colors.ansi256(196); // Red-ish
  buffer.writeText(x(0), y(6), '256 Color', { fg: color256 });
  
  // Render the buffer
  terminal.buffer.render(buffer);
  
  // Print test status
  console.log('\nColors rendered successfully');
  
  await terminal.close();
  
  // Exit after short delay
  setTimeout(() => {
    process.exit(0);
  }, 100);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
#!/usr/bin/env node

/**
 * Simple test application for terminal integration tests
 */

// Simple console output for testing
console.log('TRM Test Application');
console.log('====================');
console.log('');
console.log('Red Text');
console.log('Green Text');
console.log('Blue Text');
console.log('');
console.log('Bold Text');
console.log('Italic Text');
console.log('Underlined Text');
console.log('');
console.log('Cursor Position Test');
console.log('');
console.log('');
console.log('');
console.log('Press q to quit');

// Handle simple input simulation
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.on('data', (chunk) => {
    const char = chunk.toString();
    
    if (char === 'q' || char === '\x03') { // q or Ctrl+C
      console.log('');
      process.exit(0);
    } else if (char === '\x1b[A') { // Up arrow
      console.log('Moved Up');
    } else if (char === '\x1b[B') { // Down arrow
      console.log('Moved Down');
    } else if (char === '\x1b[D') { // Left arrow
      console.log('Moved Left');
    } else if (char === '\x1b[C') { // Right arrow
      console.log('Moved Right');
    } else if (char === '\r' || char === '\n') { // Enter
      console.log('Key pressed: Enter');
    } else if (char === '\t') { // Tab
      console.log('Key pressed: Tab');
    } else if (char === '\x1b') { // Escape
      console.log('Key pressed: Escape');
    } else if (char === '\x01') { // Ctrl+A
      console.log('Ctrl+A');
    } else {
      console.log(`Key pressed: ${char}`);
    }
  });
}

// Simulate resize event
process.stdout.on('resize', () => {
  const cols = process.stdout.columns;
  const rows = process.stdout.rows;
  console.log(`Terminal resized to ${cols}x${rows}`);
});

// Simulate mouse events (simple output)
function simulateMouseEvent(x, y) {
  console.log(`Mouse: click at (${x}, ${y})`);
}

// Export for potential external use
module.exports = { simulateMouseEvent };

// Keep alive for 30 seconds in TTY mode, otherwise exit quickly
setTimeout(() => {
  process.exit(0);
}, process.stdin.isTTY ? 30000 : 1000);
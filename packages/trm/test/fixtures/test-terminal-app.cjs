#!/usr/bin/env node

/**
 * Simple test application for terminal integration tests
 */

// Simple console output with ANSI codes for testing
console.log('TRM Test Application');
console.log('====================');
console.log('');
console.log('\x1b[31mRed Text\x1b[0m');
console.log('\x1b[32mGreen Text\x1b[0m');
console.log('\x1b[34mBlue Text\x1b[0m');
console.log('');
console.log('\x1b[1mBold Text\x1b[0m');
console.log('\x1b[3mItalic Text\x1b[0m');
console.log('\x1b[4mUnderlined Text\x1b[0m');
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
    const bytes = [...chunk];
    const char = chunk.toString();
    
    // Handle single byte characters
    if (bytes.length === 1) {
      const code = bytes[0];
      if (code === 113 || code === 81) { // 'q' or 'Q'
        console.log('');
        process.exit(0);
      } else if (code === 3) { // Ctrl+C
        console.log('');
        process.exit(0);
      } else if (code === 13) { // Enter
        console.log('Key pressed: Enter');
      } else if (code === 9) { // Tab
        console.log('Key pressed: Tab');
      } else if (code === 27) { // Escape
        console.log('Key pressed: Escape');
      } else if (code === 1) { // Ctrl+A
        console.log('Ctrl+A');
      } else {
        console.log(`Key pressed: ${char}`);
      }
    }
    // Handle arrow keys (3-byte escape sequences)
    else if (bytes.length === 3 && bytes[0] === 27 && bytes[1] === 91) {
      switch(bytes[2]) {
        case 65: console.log('Moved Up'); break;
        case 66: console.log('Moved Down'); break;
        case 67: console.log('Moved Right'); break;
        case 68: console.log('Moved Left'); break;
      }
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

// Keep process alive
// Use setInterval instead of setTimeout to keep the event loop active
const keepAlive = setInterval(() => {}, 1000);

// Exit after 30 seconds for safety
setTimeout(() => {
  clearInterval(keepAlive);
  process.exit(0);
}, 30000);
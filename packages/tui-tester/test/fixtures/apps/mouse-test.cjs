#!/usr/bin/env node

// Mouse interaction test app
const readline = require('readline');

// Enable mouse tracking
process.stdout.write('\x1b[?1000h'); // Enable mouse tracking
process.stdout.write('\x1b[?1002h'); // Enable mouse motion tracking

console.log('=== Mouse Test ===');
console.log('Click anywhere on the screen');
console.log('Press Q to quit\n');

const positions = [];

// Check if stdin is a TTY before setting raw mode
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.resume();
process.stdin.on('data', (data) => {
  const str = data.toString();
  
  // Check for quit
  if (str === 'q' || str === 'Q' || str === '\x03') {
    // Disable mouse tracking before exit
    process.stdout.write('\x1b[?1000l');
    process.stdout.write('\x1b[?1002l');
    console.log('\nGoodbye!');
    process.exit(0);
  }
  
  // Parse mouse events (simplified)
  if (str.startsWith('\x1b[M')) {
    const bytes = Array.from(data);
    if (bytes.length >= 6) {
      const button = bytes[3] - 32;
      const x = bytes[4] - 32;
      const y = bytes[5] - 32;
      
      console.log(`Mouse event: button=${button}, x=${x}, y=${y}`);
      positions.push({ button, x, y });
    }
  }
});

// Cleanup on exit
process.on('exit', () => {
  process.stdout.write('\x1b[?1000l');
  process.stdout.write('\x1b[?1002l');
});
#!/usr/bin/env node

/**
 * Proper test application for terminal integration tests
 * Following tui-tester's fixture patterns
 */

const readline = require('readline');

// Create readline interface  
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Display the initial screen immediately
function displayScreen() {
  console.clear();
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
}

// Initial display
displayScreen();

// Check if stdin is a TTY before setting raw mode
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.resume();

// Handle input using data event (more reliable in tmux)
process.stdin.on('data', (chunk) => {
  const bytes = [...chunk];
  
  // Handle arrow keys (escape sequences)
  if (bytes.length === 3 && bytes[0] === 27 && bytes[1] === 91) {
    switch(bytes[2]) {
      case 65: // Up arrow
        console.log('Moved Up');
        break;
      case 66: // Down arrow
        console.log('Moved Down');
        break;
      case 67: // Right arrow
        console.log('Moved Right');
        break;
      case 68: // Left arrow
        console.log('Moved Left');
        break;
    }
  }
  // Handle Enter key
  else if (bytes.length === 1 && bytes[0] === 13) {
    console.log('Key pressed: Enter');
  }
  // Handle Tab key
  else if (bytes.length === 1 && bytes[0] === 9) {
    console.log('Key pressed: Tab');
  }
  // Handle Escape key
  else if (bytes.length === 1 && bytes[0] === 27) {
    console.log('Key pressed: Escape');
  }
  // Handle Ctrl+C
  else if (bytes.length === 1 && bytes[0] === 3) {
    console.clear();
    process.exit(0);
  }
  // Handle 'q' for quit
  else if (bytes.length === 1 && (bytes[0] === 113 || bytes[0] === 81)) { // q or Q
    console.clear();
    process.exit(0);
  }
  // Handle Ctrl+A
  else if (bytes.length === 1 && bytes[0] === 1) {
    console.log('Ctrl+A');
  }
  // Handle regular characters
  else if (bytes.length === 1 && bytes[0] >= 32 && bytes[0] < 127) {
    const char = String.fromCharCode(bytes[0]);
    console.log(`Key pressed: ${char}`);
  }
});

// Handle resize events
process.stdout.on('resize', () => {
  const cols = process.stdout.columns;
  const rows = process.stdout.rows;
  console.log(`Terminal resized to ${cols}x${rows}`);
});

// Handle mouse events
let mouseEnabled = false;

function enableMouse() {
  if (!mouseEnabled) {
    process.stdout.write('\x1b[?1000h'); // Enable mouse tracking
    mouseEnabled = true;
  }
}

function disableMouse() {
  if (mouseEnabled) {
    process.stdout.write('\x1b[?1000l'); // Disable mouse tracking
    mouseEnabled = false;
  }
}

// Simulate mouse click
function handleMouseClick(x, y) {
  console.log(`Mouse: click at (${x}, ${y})`);
}

// Keep process alive (like tui-tester fixtures do)
const keepAlive = setInterval(() => {}, 1000);

// Clean up on exit
process.on('exit', () => {
  clearInterval(keepAlive);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  disableMouse();
});

// Auto-exit after 30 seconds to prevent hanging
setTimeout(() => {
  process.exit(0);
}, 30000);

// Export for testing
module.exports = { enableMouse, disableMouse, handleMouseClick };
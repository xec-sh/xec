#!/usr/bin/env node

// Simpler test menu to debug input issues
console.log('Test Menu Started');
console.log('Press any key to see its code');

// Check if stdin is a TTY before setting raw mode
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.resume();

process.stdin.on('data', (chunk) => {
  const bytes = [...chunk];
  console.log('Received bytes:', bytes);
  
  // Check for specific keys
  if (bytes.length === 1) {
    const code = bytes[0];
    if (code === 13) {
      console.log('ENTER key detected!');
    } else if (code === 3) {
      console.log('Ctrl+C - Exiting');
      process.exit(0);
    } else {
      console.log(`Character: "${String.fromCharCode(code)}" (code: ${code})`);
    }
  } else if (bytes.length === 3 && bytes[0] === 27 && bytes[1] === 91) {
    // Escape sequences
    switch(bytes[2]) {
      case 65: console.log('UP arrow'); break;
      case 66: console.log('DOWN arrow'); break;
      case 67: console.log('RIGHT arrow'); break;
      case 68: console.log('LEFT arrow'); break;
      default: console.log('Unknown escape sequence');
    }
  }
});

// Keep alive for 30 seconds
setTimeout(() => {
  console.log('Timeout - exiting');
  process.exit(0);
}, 30000);
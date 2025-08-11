#!/usr/bin/env node

// Simple echo app for testing basic output
console.log('Ready');

// Check if stdin is a TTY before setting raw mode
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

process.stdin.on('data', (data) => {
  const char = data.toString();
  
  // Exit on Ctrl+C
  if (char === '\x03') {
    console.log('\nBye!');
    process.exit(0);
  }
  
  // Echo the character
  process.stdout.write(char);
});

// Keep process alive
process.stdin.resume();
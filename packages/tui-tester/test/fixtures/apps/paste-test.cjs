#!/usr/bin/env node

// Bracketed paste mode test app
const readline = require('readline');

// Enable bracketed paste mode
process.stdout.write('\x1b[?2004h');

console.log('=== Paste Test ===');
console.log('Paste text here (Ctrl+C to exit):');
console.log('');

let buffer = '';
let inPaste = false;

// Check if stdin is a TTY before setting raw mode
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.resume();
process.stdin.on('data', (data) => {
  const str = data.toString();
  
  // Check for paste start
  if (str === '\x1b[200~') {
    inPaste = true;
    buffer = '';
    return;
  }
  
  // Check for paste end
  if (str === '\x1b[201~') {
    inPaste = false;
    console.log('Pasted text:');
    console.log('---');
    console.log(buffer);
    console.log('---');
    console.log(`Length: ${buffer.length} characters\n`);
    buffer = '';
    return;
  }
  
  // Exit on Ctrl+C
  if (str === '\x03') {
    process.stdout.write('\x1b[?2004l'); // Disable bracketed paste
    console.log('\nBye!');
    process.exit(0);
  }
  
  // Accumulate pasted text
  if (inPaste) {
    buffer += str;
  } else {
    // Echo regular typed characters
    process.stdout.write(str);
  }
});

// Cleanup on exit
process.on('exit', () => {
  process.stdout.write('\x1b[?2004l');
});
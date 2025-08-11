#!/usr/bin/env node

/**
 * Test application for 256 color support
 */

console.log('256 Color Test');
console.log('');
console.log('Color Palette:');

// Output some 256 color sequences
console.log('\x1b[38;5;196mColor 196 (Red)\x1b[0m');
console.log('\x1b[38;5;46mColor 46 (Green)\x1b[0m');
console.log('\x1b[38;5;21mColor 21 (Blue)\x1b[0m');
console.log('\x1b[38;5;226mColor 226 (Yellow)\x1b[0m');
console.log('');

// Background colors
console.log('Backgrounds:');
console.log('\x1b[48;5;196m  \x1b[0m \x1b[48;5;46m  \x1b[0m \x1b[48;5;21m  \x1b[0m \x1b[48;5;226m  \x1b[0m');

// Exit after 1 second
setTimeout(() => {
  process.exit(0);
}, 1000);
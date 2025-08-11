#!/usr/bin/env node

/**
 * Test application for RGB color support
 */

console.log('RGB Color Test');
console.log('');
console.log('RGB Colors:');

// Output RGB color sequences (24-bit true color)
console.log('\x1b[38;2;255;0;0mPure Red (255,0,0)\x1b[0m');
console.log('\x1b[38;2;0;255;0mPure Green (0,255,0)\x1b[0m');
console.log('\x1b[38;2;0;0;255mPure Blue (0,0,255)\x1b[0m');
console.log('\x1b[38;2;255;128;0mOrange (255,128,0)\x1b[0m');
console.log('\x1b[38;2;128;0;255mPurple (128,0,255)\x1b[0m');
console.log('');

// RGB backgrounds
console.log('RGB Backgrounds:');
console.log('\x1b[48;2;255;0;0m  \x1b[0m \x1b[48;2;0;255;0m  \x1b[0m \x1b[48;2;0;0;255m  \x1b[0m');

// Exit after 1 second
setTimeout(() => {
  process.exit(0);
}, 1000);
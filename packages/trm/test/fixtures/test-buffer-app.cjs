#!/usr/bin/env node

/**
 * Test application for buffer operations
 */

// Buffer test output
console.log('=== Buffer Test ===');
console.log('');
console.log('Buffer Content:');
console.log('#######################');
console.log('#                     #');
console.log('# Hello               #');
console.log('# Buffer              #');
console.log('#                     #');
console.log('#######################');
console.log('');

// Box drawing characters
console.log('┌───────────────────┐');
console.log('│ Box Drawing Test  │');
console.log('└───────────────────┘');
console.log('');

// Horizontal line
console.log('-------------------');
console.log('');

// ANSI test section
console.log('=== ANSI Test ===');
console.log('');
console.log('Cursor moved here');
console.log('\x1b[31mRed text with ANSI\x1b[0m');
console.log('\x1b[42mGreen background\x1b[0m');
console.log('\x1b[1mBold\x1b[0m \x1b[3mItalic\x1b[0m \x1b[4mUnderline\x1b[0m');
console.log('');
console.log('Scroll region line 1');
console.log('Scroll region line 2');
console.log('Scroll region line 3');
console.log('');
console.log('Clear line test');
console.log('Save position - back');
console.log('\x1b[0m'); // Reset

// Exit after 1 second
setTimeout(() => {
  process.exit(0);
}, 1000);
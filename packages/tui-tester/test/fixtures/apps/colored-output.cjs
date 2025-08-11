#!/usr/bin/env node

// Colored output app for testing ANSI color codes
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  underline: '\x1b[4m'
};

console.log('=== Color Test ===\n');
console.log(`${colors.red}Red text${colors.reset}`);
console.log(`${colors.green}Green text${colors.reset}`);
console.log(`${colors.blue}Blue text${colors.reset}`);
console.log(`${colors.yellow}${colors.bold}Bold yellow${colors.reset}`);
console.log(`${colors.magenta}${colors.underline}Underlined magenta${colors.reset}`);
console.log(`${colors.cyan}Cyan text${colors.reset}`);

// Status messages
console.log('\n=== Status Messages ===');
console.log(`${colors.green}✓ Success${colors.reset}`);
console.log(`${colors.red}✗ Error${colors.reset}`);
console.log(`${colors.yellow}⚠ Warning${colors.reset}`);

// Wait for user input before exit
// Check if stdin is a TTY before setting raw mode
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.resume();
process.stdin.on('data', (data) => {
  if (data.toString() === '\x03') { // Ctrl+C
    process.exit(0);
  }
});
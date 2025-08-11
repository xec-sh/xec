#!/usr/bin/env node

// Interactive menu app for testing navigation
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const menuItems = ['Option 1', 'Option 2', 'Option 3', 'Exit'];
let selectedIndex = 0;

function drawMenu() {
  console.clear();
  console.log('=== Main Menu ===\n');
  
  menuItems.forEach((item, index) => {
    const prefix = index === selectedIndex ? '> ' : '  ';
    console.log(prefix + item);
  });
  
  console.log('\nUse arrow keys to navigate, Enter to select');
}

drawMenu();

// Check if stdin is a TTY before setting raw mode
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.resume();

process.stdin.on('keypress', (str, key) => {
  if (key.name === 'up') {
    selectedIndex = Math.max(0, selectedIndex - 1);
    drawMenu();
  } else if (key.name === 'down') {
    selectedIndex = Math.min(menuItems.length - 1, selectedIndex + 1);
    drawMenu();
  } else if (key.name === 'return') {
    const selected = menuItems[selectedIndex];
    console.clear();
    console.log(`Selected: ${selected}`);
    
    if (selected === 'Exit') {
      console.log('Goodbye!');
      process.exit(0);
    }
    
    setTimeout(() => drawMenu(), 1500);
  } else if (key.ctrl && key.name === 'c') {
    process.exit(0);
  }
});

readline.emitKeypressEvents(process.stdin);
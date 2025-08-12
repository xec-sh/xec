#!/usr/bin/env node

// Fixed interactive menu app for testing navigation
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

// Initial draw
drawMenu();

// Check if stdin is a TTY before setting raw mode
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.resume();

// Direct data handling instead of keypress events which might not work in tmux
process.stdin.on('data', (chunk) => {
  const bytes = [...chunk];
  
  // Handle arrow keys (escape sequences)
  if (bytes.length === 3 && bytes[0] === 27 && bytes[1] === 91) {
    switch(bytes[2]) {
      case 65: // Up arrow
        selectedIndex = selectedIndex === 0 ? menuItems.length - 1 : selectedIndex - 1;
        drawMenu();
        break;
      case 66: // Down arrow
        selectedIndex = selectedIndex === menuItems.length - 1 ? 0 : selectedIndex + 1;
        drawMenu();
        break;
    }
  }
  // Handle Enter key
  else if (bytes.length === 1 && bytes[0] === 13) {
    const selected = menuItems[selectedIndex];
    console.clear();
    console.log(`Selected: ${selected}`);
    
    if (selected === 'Exit') {
      console.log('Goodbye!');
      setTimeout(() => process.exit(0), 100);
      return;
    }
    
    // Reset to first item when returning to menu
    selectedIndex = 0;
    setTimeout(() => drawMenu(), 1500);
  }
  // Handle Ctrl+C or 'q' for quit
  else if ((bytes.length === 1 && bytes[0] === 3) || 
           (bytes.length === 1 && bytes[0] === 113)) {
    process.exit(0);
  }
});

// Keep process alive
const keepAlive = setInterval(() => {}, 1000);

// Clean exit after 30 seconds
setTimeout(() => {
  clearInterval(keepAlive);
  console.log('\nTimeout - exiting');
  process.exit(0);
}, 30000);
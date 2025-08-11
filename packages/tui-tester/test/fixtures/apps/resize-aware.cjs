#!/usr/bin/env node

// Resize-aware app for testing terminal size changes
function drawBox() {
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  
  console.clear();
  console.log(`Terminal Size: ${cols}x${rows}`);
  console.log('');
  
  // Draw a box that adapts to terminal size
  const boxWidth = Math.min(cols - 4, 60);
  const boxHeight = Math.min(rows - 6, 10);
  
  // Top border
  console.log('┌' + '─'.repeat(boxWidth - 2) + '┐');
  
  // Middle
  for (let i = 0; i < boxHeight - 2; i++) {
    if (i === Math.floor((boxHeight - 2) / 2)) {
      const text = 'Resize me!';
      const padding = Math.floor((boxWidth - text.length - 2) / 2);
      console.log('│' + ' '.repeat(padding) + text + ' '.repeat(boxWidth - padding - text.length - 2) + '│');
    } else {
      console.log('│' + ' '.repeat(boxWidth - 2) + '│');
    }
  }
  
  // Bottom border
  console.log('└' + '─'.repeat(boxWidth - 2) + '┘');
  
  console.log('\nPress Ctrl+C to exit');
}

drawBox();

// Handle resize events
process.stdout.on('resize', () => {
  drawBox();
});

// Handle exit
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
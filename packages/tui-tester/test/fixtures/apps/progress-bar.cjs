#!/usr/bin/env node

// Progress bar app for testing dynamic updates
const total = 20;
let progress = 0;

function drawProgressBar() {
  const filled = Math.floor((progress / total) * 20);
  const empty = 20 - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const percent = Math.floor((progress / total) * 100);
  
  process.stdout.write(`\rProgress: [${bar}] ${percent}%`);
  
  if (progress >= total) {
    console.log('\nComplete!');
    process.exit(0);
  }
}

console.log('Starting process...');

const interval = setInterval(() => {
  progress++;
  drawProgressBar();
  
  if (progress >= total) {
    clearInterval(interval);
  }
}, 100);
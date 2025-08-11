#!/usr/bin/env tsx
/**
 * Example 01: Hello World
 * 
 * Simplest Aura application showing text rendering
 */

import { text, render } from '../src/index.js';

async function main() {
  // Create a simple text component
  const app = text({
    value: 'Hello, Aura! 🌟',
    x: 'center',
    y: 'center',
    style: {
      fg: { r: 100, g: 200, b: 255 }, // Light blue
      bold: true
    }
  });

  // Render to terminal
  const renderer = await render(app);

  // Exit on any key press
  setTimeout(async () => {
    await renderer.cleanup();
    console.log('\nGoodbye!');
    process.exit(0);
  }, 3000);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
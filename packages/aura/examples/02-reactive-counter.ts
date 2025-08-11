#!/usr/bin/env tsx
/**
 * Example 02: Reactive Counter
 * 
 * Demonstrates reactive state with a simple counter
 */

import { 
  flex, 
  text, 
  button, 
  render, 
  signal, 
  computed 
} from '../src/index.js';

async function main() {
  // Create reactive state
  const count = signal(0);
  const doubleCount = computed(() => count() * 2);
  const message = computed(() => `Count: ${count()} | Double: ${doubleCount()}`);

  // Create UI
  const app = flex({
    direction: 'column',
    gap: 2,
    x: 'center',
    y: 'center',
    children: [
      text({
        value: message,
        style: {
          fg: { r: 100, g: 200, b: 255 },
          bold: true
        }
      }),
      
      flex({
        direction: 'row',
        gap: 2,
        children: [
          button({
            label: '- Decrement',
            onClick: () => count.update(c => c - 1),
            style: {
              fg: { r: 255, g: 100, b: 100 }
            }
          }),
          
          button({
            label: '+ Increment',
            onClick: () => count.update(c => c + 1),
            style: {
              fg: { r: 100, g: 255, b: 100 }
            }
          }),
          
          button({
            label: 'Reset',
            onClick: () => count.set(0),
            style: {
              fg: { r: 200, g: 200, b: 200 }
            }
          })
        ]
      }),
      
      text({
        value: 'Use arrow keys or Tab to navigate, Enter to activate',
        style: {
          fg: { r: 150, g: 150, b: 150 },
          italic: true
        }
      })
    ]
  });

  // Render to terminal
  const renderer = await render(app);

  // Auto-increment every second for demo
  const timer = setInterval(() => {
    count.update(c => c + 1);
  }, 1000);

  // Cleanup on exit
  process.on('SIGINT', async () => {
    clearInterval(timer);
    await renderer.cleanup();
    console.log('\nGoodbye!');
    process.exit(0);
  });
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
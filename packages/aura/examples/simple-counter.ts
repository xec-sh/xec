#!/usr/bin/env bun
/**
 * Simple Counter - Minimal Reactive Component Example
 * 
 * This is a minimal example showing:
 * - Custom component creation
 * - Reactive state with signals
 * - Using aura('text') for rendering
 * - Basic keyboard interaction
 */

import { auraApp } from '../src/app/application.js';
import { aura } from '../src/app/aura.js';
import { signal, computed } from '@xec-sh/neoflux';
import type { AnyAuraElement } from '../src/app/types.js';

/**
 * Simple Counter Component
 * A minimal custom component demonstrating reactivity
 */
function SimpleCounter(): AnyAuraElement {
  // Reactive state - the counter value
  const count = signal(0);
  
  // Computed value - formatted display text
  const displayText = computed(() => {
    return `Current count: ${count.get()}`;
  });
  
  // Methods to update the counter
  const increment = () => count.set(count.get() + 1);
  const decrement = () => count.set(count.get() - 1);
  const reset = () => count.set(0);
  
  // Store methods globally for keyboard handler
  (global as any).counterActions = { increment, decrement, reset };
  
  // Build the component using aura('text')
  return aura('box', {
    x: 10,
    y: 5,
    width: 40,
    height: 10,
    title: 'Simple Counter',
    border: 'single',
    children: [
      // Display the counter value using aura('text')
      aura('text', {
        x: 2,
        y: 2,
        content: displayText, // This is reactive!
        style: {
          color: [0, 1, 0, 1], // Green text
          bold: true
        }
      }),
      
      // Instructions
      aura('text', {
        x: 2,
        y: 4,
        content: 'Press:',
        style: { color: [0.7, 0.7, 0.7, 1] }
      }),
      
      aura('text', {
        x: 2,
        y: 5,
        content: '[+] increment  [-] decrement',
        style: { color: [0.5, 0.5, 0.5, 1] }
      }),
      
      aura('text', {
        x: 2,
        y: 6,
        content: '[r] reset      [q] quit',
        style: { color: [0.5, 0.5, 0.5, 1] }
      })
    ]
  });
}

// Main app
async function main() {
  const app = await auraApp({
    children: SimpleCounter(),
    
    onKeyPress: (key) => {
      const actions = (global as any).counterActions;
      
      switch (key.name) {
        case '+':
          actions.increment();
          break;
        case '-':
          actions.decrement();
          break;
        case 'r':
          actions.reset();
          break;
        case 'q':
          app.stop();
          process.exit(0);
          break;
      }
    }
  });
}

main().catch(console.error);
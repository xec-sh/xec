#!/usr/bin/env bun
/**
 * Demo of improved Aura application architecture
 * Shows how the new API is more intuitive and flexible
 */

import { auraApp } from '../src/app/application.js';
import { Box, Text, Show, For } from '../src/app/aura.js';
import { signal, computed } from '@xec-sh/neoflux';

// Example 1: Simple single component app
async function simpleExample() {
  const app = await auraApp(
    Text({
      content: 'Hello, Aura! Press q to quit.',
      style: { color: [0, 1, 0, 1] }
    })
  );

  return app;
}

// Example 2: Multiple components at root level
async function multipleComponentsExample() {
  const app = await auraApp([
    // Header
    Box({
      x: 0,
      y: 0,
      width: '100%',
      height: 3,
      title: 'Header',
      border: 'single',
      children: [
        Text({ content: 'Multiple Components Demo', x: 1, y: 1 })
      ]
    }),

    // Main content area
    Box({
      x: 0,
      y: 3,
      width: '70%',
      height: 15,
      title: 'Main Content',
      border: 'single',
      children: [
        Text({ content: 'Main content goes here', x: 1, y: 1 })
      ]
    }),

    // Sidebar
    Box({
      x: '70%',
      y: 3,
      width: '30%',
      height: 15,
      title: 'Sidebar',
      border: 'single',
      children: [
        Text({ content: 'Sidebar content', x: 1, y: 1 })
      ]
    }),

    // Footer
    Box({
      x: 0,
      y: 18,
      width: '100%',
      height: 3,
      title: 'Footer',
      border: 'single',
      children: [
        Text({ content: 'Status: Ready | Press q to quit', x: 1, y: 1 })
      ]
    })
  ]);

  return app;
}

// Example 3: Dynamic components with signals
async function dynamicExample() {
  const counter = signal(0);
  const items = signal(['Item 1', 'Item 2', 'Item 3']);
  const showDetails = signal(false);

  const app = await auraApp(
    () => [
      // Dynamic counter display
      Box({
        x: 2,
        y: 2,
        width: 30,
        height: 5,
        title: 'Counter',
        border: 'single',
        children: [
          Text({
            x: 1,
            y: 1,
            content: computed(() => `Count: ${counter.get()}`)
          }),
          Text({
            x: 1,
            y: 2,
            content: 'Press + to increment, - to decrement'
          })
        ]
      }),

      // Dynamic list
      Box({
        x: 35,
        y: 2,
        width: 30,
        height: 10,
        title: 'Dynamic List',
        border: 'single',
        children: [
          For({
            each: items,
            children: (item, index) => Text({
              x: 1,
              y: computed(() => index.get() + 1),
              content: computed(() => `• ${item}`)
            })
          })
        ]
      }),

      // Conditional rendering
      Show({
        when: showDetails,
        children: () => Box({
          x: 2,
          y: 8,
          width: 30,
          height: 6,
          title: 'Details',
          border: 'double',
          style: {
            backgroundColor: [0.1, 0.1, 0.3, 0.8]
          },
          children: [
            Text({
              x: 1,
              y: 1,
              content: 'Details are now visible!'
            }),
            Text({
              x: 1,
              y: 2,
              content: 'Press d again to hide'
            })
          ]
        })
      }),

      // Instructions
      Text({
        x: 2,
        y: 15,
        content: 'Keys: + (increment) | - (decrement) | d (toggle details) | q (quit)'
      })
    ],
    {
      onKey: (key) => {
        switch (key) {
          case '+':
            counter.set(counter.get() + 1);
            break;
          case '-':
            counter.set(counter.get() - 1);
            break;
          case 'd':
            showDetails.set(!showDetails.get());
            break;
          case 'a':
            items.set([...items.get(), `Item ${items.get().length + 1}`]);
            break;
        }
      }
    }
  );

  return app;
}

// Example 4: Updating children dynamically
async function updatingChildrenExample() {
  const views = {
    home: () => [
      Box({
        x: 2,
        y: 2,
        width: 40,
        height: 10,
        title: 'Home View',
        border: 'single',
        children: [
          Text({ x: 1, y: 1, content: 'Welcome to Home!' }),
          Text({ x: 1, y: 3, content: 'Press:' }),
          Text({ x: 1, y: 4, content: '  1 - Home (current)' }),
          Text({ x: 1, y: 5, content: '  2 - Settings' }),
          Text({ x: 1, y: 6, content: '  3 - About' })
        ]
      })
    ],
    settings: () => [
      Box({
        x: 2,
        y: 2,
        width: 40,
        height: 10,
        title: 'Settings View',
        border: 'double',
        style: {
          borderColor: [1, 1, 0, 1]
        },
        children: [
          Text({ x: 1, y: 1, content: 'Settings Page' }),
          Text({ x: 1, y: 3, content: 'Options:' }),
          Text({ x: 1, y: 4, content: '  [x] Enable feature A' }),
          Text({ x: 1, y: 5, content: '  [ ] Enable feature B' })
        ]
      })
    ],
    about: () => [
      Box({
        x: 2,
        y: 2,
        width: 40,
        height: 10,
        title: 'About View',
        border: 'single',
        style: {
          borderColor: [0, 1, 1, 1]
        },
        children: [
          Text({ x: 1, y: 1, content: 'About This App' }),
          Text({ x: 1, y: 3, content: 'Version: 1.0.0' }),
          Text({ x: 1, y: 4, content: 'Built with Aura Next' })
        ]
      })
    ]
  };

  const app = await auraApp(views.home(), {
    onKey: (key) => {
      switch (key) {
        case '1':
          app.updateChildren(views.home());
          break;
        case '2':
          app.updateChildren(views.settings());
          break;
        case '3':
          app.updateChildren(views.about());
          break;
      }
    }
  });

  return app;
}

// Run the desired example
async function main() {
  const example = process.argv[2] || 'multiple';

  console.log('Starting example:', example);

  let app;
  switch (example) {
    case 'simple':
      app = await simpleExample();
      break;
    case 'multiple':
      app = await multipleComponentsExample();
      break;
    case 'dynamic':
      app = await dynamicExample();
      break;
    case 'updating':
      app = await updatingChildrenExample();
      break;
    default:
      console.error('Unknown example:', example);
      console.log('Available examples: simple, multiple, dynamic, updating');
      process.exit(1);
  }

  // App is running, will exit on 'q' or Ctrl+C
}

main().catch(console.error);
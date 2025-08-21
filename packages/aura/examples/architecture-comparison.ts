#!/usr/bin/env bun
/**
 * Architecture Comparison
 * 
 * This file demonstrates the difference between the original
 * and improved application architectures
 */

import { signal } from '@xec-sh/neoflux';

// ============================================
// ORIGINAL ARCHITECTURE (Problematic)
// ============================================

/**
 * Original approach - creates unnecessary nesting
 * 
 * Structure created:
 * renderer.root (RootComponent)
 *   └── user's root (Box)
 *       ├── Header
 *       ├── Content
 *       └── Footer
 */
async function originalArchitectureExample() {
  // Pseudo-code showing the original approach
  /*
  const app = await createApp({
    root: Box({  // <-- This becomes a CHILD of renderer.root!
      width: '100%',
      height: '100%',
      children: [
        Box({ title: 'Header', height: 3 }),
        Box({ title: 'Content', flexGrow: 1 }),
        Box({ title: 'Footer', height: 3 })
      ]
    })
  });
  
  // Problems:
  // 1. User has to create their own root container
  // 2. This root is added as a child to renderer.root
  // 3. Extra nesting level that serves no purpose
  // 4. Confusing which root is the "real" root
  // 5. Layout calculations have an extra unnecessary layer
  */

  console.log(`
  Original Architecture Problems:
  1. User must create a root container
  2. Creates unnecessary nesting (renderer.root > user.root > components)
  3. Confusing API - which root is the real root?
  4. Performance impact from extra nesting
  5. Layout calculations go through unnecessary layer
  `);
}

// ============================================
// IMPROVED ARCHITECTURE (Clean & Intuitive)
// ============================================

/**
 * Improved approach - uses renderer's root directly
 * 
 * Structure created:
 * renderer.root (RootComponent)
 *   ├── Header
 *   ├── Content
 *   └── Footer
 */
async function improvedArchitectureExample() {
  // The improved approach - actual working code
  const { auraApp } = await import('../src/app/application.js');
  const { Box, Text } = await import('../src/app/aura.js');

  const app = await auraApp([
    // Components are added DIRECTLY to renderer.root
    Box({
      x: 0,
      y: 0,
      width: '100%',
      height: 3,
      title: 'Header - Direct Child of Root',
      border: 'single',
      style: { borderColor: [0, 1, 0, 1] },
      children: [
        Text({ x: 1, y: 1, content: 'No unnecessary nesting!' })
      ]
    }),

    Box({
      x: 0,
      y: 3,
      width: '100%',
      height: 10,
      title: 'Content - Also Direct Child',
      border: 'single',
      style: { borderColor: [1, 1, 0, 1] },
      children: [
        Text({ x: 1, y: 1, content: 'Clean component hierarchy' }),
        Text({ x: 1, y: 2, content: 'Better performance' }),
        Text({ x: 1, y: 3, content: 'Intuitive API' })
      ]
    }),

    Box({
      x: 0,
      y: 13,
      width: '100%',
      height: 3,
      title: 'Footer - Same Level as Others',
      border: 'single',
      style: { borderColor: [0, 1, 1, 1] },
      children: [
        Text({ x: 1, y: 1, content: 'Press q to quit' })
      ]
    }),

    // Info panel
    Box({
      x: 2,
      y: 17,
      width: 60,
      height: 6,
      border: 'double',
      style: {
        borderColor: [1, 0, 1, 1],
        backgroundColor: [0.1, 0, 0.1, 0.3]
      },
      children: [
        Text({
          x: 1,
          y: 1,
          content: 'Improved Architecture Benefits:',
          style: { color: [1, 1, 0, 1] }
        }),
        Text({ x: 1, y: 2, content: '✓ No need to create root container' }),
        Text({ x: 1, y: 3, content: '✓ Components added directly to renderer.root' }),
        Text({ x: 1, y: 4, content: '✓ Clean hierarchy, better performance' })
      ]
    })
  ]);

  // Show that we have direct access to the real root
  const root = app.getRootComponent();
  console.log('Root component ID:', root.id); // Will show "__root__"
  console.log('Number of direct children:', root.children.length);

  return app;
}

// ============================================
// VISUAL COMPARISON
// ============================================

async function visualComparison() {
  const { auraApp } = await import('../src/app/application.js');
  const { Box, Text } = await import('../src/app/aura.js');

  const app = await auraApp([
    // Left side - showing old architecture
    Box({
      x: 2,
      y: 2,
      width: 35,
      height: 20,
      title: 'OLD Architecture',
      border: 'single',
      style: { borderColor: [1, 0, 0, 1] },
      children: [
        Text({ x: 1, y: 1, content: 'Component Hierarchy:', style: { color: [1, 1, 0, 1] } }),
        Text({ x: 1, y: 3, content: 'renderer.root' }),
        Text({ x: 1, y: 4, content: '  └── user\'s Box (unnecessary!)' }),
        Text({ x: 1, y: 5, content: '      ├── Header' }),
        Text({ x: 1, y: 6, content: '      ├── Content' }),
        Text({ x: 1, y: 7, content: '      └── Footer' }),
        Text({ x: 1, y: 9, content: 'Problems:', style: { color: [1, 0.5, 0.5, 1] } }),
        Text({ x: 1, y: 10, content: '• Extra nesting level' }),
        Text({ x: 1, y: 11, content: '• Confusing API' }),
        Text({ x: 1, y: 12, content: '• Performance overhead' }),
        Text({ x: 1, y: 13, content: '• Must manage own root' }),
        Text({ x: 1, y: 15, content: 'Code:', style: { color: [0.7, 0.7, 0.7, 1] } }),
        Text({ x: 1, y: 16, content: 'createApp({' }),
        Text({ x: 1, y: 17, content: '  root: Box({ // Extra!' }),
        Text({ x: 1, y: 18, content: '    children: [...]' }),
      ]
    }),

    // Right side - showing new architecture
    Box({
      x: 40,
      y: 2,
      width: 35,
      height: 20,
      title: 'NEW Architecture',
      border: 'double',
      style: { borderColor: [0, 1, 0, 1] },
      children: [
        Text({ x: 1, y: 1, content: 'Component Hierarchy:', style: { color: [1, 1, 0, 1] } }),
        Text({ x: 1, y: 3, content: 'renderer.root' }),
        Text({ x: 1, y: 4, content: '  ├── Header' }),
        Text({ x: 1, y: 5, content: '  ├── Content' }),
        Text({ x: 1, y: 6, content: '  └── Footer' }),
        Text({ x: 1, y: 8, content: 'Benefits:', style: { color: [0.5, 1, 0.5, 1] } }),
        Text({ x: 1, y: 9, content: '✓ Direct children' }),
        Text({ x: 1, y: 10, content: '✓ Clean & intuitive' }),
        Text({ x: 1, y: 11, content: '✓ Better performance' }),
        Text({ x: 1, y: 12, content: '✓ No root to manage' }),
        Text({ x: 1, y: 14, content: 'Code:', style: { color: [0.7, 0.7, 0.7, 1] } }),
        Text({ x: 1, y: 15, content: 'auraApp([' }),
        Text({ x: 1, y: 16, content: '  Header(),' }),
        Text({ x: 1, y: 17, content: '  Content(),' }),
        Text({ x: 1, y: 18, content: '  Footer()' }),
      ]
    }),

    // Bottom info
    Text({
      x: 15,
      y: 23,
      content: 'Press q to quit | The NEW architecture is cleaner and more efficient',
      style: { color: [0.5, 0.5, 0.5, 1] }
    })
  ]);

  return app;
}

// ============================================
// MAIN
// ============================================

async function main() {
  const mode = process.argv[2] || 'visual';

  switch (mode) {
    case 'old':
      await originalArchitectureExample();
      break;
    case 'new':
      await improvedArchitectureExample();
      break;
    case 'visual':
      await visualComparison();
      break;
    default:
      console.log('Usage: bun run architecture-comparison.ts [old|new|visual]');
      process.exit(1);
  }
}

main().catch(console.error);
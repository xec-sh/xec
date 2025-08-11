#!/usr/bin/env tsx
/**
 * Layout Example 01: Basic Layout Engine Usage
 * Demonstrates the core layout engine and simple layout item with visual rendering
 */

import { createLayoutRenderer } from './layout-renderer.js';
import {
  x,
  y,
  cols,
  rows, LayoutType, SimpleLayoutItem, createLayoutEngine
} from '../src/advanced/layout.js';

async function main() {
  console.log('=== Layout Engine Basic Example ===\n');

  // Create renderer for visualization
  const renderer = await createLayoutRenderer();

  // Create layout engine
  const engine = createLayoutEngine();

  // Set viewport (terminal size)
  engine.setViewport({
    x: x(0),
    y: y(3),  // Start below title
    width: cols(80),
    height: rows(20)  // Use less height to leave room for info
  });

  console.log(`Viewport: ${engine.viewport.width}x${engine.viewport.height}`);
  console.log('Creating layouts and arranging items...\n');

  // Create flex layout with padding and gap
  const flexLayout = engine.createLayout(LayoutType.Flex, {
    padding: { top: 1, right: 2, bottom: 1, left: 2 },
    gap: 1,
    direction: 'row'
  });

  // Add layout to engine for management
  engine.addLayout('main-flex', flexLayout);

  // Create simple layout items
  const item1 = new SimpleLayoutItem(cols(20), rows(5));
  const item2 = new SimpleLayoutItem(cols(30), rows(10));
  const item3 = new SimpleLayoutItem({ width: cols(15), height: rows(3) });

  // Add items to flex layout
  flexLayout.add(item1);
  flexLayout.add(item2, { flex: 1 }); // Flexible item
  flexLayout.add(item3);

  // Arrange layout within viewport
  flexLayout.arrange(engine.viewport);

  // Render the viewport container
  renderer.renderContainer(engine.viewport, 'Viewport (80x20)');

  // Render each item with labels
  renderer.renderItems([
    { item: item1, label: 'Item 1 (20x5)' },
    { item: item2, label: 'Item 2 (flex)' },
    { item: item3, label: 'Item 3 (15x3)' }
  ], { showBorders: true, borderStyle: 'rounded' });

  // Move cursor below the visual
  renderer.moveCursorBelow();

  // Print layout information
  console.log('\n--- Layout Information ---');
  console.log(`Layout type: ${flexLayout.type}`);
  console.log(`Direction: row`);
  console.log(`Padding: top=1, right=2, bottom=1, left=2`);
  console.log(`Gap: 1`);
  
  console.log('\nItem positions after arrangement:');
  console.log(`  Item 1: (${item1.bounds.x}, ${item1.bounds.y}) size: ${item1.bounds.width}x${item1.bounds.height}`);
  console.log(`  Item 2: (${item2.bounds.x}, ${item2.bounds.y}) size: ${item2.bounds.width}x${item2.bounds.height} [flexible]`);
  console.log(`  Item 3: (${item3.bounds.x}, ${item3.bounds.y}) size: ${item3.bounds.width}x${item3.bounds.height}`);

  // Clean up
  await renderer.cleanup();
  
  console.log('\n=== Example Complete ===');
}

main().catch(console.error);
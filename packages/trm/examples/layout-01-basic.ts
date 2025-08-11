#!/usr/bin/env tsx
/**
 * Layout Example 01: Basic Layout Engine Usage
 * Demonstrates the core layout engine and simple layout item
 */

import {
  createLayoutEngine,
  SimpleLayoutItem,
  LayoutType,
  x, y, cols, rows
} from '../src/advanced/layout.js';

async function main() {
  console.log('=== Layout Engine Basic Example ===\n');

  // Create layout engine
  const engine = createLayoutEngine();

  // Set viewport (terminal size)
  engine.setViewport({
    x: x(0),
    y: y(0),
    width: cols(80),
    height: rows(24)
  });

  console.log(`Viewport: ${engine.viewport.width}x${engine.viewport.height}\n`);

  // Create different layout types
  const flexLayout = engine.createLayout(LayoutType.Flex, {
    padding: { top: 1, right: 2, bottom: 1, left: 2 },
    gap: 1
  });

  const gridLayout = engine.createLayout(LayoutType.Grid, {
    gap: 2
  });

  const stackLayout = engine.createLayout(LayoutType.Stack);

  // Add layouts to engine for management
  engine.addLayout('main-flex', flexLayout);
  engine.addLayout('sidebar-grid', gridLayout);
  engine.addLayout('overlay-stack', stackLayout);

  console.log('Created layouts:');
  for (const [name, layout] of engine.layouts) {
    console.log(`  - ${name}: ${layout.type}`);
  }

  // Create simple layout items
  const item1 = new SimpleLayoutItem(cols(20), rows(5));
  const item2 = new SimpleLayoutItem(cols(30), rows(10));
  const item3 = new SimpleLayoutItem({ width: cols(15), height: rows(3) });

  // Add items to flex layout
  flexLayout.add(item1);
  flexLayout.add(item2, { flex: 1 }); // Flexible item
  flexLayout.add(item3);

  // Measure required size
  const requiredSize = flexLayout.measure({
    width: cols(80),
    height: rows(24)
  });

  console.log(`\nFlex layout required size: ${requiredSize.width}x${requiredSize.height}`);

  // Arrange layout within viewport
  flexLayout.arrange(engine.viewport);

  console.log('\nItem positions after arrangement:');
  console.log(`  Item 1: ${item1.bounds.x},${item1.bounds.y} (${item1.bounds.width}x${item1.bounds.height})`);
  console.log(`  Item 2: ${item2.bounds.x},${item2.bounds.y} (${item2.bounds.width}x${item2.bounds.height})`);
  console.log(`  Item 3: ${item3.bounds.x},${item3.bounds.y} (${item3.bounds.width}x${item3.bounds.height})`);

  // Demonstrate layout invalidation
  console.log('\n--- Layout Invalidation ---');
  console.log(`Needs layout before invalidation: ${flexLayout.needsLayout}`);
  
  flexLayout.invalidate();
  console.log(`Needs layout after invalidation: ${flexLayout.needsLayout}`);
  
  flexLayout.arrange(engine.viewport);
  console.log(`Needs layout after arrangement: ${flexLayout.needsLayout}`);

  // Remove layout from engine
  engine.removeLayout('overlay-stack');
  console.log('\nLayouts after removing overlay-stack:');
  for (const [name] of engine.layouts) {
    console.log(`  - ${name}`);
  }

  console.log('\n=== Example Complete ===');
}

main().catch(console.error);
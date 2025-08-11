#!/usr/bin/env tsx
/**
 * Layout Example 02: Flex Layout
 * Demonstrates all flex layout features with visual rendering
 */

import { createLayoutRenderer } from './layout-renderer.js';
import {
  x,
  y,
  cols, rows, type AlignItems, createFlexLayout,
  SimpleLayoutItem,
  type FlexDirection,
  type JustifyContent
} from '../src/advanced/layout.js';

async function demonstrateFlexDirection(renderer: any) {
  console.log('\n=== Flex Direction Demo ===\n');

  const directions: FlexDirection[] = ['row', 'column', 'row-reverse', 'column-reverse'];

  for (const direction of directions) {
    renderer.terminal.screen.clear();
    console.log(`Direction: ${direction}\n`);
    
    const layout = createFlexLayout({
      direction,
      gap: 1,
      padding: 1
    });

    // Add three items
    const item1 = new SimpleLayoutItem(cols(10), rows(3));
    const item2 = new SimpleLayoutItem(cols(10), rows(3));
    const item3 = new SimpleLayoutItem(cols(10), rows(3));

    layout.add(item1);
    layout.add(item2);
    layout.add(item3);

    // Arrange in a viewport
    const viewport = {
      x: x(2),
      y: y(3),
      width: cols(50),
      height: rows(10)
    };
    
    layout.arrange(viewport);

    // Render the viewport and items
    renderer.renderContainer(viewport, `Flex: ${direction}`);
    renderer.renderItems([
      { item: item1, label: '1' },
      { item: item2, label: '2' },
      { item: item3, label: '3' }
    ], { showBorders: true, borderStyle: 'single' });
    
    // Print info
    renderer.moveCursorBelow(10);
    console.log('\nPress Enter for next demo...');
    
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      await new Promise(resolve => {
        process.stdin.once('data', resolve);
      });
      process.stdin.setRawMode(false);
    }
  }
}

async function demonstrateJustifyContent(renderer: any) {
  console.log('\n=== Justify Content Demo ===\n');

  const justifications: JustifyContent[] = [
    'flex-start',
    'flex-end',
    'center',
    'space-between',
    'space-around',
    'space-evenly'
  ];

  for (const justifyContent of justifications) {
    renderer.terminal.screen.clear();
    console.log(`Justify: ${justifyContent}\n`);
    
    const layout = createFlexLayout({
      direction: 'row',
      justifyContent,
      gap: 0
    });

    // Add three fixed-size items
    const item1 = new SimpleLayoutItem(cols(8), rows(3));
    const item2 = new SimpleLayoutItem(cols(8), rows(3));
    const item3 = new SimpleLayoutItem(cols(8), rows(3));

    layout.add(item1);
    layout.add(item2);
    layout.add(item3);

    // Arrange in a wider area to see justification
    const viewport = {
      x: x(2),
      y: y(3),
      width: cols(60),
      height: rows(5)
    };
    
    layout.arrange(viewport);

    // Render
    renderer.renderContainer(viewport, `Justify: ${justifyContent}`);
    renderer.renderItems([
      { item: item1, label: '1' },
      { item: item2, label: '2' },
      { item: item3, label: '3' }
    ], { showBorders: true, borderStyle: 'rounded' });
    
    renderer.moveCursorBelow(12);
    console.log('\nPress Enter for next demo...');
    
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      await new Promise(resolve => {
        process.stdin.once('data', resolve);
      });
      process.stdin.setRawMode(false);
    }
  }
}

async function demonstrateAlignItems(renderer: any) {
  console.log('\n=== Align Items Demo ===\n');

  const alignments: AlignItems[] = [
    'flex-start',
    'flex-end',
    'center',
    'stretch',
    'baseline'
  ];

  for (const alignItems of alignments) {
    renderer.terminal.screen.clear();
    console.log(`Align: ${alignItems}\n`);
    
    const layout = createFlexLayout({
      direction: 'row',
      alignItems,
      gap: 2
    });

    // Add items with different heights
    const item1 = new SimpleLayoutItem(cols(10), rows(2));
    const item2 = new SimpleLayoutItem(cols(10), rows(4));
    const item3 = new SimpleLayoutItem(cols(10), rows(3));

    layout.add(item1);
    layout.add(item2);
    layout.add(item3);

    // Arrange in area with height for alignment
    const viewport = {
      x: x(2),
      y: y(3),
      width: cols(40),
      height: rows(8)
    };
    
    layout.arrange(viewport);

    // Render
    renderer.renderContainer(viewport, `Align: ${alignItems}`);
    renderer.renderItems([
      { item: item1, label: 'H:2' },
      { item: item2, label: 'H:4' },
      { item: item3, label: 'H:3' }
    ], { showBorders: true, borderStyle: 'single' });
    
    renderer.moveCursorBelow(10);
    console.log('\nPress Enter for next demo...');
    
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      await new Promise(resolve => {
        process.stdin.once('data', resolve);
      });
      process.stdin.setRawMode(false);
    }
  }
}

async function demonstrateFlexGrow(renderer: any) {
  console.log('\n=== Flex Grow Demo ===\n');
  
  renderer.terminal.screen.clear();

  const layout = createFlexLayout({
    direction: 'row',
    gap: 1
  });

  // Add items with different flex values
  const item1 = new SimpleLayoutItem(cols(10), rows(3));
  const item2 = new SimpleLayoutItem(cols(10), rows(3));
  const item3 = new SimpleLayoutItem(cols(10), rows(3));
  const item4 = new SimpleLayoutItem(cols(10), rows(3));

  layout.add(item1); // No flex (fixed size)
  layout.add(item2, { flex: 1 }); // Flex 1
  layout.add(item3, { flex: 2 }); // Flex 2 (twice the size of flex: 1)
  layout.add(item4, { flex: 1 }); // Flex 1

  // Arrange in a large area
  const viewport = {
    x: x(2),
    y: y(3),
    width: cols(70),
    height: rows(5)
  };
  
  layout.arrange(viewport);

  // Render
  renderer.renderContainer(viewport, 'Flex Grow Demo');
  renderer.renderItems([
    { item: item1, label: 'Fixed' },
    { item: item2, label: 'Flex:1' },
    { item: item3, label: 'Flex:2' },
    { item: item4, label: 'Flex:1' }
  ], { showBorders: true, borderStyle: 'double' });
  
  renderer.moveCursorBelow(10);
  console.log('Items with flex values:');
  console.log(`  Fixed: width=${item1.bounds.width}`);
  console.log(`  Flex:1: width=${item2.bounds.width}`);
  console.log(`  Flex:2: width=${item3.bounds.width}`);
  console.log(`  Flex:1: width=${item4.bounds.width}`);
  console.log('\nPress Enter for next demo...');
  
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });
    process.stdin.setRawMode(false);
  }
}

async function demonstrateWrap(renderer: any) {
  console.log('\n=== Flex Wrap Demo ===\n');
  
  renderer.terminal.screen.clear();

  const layout = createFlexLayout({
    direction: 'row',
    wrap: true,
    gap: 1
  });

  // Add many items that won't fit in one row
  const items = [];
  for (let i = 0; i < 8; i++) {
    const item = new SimpleLayoutItem(cols(12), rows(2));
    layout.add(item);
    items.push(item);
  }

  // Arrange in limited width
  const viewport = {
    x: x(2),
    y: y(3),
    width: cols(50),
    height: rows(10)
  };
  
  layout.arrange(viewport);

  // Render
  renderer.renderContainer(viewport, 'Flex Wrap: true');
  
  const renderItems = items.map((item, i) => ({
    item,
    label: `${i + 1}`
  }));
  
  renderer.renderItems(renderItems, { showBorders: true, borderStyle: 'single' });
  
  renderer.moveCursorBelow(8);
  console.log('\nItems wrapped into multiple rows');
  console.log('\nPress Enter to finish...');
  
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });
    process.stdin.setRawMode(false);
  }
}

async function main() {
  console.log('=== Flex Layout Visual Examples ===');
  console.log('This demo will show different flex layout configurations visually.');
  
  // Create renderer
  const renderer = await createLayoutRenderer();
  
  try {
    // Run demos
    await demonstrateFlexDirection(renderer);
    await demonstrateJustifyContent(renderer);
    await demonstrateAlignItems(renderer);
    await demonstrateFlexGrow(renderer);
    await demonstrateWrap(renderer);
    
    // Clean up
    renderer.terminal.screen.clear();
    console.log('\n=== Examples Complete ===\n');
  } finally {
    await renderer.cleanup();
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
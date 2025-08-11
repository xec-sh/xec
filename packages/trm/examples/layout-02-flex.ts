#!/usr/bin/env tsx
/**
 * Layout Example 02: Flex Layout
 * Demonstrates all flex layout features including direction, alignment, and justification
 */

import {
  createFlexLayout,
  SimpleLayoutItem,
  x, y, cols, rows,
  type FlexDirection,
  type JustifyContent,
  type AlignItems
} from '../src/advanced/layout.js';

function demonstrateFlexDirection() {
  console.log('=== Flex Direction ===\n');

  const directions: FlexDirection[] = ['row', 'column', 'row-reverse', 'column-reverse'];

  for (const direction of directions) {
    console.log(`Direction: ${direction}`);
    
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

    // Arrange in a 50x10 area
    layout.arrange({
      x: x(0),
      y: y(0),
      width: cols(50),
      height: rows(10)
    });

    console.log(`  Item 1: (${item1.bounds.x}, ${item1.bounds.y})`);
    console.log(`  Item 2: (${item2.bounds.x}, ${item2.bounds.y})`);
    console.log(`  Item 3: (${item3.bounds.x}, ${item3.bounds.y})`);
    console.log();
  }
}

function demonstrateJustifyContent() {
  console.log('=== Justify Content ===\n');

  const justifications: JustifyContent[] = [
    'flex-start',
    'flex-end',
    'center',
    'space-between',
    'space-around',
    'space-evenly'
  ];

  for (const justifyContent of justifications) {
    console.log(`Justify: ${justifyContent}`);
    
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
    layout.arrange({
      x: x(0),
      y: y(0),
      width: cols(60),
      height: rows(5)
    });

    console.log(`  Item positions: [${item1.bounds.x}, ${item2.bounds.x}, ${item3.bounds.x}]`);
    console.log();
  }
}

function demonstrateAlignItems() {
  console.log('=== Align Items ===\n');

  const alignments: AlignItems[] = [
    'flex-start',
    'flex-end',
    'center',
    'stretch',
    'baseline'
  ];

  for (const alignItems of alignments) {
    console.log(`Align: ${alignItems}`);
    
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
    layout.arrange({
      x: x(0),
      y: y(0),
      width: cols(40),
      height: rows(8)
    });

    console.log(`  Item Y positions: [${item1.bounds.y}, ${item2.bounds.y}, ${item3.bounds.y}]`);
    console.log(`  Item heights: [${item1.bounds.height}, ${item2.bounds.height}, ${item3.bounds.height}]`);
    console.log();
  }
}

function demonstrateFlexGrow() {
  console.log('=== Flex Grow ===\n');

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
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(80),
    height: rows(5)
  });

  console.log('Items with flex values:');
  console.log(`  Item 1 (no flex): width=${item1.bounds.width}`);
  console.log(`  Item 2 (flex: 1): width=${item2.bounds.width}`);
  console.log(`  Item 3 (flex: 2): width=${item3.bounds.width}`);
  console.log(`  Item 4 (flex: 1): width=${item4.bounds.width}`);
  console.log();
}

function demonstrateAlignSelf() {
  console.log('=== Align Self ===\n');

  const layout = createFlexLayout({
    direction: 'row',
    alignItems: 'flex-start', // Default alignment
    gap: 2
  });

  // Add items with different align-self values
  const item1 = new SimpleLayoutItem(cols(10), rows(2));
  const item2 = new SimpleLayoutItem(cols(10), rows(2));
  const item3 = new SimpleLayoutItem(cols(10), rows(2));
  const item4 = new SimpleLayoutItem(cols(10), rows(2));

  layout.add(item1); // Uses parent's alignItems
  layout.add(item2, { alignSelf: 'center' });
  layout.add(item3, { alignSelf: 'flex-end' });
  layout.add(item4, { alignSelf: 'stretch' });

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(50),
    height: rows(8)
  });

  console.log('Items with different align-self:');
  console.log(`  Item 1 (default):     y=${item1.bounds.y}, height=${item1.bounds.height}`);
  console.log(`  Item 2 (center):      y=${item2.bounds.y}, height=${item2.bounds.height}`);
  console.log(`  Item 3 (flex-end):    y=${item3.bounds.y}, height=${item3.bounds.height}`);
  console.log(`  Item 4 (stretch):     y=${item4.bounds.y}, height=${item4.bounds.height}`);
  console.log();
}

function demonstrateMarginAndPadding() {
  console.log('=== Margin and Padding ===\n');

  // Layout with padding
  const layout = createFlexLayout({
    direction: 'row',
    padding: { top: 2, right: 3, bottom: 2, left: 3 },
    gap: 1
  });

  // Add items with margins
  const item1 = new SimpleLayoutItem(cols(10), rows(3));
  const item2 = new SimpleLayoutItem(cols(10), rows(3));
  const item3 = new SimpleLayoutItem(cols(10), rows(3));

  layout.add(item1, { margin: 1 }); // Uniform margin
  layout.add(item2, { margin: { top: 2, bottom: 2 } }); // Vertical margin
  layout.add(item3, { margin: { left: 3, right: 3 } }); // Horizontal margin

  // Measure and arrange
  const size = layout.measure({ width: cols(80), height: rows(20) });
  console.log(`Layout size with padding and margins: ${size.width}x${size.height}`);

  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(60),
    height: rows(10)
  });

  console.log('Item positions with margins:');
  console.log(`  Item 1: (${item1.bounds.x}, ${item1.bounds.y}) size: ${item1.bounds.width}x${item1.bounds.height}`);
  console.log(`  Item 2: (${item2.bounds.x}, ${item2.bounds.y}) size: ${item2.bounds.width}x${item2.bounds.height}`);
  console.log(`  Item 3: (${item3.bounds.x}, ${item3.bounds.y}) size: ${item3.bounds.width}x${item3.bounds.height}`);
  console.log();
}

function demonstrateWrap() {
  console.log('=== Flex Wrap ===\n');

  const layout = createFlexLayout({
    direction: 'row',
    wrap: true,
    gap: 1
  });

  // Add many items that won't fit in one row
  for (let i = 0; i < 8; i++) {
    const item = new SimpleLayoutItem(cols(12), rows(2));
    layout.add(item);
  }

  // Arrange in limited width
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(50),
    height: rows(10)
  });

  console.log('Wrapped items:');
  for (let i = 0; i < layout.children.length; i++) {
    const { item } = layout.children[i];
    console.log(`  Item ${i + 1}: (${item.bounds.x}, ${item.bounds.y})`);
  }
  console.log();
}

async function main() {
  console.log('=== Flex Layout Examples ===\n');
  
  demonstrateFlexDirection();
  demonstrateJustifyContent();
  demonstrateAlignItems();
  demonstrateFlexGrow();
  demonstrateAlignSelf();
  demonstrateMarginAndPadding();
  demonstrateWrap();
  
  console.log('=== Examples Complete ===');
}

main().catch(console.error);
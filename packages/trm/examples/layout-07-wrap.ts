#!/usr/bin/env tsx
/**
 * Layout Example 07: Wrap Layout
 * Demonstrates wrapping items to next line when space runs out
 */

import {
  x,
  y,
  cols, rows, createWrapLayout, SimpleLayoutItem
} from '../src/advanced/layout.js';

function demonstrateBasicWrap() {
  console.log('=== Basic Wrap Layout ===\n');

  const layout = createWrapLayout({
    gap: 1,
    padding: 2
  });

  // Add items that will wrap
  for (let i = 0; i < 8; i++) {
    const item = new SimpleLayoutItem(cols(12), rows(3));
    layout.add(item);
  }

  // Measure how much space is needed
  const size = layout.measure({ width: cols(50), height: rows(20) });
  console.log(`Required size for 8 items: ${size.width}x${size.height}`);

  // Arrange in limited width to force wrapping
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(50),
    height: rows(15)
  });

  console.log('\nWrapped items (12 cols each in 50 col container):');
  for (let i = 0; i < layout.children.length; i++) {
    const { item } = layout.children[i];
    const row = Math.floor(item.bounds.y / 4); // Approximate row
    console.log(`  Item ${i + 1}: pos=(${item.bounds.x}, ${item.bounds.y}) - Row ${row + 1}`);
  }
  console.log();
}

function demonstrateVariableSizes() {
  console.log('=== Variable Size Items ===\n');

  const layout = createWrapLayout({
    gap: 1
  });

  // Add items of different widths
  const sizes = [8, 12, 10, 15, 6, 20, 11, 9, 14, 7];
  
  for (let i = 0; i < sizes.length; i++) {
    const item = new SimpleLayoutItem(cols(sizes[i]), rows(2));
    layout.add(item);
  }

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(45),
    height: rows(20)
  });

  console.log('Items with variable widths:');
  let currentRow = -1;
  for (let i = 0; i < layout.children.length; i++) {
    const { item } = layout.children[i];
    const row = Math.floor(item.bounds.y / 3);
    if (row !== currentRow) {
      currentRow = row;
      console.log(`\nRow ${row + 1}:`);
    }
    console.log(`  Item ${i + 1} (width=${sizes[i]}): x=${item.bounds.x}`);
  }
  console.log();
}

function demonstrateRowHeight() {
  console.log('=== Variable Row Heights ===\n');

  const layout = createWrapLayout({
    gap: 1
  });

  // Add items with different heights
  const items = [
    { width: 10, height: 2 },
    { width: 10, height: 4 },
    { width: 10, height: 3 },
    { width: 10, height: 2 },
    { width: 10, height: 5 },
    { width: 10, height: 2 },
    { width: 10, height: 3 },
    { width: 10, height: 4 }
  ];

  for (const spec of items) {
    const item = new SimpleLayoutItem(cols(spec.width), rows(spec.height));
    layout.add(item);
  }

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(35),
    height: rows(20)
  });

  console.log('Rows adjust to tallest item in each row:');
  let lastY = -1;
  let rowNum = 0;
  let rowItems: number[] = [];
  
  for (let i = 0; i < layout.children.length; i++) {
    const { item } = layout.children[i];
    
    if (item.bounds.y !== lastY && lastY !== -1) {
      console.log(`Row ${rowNum}: Items ${rowItems.join(', ')} at y=${lastY}`);
      rowNum++;
      rowItems = [];
    }
    
    rowItems.push(i + 1);
    lastY = item.bounds.y;
  }
  
  if (rowItems.length > 0) {
    console.log(`Row ${rowNum}: Items ${rowItems.join(', ')} at y=${lastY}`);
  }
  console.log();
}

function demonstrateTagCloud() {
  console.log('=== Tag Cloud Example ===\n');

  const layout = createWrapLayout({
    gap: 1,
    padding: 1
  });

  // Simulate tags with different lengths
  const tags = [
    'JavaScript', 'TypeScript', 'Node.js', 'React',
    'Vue', 'Angular', 'CSS', 'HTML', 'Python',
    'Go', 'Rust', 'C++', 'Terminal', 'Layout',
    'UI', 'UX', 'Design', 'Backend', 'Frontend',
    'DevOps', 'CI/CD', 'Testing', 'TDD'
  ];

  for (const tag of tags) {
    // Width based on tag length + padding
    const width = tag.length + 4;
    const item = new SimpleLayoutItem(cols(width), rows(1));
    layout.add(item);
  }

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(60),
    height: rows(10)
  });

  console.log('Tag cloud layout:');
  for (let i = 0; i < tags.length; i++) {
    const { item } = layout.children[i];
    console.log(`  ${tags[i].padEnd(12)}: (${String(item.bounds.x).padStart(2)}, ${item.bounds.y}) width=${item.bounds.width}`);
  }
  console.log();
}

function demonstrateGallery() {
  console.log('=== Gallery Layout ===\n');

  const layout = createWrapLayout({
    gap: 2,
    padding: { top: 1, right: 2, bottom: 1, left: 2 }
  });

  // Create gallery items (thumbnails)
  const thumbnailSize = { width: 15, height: 8 };
  const itemCount = 12;

  for (let i = 0; i < itemCount; i++) {
    const item = new SimpleLayoutItem(
      cols(thumbnailSize.width),
      rows(thumbnailSize.height)
    );
    layout.add(item);
  }

  // Measure required size
  const size = layout.measure({ width: cols(70), height: rows(50) });
  console.log(`Gallery size for ${itemCount} items: ${size.width}x${size.height}`);

  // Arrange in specific viewport
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(70),
    height: rows(30)
  });

  // Calculate grid info
  const itemsPerRow = Math.floor((70 - 4) / (thumbnailSize.width + 2));
  const rowCount = Math.ceil(itemCount / itemsPerRow);

  console.log(`\nGallery grid: ${itemsPerRow} columns x ${rowCount} rows`);
  console.log('Thumbnail positions:');
  
  for (let i = 0; i < layout.children.length; i++) {
    const { item } = layout.children[i];
    const col = i % itemsPerRow;
    const rowIndex = Math.floor(i / itemsPerRow);
    console.log(`  Thumb ${String(i + 1).padStart(2)}: Grid[${rowIndex},${col}] at (${item.bounds.x}, ${item.bounds.y})`);
  }
  console.log();
}

function demonstrateResponsiveWrap() {
  console.log('=== Responsive Wrap Behavior ===\n');

  const layout = createWrapLayout({
    gap: 1
  });

  // Add fixed set of items
  const items: SimpleLayoutItem[] = [];
  for (let i = 0; i < 6; i++) {
    const item = new SimpleLayoutItem(cols(10), rows(3));
    items.push(item);
    layout.add(item);
  }

  // Test different container widths
  const widths = [65, 45, 35, 25, 15];

  for (const width of widths) {
    layout.arrange({
      x: x(0),
      y: y(0),
      width: cols(width),
      height: rows(20)
    });

    const itemsPerRow = Math.floor(width / 11); // 10 + 1 gap
    const rowCount = Math.ceil(6 / itemsPerRow);

    console.log(`Width ${width}:`);
    console.log(`  Items per row: ${itemsPerRow}`);
    console.log(`  Number of rows: ${rowCount}`);
    
    // Show first and last item positions
    const firstItem = items[0];
    const lastItem = items[5];
    console.log(`  First item: (${firstItem.bounds.x}, ${firstItem.bounds.y})`);
    console.log(`  Last item:  (${lastItem.bounds.x}, ${lastItem.bounds.y})`);
    console.log();
  }
}

function demonstrateButtonGrid() {
  console.log('=== Button Grid Example ===\n');

  const layout = createWrapLayout({
    gap: 2,
    padding: 2
  });

  // Create calculator-style button grid
  const buttons = [
    '7', '8', '9', '/',
    '4', '5', '6', '*',
    '1', '2', '3', '-',
    '0', '.', '=', '+'
  ];

  for (const label of buttons) {
    const width = label === '0' || label === '=' ? 12 : 8;
    const item = new SimpleLayoutItem(cols(width), rows(2));
    layout.add(item);
  }

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(40),
    height: rows(12)
  });

  console.log('Calculator button layout:');
  for (let i = 0; i < buttons.length; i++) {
    const { item } = layout.children[i];
    const label = buttons[i];
    console.log(`  Button '${label}': (${item.bounds.x}, ${item.bounds.y}) size=${item.bounds.width}x${item.bounds.height}`);
  }
  console.log();
}

function demonstrateWrapWithConstraints() {
  console.log('=== Wrap with Min/Max Constraints ===\n');

  const layout = createWrapLayout({
    gap: 1,
    padding: 1
  });

  // Custom layout item with constraints
  class ConstrainedItem extends SimpleLayoutItem {
    constructor(
      public minWidth: number,
      public maxWidth: number,
      public preferredWidth: number,
      public height: number
    ) {
      super(cols(preferredWidth), rows(height));
    }

    measure(availableSpace: { width: number; height: number }) {
      const width = Math.min(
        this.maxWidth,
        Math.max(this.minWidth, Math.min(this.preferredWidth, availableSpace.width))
      );
      return {
        width: cols(width),
        height: rows(this.height)
      };
    }
  }

  // Add items with constraints
  const constrainedItems = [
    new ConstrainedItem(8, 15, 12, 3),   // Flexible width
    new ConstrainedItem(10, 20, 15, 3),  // Flexible width
    new ConstrainedItem(5, 10, 8, 3),    // Flexible width
    new ConstrainedItem(12, 12, 12, 3),  // Fixed width
    new ConstrainedItem(6, 18, 10, 3),   // Flexible width
  ];

  for (const item of constrainedItems) {
    layout.add(item);
  }

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(50),
    height: rows(15)
  });

  console.log('Items with width constraints:');
  for (let i = 0; i < constrainedItems.length; i++) {
    const item = constrainedItems[i];
    console.log(`  Item ${i + 1}: min=${item.minWidth}, max=${item.maxWidth}, actual=${item.bounds.width}`);
  }
  console.log();
}

function demonstrateWrapPerformance() {
  console.log('=== Wrap Performance Test ===\n');

  const layout = createWrapLayout({
    gap: 1
  });

  // Add many items
  const itemCount = 100;
  console.log(`Adding ${itemCount} items...`);
  
  const startAdd = Date.now();
  for (let i = 0; i < itemCount; i++) {
    const width = 5 + (i % 10); // Variable widths
    const item = new SimpleLayoutItem(cols(width), rows(1));
    layout.add(item);
  }
  const addTime = Date.now() - startAdd;

  // Measure
  const startMeasure = Date.now();
  const size = layout.measure({ width: cols(80), height: rows(100) });
  const measureTime = Date.now() - startMeasure;

  // Arrange
  const startArrange = Date.now();
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(80),
    height: rows(50)
  });
  const arrangeTime = Date.now() - startArrange;

  console.log('\nPerformance results:');
  console.log(`  Add ${itemCount} items: ${addTime}ms`);
  console.log(`  Measure: ${measureTime}ms`);
  console.log(`  Arrange: ${arrangeTime}ms`);
  console.log(`  Total: ${addTime + measureTime + arrangeTime}ms`);
  console.log(`\nLayout size: ${size.width}x${size.height}`);
  console.log();
}

async function main() {
  console.log('=== Wrap Layout Examples ===\n');

  demonstrateBasicWrap();
  demonstrateVariableSizes();
  demonstrateRowHeight();
  demonstrateTagCloud();
  demonstrateGallery();
  demonstrateResponsiveWrap();
  demonstrateButtonGrid();
  demonstrateWrapWithConstraints();
  demonstrateWrapPerformance();

  console.log('=== Examples Complete ===');
}

main().catch(console.error);
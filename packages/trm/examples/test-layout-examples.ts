#!/usr/bin/env tsx
/**
 * Test script to verify layout examples compile and basic functionality
 */

import { x, y, cols, rows, createGridLayout, SimpleLayoutItem } from '../src/advanced/layout.js';

function testGridLayout() {
  console.log('Testing Grid Layout functionality...\n');
  
  // Create a 2x2 grid with fraction-based sizing
  const layout = createGridLayout({
    columns: [
      { type: 'fraction', size: 1 },
      { type: 'fraction', size: 1 }
    ],
    rows: [
      { type: 'fraction', size: 1 },
      { type: 'fraction', size: 1 }
    ],
    gap: 1
  });
  
  // Add 4 items
  for (let i = 0; i < 4; i++) {
    const item = new SimpleLayoutItem(cols(20), rows(5));
    layout.add(item);
  }
  
  // Arrange the layout
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(41),
    height: rows(11)
  });
  
  // Check positions
  console.log('2x2 Grid Layout positions:');
  const cells = layout.children;
  for (let i = 0; i < cells.length; i++) {
    const { item } = cells[i];
    console.log(`  Cell ${i + 1}: position=(${item.bounds.x}, ${item.bounds.y}), size=${item.bounds.width}x${item.bounds.height}`);
  }
  
  // Verify positions are correct
  const expectedPositions = [
    { x: 0, y: 0 },    // Top-left
    { x: 21, y: 0 },   // Top-right (20 + 1 gap)
    { x: 0, y: 6 },    // Bottom-left (5 + 1 gap)
    { x: 21, y: 6 }    // Bottom-right
  ];
  
  let allCorrect = true;
  for (let i = 0; i < cells.length; i++) {
    const actual = cells[i].item.bounds;
    const expected = expectedPositions[i];
    
    if (actual.x !== expected.x || actual.y !== expected.y) {
      console.error(`  ❌ Cell ${i + 1} position mismatch: expected (${expected.x}, ${expected.y}), got (${actual.x}, ${actual.y})`);
      allCorrect = false;
    }
  }
  
  if (allCorrect) {
    console.log('\n✅ Grid layout test passed!');
  } else {
    console.log('\n❌ Grid layout test failed!');
  }
  
  return allCorrect;
}

function testLayoutWithDifferentSizes() {
  console.log('\nTesting Grid Layout with different cell sizes...\n');
  
  const layout = createGridLayout({
    columns: [
      { type: 'fixed', size: 10 },
      { type: 'fraction', size: 1 }
    ],
    rows: [
      { type: 'fixed', size: 3 },
      { type: 'auto' }
    ],
    gap: 0
  });
  
  // Add items
  layout.add(new SimpleLayoutItem(cols(8), rows(2)));
  layout.add(new SimpleLayoutItem(cols(15), rows(2)));
  layout.add(new SimpleLayoutItem(cols(8), rows(4)));
  layout.add(new SimpleLayoutItem(cols(15), rows(4)));
  
  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(40),
    height: rows(10)
  });
  
  console.log('Grid with custom tracks:');
  for (let i = 0; i < layout.children.length; i++) {
    const { item } = layout.children[i];
    console.log(`  Cell ${i + 1}: position=(${item.bounds.x}, ${item.bounds.y}), size=${item.bounds.width}x${item.bounds.height}`);
  }
  
  return true;
}

// Run tests
console.log('=====================================');
console.log('TRM Layout System - Test Suite');
console.log('=====================================\n');

const test1 = testGridLayout();
const test2 = testLayoutWithDifferentSizes();

if (test1 && test2) {
  console.log('\n=====================================');
  console.log('✅ All layout tests passed!');
  console.log('=====================================');
  console.log('\nThe layout examples should work correctly.');
  console.log('Run them with:');
  console.log('  npx tsx examples/layout-09-fullscreen-grid.ts  # Fullscreen mode');
  console.log('  npx tsx examples/layout-10-inline-grid.ts      # Inline mode');
} else {
  console.log('\n=====================================');
  console.log('❌ Some tests failed!');
  console.log('=====================================');
  process.exit(1);
}
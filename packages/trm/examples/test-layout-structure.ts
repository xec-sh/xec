#!/usr/bin/env tsx
/**
 * Test script to understand the structure of layout children
 */

import { x, y, cols, rows, createGridLayout, SimpleLayoutItem } from '../src/advanced/layout.js';

async function testLayoutStructure() {
  console.log('Testing layout children structure...\n');
  
  // Create a 2x2 grid layout
  const layout = createGridLayout({
    columns: [
      { type: 'fraction', size: 1 },
      { type: 'fraction', size: 1 }
    ],
    rows: [
      { type: 'fraction', size: 1 },
      { type: 'fraction', size: 1 }
    ],
    gap: 0
  });
  
  // Add 4 items to the layout
  for (let i = 0; i < 4; i++) {
    layout.add(new SimpleLayoutItem(cols(50), rows(25)));
  }
  
  // Arrange the layout
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(100),
    height: rows(50)
  });
  
  // Examine the structure of children
  console.log(`Layout has ${layout.children.length} children\n`);
  
  layout.children.forEach((child, index) => {
    console.log(`Child ${index}:`);
    console.log(`  Type: ${typeof child}`);
    console.log(`  Constructor: ${child.constructor.name}`);
    console.log(`  Properties:`, Object.keys(child));
    
    // Check if it has a bounds property directly
    if ('bounds' in child) {
      console.log(`  ✓ Has 'bounds' property directly`);
      console.log(`    bounds:`, child.bounds);
    } else {
      console.log(`  ✗ No 'bounds' property directly`);
    }
    
    // Check if it has an item property
    if ('item' in child) {
      console.log(`  ✓ Has 'item' property`);
      console.log(`    item properties:`, Object.keys(child.item));
      if ('bounds' in child.item) {
        console.log(`    item.bounds:`, child.item.bounds);
      }
    } else {
      console.log(`  ✗ No 'item' property`);
    }
    
    console.log('');
  });
}

// Run the test
testLayoutStructure().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
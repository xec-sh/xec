#!/usr/bin/env tsx
/**
 * Test script to identify errors in layout examples
 */

async function testLayoutImports() {
  console.log('Testing layout imports...\n');
  
  try {
    console.log('Importing layout module...');
    const layout = await import('../src/advanced/layout.js');
    console.log('✓ Layout module imported successfully');
    console.log('Available exports:', Object.keys(layout));
    
    // Test creating a grid layout
    console.log('\nTesting createGridLayout...');
    const { createGridLayout, SimpleLayoutItem, x, y, cols, rows } = layout;
    
    if (!createGridLayout) {
      throw new Error('createGridLayout is not exported');
    }
    
    const gridLayout = createGridLayout({
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
    
    console.log('✓ Grid layout created successfully');
    
    // Test SimpleLayoutItem
    console.log('\nTesting SimpleLayoutItem...');
    if (!SimpleLayoutItem) {
      throw new Error('SimpleLayoutItem is not exported');
    }
    
    const item = new SimpleLayoutItem(cols(10), rows(5));
    console.log('✓ SimpleLayoutItem created successfully');
    
    // Test adding items to layout
    console.log('\nTesting layout.add...');
    if (!gridLayout.add) {
      throw new Error('gridLayout.add method does not exist');
    }
    
    gridLayout.add(item);
    console.log('✓ Item added to layout successfully');
    
    // Test arrange method
    console.log('\nTesting layout.arrange...');
    if (!gridLayout.arrange) {
      throw new Error('gridLayout.arrange method does not exist');
    }
    
    gridLayout.arrange({
      x: x(0),
      y: y(0),
      width: cols(100),
      height: rows(50)
    });
    console.log('✓ Layout arranged successfully');
    
    // Check children
    console.log('\nChecking layout.children...');
    if (!gridLayout.children) {
      throw new Error('gridLayout.children property does not exist');
    }
    console.log(`✓ Layout has ${gridLayout.children.length} children`);
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  }
}

// Run the test
testLayoutImports().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
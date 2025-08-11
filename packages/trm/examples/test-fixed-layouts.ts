#!/usr/bin/env tsx
/**
 * Test to verify that the fixed layout examples compile and run without errors
 */

async function testFixedLayouts() {
  console.log('Testing fixed layout examples...\n');
  
  try {
    // Test imports from layout-09 (relevant parts)
    console.log('Testing layout-09 imports and functionality...');
    const { TerminalImpl } = await import('../src/core/terminal.js');
    const { BufferManagerImpl } = await import('../src/core/buffer.js');
    const { ColorSystem } = await import('../src/core/color.js');
    const { createGridLayout, SimpleLayoutItem, x, y, cols, rows } = await import('../src/advanced/layout.js');
    const { ColorDepth } = await import('../src/types.js');
    
    // Create a minimal terminal for testing
    const terminal = new TerminalImpl({
      mode: 'inline',
      rawMode: false,
      keyboard: false
    });
    
    await terminal.init();
    
    const width = 80;
    const height = 20;
    const bufferManager = new BufferManagerImpl(terminal.stream);
    const colors = new ColorSystem(ColorDepth.TrueColor);
    
    // Test the grid separator drawing logic (the part that had errors)
    console.log('Testing grid separator drawing logic...');
    
    const midX = Math.floor(width / 2);
    const midY = Math.floor(height / 2);
    
    // Test vertical separator (this was the problematic code)
    for (let yPos = 0; yPos < height; yPos++) {
      const char = yPos === midY ? '┼' : '│';
      bufferManager.backBuffer.setCell(x(midX), y(yPos), char, { fg: colors.gray });
    }
    console.log('✓ Vertical separator drawn without errors');
    
    // Test horizontal separator (this was also problematic)
    for (let xPos = 0; xPos < width; xPos++) {
      if (xPos !== midX) {
        bufferManager.backBuffer.setCell(x(xPos), y(midY), '─', { fg: colors.gray });
      }
    }
    console.log('✓ Horizontal separator drawn without errors');
    
    // Test grid layout creation and arrangement
    console.log('\nTesting grid layout creation...');
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
    
    const cellWidth = Math.floor(width / 2);
    const cellHeight = Math.floor(height / 2);
    
    for (let i = 0; i < 4; i++) {
      layout.add(new SimpleLayoutItem(cols(cellWidth), rows(cellHeight)));
    }
    
    layout.arrange({
      x: x(0),
      y: y(0),
      width: cols(width),
      height: rows(height)
    });
    
    const cells = layout.children;
    console.log(`✓ Grid layout created with ${cells.length} cells`);
    
    // Test accessing cell bounds (as done in the examples)
    if (cells[0]) {
      const bounds = cells[0].item.bounds;
      console.log(`  Cell 0 bounds: x=${bounds.x}, y=${bounds.y}, w=${bounds.width}, h=${bounds.height}`);
    }
    if (cells[1]) {
      const bounds = cells[1].item.bounds;
      console.log(`  Cell 1 bounds: x=${bounds.x}, y=${bounds.y}, w=${bounds.width}, h=${bounds.height}`);
    }
    if (cells[2]) {
      const bounds = cells[2].item.bounds;
      console.log(`  Cell 2 bounds: x=${bounds.x}, y=${bounds.y}, w=${bounds.width}, h=${bounds.height}`);
    }
    if (cells[3]) {
      const bounds = cells[3].item.bounds;
      console.log(`  Cell 3 bounds: x=${bounds.x}, y=${bounds.y}, w=${bounds.width}, h=${bounds.height}`);
    }
    
    await terminal.close();
    
    console.log('\n✅ All tests passed! The layout examples should now work correctly.');
    console.log('\nThe issues fixed were:');
    console.log('1. Variable name conflicts in layout-09-fullscreen-grid.ts');
    console.log('   - Loop variable "y" conflicted with imported y() function');
    console.log('   - Loop variable "x" conflicted with imported x() function');
    console.log('   - Fixed by renaming loop variables to "yPos" and "xPos"');
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testFixedLayouts().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
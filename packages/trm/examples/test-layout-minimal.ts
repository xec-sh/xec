#!/usr/bin/env tsx
/**
 * Minimal test to replicate the layout example functionality
 */

import { ColorDepth } from '../src/types.js';
import { ColorSystem } from '../src/core/color.js';
import { TerminalImpl } from '../src/core/terminal.js';
import { BufferManagerImpl } from '../src/core/buffer.js';
import { x, y, cols, rows, createGridLayout, SimpleLayoutItem } from '../src/advanced/layout.js';

async function testMinimalLayout() {
  console.log('Testing minimal layout example...\n');
  
  try {
    // Create terminal with non-interactive settings for testing
    const terminal = new TerminalImpl({
      mode: 'inline',
      rawMode: false,
      keyboard: false,
      cursorHidden: false
    });
    
    console.log('Initializing terminal...');
    await terminal.init();
    console.log('✓ Terminal initialized');
    
    const width = 80;
    const height = 20;
    
    console.log('Creating buffer manager...');
    const bufferManager = new BufferManagerImpl(terminal.stream);
    console.log('✓ Buffer manager created');
    
    console.log('Creating color system...');
    const colors = new ColorSystem(ColorDepth.TrueColor);
    console.log('✓ Color system created');
    
    console.log('Creating grid layout...');
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
    console.log('✓ Grid layout created');
    
    console.log('Adding items to layout...');
    const cellWidth = Math.floor(width / 2);
    const cellHeight = Math.floor(height / 2);
    
    for (let i = 0; i < 4; i++) {
      layout.add(new SimpleLayoutItem(cols(cellWidth), rows(cellHeight)));
    }
    console.log('✓ 4 items added to layout');
    
    console.log('Arranging layout...');
    layout.arrange({
      x: x(0),
      y: y(0),
      width: cols(width),
      height: rows(height)
    });
    console.log('✓ Layout arranged');
    
    console.log('Accessing children...');
    const cells = layout.children;
    console.log(`✓ Got ${cells.length} children`);
    
    console.log('Testing child access...');
    if (cells[0]) {
      console.log('  Cell 0 bounds:', cells[0].item.bounds);
    }
    if (cells[1]) {
      console.log('  Cell 1 bounds:', cells[1].item.bounds);
    }
    if (cells[2]) {
      console.log('  Cell 2 bounds:', cells[2].item.bounds);
    }
    if (cells[3]) {
      console.log('  Cell 3 bounds:', cells[3].item.bounds);
    }
    console.log('✓ All cells accessible');
    
    console.log('Testing buffer operations...');
    const buffer = bufferManager.backBuffer;
    
    // Test drawing to a cell area
    if (cells[0]) {
      const rect = cells[0].item.bounds;
      buffer.writeText(x(rect.x + 1), y(rect.y + 1), 'Test Text', { fg: colors.white });
      console.log('✓ Text written to cell 0');
    }
    
    console.log('Closing terminal...');
    await terminal.close();
    console.log('✓ Terminal closed');
    
    console.log('\n✅ All tests passed! The layout examples should work.');
    
  } catch (error) {
    console.error('\n❌ Error occurred:', error);
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testMinimalLayout().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
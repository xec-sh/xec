#!/usr/bin/env tsx
/**
 * Layout Example 03: Grid Layout
 * Demonstrates grid layout with tracks, placement, and spanning
 */

import {
  x,
  y,
  cols, rows, type GridTrack, createGridLayout,
  SimpleLayoutItem,
  type GridAutoFlow
} from '../src/advanced/layout.js';

function demonstrateBasicGrid() {
  console.log('=== Basic Grid ===\n');

  // Create a simple 3x3 grid
  const layout = createGridLayout({
    columns: 3, // 3 equal columns
    rows: 3,    // 3 auto-sized rows
    gap: 1
  });

  // Add 9 items
  for (let i = 0; i < 9; i++) {
    const item = new SimpleLayoutItem(cols(10), rows(2));
    layout.add(item);
  }

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(40),
    height: rows(12)
  });

  console.log('3x3 Grid item positions:');
  for (let i = 0; i < layout.children.length; i++) {
    const { item } = layout.children[i];
    console.log(`  Item ${i + 1}: (${item.bounds.x}, ${item.bounds.y})`);
  }
  console.log();
}

function demonstrateGridTracks() {
  console.log('=== Grid Tracks ===\n');

  // Define custom grid tracks
  const columnTracks: GridTrack[] = [
    { type: 'fixed', size: 10 },      // Fixed 10 columns
    { type: 'fraction', size: 1 },    // 1fr
    { type: 'fraction', size: 2 },    // 2fr (twice the size of 1fr)
    { type: 'auto' }                   // Auto-sized
  ];

  const rowTracks: GridTrack[] = [
    { type: 'fixed', size: 3 },        // Fixed 3 rows
    { type: 'minmax', min: 2, max: 5 }, // Between 2 and 5 rows
    { type: 'auto' }                    // Auto-sized
  ];

  const layout = createGridLayout({
    columns: columnTracks,
    rows: rowTracks,
    gap: 1
  });

  // Add items to see track sizing
  for (let i = 0; i < 12; i++) {
    const item = new SimpleLayoutItem(cols(8), rows(2));
    layout.add(item);
  }

  // Measure required size
  const size = layout.measure({ width: cols(60), height: rows(20) });
  console.log(`Grid size with custom tracks: ${size.width}x${size.height}`);

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(60),
    height: rows(15)
  });

  console.log('Items in custom grid:');
  for (let i = 0; i < Math.min(4, layout.children.length); i++) {
    const { item } = layout.children[i];
    console.log(`  Item ${i + 1}: pos=(${item.bounds.x}, ${item.bounds.y}), size=${item.bounds.width}x${item.bounds.height}`);
  }
  console.log();
}

function demonstrateGridPlacement() {
  console.log('=== Grid Placement ===\n');

  const layout = createGridLayout({
    columns: 4,
    rows: 4,
    gap: 1
  });

  // Add items with explicit placement
  const item1 = new SimpleLayoutItem(cols(10), rows(2));
  const item2 = new SimpleLayoutItem(cols(10), rows(2));
  const item3 = new SimpleLayoutItem(cols(10), rows(2));
  const item4 = new SimpleLayoutItem(cols(10), rows(2));

  // Place items in specific cells
  layout.add(item1, {
    gridColumn: { start: 1 },
    gridRow: { start: 1 }
  });

  layout.add(item2, {
    gridColumn: { start: 3 },
    gridRow: { start: 1 }
  });

  layout.add(item3, {
    gridColumn: { start: 2 },
    gridRow: { start: 3 }
  });

  layout.add(item4, {
    gridColumn: { start: 4 },
    gridRow: { start: 4 }
  });

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(50),
    height: rows(20)
  });

  console.log('Explicitly placed items:');
  console.log(`  Item 1 at col 1, row 1: (${item1.bounds.x}, ${item1.bounds.y})`);
  console.log(`  Item 2 at col 3, row 1: (${item2.bounds.x}, ${item2.bounds.y})`);
  console.log(`  Item 3 at col 2, row 3: (${item3.bounds.x}, ${item3.bounds.y})`);
  console.log(`  Item 4 at col 4, row 4: (${item4.bounds.x}, ${item4.bounds.y})`);
  console.log();
}

function demonstrateGridSpanning() {
  console.log('=== Grid Spanning ===\n');

  const layout = createGridLayout({
    columns: 4,
    rows: 3,
    gap: 1
  });

  // Add items that span multiple cells
  const header = new SimpleLayoutItem(cols(40), rows(2));
  const sidebar = new SimpleLayoutItem(cols(10), rows(6));
  const content = new SimpleLayoutItem(cols(25), rows(4));
  const footer = new SimpleLayoutItem(cols(40), rows(1));

  // Header spans all columns
  layout.add(header, {
    gridColumn: { start: 1, span: 4 },
    gridRow: { start: 1 }
  });

  // Sidebar spans 2 rows
  layout.add(sidebar, {
    gridColumn: { start: 1 },
    gridRow: { start: 2, span: 2 }
  });

  // Content spans 2 columns and 1 row
  layout.add(content, {
    gridColumn: { start: 2, span: 2 },
    gridRow: { start: 2 }
  });

  // Footer spans all columns
  layout.add(footer, {
    gridColumn: { start: 1, span: 4 },
    gridRow: { start: 3 }
  });

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(60),
    height: rows(15)
  });

  console.log('Spanning grid items:');
  console.log(`  Header (4 cols): pos=(${header.bounds.x}, ${header.bounds.y}), size=${header.bounds.width}x${header.bounds.height}`);
  console.log(`  Sidebar (2 rows): pos=(${sidebar.bounds.x}, ${sidebar.bounds.y}), size=${sidebar.bounds.width}x${sidebar.bounds.height}`);
  console.log(`  Content (2x1): pos=(${content.bounds.x}, ${content.bounds.y}), size=${content.bounds.width}x${content.bounds.height}`);
  console.log(`  Footer (4 cols): pos=(${footer.bounds.x}, ${footer.bounds.y}), size=${footer.bounds.width}x${footer.bounds.height}`);
  console.log();
}

function demonstrateAutoFlow() {
  console.log('=== Grid Auto Flow ===\n');

  const flows: GridAutoFlow[] = ['row', 'column', 'dense'];

  for (const autoFlow of flows) {
    console.log(`Auto flow: ${autoFlow}`);

    const layout = createGridLayout({
      columns: 3,
      rows: 3,
      autoFlow,
      gap: 1
    });

    // Add items with some gaps
    const item1 = new SimpleLayoutItem(cols(8), rows(2));
    const item2 = new SimpleLayoutItem(cols(8), rows(2));
    const item3 = new SimpleLayoutItem(cols(8), rows(2));
    const item4 = new SimpleLayoutItem(cols(8), rows(2));
    const item5 = new SimpleLayoutItem(cols(8), rows(2));

    // Place first item explicitly
    layout.add(item1, {
      gridColumn: { start: 2 },
      gridRow: { start: 1 }
    });

    // Auto-place the rest
    layout.add(item2);
    layout.add(item3);
    layout.add(item4);
    layout.add(item5);

    // Arrange
    layout.arrange({
      x: x(0),
      y: y(0),
      width: cols(30),
      height: rows(10)
    });

    console.log(`  Item positions:`);
    for (let i = 0; i < layout.children.length; i++) {
      const { item } = layout.children[i];
      console.log(`    Item ${i + 1}: (${item.bounds.x}, ${item.bounds.y})`);
    }
    console.log();
  }
}

function demonstrateFractionUnits() {
  console.log('=== Fraction Units ===\n');

  const layout = createGridLayout({
    columns: [
      { type: 'fraction', size: 1 },  // 1fr
      { type: 'fraction', size: 2 },  // 2fr
      { type: 'fraction', size: 1 }   // 1fr
    ],
    rows: [
      { type: 'fraction', size: 1 },  // 1fr
      { type: 'fraction', size: 1 }   // 1fr
    ],
    gap: 1
  });

  // Add items
  for (let i = 0; i < 6; i++) {
    const item = new SimpleLayoutItem(cols(10), rows(2));
    layout.add(item);
  }

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(40),
    height: rows(10)
  });

  console.log('Grid with fr units (1fr-2fr-1fr columns):');
  for (let i = 0; i < layout.children.length; i++) {
    const { item } = layout.children[i];
    const col = i % 3;
    const row = Math.floor(i / 3);
    console.log(`  Item at [${row},${col}]: width=${item.bounds.width}`);
  }
  console.log();
}

function demonstrateComplexGrid() {
  console.log('=== Complex Grid Layout ===\n');

  // Create a complex grid layout
  const layout = createGridLayout({
    columns: [
      { type: 'fixed', size: 15 },          // Navigation
      { type: 'fraction', size: 2 },        // Main content
      { type: 'fraction', size: 1 },        // Sidebar
      { type: 'minmax', min: 5, max: 10 }   // Ads
    ],
    rows: [
      { type: 'fixed', size: 3 },           // Header
      { type: 'fraction', size: 1 },        // Content
      { type: 'auto' },                     // Dynamic
      { type: 'fixed', size: 2 }            // Footer
    ],
    gap: 2,
    padding: { top: 1, right: 2, bottom: 1, left: 2 }
  });

  // Add complex layout items
  const nav = new SimpleLayoutItem(cols(12), rows(10));
  const header = new SimpleLayoutItem(cols(50), rows(3));
  const main = new SimpleLayoutItem(cols(30), rows(10));
  const sidebar = new SimpleLayoutItem(cols(15), rows(10));
  const ads = new SimpleLayoutItem(cols(8), rows(10));
  const footer = new SimpleLayoutItem(cols(50), rows(2));

  // Place items strategically
  layout.add(nav, {
    gridColumn: { start: 1 },
    gridRow: { start: 1, span: 3 }
  });

  layout.add(header, {
    gridColumn: { start: 2, span: 3 },
    gridRow: { start: 1 }
  });

  layout.add(main, {
    gridColumn: { start: 2 },
    gridRow: { start: 2, span: 2 }
  });

  layout.add(sidebar, {
    gridColumn: { start: 3 },
    gridRow: { start: 2, span: 2 }
  });

  layout.add(ads, {
    gridColumn: { start: 4 },
    gridRow: { start: 2, span: 2 }
  });

  layout.add(footer, {
    gridColumn: { start: 1, span: 4 },
    gridRow: { start: 4 }
  });

  // Measure and arrange
  const size = layout.measure({ width: cols(80), height: rows(24) });
  console.log(`Complex grid size: ${size.width}x${size.height}`);

  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(80),
    height: rows(20)
  });

  console.log('Complex grid layout:');
  console.log(`  Nav:     pos=(${nav.bounds.x}, ${nav.bounds.y}), size=${nav.bounds.width}x${nav.bounds.height}`);
  console.log(`  Header:  pos=(${header.bounds.x}, ${header.bounds.y}), size=${header.bounds.width}x${header.bounds.height}`);
  console.log(`  Main:    pos=(${main.bounds.x}, ${main.bounds.y}), size=${main.bounds.width}x${main.bounds.height}`);
  console.log(`  Sidebar: pos=(${sidebar.bounds.x}, ${sidebar.bounds.y}), size=${sidebar.bounds.width}x${sidebar.bounds.height}`);
  console.log(`  Ads:     pos=(${ads.bounds.x}, ${ads.bounds.y}), size=${ads.bounds.width}x${ads.bounds.height}`);
  console.log(`  Footer:  pos=(${footer.bounds.x}, ${footer.bounds.y}), size=${footer.bounds.width}x${footer.bounds.height}`);
  console.log();
}

async function main() {
  console.log('=== Grid Layout Examples ===\n');

  demonstrateBasicGrid();
  demonstrateGridTracks();
  demonstrateGridPlacement();
  demonstrateGridSpanning();
  demonstrateAutoFlow();
  demonstrateFractionUnits();
  demonstrateComplexGrid();

  console.log('=== Examples Complete ===');
}

main().catch(console.error);
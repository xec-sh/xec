#!/usr/bin/env tsx
/**
 * Layout Example 05: Stack Layout
 * Demonstrates stacking items on top of each other (z-order)
 */

import {
  x,
  y,
  cols, rows, SimpleLayoutItem, createStackLayout
} from '../src/advanced/layout.js';

function demonstrateBasicStack() {
  console.log('=== Basic Stack Layout ===\n');

  const layout = createStackLayout({
    padding: 2
  });

  // Create items of different sizes
  const background = new SimpleLayoutItem(cols(40), rows(10));
  const middle = new SimpleLayoutItem(cols(30), rows(8));
  const foreground = new SimpleLayoutItem(cols(20), rows(5));
  const top = new SimpleLayoutItem(cols(10), rows(3));

  // Add items (last added appears on top)
  layout.add(background);
  layout.add(middle);
  layout.add(foreground);
  layout.add(top);

  // Measure
  const size = layout.measure({ width: cols(50), height: rows(15) });
  console.log(`Stack size (largest item + padding): ${size.width}x${size.height}`);

  // Arrange - all items get the same bounds
  layout.arrange({
    x: x(5),
    y: y(2),
    width: cols(45),
    height: rows(12)
  });

  console.log('Stacked items (all have same position):');
  console.log(`  Background: pos=(${background.bounds.x}, ${background.bounds.y}), size=${background.bounds.width}x${background.bounds.height}`);
  console.log(`  Middle:     pos=(${middle.bounds.x}, ${middle.bounds.y}), size=${middle.bounds.width}x${middle.bounds.height}`);
  console.log(`  Foreground: pos=(${foreground.bounds.x}, ${foreground.bounds.y}), size=${foreground.bounds.width}x${foreground.bounds.height}`);
  console.log(`  Top:        pos=(${top.bounds.x}, ${top.bounds.y}), size=${top.bounds.width}x${top.bounds.height}`);
  console.log();
}

function demonstrateLayeredUI() {
  console.log('=== Layered UI with Stack ===\n');

  const layout = createStackLayout();

  // Create UI layers
  const backgroundLayer = new SimpleLayoutItem(cols(60), rows(20));
  const contentLayer = new SimpleLayoutItem(cols(50), rows(15));
  const overlayLayer = new SimpleLayoutItem(cols(30), rows(10));
  const modalLayer = new SimpleLayoutItem(cols(25), rows(8));
  const tooltipLayer = new SimpleLayoutItem(cols(15), rows(3));

  // Add layers in order (bottom to top)
  console.log('Adding layers:');
  console.log('  1. Background layer (full size)');
  layout.add(backgroundLayer);
  
  console.log('  2. Content layer (main UI)');
  layout.add(contentLayer);
  
  console.log('  3. Overlay layer (dimmed background)');
  layout.add(overlayLayer);
  
  console.log('  4. Modal dialog layer');
  layout.add(modalLayer);
  
  console.log('  5. Tooltip layer (topmost)');
  layout.add(tooltipLayer);

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(60),
    height: rows(20)
  });

  console.log('\nAll layers share the same bounds:');
  console.log(`  Position: (${backgroundLayer.bounds.x}, ${backgroundLayer.bounds.y})`);
  console.log(`  Size: ${backgroundLayer.bounds.width}x${backgroundLayer.bounds.height}`);
  console.log();
}

function demonstrateStackWithClear() {
  console.log('=== Dynamic Stack Management ===\n');

  const layout = createStackLayout();

  // Initial items
  const item1 = new SimpleLayoutItem(cols(20), rows(5));
  const item2 = new SimpleLayoutItem(cols(20), rows(5));
  
  layout.add(item1);
  layout.add(item2);
  
  console.log(`Initial stack: ${layout.children.length} items`);

  // Clear and add new items
  layout.clear();
  console.log(`After clear: ${layout.children.length} items`);

  const newItem1 = new SimpleLayoutItem(cols(25), rows(6));
  const newItem2 = new SimpleLayoutItem(cols(25), rows(6));
  const newItem3 = new SimpleLayoutItem(cols(25), rows(6));
  
  layout.add(newItem1);
  layout.add(newItem2);
  layout.add(newItem3);
  
  console.log(`After adding new items: ${layout.children.length} items`);

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(30),
    height: rows(10)
  });

  console.log(`\nNew stack bounds: ${newItem1.bounds.width}x${newItem1.bounds.height}`);
  console.log();
}

function demonstrateStackVsAbsolute() {
  console.log('=== Stack vs Absolute Comparison ===\n');

  console.log('Stack Layout:');
  console.log('  - All items share the same position and size');
  console.log('  - Items are rendered in order (z-index)');
  console.log('  - Perfect for overlays, modals, tooltips');
  console.log('  - Simpler than absolute when you want full overlap');

  const stackLayout = createStackLayout();
  const stackItem1 = new SimpleLayoutItem(cols(20), rows(5));
  const stackItem2 = new SimpleLayoutItem(cols(15), rows(3));
  
  stackLayout.add(stackItem1);
  stackLayout.add(stackItem2);
  
  stackLayout.arrange({
    x: x(0),
    y: y(0),
    width: cols(25),
    height: rows(8)
  });

  console.log(`\n  Stack items:`);
  console.log(`    Item 1: (${stackItem1.bounds.x}, ${stackItem1.bounds.y}) ${stackItem1.bounds.width}x${stackItem1.bounds.height}`);
  console.log(`    Item 2: (${stackItem2.bounds.x}, ${stackItem2.bounds.y}) ${stackItem2.bounds.width}x${stackItem2.bounds.height}`);
  console.log(`    Notice: Both items have identical bounds!`);

  console.log('\nAbsolute Layout:');
  console.log('  - Each item can have different position and size');
  console.log('  - More control over individual placement');
  console.log('  - Better for complex layouts with specific positioning');
  console.log();
}

function demonstrateStackUseCases() {
  console.log('=== Stack Layout Use Cases ===\n');

  // Use case 1: Game screen layers
  console.log('1. Game Screen Layers:');
  const gameStack = createStackLayout();
  
  const gameWorld = new SimpleLayoutItem(cols(80), rows(24));
  const gameUI = new SimpleLayoutItem(cols(80), rows(24));
  const gamePauseMenu = new SimpleLayoutItem(cols(40), rows(15));
  
  gameStack.add(gameWorld);    // Bottom: game world
  gameStack.add(gameUI);        // Middle: HUD/UI
  gameStack.add(gamePauseMenu); // Top: pause menu
  
  gameStack.arrange({
    x: x(0),
    y: y(0),
    width: cols(80),
    height: rows(24)
  });
  
  console.log('   Game layers all at:', `(${gameWorld.bounds.x}, ${gameWorld.bounds.y})`);

  // Use case 2: Modal dialogs
  console.log('\n2. Modal Dialog System:');
  const modalStack = createStackLayout();
  
  const mainContent = new SimpleLayoutItem(cols(60), rows(20));
  const dimOverlay = new SimpleLayoutItem(cols(60), rows(20));
  const modalDialog = new SimpleLayoutItem(cols(40), rows(12));
  
  modalStack.add(mainContent);
  modalStack.add(dimOverlay);
  modalStack.add(modalDialog);
  
  modalStack.arrange({
    x: x(0),
    y: y(0),
    width: cols(60),
    height: rows(20)
  });
  
  console.log('   All modal layers at:', `(${mainContent.bounds.x}, ${mainContent.bounds.y})`);

  // Use case 3: Loading screens
  console.log('\n3. Loading Screen:');
  const loadingStack = createStackLayout();
  
  const appContent = new SimpleLayoutItem(cols(50), rows(15));
  const loadingOverlay = new SimpleLayoutItem(cols(50), rows(15));
  const spinner = new SimpleLayoutItem(cols(10), rows(3));
  
  loadingStack.add(appContent);
  loadingStack.add(loadingOverlay);
  loadingStack.add(spinner);
  
  loadingStack.arrange({
    x: x(0),
    y: y(0),
    width: cols(50),
    height: rows(15)
  });
  
  console.log('   Loading layers at:', `(${appContent.bounds.x}, ${appContent.bounds.y})`);
  console.log();
}

function demonstrateNestedStacks() {
  console.log('=== Nested Stack Layouts ===\n');

  // Create a parent stack
  const parentStack = createStackLayout({
    padding: 1
  });

  // Create child stacks as layout items
  class StackLayoutItem {
    bounds = { x: x(0), y: y(0), width: cols(0), height: rows(0) };
    private layout = createStackLayout();
    
    constructor() {
      // Add some items to this nested stack
      this.layout.add(new SimpleLayoutItem(cols(20), rows(5)));
      this.layout.add(new SimpleLayoutItem(cols(15), rows(4)));
    }
    
    measure(availableSpace: { width: number; height: number }) {
      return this.layout.measure({
        width: cols(availableSpace.width),
        height: rows(availableSpace.height)
      });
    }
    
    arrange(finalRect: typeof this.bounds) {
      this.bounds = finalRect;
      this.layout.arrange(finalRect);
    }
  }

  const nestedStack1 = new StackLayoutItem();
  const nestedStack2 = new StackLayoutItem();
  const topItem = new SimpleLayoutItem(cols(30), rows(8));

  // Add nested stacks to parent
  parentStack.add(nestedStack1);
  parentStack.add(nestedStack2);
  parentStack.add(topItem);

  // Arrange parent
  parentStack.arrange({
    x: x(0),
    y: y(0),
    width: cols(35),
    height: rows(10)
  });

  console.log('Nested stacks:');
  console.log(`  Nested Stack 1: (${nestedStack1.bounds.x}, ${nestedStack1.bounds.y}) ${nestedStack1.bounds.width}x${nestedStack1.bounds.height}`);
  console.log(`  Nested Stack 2: (${nestedStack2.bounds.x}, ${nestedStack2.bounds.y}) ${nestedStack2.bounds.width}x${nestedStack2.bounds.height}`);
  console.log(`  Top Item:       (${topItem.bounds.x}, ${topItem.bounds.y}) ${topItem.bounds.width}x${topItem.bounds.height}`);
  console.log();
}

async function main() {
  console.log('=== Stack Layout Examples ===\n');

  demonstrateBasicStack();
  demonstrateLayeredUI();
  demonstrateStackWithClear();
  demonstrateStackVsAbsolute();
  demonstrateStackUseCases();
  demonstrateNestedStacks();

  console.log('=== Examples Complete ===');
}

main().catch(console.error);
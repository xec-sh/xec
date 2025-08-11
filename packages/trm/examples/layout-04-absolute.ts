#!/usr/bin/env tsx
/**
 * Layout Example 04: Absolute Layout
 * Demonstrates absolute positioning with coordinates and constraints
 */

import {
  x,
  y,
  cols, rows, SimpleLayoutItem, createAbsoluteLayout
} from '../src/advanced/layout.js';

function demonstrateBasicAbsolute() {
  console.log('=== Basic Absolute Positioning ===\n');

  const layout = createAbsoluteLayout({
    padding: 2
  });

  // Create items at specific positions
  const topLeft = new SimpleLayoutItem(cols(15), rows(3));
  const topRight = new SimpleLayoutItem(cols(15), rows(3));
  const center = new SimpleLayoutItem(cols(20), rows(5));
  const bottomLeft = new SimpleLayoutItem(cols(15), rows(3));
  const bottomRight = new SimpleLayoutItem(cols(15), rows(3));

  // Position items absolutely
  layout.add(topLeft, { left: 0, top: 0 });
  layout.add(topRight, { left: 40, top: 0 });
  layout.add(center, { left: 20, top: 5 });
  layout.add(bottomLeft, { left: 0, top: 12 });
  layout.add(bottomRight, { left: 40, top: 12 });

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(60),
    height: rows(18)
  });

  console.log('Absolutely positioned items:');
  console.log(`  Top-left:     (${topLeft.bounds.x}, ${topLeft.bounds.y})`);
  console.log(`  Top-right:    (${topRight.bounds.x}, ${topRight.bounds.y})`);
  console.log(`  Center:       (${center.bounds.x}, ${center.bounds.y})`);
  console.log(`  Bottom-left:  (${bottomLeft.bounds.x}, ${bottomLeft.bounds.y})`);
  console.log(`  Bottom-right: (${bottomRight.bounds.x}, ${bottomRight.bounds.y})`);
  console.log();
}

function demonstrateRightBottom() {
  console.log('=== Right/Bottom Positioning ===\n');

  const layout = createAbsoluteLayout();

  // Create items positioned from right/bottom edges
  const item1 = new SimpleLayoutItem(cols(10), rows(3));
  const item2 = new SimpleLayoutItem(cols(10), rows(3));
  const item3 = new SimpleLayoutItem(cols(10), rows(3));
  const item4 = new SimpleLayoutItem(cols(10), rows(3));

  // Position from edges
  layout.add(item1, { right: 5, top: 2 });      // 5 from right, 2 from top
  layout.add(item2, { left: 5, bottom: 2 });    // 5 from left, 2 from bottom
  layout.add(item3, { right: 5, bottom: 2 });   // 5 from right, 2 from bottom
  layout.add(item4, { right: 20, bottom: 6 });  // More centered

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(50),
    height: rows(15)
  });

  console.log('Items positioned from edges:');
  console.log(`  From right/top:    (${item1.bounds.x}, ${item1.bounds.y})`);
  console.log(`  From left/bottom:  (${item2.bounds.x}, ${item2.bounds.y})`);
  console.log(`  From right/bottom: (${item3.bounds.x}, ${item3.bounds.y})`);
  console.log(`  Centered:          (${item4.bounds.x}, ${item4.bounds.y})`);
  console.log();
}

function demonstrateStretch() {
  console.log('=== Stretch Between Edges ===\n');

  const layout = createAbsoluteLayout();

  // Items that stretch between edges
  const header = new SimpleLayoutItem(cols(50), rows(3));
  const sidebar = new SimpleLayoutItem(cols(15), rows(10));
  const content = new SimpleLayoutItem(cols(30), rows(10));
  const footer = new SimpleLayoutItem(cols(50), rows(2));

  // Stretch items using left/right and top/bottom
  layout.add(header, { 
    left: 0, 
    right: 0,  // Stretches full width
    top: 0 
  });

  layout.add(sidebar, { 
    left: 0,
    top: 3,
    bottom: 2  // Stretches vertically
  });

  layout.add(content, { 
    left: 15,
    right: 5,  // Stretches horizontally
    top: 3,
    bottom: 2  // Stretches vertically
  });

  layout.add(footer, { 
    left: 0,
    right: 0,  // Stretches full width
    bottom: 0
  });

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(60),
    height: rows(20)
  });

  console.log('Stretched items:');
  console.log(`  Header: pos=(${header.bounds.x}, ${header.bounds.y}), size=${header.bounds.width}x${header.bounds.height}`);
  console.log(`  Sidebar: pos=(${sidebar.bounds.x}, ${sidebar.bounds.y}), size=${sidebar.bounds.width}x${sidebar.bounds.height}`);
  console.log(`  Content: pos=(${content.bounds.x}, ${content.bounds.y}), size=${content.bounds.width}x${content.bounds.height}`);
  console.log(`  Footer: pos=(${footer.bounds.x}, ${footer.bounds.y}), size=${footer.bounds.width}x${footer.bounds.height}`);
  console.log();
}

function demonstrateOverlapping() {
  console.log('=== Overlapping Items ===\n');

  const layout = createAbsoluteLayout();

  // Create overlapping items (z-order is based on addition order)
  const background = new SimpleLayoutItem(cols(30), rows(10));
  const middle = new SimpleLayoutItem(cols(20), rows(6));
  const foreground = new SimpleLayoutItem(cols(10), rows(3));

  // Add in z-order (first added = bottom)
  layout.add(background, { left: 5, top: 2 });
  layout.add(middle, { left: 10, top: 4 });
  layout.add(foreground, { left: 15, top: 6 });

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(40),
    height: rows(15)
  });

  console.log('Overlapping items (z-order):');
  console.log(`  Background: (${background.bounds.x}, ${background.bounds.y}) size=${background.bounds.width}x${background.bounds.height}`);
  console.log(`  Middle:     (${middle.bounds.x}, ${middle.bounds.y}) size=${middle.bounds.width}x${middle.bounds.height}`);
  console.log(`  Foreground: (${foreground.bounds.x}, ${foreground.bounds.y}) size=${foreground.bounds.width}x${foreground.bounds.height}`);
  console.log();
}

function demonstrateCentering() {
  console.log('=== Centering Items ===\n');

  const layout = createAbsoluteLayout();
  
  // To center an item, we need to calculate position
  const containerWidth = 50;
  const containerHeight = 15;
  
  const item = new SimpleLayoutItem(cols(20), rows(5));
  const itemWidth = 20;
  const itemHeight = 5;
  
  // Calculate center position
  const centerX = Math.floor((containerWidth - itemWidth) / 2);
  const centerY = Math.floor((containerHeight - itemHeight) / 2);
  
  layout.add(item, { left: centerX, top: centerY });

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(containerWidth),
    height: rows(containerHeight)
  });

  console.log(`Centered item in ${containerWidth}x${containerHeight} container:`);
  console.log(`  Position: (${item.bounds.x}, ${item.bounds.y})`);
  console.log(`  Size: ${item.bounds.width}x${item.bounds.height}`);
  console.log();
}

function demonstrateComplexAbsolute() {
  console.log('=== Complex Absolute Layout ===\n');

  const layout = createAbsoluteLayout({
    padding: { top: 1, right: 2, bottom: 1, left: 2 }
  });

  // Create a complex UI layout
  const logo = new SimpleLayoutItem(cols(8), rows(2));
  const title = new SimpleLayoutItem(cols(30), rows(2));
  const menu = new SimpleLayoutItem(cols(15), rows(2));
  const notification = new SimpleLayoutItem(cols(5), rows(1));
  const mainPanel = new SimpleLayoutItem(cols(40), rows(12));
  const sidePanel = new SimpleLayoutItem(cols(15), rows(8));
  const statusBar = new SimpleLayoutItem(cols(60), rows(1));
  const floatingButton = new SimpleLayoutItem(cols(6), rows(2));

  // Position everything
  layout.add(logo, { left: 0, top: 0 });
  layout.add(title, { left: 10, top: 0 });
  layout.add(menu, { right: 0, top: 0 });
  layout.add(notification, { right: 2, top: 3 });
  
  layout.add(mainPanel, { 
    left: 0, 
    top: 3,
    right: 18  // Leave space for side panel
  });
  
  layout.add(sidePanel, { 
    right: 0,
    top: 3,
    bottom: 2
  });
  
  layout.add(statusBar, { 
    left: 0,
    right: 0,
    bottom: 0
  });
  
  layout.add(floatingButton, { 
    right: 3,
    bottom: 3
  });

  // Measure
  const size = layout.measure({ width: cols(80), height: rows(24) });
  console.log(`Complex layout size: ${size.width}x${size.height}`);

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(70),
    height: rows(20)
  });

  console.log('Complex absolute layout:');
  console.log(`  Logo:     (${logo.bounds.x}, ${logo.bounds.y})`);
  console.log(`  Title:    (${title.bounds.x}, ${title.bounds.y})`);
  console.log(`  Menu:     (${menu.bounds.x}, ${menu.bounds.y})`);
  console.log(`  Notif:    (${notification.bounds.x}, ${notification.bounds.y})`);
  console.log(`  Main:     (${mainPanel.bounds.x}, ${mainPanel.bounds.y}) size=${mainPanel.bounds.width}x${mainPanel.bounds.height}`);
  console.log(`  Side:     (${sidePanel.bounds.x}, ${sidePanel.bounds.y}) size=${sidePanel.bounds.width}x${sidePanel.bounds.height}`);
  console.log(`  Status:   (${statusBar.bounds.x}, ${statusBar.bounds.y}) size=${statusBar.bounds.width}x${statusBar.bounds.height}`);
  console.log(`  Button:   (${floatingButton.bounds.x}, ${floatingButton.bounds.y})`);
  console.log();
}

async function main() {
  console.log('=== Absolute Layout Examples ===\n');

  demonstrateBasicAbsolute();
  demonstrateRightBottom();
  demonstrateStretch();
  demonstrateOverlapping();
  demonstrateCentering();
  demonstrateComplexAbsolute();

  console.log('=== Examples Complete ===');
}

main().catch(console.error);
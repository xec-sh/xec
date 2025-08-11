#!/usr/bin/env tsx
/**
 * Layout Example 06: Dock Layout
 * Demonstrates docking items to edges with fill support
 */

import {
  x,
  y,
  cols, rows, createDockLayout, SimpleLayoutItem
} from '../src/advanced/layout.js';

function demonstrateBasicDock() {
  console.log('=== Basic Dock Layout ===\n');

  const layout = createDockLayout({
    padding: 1
  });

  // Create items to dock
  const topBar = new SimpleLayoutItem(cols(50), rows(3));
  const leftPanel = new SimpleLayoutItem(cols(15), rows(10));
  const rightPanel = new SimpleLayoutItem(cols(12), rows(10));
  const bottomBar = new SimpleLayoutItem(cols(50), rows(2));
  const content = new SimpleLayoutItem(cols(30), rows(10));

  // Dock items to edges
  layout.add(topBar, { dock: 'top' });
  layout.add(leftPanel, { dock: 'left' });
  layout.add(rightPanel, { dock: 'right' });
  layout.add(bottomBar, { dock: 'bottom' });
  layout.add(content, { dock: 'fill' }); // Fill remaining space

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(60),
    height: rows(20)
  });

  console.log('Docked items:');
  console.log(`  Top:    pos=(${topBar.bounds.x}, ${topBar.bounds.y}), size=${topBar.bounds.width}x${topBar.bounds.height}`);
  console.log(`  Left:   pos=(${leftPanel.bounds.x}, ${leftPanel.bounds.y}), size=${leftPanel.bounds.width}x${leftPanel.bounds.height}`);
  console.log(`  Right:  pos=(${rightPanel.bounds.x}, ${rightPanel.bounds.y}), size=${rightPanel.bounds.width}x${rightPanel.bounds.height}`);
  console.log(`  Bottom: pos=(${bottomBar.bounds.x}, ${bottomBar.bounds.y}), size=${bottomBar.bounds.width}x${bottomBar.bounds.height}`);
  console.log(`  Fill:   pos=(${content.bounds.x}, ${content.bounds.y}), size=${content.bounds.width}x${content.bounds.height}`);
  console.log();
}

function demonstrateDockOrder() {
  console.log('=== Dock Order Matters ===\n');

  console.log('Layout 1: Top -> Left -> Right -> Bottom');
  const layout1 = createDockLayout();
  
  const top1 = new SimpleLayoutItem(cols(40), rows(3));
  const left1 = new SimpleLayoutItem(cols(10), rows(10));
  const right1 = new SimpleLayoutItem(cols(10), rows(10));
  const bottom1 = new SimpleLayoutItem(cols(40), rows(2));
  
  layout1.add(top1, { dock: 'top' });
  layout1.add(left1, { dock: 'left' });
  layout1.add(right1, { dock: 'right' });
  layout1.add(bottom1, { dock: 'bottom' });
  
  layout1.arrange({
    x: x(0),
    y: y(0),
    width: cols(50),
    height: rows(15)
  });
  
  console.log(`  Top width: ${top1.bounds.width} (full width)`);
  console.log(`  Left height: ${left1.bounds.height} (remaining height)`);
  console.log(`  Right height: ${right1.bounds.height} (remaining height)`);
  console.log(`  Bottom width: ${bottom1.bounds.width} (remaining width)`);

  console.log('\nLayout 2: Left -> Right -> Top -> Bottom');
  const layout2 = createDockLayout();
  
  const left2 = new SimpleLayoutItem(cols(10), rows(15));
  const right2 = new SimpleLayoutItem(cols(10), rows(15));
  const top2 = new SimpleLayoutItem(cols(30), rows(3));
  const bottom2 = new SimpleLayoutItem(cols(30), rows(2));
  
  layout2.add(left2, { dock: 'left' });
  layout2.add(right2, { dock: 'right' });
  layout2.add(top2, { dock: 'top' });
  layout2.add(bottom2, { dock: 'bottom' });
  
  layout2.arrange({
    x: x(0),
    y: y(0),
    width: cols(50),
    height: rows(15)
  });
  
  console.log(`  Left height: ${left2.bounds.height} (full height)`);
  console.log(`  Right height: ${right2.bounds.height} (full height)`);
  console.log(`  Top width: ${top2.bounds.width} (remaining width)`);
  console.log(`  Bottom width: ${bottom2.bounds.width} (remaining width)`);
  console.log();
}

function demonstrateMultipleFill() {
  console.log('=== Multiple Fill Items ===\n');

  const layout = createDockLayout();

  // Dock edge items
  const header = new SimpleLayoutItem(cols(50), rows(2));
  const footer = new SimpleLayoutItem(cols(50), rows(2));
  
  // Multiple fill items (they share the same fill area)
  const content1 = new SimpleLayoutItem(cols(30), rows(10));
  const content2 = new SimpleLayoutItem(cols(25), rows(8));
  const content3 = new SimpleLayoutItem(cols(20), rows(6));

  layout.add(header, { dock: 'top' });
  layout.add(footer, { dock: 'bottom' });
  
  // All fill items get the same bounds
  layout.add(content1, { dock: 'fill' });
  layout.add(content2, { dock: 'fill' });
  layout.add(content3); // No dock = fill by default

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(50),
    height: rows(15)
  });

  console.log('Multiple fill items share the same area:');
  console.log(`  Content 1: pos=(${content1.bounds.x}, ${content1.bounds.y}), size=${content1.bounds.width}x${content1.bounds.height}`);
  console.log(`  Content 2: pos=(${content2.bounds.x}, ${content2.bounds.y}), size=${content2.bounds.width}x${content2.bounds.height}`);
  console.log(`  Content 3: pos=(${content3.bounds.x}, ${content3.bounds.y}), size=${content3.bounds.width}x${content3.bounds.height}`);
  console.log('  (All have identical bounds - layered like a stack)');
  console.log();
}

function demonstrateComplexDock() {
  console.log('=== Complex Dock Layout ===\n');

  const layout = createDockLayout({
    padding: { top: 1, right: 1, bottom: 1, left: 1 }
  });

  // Create a complex application layout
  const menuBar = new SimpleLayoutItem(cols(60), rows(1));
  const toolBar = new SimpleLayoutItem(cols(60), rows(2));
  const statusBar = new SimpleLayoutItem(cols(60), rows(1));
  const leftSidebar = new SimpleLayoutItem(cols(12), rows(15));
  const rightSidebar = new SimpleLayoutItem(cols(15), rows(15));
  const bottomPanel = new SimpleLayoutItem(cols(40), rows(4));
  const mainContent = new SimpleLayoutItem(cols(30), rows(10));

  // Add in specific order for desired layout
  layout.add(menuBar, { dock: 'top' });
  layout.add(toolBar, { dock: 'top' });      // Second top item
  layout.add(statusBar, { dock: 'bottom' });
  layout.add(leftSidebar, { dock: 'left' });
  layout.add(rightSidebar, { dock: 'right' });
  layout.add(bottomPanel, { dock: 'bottom' }); // Second bottom item
  layout.add(mainContent, { dock: 'fill' });

  // Arrange
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(70),
    height: rows(24)
  });

  console.log('Complex application layout:');
  console.log(`  Menu:    pos=(${menuBar.bounds.x}, ${menuBar.bounds.y}), size=${menuBar.bounds.width}x${menuBar.bounds.height}`);
  console.log(`  Tool:    pos=(${toolBar.bounds.x}, ${toolBar.bounds.y}), size=${toolBar.bounds.width}x${toolBar.bounds.height}`);
  console.log(`  Left:    pos=(${leftSidebar.bounds.x}, ${leftSidebar.bounds.y}), size=${leftSidebar.bounds.width}x${leftSidebar.bounds.height}`);
  console.log(`  Right:   pos=(${rightSidebar.bounds.x}, ${rightSidebar.bounds.y}), size=${rightSidebar.bounds.width}x${rightSidebar.bounds.height}`);
  console.log(`  Bottom:  pos=(${bottomPanel.bounds.x}, ${bottomPanel.bounds.y}), size=${bottomPanel.bounds.width}x${bottomPanel.bounds.height}`);
  console.log(`  Status:  pos=(${statusBar.bounds.x}, ${statusBar.bounds.y}), size=${statusBar.bounds.width}x${statusBar.bounds.height}`);
  console.log(`  Content: pos=(${mainContent.bounds.x}, ${mainContent.bounds.y}), size=${mainContent.bounds.width}x${mainContent.bounds.height}`);
  console.log();
}

function demonstrateDockUseCases() {
  console.log('=== Dock Layout Use Cases ===\n');

  // Use case 1: IDE Layout
  console.log('1. IDE Layout:');
  const ideLayout = createDockLayout();
  
  const ideMenu = new SimpleLayoutItem(cols(80), rows(1));
  const ideExplorer = new SimpleLayoutItem(cols(20), rows(20));
  const ideTerminal = new SimpleLayoutItem(cols(60), rows(6));
  const ideEditor = new SimpleLayoutItem(cols(50), rows(15));
  
  ideLayout.add(ideMenu, { dock: 'top' });
  ideLayout.add(ideExplorer, { dock: 'left' });
  ideLayout.add(ideTerminal, { dock: 'bottom' });
  ideLayout.add(ideEditor, { dock: 'fill' });
  
  ideLayout.arrange({
    x: x(0),
    y: y(0),
    width: cols(80),
    height: rows(24)
  });
  
  console.log(`   Menu at top: ${ideMenu.bounds.width}x${ideMenu.bounds.height}`);
  console.log(`   Explorer on left: ${ideExplorer.bounds.width}x${ideExplorer.bounds.height}`);
  console.log(`   Terminal at bottom: ${ideTerminal.bounds.width}x${ideTerminal.bounds.height}`);
  console.log(`   Editor fills center: ${ideEditor.bounds.width}x${ideEditor.bounds.height}`);

  // Use case 2: Dashboard
  console.log('\n2. Dashboard Layout:');
  const dashLayout = createDockLayout();
  
  const dashHeader = new SimpleLayoutItem(cols(60), rows(3));
  const dashNav = new SimpleLayoutItem(cols(60), rows(2));
  const dashMetrics = new SimpleLayoutItem(cols(15), rows(15));
  const dashCharts = new SimpleLayoutItem(cols(40), rows(15));
  
  dashLayout.add(dashHeader, { dock: 'top' });
  dashLayout.add(dashNav, { dock: 'top' });
  dashLayout.add(dashMetrics, { dock: 'right' });
  dashLayout.add(dashCharts, { dock: 'fill' });
  
  dashLayout.arrange({
    x: x(0),
    y: y(0),
    width: cols(60),
    height: rows(20)
  });
  
  console.log(`   Header: ${dashHeader.bounds.width}x${dashHeader.bounds.height}`);
  console.log(`   Navigation: ${dashNav.bounds.width}x${dashNav.bounds.height}`);
  console.log(`   Metrics sidebar: ${dashMetrics.bounds.width}x${dashMetrics.bounds.height}`);
  console.log(`   Charts area: ${dashCharts.bounds.width}x${dashCharts.bounds.height}`);

  // Use case 3: Chat Application
  console.log('\n3. Chat Application:');
  const chatLayout = createDockLayout();
  
  const chatTitle = new SimpleLayoutItem(cols(50), rows(2));
  const chatUsers = new SimpleLayoutItem(cols(12), rows(15));
  const chatInput = new SimpleLayoutItem(cols(38), rows(3));
  const chatMessages = new SimpleLayoutItem(cols(38), rows(15));
  
  chatLayout.add(chatTitle, { dock: 'top' });
  chatLayout.add(chatUsers, { dock: 'right' });
  chatLayout.add(chatInput, { dock: 'bottom' });
  chatLayout.add(chatMessages, { dock: 'fill' });
  
  chatLayout.arrange({
    x: x(0),
    y: y(0),
    width: cols(50),
    height: rows(20)
  });
  
  console.log(`   Title bar: ${chatTitle.bounds.width}x${chatTitle.bounds.height}`);
  console.log(`   User list: ${chatUsers.bounds.width}x${chatUsers.bounds.height}`);
  console.log(`   Input area: ${chatInput.bounds.width}x${chatInput.bounds.height}`);
  console.log(`   Messages: ${chatMessages.bounds.width}x${chatMessages.bounds.height}`);
  console.log();
}

function demonstrateDynamicDock() {
  console.log('=== Dynamic Dock Layout ===\n');

  const layout = createDockLayout();

  // Initial layout
  const header = new SimpleLayoutItem(cols(40), rows(2));
  const content = new SimpleLayoutItem(cols(40), rows(10));
  
  layout.add(header, { dock: 'top' });
  layout.add(content, { dock: 'fill' });
  
  console.log(`Initial layout: ${layout.children.length} items`);

  // Add sidebar dynamically
  const sidebar = new SimpleLayoutItem(cols(10), rows(10));
  layout.add(sidebar, { dock: 'left' });
  
  console.log(`After adding sidebar: ${layout.children.length} items`);

  // Remove header
  layout.remove(header);
  console.log(`After removing header: ${layout.children.length} items`);

  // Add new items
  const newHeader = new SimpleLayoutItem(cols(40), rows(3));
  const footer = new SimpleLayoutItem(cols(40), rows(2));
  
  layout.add(newHeader, { dock: 'top' });
  layout.add(footer, { dock: 'bottom' });
  
  console.log(`Final layout: ${layout.children.length} items`);

  // Arrange final layout
  layout.arrange({
    x: x(0),
    y: y(0),
    width: cols(50),
    height: rows(15)
  });

  console.log('\nFinal arrangement:');
  console.log(`  New Header: (${newHeader.bounds.x}, ${newHeader.bounds.y}) ${newHeader.bounds.width}x${newHeader.bounds.height}`);
  console.log(`  Sidebar:    (${sidebar.bounds.x}, ${sidebar.bounds.y}) ${sidebar.bounds.width}x${sidebar.bounds.height}`);
  console.log(`  Content:    (${content.bounds.x}, ${content.bounds.y}) ${content.bounds.width}x${content.bounds.height}`);
  console.log(`  Footer:     (${footer.bounds.x}, ${footer.bounds.y}) ${footer.bounds.width}x${footer.bounds.height}`);
  console.log();
}

async function main() {
  console.log('=== Dock Layout Examples ===\n');

  demonstrateBasicDock();
  demonstrateDockOrder();
  demonstrateMultipleFill();
  demonstrateComplexDock();
  demonstrateDockUseCases();
  demonstrateDynamicDock();

  console.log('=== Examples Complete ===');
}

main().catch(console.error);
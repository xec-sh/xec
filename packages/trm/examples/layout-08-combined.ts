#!/usr/bin/env tsx
/**
 * Layout Example 08: Combined Layouts
 * Demonstrates combining multiple layout types for complex UIs
 */

import {
  x,
  y,
  cols,
  rows,
  LayoutType,
  type Layout,
  type Rectangle,
  type LayoutItem,
  createFlexLayout,
  createGridLayout, createDockLayout, createWrapLayout, SimpleLayoutItem,
  createStackLayout,
  createLayoutEngine,
  createAbsoluteLayout
} from '../src/advanced/layout.js';

/**
 * Custom layout item that contains another layout
 */
class LayoutContainer implements LayoutItem {
  bounds: Rectangle = { x: x(0), y: y(0), width: cols(0), height: rows(0) };
  
  constructor(private layout: Layout) {}

  measure(availableSpace: { width: number; height: number }) {
    return this.layout.measure({
      width: cols(availableSpace.width),
      height: rows(availableSpace.height)
    });
  }

  arrange(finalRect: Rectangle) {
    this.bounds = finalRect;
    this.layout.arrange(finalRect);
  }

  getLayout(): Layout {
    return this.layout;
  }
}

function demonstrateNestedLayouts() {
  console.log('=== Nested Layouts ===\n');

  // Create main dock layout
  const mainLayout = createDockLayout();

  // Create header with flex layout
  const headerFlex = createFlexLayout({
    direction: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 1
  });
  
  headerFlex.add(new SimpleLayoutItem(cols(10), rows(2))); // Logo
  headerFlex.add(new SimpleLayoutItem(cols(20), rows(2))); // Title
  headerFlex.add(new SimpleLayoutItem(cols(15), rows(2))); // Menu
  
  const headerContainer = new LayoutContainer(headerFlex);

  // Create sidebar with grid layout
  const sidebarGrid = createGridLayout({
    columns: 1,
    rows: 4,
    gap: 1,
    padding: 1
  });
  
  for (let i = 0; i < 4; i++) {
    sidebarGrid.add(new SimpleLayoutItem(cols(12), rows(3)));
  }
  
  const sidebarContainer = new LayoutContainer(sidebarGrid);

  // Create main content with wrap layout
  const contentWrap = createWrapLayout({
    gap: 2,
    padding: 2
  });
  
  for (let i = 0; i < 9; i++) {
    contentWrap.add(new SimpleLayoutItem(cols(12), rows(4)));
  }
  
  const contentContainer = new LayoutContainer(contentWrap);

  // Assemble main layout
  mainLayout.add(headerContainer, { dock: 'top' });
  mainLayout.add(sidebarContainer, { dock: 'left' });
  mainLayout.add(contentContainer, { dock: 'fill' });

  // Arrange
  mainLayout.arrange({
    x: x(0),
    y: y(0),
    width: cols(70),
    height: rows(24)
  });

  console.log('Nested layout structure:');
  console.log(`  Header (Flex): ${headerContainer.bounds.width}x${headerContainer.bounds.height}`);
  console.log(`  Sidebar (Grid): ${sidebarContainer.bounds.width}x${sidebarContainer.bounds.height}`);
  console.log(`  Content (Wrap): ${contentContainer.bounds.width}x${contentContainer.bounds.height}`);
  console.log();
}

function demonstrateComplexApplication() {
  console.log('=== Complex Application Layout ===\n');

  // Main application uses dock layout
  const appLayout = createDockLayout();

  // --- Top Bar (Flex) ---
  const topBar = createFlexLayout({
    direction: 'row',
    gap: 2,
    padding: { top: 0, right: 2, bottom: 0, left: 2 }
  });
  
  topBar.add(new SimpleLayoutItem(cols(8), rows(1)));  // App icon
  topBar.add(new SimpleLayoutItem(cols(15), rows(1)), { flex: 1 }); // Search bar
  topBar.add(new SimpleLayoutItem(cols(10), rows(1))); // User menu
  
  // --- Navigation (Flex) ---
  const nav = createFlexLayout({
    direction: 'row',
    justifyContent: 'flex-start',
    gap: 1,
    padding: { left: 2, right: 2 }
  });
  
  const navItems = ['Dashboard', 'Projects', 'Tasks', 'Reports', 'Settings'];
  for (const item of navItems) {
    nav.add(new SimpleLayoutItem(cols(item.length + 2), rows(1)));
  }

  // --- Main Content Area (Grid) ---
  const mainContent = createGridLayout({
    columns: [
      { type: 'fraction', size: 2 },
      { type: 'fraction', size: 1 }
    ],
    rows: [
      { type: 'fixed', size: 8 },
      { type: 'fraction', size: 1 }
    ],
    gap: 2,
    padding: 2
  });
  
  // Dashboard widgets
  mainContent.add(new SimpleLayoutItem(cols(30), rows(8)), {
    gridColumn: { start: 1, span: 2 },
    gridRow: { start: 1 }
  });
  
  mainContent.add(new SimpleLayoutItem(cols(20), rows(10)), {
    gridColumn: { start: 1 },
    gridRow: { start: 2 }
  });
  
  mainContent.add(new SimpleLayoutItem(cols(15), rows(10)), {
    gridColumn: { start: 2 },
    gridRow: { start: 2 }
  });

  // --- Status Bar (Flex) ---
  const statusBar = createFlexLayout({
    direction: 'row',
    justifyContent: 'space-between',
    padding: { left: 2, right: 2 }
  });
  
  statusBar.add(new SimpleLayoutItem(cols(20), rows(1))); // Status text
  statusBar.add(new SimpleLayoutItem(cols(15), rows(1))); // Progress
  statusBar.add(new SimpleLayoutItem(cols(10), rows(1))); // Time

  // Assemble application
  appLayout.add(new LayoutContainer(topBar), { dock: 'top' });
  appLayout.add(new LayoutContainer(nav), { dock: 'top' });
  appLayout.add(new LayoutContainer(statusBar), { dock: 'bottom' });
  appLayout.add(new LayoutContainer(mainContent), { dock: 'fill' });

  // Arrange
  appLayout.arrange({
    x: x(0),
    y: y(0),
    width: cols(80),
    height: rows(24)
  });

  console.log('Application layout components:');
  const topBarContainer = appLayout.children[0].item as LayoutContainer;
  const navContainer = appLayout.children[1].item as LayoutContainer;
  const statusContainer = appLayout.children[2].item as LayoutContainer;
  const contentContainer = appLayout.children[3].item as LayoutContainer;
  
  console.log(`  Top Bar:    ${topBarContainer.bounds.width}x${topBarContainer.bounds.height}`);
  console.log(`  Navigation: ${navContainer.bounds.width}x${navContainer.bounds.height}`);
  console.log(`  Content:    ${contentContainer.bounds.width}x${contentContainer.bounds.height}`);
  console.log(`  Status Bar: ${statusContainer.bounds.width}x${statusContainer.bounds.height}`);
  console.log();
}

function demonstrateModalOverlay() {
  console.log('=== Modal with Stack and Absolute ===\n');

  // Main stack for layering
  const stackLayout = createStackLayout();

  // Background content (any layout)
  const backgroundContent = createGridLayout({
    columns: 3,
    rows: 3,
    gap: 1
  });
  
  for (let i = 0; i < 9; i++) {
    backgroundContent.add(new SimpleLayoutItem(cols(15), rows(5)));
  }

  // Modal overlay with absolute positioning
  const modalOverlay = createAbsoluteLayout();
  
  // Semi-transparent background
  const dimBackground = new SimpleLayoutItem(cols(60), rows(20));
  modalOverlay.add(dimBackground, { left: 0, top: 0, right: 0, bottom: 0 });
  
  // Modal dialog (centered)
  const modalWidth = 30;
  const modalHeight = 12;
  const modalLeft = Math.floor((60 - modalWidth) / 2);
  const modalTop = Math.floor((20 - modalHeight) / 2);
  
  const modalDialog = new SimpleLayoutItem(cols(modalWidth), rows(modalHeight));
  modalOverlay.add(modalDialog, { left: modalLeft, top: modalTop });

  // Stack the layouts
  stackLayout.add(new LayoutContainer(backgroundContent));
  stackLayout.add(new LayoutContainer(modalOverlay));

  // Arrange
  stackLayout.arrange({
    x: x(0),
    y: y(0),
    width: cols(60),
    height: rows(20)
  });

  console.log('Modal overlay structure:');
  console.log(`  Background grid: 3x3 grid`);
  console.log(`  Dim overlay: full screen`);
  console.log(`  Modal dialog: ${modalWidth}x${modalHeight} centered at (${modalLeft}, ${modalTop})`);
  console.log();
}

function demonstrateResponsiveLayout() {
  console.log('=== Responsive Layout System ===\n');

  // Function to create layout based on width
  function createResponsiveLayout(width: number): Layout {
    if (width >= 80) {
      // Desktop: Grid layout
      const layout = createGridLayout({
        columns: [
          { type: 'fixed', size: 20 },
          { type: 'fraction', size: 2 },
          { type: 'fraction', size: 1 }
        ],
        rows: [
          { type: 'fixed', size: 3 },
          { type: 'fraction', size: 1 }
        ],
        gap: 2
      });
      
      console.log('  Using desktop grid layout');
      return layout;
      
    } else if (width >= 50) {
      // Tablet: Flex with wrap
      const layout = createFlexLayout({
        direction: 'row',
        wrap: true,
        gap: 2
      });
      
      console.log('  Using tablet flex layout');
      return layout;
      
    } else {
      // Mobile: Simple dock
      const layout = createDockLayout();
      console.log('  Using mobile dock layout');
      return layout;
    }
  }

  // Test different screen sizes
  const screenSizes = [
    { name: 'Mobile', width: 40, height: 20 },
    { name: 'Tablet', width: 60, height: 20 },
    { name: 'Desktop', width: 100, height: 24 }
  ];

  for (const screen of screenSizes) {
    console.log(`${screen.name} (${screen.width}x${screen.height}):`);
    
    const layout = createResponsiveLayout(screen.width);
    
    // Add some items
    layout.add(new SimpleLayoutItem(cols(20), rows(3)));
    layout.add(new SimpleLayoutItem(cols(30), rows(10)));
    layout.add(new SimpleLayoutItem(cols(15), rows(8)));
    
    // Arrange
    layout.arrange({
      x: x(0),
      y: y(0),
      width: cols(screen.width),
      height: rows(screen.height)
    });
    
    console.log(`  Layout type: ${layout.type}`);
    console.log();
  }
}

function demonstrateLayoutEngine() {
  console.log('=== Layout Engine Management ===\n');

  const engine = createLayoutEngine();

  // Set viewport
  engine.setViewport({
    x: x(0),
    y: y(0),
    width: cols(80),
    height: rows(24)
  });

  // Create and register multiple layouts
  const layouts = {
    header: createFlexLayout({ direction: 'row', padding: 1 }),
    sidebar: createDockLayout(),
    main: createGridLayout({ columns: 2, rows: 2 }),
    footer: createFlexLayout({ direction: 'row', justifyContent: 'space-between' })
  };

  for (const [name, layout] of Object.entries(layouts)) {
    engine.addLayout(name, layout);
  }

  console.log('Registered layouts:');
  for (const [name] of Array.from(engine.layouts.entries())) {
    console.log(`  - ${name}`);
  }

  // Access and modify layouts
  const headerLayout = engine.getLayout('header');
  if (headerLayout) {
    headerLayout.add(new SimpleLayoutItem(cols(10), rows(2)));
    headerLayout.add(new SimpleLayoutItem(cols(30), rows(2)), { flex: 1 });
    headerLayout.add(new SimpleLayoutItem(cols(10), rows(2)));
  }

  // Remove a layout
  engine.removeLayout('footer');
  console.log('\nAfter removing footer:');
  for (const [name] of Array.from(engine.layouts.entries())) {
    console.log(`  - ${name}`);
  }

  // Create layout dynamically based on type
  const dynamicLayout = engine.createLayout(LayoutType.Wrap, {
    gap: 2,
    padding: 2
  });
  
  engine.addLayout('dynamic', dynamicLayout);
  console.log(`\nAdded dynamic ${dynamicLayout.type} layout`);
  console.log();
}

function demonstrateMixedContent() {
  console.log('=== Mixed Content Layout ===\n');

  // Create a complex mixed layout
  const mainDock = createDockLayout();

  // Header with tabs (flex)
  const header = createFlexLayout({
    direction: 'row',
    gap: 0
  });
  
  const tabs = ['Editor', 'Preview', 'Console', 'Debug'];
  for (const tab of tabs) {
    header.add(new SimpleLayoutItem(cols(tab.length + 4), rows(2)));
  }

  // Left panel with tools (grid)
  const toolPanel = createGridLayout({
    columns: 2,
    rows: 5,
    gap: 1,
    padding: 1
  });
  
  for (let i = 0; i < 10; i++) {
    toolPanel.add(new SimpleLayoutItem(cols(3), rows(2)));
  }

  // Center with editor and preview (flex)
  const center = createFlexLayout({
    direction: 'row',
    gap: 2
  });
  
  const editor = new SimpleLayoutItem(cols(35), rows(15));
  const preview = new SimpleLayoutItem(cols(30), rows(15));
  
  center.add(editor, { flex: 1 });
  center.add(preview, { flex: 1 });

  // Bottom with console (wrap for outputs)
  const consoleLayout = createWrapLayout({
    gap: 0,
    padding: 1
  });
  
  for (let i = 0; i < 5; i++) {
    consoleLayout.add(new SimpleLayoutItem(cols(60), rows(1)));
  }

  // Assemble
  mainDock.add(new LayoutContainer(header), { dock: 'top' });
  mainDock.add(new LayoutContainer(toolPanel), { dock: 'left' });
  mainDock.add(new LayoutContainer(consoleLayout), { dock: 'bottom' });
  mainDock.add(new LayoutContainer(center), { dock: 'fill' });

  // Arrange
  mainDock.arrange({
    x: x(0),
    y: y(0),
    width: cols(80),
    height: rows(24)
  });

  console.log('Mixed content layout:');
  console.log('  Header (Flex): Tab bar');
  console.log('  Tools (Grid): 2x5 tool grid');
  console.log('  Center (Flex): Editor + Preview');
  console.log('  Console (Wrap): Output lines');
  console.log();

  // Get bounds
  const [headerItem, toolsItem, consoleItem, centerItem] = mainDock.children;
  console.log('Component sizes:');
  console.log(`  Header:  ${headerItem.item.bounds.width}x${headerItem.item.bounds.height}`);
  console.log(`  Tools:   ${toolsItem.item.bounds.width}x${toolsItem.item.bounds.height}`);
  console.log(`  Center:  ${centerItem.item.bounds.width}x${centerItem.item.bounds.height}`);
  console.log(`  Console: ${consoleItem.item.bounds.width}x${consoleItem.item.bounds.height}`);
  console.log();
}

async function main() {
  console.log('=== Combined Layout Examples ===\n');

  demonstrateNestedLayouts();
  demonstrateComplexApplication();
  demonstrateModalOverlay();
  demonstrateResponsiveLayout();
  demonstrateLayoutEngine();
  demonstrateMixedContent();

  console.log('=== Examples Complete ===');
}

main().catch(console.error);
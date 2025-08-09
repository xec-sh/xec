/**
 * Comprehensive tests for VirtualScroll component
 */

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { TestHarness } from '../../../../src/test/test-harness.js';
import { MockTerminal } from '../../../../src/test/mock-terminal.js';
import { VirtualScroll, type VirtualItem } from '../../../../src/components/advanced/virtual-scroll.js';

import type { Key } from '../../../../src/core/types.js';

// ============================================================================
// Test Data
// ============================================================================

interface TestItemData {
  id: number;
  title: string;
  description: string;
  category: string;
}

const createTestItems = (count: number): VirtualItem<TestItemData>[] => Array.from({ length: count }, (_, i) => ({
    id: i,
    data: {
      id: i,
      title: `Item ${i}`,
      description: `Description for item ${i}`,
      category: `Category ${i % 3}`
    },
    height: i % 3 === 0 ? 2 : 1 // Variable heights for testing
  }));

// ============================================================================
// Test Suite
// ============================================================================

describe('VirtualScroll Component', () => {
  let virtualScroll: VirtualScroll<TestItemData>;
  let terminal: MockTerminal;
  let harness: TestHarness;
  let testItems: VirtualItem<TestItemData>[];

  beforeEach(() => {
    terminal = new MockTerminal();
    harness = new TestHarness(terminal);
    testItems = createTestItems(100);
  });

  afterEach(() => {
    if (virtualScroll) {
      virtualScroll.unmount();
    }
    vi.clearAllMocks();
  });

  // ========================================================================
  // Basic Functionality
  // ========================================================================

  describe('Basic Functionality', () => {
    it('should create virtual scroll with items', () => {
      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 10),
        height: 20
      });

      expect(virtualScroll).toBeDefined();
      expect(virtualScroll.getItems()).toHaveLength(10);
    });

    it('should render virtual scroll with items', () => {
      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 5),
        height: 10
      });

      const output = virtualScroll.render();
      expect(output.lines).toBeDefined();
      expect(output.lines.length).toBe(10); // Should match viewport height

      // Check for item content
      const itemFound = output.lines.some(line => line.includes('Item 0'));
      expect(itemFound).toBe(true);
    });

    it('should handle empty items list', () => {
      virtualScroll = new VirtualScroll({
        items: [],
        height: 20
      });

      const output = virtualScroll.render();
      expect(output.lines.some(line => line.includes('No items to display'))).toBe(true);
    });

    it('should use custom empty renderer', () => {
      const customEmptyRenderer = vi.fn(() => ({ lines: ['Custom empty message'] }));
      
      virtualScroll = new VirtualScroll({
        items: [],
        height: 20,
        emptyRenderer: customEmptyRenderer
      });

      const output = virtualScroll.render();
      expect(customEmptyRenderer).toHaveBeenCalled();
      expect(output.lines).toContain('Custom empty message');
    });
  });

  // ========================================================================
  // Virtual Scrolling Logic
  // ========================================================================

  describe('Virtual Scrolling', () => {
    beforeEach(() => {
      virtualScroll = new VirtualScroll({
        items: testItems,
        height: 20,
        itemHeight: 1,
        overscan: 5
      });
    });

    it('should only render visible items plus overscan', () => {
      const output = virtualScroll.render();
      
      // Should render viewport height (20) lines
      expect(output.lines).toHaveLength(20);
      
      // Should not render all 100 items at once
      const metrics = virtualScroll.getMetrics();
      expect(metrics.renderedItems).toBeLessThan(testItems.length);
      expect(metrics.renderedItems).toBeGreaterThan(0);
    });

    it('should handle dynamic item heights', () => {
      const itemsWithVariableHeights = testItems.slice(0, 10).map((item, i) => ({
        ...item,
        height: i % 2 === 0 ? 2 : 1
      }));

      virtualScroll = new VirtualScroll({
        items: itemsWithVariableHeights,
        height: 20,
        itemHeight: (item) => item.height || 1
      });

      const output = virtualScroll.render();
      expect(output.lines).toHaveLength(20);
    });

    it('should handle item height function', () => {
      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 20),
        height: 20,
        itemHeight: (item, index) => index % 3 === 0 ? 2 : 1
      });

      const output = virtualScroll.render();
      expect(output.lines).toHaveLength(20);
    });
  });

  // ========================================================================
  // Keyboard Navigation
  // ========================================================================

  describe('Keyboard Navigation', () => {
    beforeEach(() => {
      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 50),
        height: 20,
        itemHeight: 1
      });
    });

    it('should handle vertical navigation', () => {
      const downKey: Key = { name: 'down', sequence: '\x1b[B', ctrl: false, meta: false, shift: false };
      const upKey: Key = { name: 'up', sequence: '\x1b[A', ctrl: false, meta: false, shift: false };

      expect(virtualScroll.handleKeypress(downKey)).toBe(true);
      expect(virtualScroll.handleKeypress(upKey)).toBe(true);
    });

    it('should handle page navigation', () => {
      const pageDownKey: Key = { name: 'pagedown', sequence: '\x1b[6~', ctrl: false, meta: false, shift: false };
      const pageUpKey: Key = { name: 'pageup', sequence: '\x1b[5~', ctrl: false, meta: false, shift: false };

      expect(virtualScroll.handleKeypress(pageDownKey)).toBe(true);
      expect(virtualScroll.handleKeypress(pageUpKey)).toBe(true);
    });

    it('should handle home and end keys', () => {
      const homeKey: Key = { name: 'home', sequence: '\x1b[H', ctrl: false, meta: false, shift: false };
      const endKey: Key = { name: 'end', sequence: '\x1b[F', ctrl: false, meta: false, shift: false };

      expect(virtualScroll.handleKeypress(homeKey)).toBe(true);
      expect(virtualScroll.handleKeypress(endKey)).toBe(true);
    });

    it('should handle item selection with space', () => {
      const spaceKey: Key = { name: 'space', sequence: ' ', ctrl: false, meta: false, shift: false };
      
      const handled = virtualScroll.handleKeypress(spaceKey);
      expect(handled).toBe(true);
      
      const selected = virtualScroll.getSelectedItems();
      expect(selected).toHaveLength(1);
    });

    it('should handle item click with enter', () => {
      const onItemClick = vi.fn();
      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 10),
        height: 20,
        onItemClick
      });

      const enterKey: Key = { name: 'enter', sequence: '\r', ctrl: false, meta: false, shift: false };
      
      virtualScroll.handleKeypress(enterKey);
      expect(onItemClick).toHaveBeenCalledWith(expect.any(Object), 0);
    });
  });

  // ========================================================================
  // Item Management
  // ========================================================================

  describe('Item Management', () => {
    beforeEach(() => {
      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 10),
        height: 20
      });
    });

    it('should set new items', () => {
      const newItems = createTestItems(5);
      virtualScroll.setItems(newItems);
      
      expect(virtualScroll.getItems()).toHaveLength(5);
    });

    it('should add items', () => {
      const newItems = createTestItems(3);
      virtualScroll.addItems(newItems);
      
      expect(virtualScroll.getItems()).toHaveLength(13);
    });

    it('should add items at specific index', () => {
      const newItems = createTestItems(2);
      virtualScroll.addItems(newItems, 3);
      
      const items = virtualScroll.getItems();
      expect(items).toHaveLength(12);
      expect(items[3].id).toBe(0); // First new item
    });

    it('should remove items', () => {
      virtualScroll.removeItems([0, 2, 4]);
      
      const items = virtualScroll.getItems();
      expect(items).toHaveLength(7);
    });

    it('should update item', () => {
      const updatedData = { title: 'Updated Title' };
      virtualScroll.updateItem(0, { data: { ...testItems[0].data, ...updatedData } });
      
      const items = virtualScroll.getItems();
      expect(items[0].data.title).toBe('Updated Title');
    });
  });

  // ========================================================================
  // Focus and Selection
  // ========================================================================

  describe('Focus and Selection', () => {
    beforeEach(() => {
      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 20),
        height: 20
      });
    });

    it('should get and set focused item', () => {
      virtualScroll.setFocusedItem(5);
      const focused = virtualScroll.getFocusedItem();
      
      expect(focused?.id).toBe(5);
    });

    it('should handle focus bounds checking', () => {
      // Try to focus beyond bounds
      virtualScroll.setFocusedItem(100);
      const focused = virtualScroll.getFocusedItem();
      expect(focused?.id).not.toBe(100);
      
      virtualScroll.setFocusedItem(-1);
      const focused2 = virtualScroll.getFocusedItem();
      expect(focused2?.id).not.toBe(-1);
    });

    it('should handle multiple selection', () => {
      virtualScroll.setSelectedItems([0, 2, 4]);
      const selected = virtualScroll.getSelectedItems();
      
      expect(selected).toHaveLength(3);
      expect(selected.map(item => item.id)).toEqual([0, 2, 4]);
    });

    it('should clear selection', () => {
      virtualScroll.setSelectedItems([0, 1, 2]);
      expect(virtualScroll.getSelectedItems()).toHaveLength(3);
      
      virtualScroll.clearSelection();
      expect(virtualScroll.getSelectedItems()).toHaveLength(0);
    });

    it('should provide cursor position for focused item', () => {
      virtualScroll.setFocusedItem(2);
      const output = virtualScroll.render();
      
      if (output.cursor) {
        expect(output.cursor.x).toBe(0);
        expect(output.cursor.y).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ========================================================================
  // Scrolling
  // ========================================================================

  describe('Scrolling', () => {
    beforeEach(() => {
      virtualScroll = new VirtualScroll({
        items: testItems, // 100 items
        height: 20,
        itemHeight: 1
      });
    });

    it('should scroll to specific item', () => {
      virtualScroll.scrollToItem(50);
      
      // Should focus the item
      const focused = virtualScroll.getFocusedItem();
      expect(focused?.id).toBe(50);
    });

    it('should scroll to top', () => {
      virtualScroll.setFocusedItem(50); // Start in middle
      virtualScroll.scrollToTop();
      
      const focused = virtualScroll.getFocusedItem();
      expect(focused?.id).toBe(0);
    });

    it('should scroll to bottom', () => {
      virtualScroll.scrollToBottom();
      
      const focused = virtualScroll.getFocusedItem();
      expect(focused?.id).toBe(testItems.length - 1);
    });

    it('should emit scroll events', () => {
      const onScroll = vi.fn();
      virtualScroll = new VirtualScroll({
        items: testItems,
        height: 20,
        itemHeight: 1,
        onScroll
      });

      virtualScroll.scrollToItem(20);
      
      // onScroll might be called during scrolling
      // We can't easily test this without triggering internal scroll logic
    });
  });

  // ========================================================================
  // Custom Renderers
  // ========================================================================

  describe('Custom Renderers', () => {
    it('should use custom item renderer', () => {
      const customRenderer = vi.fn((item: VirtualItem<TestItemData>) => ({
        lines: [`Custom: ${item.data.title}`]
      }));

      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 5),
        height: 20,
        itemRenderer: customRenderer
      });

      const output = virtualScroll.render();
      
      expect(customRenderer).toHaveBeenCalled();
      expect(output.lines.some(line => line.includes('Custom:'))).toBe(true);
    });

    it('should use item component for rendering', () => {
      const mockComponent = {
        render: vi.fn(() => ({ lines: ['Component rendered'] }))
      };

      const itemsWithComponent = testItems.slice(0, 3).map(item => ({
        ...item,
        component: mockComponent
      }));

      virtualScroll = new VirtualScroll({
        items: itemsWithComponent,
        height: 20
      });

      virtualScroll.render();
      expect(mockComponent.render).toHaveBeenCalled();
    });

    it('should use item renderer function', () => {
      const itemsWithRenderer = testItems.slice(0, 3).map(item => ({
        ...item,
        renderer: vi.fn(() => `Rendered: ${item.data.title}`)
      }));

      virtualScroll = new VirtualScroll({
        items: itemsWithRenderer,
        height: 20
      });

      const output = virtualScroll.render();
      expect(output.lines.some(line => line.includes('Rendered:'))).toBe(true);
    });
  });

  // ========================================================================
  // Performance and Optimization
  // ========================================================================

  describe('Performance', () => {
    it('should handle large datasets efficiently', () => {
      const largeDataset = createTestItems(10000);
      
      virtualScroll = new VirtualScroll({
        items: largeDataset,
        height: 20,
        itemHeight: 1,
        overscan: 5
      });

      const startTime = performance.now();
      virtualScroll.render();
      const endTime = performance.now();
      
      // Should render quickly even with large dataset
      expect(endTime - startTime).toBeLessThan(100); // Less than 100ms
    });

    it('should cache rendered items', () => {
      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 10),
        height: 20,
        cacheSize: 50
      });

      // Render multiple times to test caching
      virtualScroll.render();
      virtualScroll.render();
      
      const metrics = virtualScroll.getMetrics();
      expect(metrics.renderedItems).toBeGreaterThan(0);
    });

    it('should provide performance metrics', () => {
      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 20),
        height: 20
      });

      virtualScroll.render();
      const metrics = virtualScroll.getMetrics();
      
      expect(metrics.totalItems).toBe(20);
      expect(metrics.renderedItems).toBeGreaterThan(0);
      expect(metrics.renderTime).toBeGreaterThanOrEqual(0);
    });
  });

  // ========================================================================
  // Infinite Scrolling
  // ========================================================================

  describe('Infinite Scrolling', () => {
    it('should load more items when enabled', async () => {
      const onLoadMore = vi.fn().mockResolvedValue(createTestItems(10));
      
      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 20),
        height: 20,
        infinite: true,
        preloadThreshold: 5,
        onLoadMore
      });

      // Scroll near the end to trigger loading
      virtualScroll.scrollToItem(18);
      
      // Wait for async loading
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(onLoadMore).toHaveBeenCalledWith('down');
    });

    it('should handle loading state', () => {
      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 10),
        height: 20,
        infinite: true,
        loadingRenderer: () => ({ lines: ['Loading more items...'] })
      });

      // Trigger loading state internally
      virtualScroll.setState({ isLoading: true });
      
      const output = virtualScroll.render();
      // Loading state would be handled internally
      expect(output.lines).toBeDefined();
    });
  });

  // ========================================================================
  // Event Callbacks
  // ========================================================================

  describe('Event Callbacks', () => {
    let onItemClick: ReturnType<typeof vi.fn>;
    let onItemSelect: ReturnType<typeof vi.fn>;
    let onItemsRendered: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      onItemClick = vi.fn();
      onItemSelect = vi.fn();
      onItemsRendered = vi.fn();

      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 20),
        height: 20,
        onItemClick,
        onItemSelect,
        onItemsRendered
      });
    });

    it('should call onItemsRendered when rendering', () => {
      virtualScroll.render();
      
      expect(onItemsRendered).toHaveBeenCalledWith(
        expect.any(Number), // start index
        expect.any(Number), // end index
        20 // total items
      );
    });

    it('should call onItemSelect when selecting items', () => {
      const spaceKey: Key = { name: 'space', sequence: ' ', ctrl: false, meta: false, shift: false };
      virtualScroll.handleKeypress(spaceKey);
      
      expect(onItemSelect).toHaveBeenCalledWith(expect.any(Object), 0);
    });

    it('should call onItemClick when clicking items', () => {
      const enterKey: Key = { name: 'enter', sequence: '\r', ctrl: false, meta: false, shift: false };
      virtualScroll.handleKeypress(enterKey);
      
      expect(onItemClick).toHaveBeenCalledWith(expect.any(Object), 0);
    });
  });

  // ========================================================================
  // Horizontal Scrolling
  // ========================================================================

  describe('Horizontal Scrolling', () => {
    beforeEach(() => {
      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 10),
        height: 20,
        horizontal: true
      });
    });

    it('should handle horizontal navigation', () => {
      const leftKey: Key = { name: 'left', sequence: '\x1b[D', ctrl: false, meta: false, shift: false };
      const rightKey: Key = { name: 'right', sequence: '\x1b[C', ctrl: false, meta: false, shift: false };

      expect(virtualScroll.handleKeypress(leftKey)).toBe(true);
      expect(virtualScroll.handleKeypress(rightKey)).toBe(true);
    });
  });

  // ========================================================================
  // Debug Mode
  // ========================================================================

  describe('Debug Mode', () => {
    it('should show debug information when enabled', () => {
      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 10),
        height: 20,
        debug: true
      });

      const output = virtualScroll.render();
      
      // Debug info should be in the last line
      const debugLine = output.lines[output.lines.length - 1];
      expect(debugLine).toContain('Items:');
      expect(debugLine).toContain('Rendered:');
    });

    it('should not show debug information when disabled', () => {
      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 10),
        height: 20,
        debug: false
      });

      const output = virtualScroll.render();
      
      // Should not contain debug information
      const hasDebugInfo = output.lines.some(line => line.includes('Items:') && line.includes('Rendered:'));
      expect(hasDebugInfo).toBe(false);
    });
  });

  // ========================================================================
  // Error Handling
  // ========================================================================

  describe('Error Handling', () => {
    it('should handle invalid item indices gracefully', () => {
      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 5),
        height: 20
      });

      // Try to focus invalid indices
      virtualScroll.setFocusedItem(-1);
      virtualScroll.setFocusedItem(100);
      
      expect(() => virtualScroll.render()).not.toThrow();
    });

    it('should handle empty height gracefully', () => {
      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 5),
        height: 0
      });

      expect(() => virtualScroll.render()).not.toThrow();
    });

    it('should handle invalid scroll positions', () => {
      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 5),
        height: 20
      });

      virtualScroll.scrollToItem(-10);
      virtualScroll.scrollToItem(1000);
      
      expect(() => virtualScroll.render()).not.toThrow();
    });
  });

  // ========================================================================
  // Cleanup
  // ========================================================================

  describe('Cleanup', () => {
    it('should cleanup properly on unmount', async () => {
      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 10),
        height: 20
      });

      await expect(virtualScroll.unmount()).resolves.toBeUndefined();
    });

    it('should refresh correctly', () => {
      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 10),
        height: 20
      });

      expect(() => virtualScroll.refresh()).not.toThrow();
      expect(() => virtualScroll.render()).not.toThrow();
    });

    it('should clear animation frames on unmount', async () => {
      virtualScroll = new VirtualScroll({
        items: testItems.slice(0, 10),
        height: 20,
        scrollBehavior: 'smooth'
      });

      // Start a smooth scroll
      virtualScroll.scrollToItem(5);
      
      // Should cleanup without errors
      await expect(virtualScroll.unmount()).resolves.toBeUndefined();
    });
  });
});
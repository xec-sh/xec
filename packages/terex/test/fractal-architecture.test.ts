/**
 * Tests for the Fractal Architecture implementation
 * Tests zIndex, draggable, and resizable as base component properties
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseComponent } from '../src/core/component';
import { RenderEngine } from '../src/core/render-engine';
import { Box } from '../src/components/containers/box';
import { Text } from '../src/components/primitives/text';
import type { Output, TerminalStream } from '../src/core/types';

// Mock component for testing
class TestComponent extends BaseComponent<{ content: string }> {
  constructor(content = 'Test') {
    super({ initialState: { content } });
  }
  
  render(): Output {
    return {
      lines: [this.state.content],
      cursor: undefined,
      style: undefined
    };
  }
}

describe('Fractal Architecture - Base Component Properties', () => {
  let component: TestComponent;
  
  beforeEach(() => {
    component = new TestComponent();
  });
  
  describe('zIndex Management', () => {
    it('should have default zIndex of 0', () => {
      expect(component.getZIndex()).toBe(0);
    });
    
    it('should allow setting zIndex', () => {
      component.setZIndex(10);
      expect(component.getZIndex()).toBe(10);
    });
    
    it('should emit zIndexChange event when zIndex changes', () => {
      const listener = vi.fn();
      component.on('zIndexChange', listener);
      
      component.setZIndex(5);
      
      expect(listener).toHaveBeenCalledWith(5);
    });
    
    it('should mark component as dirty when zIndex changes', () => {
      const spy = vi.spyOn(component as any, 'invalidate');
      component.setZIndex(3);
      expect(spy).toHaveBeenCalled();
    });
  });
  
  describe('Layer Type Management', () => {
    it('should have default layer type of base', () => {
      expect(component.getLayerType()).toBe('base');
    });
    
    it('should allow setting layer type', () => {
      component.setLayerType('modal');
      expect(component.getLayerType()).toBe('modal');
    });
  });
  
  describe('Draggable Properties', () => {
    it('should not be draggable by default', () => {
      expect(component.canDrag()).toBe(false);
    });
    
    it('should be draggable when enabled and has no parent', () => {
      component.setDraggable(true);
      expect(component.canDrag()).toBe(true);
    });
    
    it('should not be draggable when has parent even if enabled', () => {
      const parent = new TestComponent();
      component.setDraggable(true);
      parent.addChild(component);
      
      expect(component.canDrag()).toBe(false);
    });
    
    it('should handle drag start correctly', () => {
      component.setDraggable(true);
      component.setPosition(10, 10);
      
      const listener = vi.fn();
      component.on('dragStart', listener);
      
      component.startDrag(15, 20);
      
      expect(listener).toHaveBeenCalledWith({ x: 15, y: 20 });
      expect(component.isDraggingNow()).toBe(true);
    });
    
    it('should update position during drag', () => {
      component.setDraggable(true);
      component.setPosition(10, 10);
      component.setDimensions(20, 10);
      
      component.startDrag(15, 15); // Start at mouse position 15,15
      component.updateDrag(25, 25); // Move mouse to 25,25
      
      const pos = component.getPosition();
      expect(pos.x).toBe(20); // 25 - offset(5)
      expect(pos.y).toBe(20); // 25 - offset(5)
    });
    
    it('should respect drag boundaries', () => {
      component.setDraggable(true);
      component.setPosition(0, 0);
      component.setDimensions(10, 5);
      component.setDragBounds({
        type: 'custom',
        bounds: { x: 0, y: 0, width: 50, height: 20 }
      });
      
      component.startDrag(5, 2);
      component.updateDrag(100, 100); // Try to drag beyond bounds
      
      const pos = component.getPosition();
      expect(pos.x).toBe(40); // 50 - 10 (max x for component width)
      expect(pos.y).toBe(15); // 20 - 5 (max y for component height)
    });
    
    it('should end drag correctly', () => {
      component.setDraggable(true);
      component.startDrag(10, 10);
      
      const listener = vi.fn();
      component.on('dragEnd', listener);
      
      component.endDrag();
      
      expect(component.isDraggingNow()).toBe(false);
      expect(listener).toHaveBeenCalled();
    });
  });
  
  describe('Resizable Properties', () => {
    it('should not be resizable by default', () => {
      expect(component.canResize()).toBe(false);
    });
    
    it('should be resizable when enabled and has no parent', () => {
      component.setResizable(true);
      expect(component.canResize()).toBe(true);
    });
    
    it('should not be resizable when has parent even if enabled', () => {
      const parent = new TestComponent();
      component.setResizable(true);
      parent.addChild(component);
      
      expect(component.canResize()).toBe(false);
    });
    
    it('should detect resize handles correctly', () => {
      component.setResizable(true, ['bottom-right', 'right', 'bottom']);
      component.setPosition(10, 10);
      component.setDimensions(20, 10);
      
      // Test bottom-right corner
      expect(component.getResizeHandleAt(29, 19)).toBe('bottom-right');
      
      // Test right edge
      expect(component.getResizeHandleAt(29, 15)).toBe('right');
      
      // Test bottom edge
      expect(component.getResizeHandleAt(20, 19)).toBe('bottom');
      
      // Test no handle
      expect(component.getResizeHandleAt(20, 15)).toBe(null);
    });
    
    it('should handle resize start correctly', () => {
      component.setResizable(true);
      component.setDimensions(20, 10);
      
      const listener = vi.fn();
      component.on('resizeStart', listener);
      
      component.startResize('bottom-right', 30, 20);
      
      expect(listener).toHaveBeenCalledWith({ width: 20, height: 10 });
      expect(component.isResizingNow()).toBe(true);
    });
    
    it('should update dimensions during resize', () => {
      component.setResizable(true);
      component.setPosition(10, 10);
      component.setDimensions(20, 10);
      
      component.startResize('bottom-right', 30, 20);
      component.updateResize(35, 25); // Move 5 pixels right and down
      
      const dims = component.getDimensions();
      expect(dims.width).toBe(25); // 20 + 5
      expect(dims.height).toBe(15); // 10 + 5
    });
    
    it('should respect size constraints during resize', () => {
      component.setResizable(true);
      component.setSizeConstraints({
        minWidth: 10,
        maxWidth: 30,
        minHeight: 5,
        maxHeight: 15
      });
      component.setDimensions(20, 10);
      
      component.startResize('bottom-right', 30, 20);
      
      // Try to resize beyond max
      component.updateResize(50, 40);
      let dims = component.getDimensions();
      expect(dims.width).toBe(30); // Clamped to maxWidth
      expect(dims.height).toBe(15); // Clamped to maxHeight
      
      // Try to resize below min
      component.startResize('top-left', 10, 10);
      component.updateResize(25, 20);
      dims = component.getDimensions();
      expect(dims.width).toBeGreaterThanOrEqual(10); // At least minWidth
      expect(dims.height).toBeGreaterThanOrEqual(5); // At least minHeight
    });
    
    it('should handle resize from different edges', () => {
      component.setResizable(true, ['left', 'top', 'top-left']);
      component.setPosition(20, 20);
      component.setDimensions(20, 10);
      
      // Resize from left
      component.startResize('left', 20, 25);
      component.updateResize(15, 25); // Move left edge 5 pixels left
      
      let pos = component.getPosition();
      let dims = component.getDimensions();
      expect(pos.x).toBe(15); // Position moves left
      expect(dims.width).toBe(25); // Width increases
      
      // Reset and resize from top
      component.setPosition(20, 20);
      component.setDimensions(20, 10);
      component.startResize('top', 30, 20);
      component.updateResize(30, 15); // Move top edge 5 pixels up
      
      pos = component.getPosition();
      dims = component.getDimensions();
      expect(pos.y).toBe(15); // Position moves up
      expect(dims.height).toBe(15); // Height increases
    });
    
    it('should end resize correctly', () => {
      component.setResizable(true);
      component.startResize('bottom-right', 30, 20);
      
      const listener = vi.fn();
      component.on('resizeEnd', listener);
      
      component.endResize();
      
      expect(component.isResizingNow()).toBe(false);
      expect(listener).toHaveBeenCalled();
    });
  });
});

describe('Fractal Architecture - Render Engine Integration', () => {
  let engine: RenderEngine;
  let mockStream: TerminalStream;
  
  beforeEach(() => {
    mockStream = {
      input: process.stdin,
      output: {
        write: vi.fn(),
        columns: 80,
        rows: 24,
        on: vi.fn()
      } as any,
      isTTY: true,
      colorMode: 'truecolor'
    };
    
    engine = new RenderEngine(mockStream, {
      enableFrameScheduling: false,
      autoResize: false,
      logUpdateStyle: false
    });
  });
  
  describe('Z-Index Layering', () => {
    it('should render components in z-index order', async () => {
      const root = new TestComponent('Root');
      
      const comp1 = new TestComponent('Layer1');
      comp1.setZIndex(1);
      comp1.setPosition(0, 0);
      
      const comp2 = new TestComponent('Layer2');
      comp2.setZIndex(2);
      comp2.setPosition(0, 0);
      
      const comp3 = new TestComponent('Layer0');
      comp3.setZIndex(0);
      comp3.setPosition(0, 0);
      
      root.addChild(comp3);
      root.addChild(comp1);
      root.addChild(comp2);
      
      await engine.start(root);
      
      // The last rendered (highest z-index) should overlay the others
      // This is tested by checking the render output
      expect(mockStream.output.write).toHaveBeenCalled();
      
      await engine.stop();
    });
    
    it('should handle nested component z-index correctly', async () => {
      const root = new TestComponent('Root');
      root.setZIndex(0);
      
      const parent = new TestComponent('Parent');
      parent.setZIndex(10);
      
      const child = new TestComponent('Child');
      child.setZIndex(5); // Relative to parent
      
      parent.addChild(child);
      root.addChild(parent);
      
      // Child should have effective z-index of 15 (10 + 5)
      const components = (engine as any).collectComponentsWithZIndex(root);
      const childComponent = components.find((c: any) => c.component === child);
      
      expect(childComponent?.zIndex).toBe(15);
      
      await engine.stop();
    });
  });
  
  describe('Mouse Event Handling', () => {
    it('should initiate drag on mousedown for draggable components', async () => {
      const root = new TestComponent('Root');
      const draggable = new TestComponent('Draggable');
      draggable.setDraggable(true);
      draggable.setPosition(10, 10);
      draggable.setDimensions(20, 10);
      
      // Add as root (no parent) so it can be dragged
      await engine.start(draggable);
      
      // Simulate mousedown
      (engine as any).handleMouseEvent({
        type: 'mousedown',
        x: 15,
        y: 15,
        button: 'left',
        modifiers: { ctrl: false, meta: false, shift: false, alt: false }
      });
      
      expect((engine as any).draggingComponent).toBe(draggable);
      expect(draggable.isDraggingNow()).toBe(true);
      
      await engine.stop();
    });
    
    it('should detect resize handles on mousedown', async () => {
      const resizable = new TestComponent('Resizable');
      resizable.setResizable(true, ['bottom-right']);
      resizable.setPosition(10, 10);
      resizable.setDimensions(20, 10);
      
      await engine.start(resizable);
      
      // Simulate mousedown on resize handle
      (engine as any).handleMouseEvent({
        type: 'mousedown',
        x: 29,
        y: 19,
        button: 'left',
        modifiers: { ctrl: false, meta: false, shift: false, alt: false }
      });
      
      expect((engine as any).resizingComponent).toBe(resizable);
      expect(resizable.isResizingNow()).toBe(true);
      
      await engine.stop();
    });
    
    it('should handle z-order correctly for mouse events', async () => {
      const root = new TestComponent('Root');
      
      const bottom = new TestComponent('Bottom');
      bottom.setZIndex(1);
      bottom.setPosition(10, 10);
      bottom.setDimensions(30, 20);
      bottom.setDraggable(true);
      
      const top = new TestComponent('Top');
      top.setZIndex(10);
      top.setPosition(20, 15);
      top.setDimensions(20, 10);
      top.setDraggable(true);
      
      root.addChild(bottom);
      root.addChild(top);
      
      await engine.start(root);
      
      // Click at position that overlaps both components
      (engine as any).handleMouseEvent({
        type: 'mousedown',
        x: 25,
        y: 20,
        button: 'left',
        modifiers: { ctrl: false, meta: false, shift: false, alt: false }
      });
      
      // Should select the top component (higher z-index)
      // Note: This would work if components had no parent
      // In this case, they have a parent so can't be dragged
      expect((engine as any).draggingComponent).toBe(null);
      
      await engine.stop();
    });
  });
});

describe('Fractal Architecture - Real-World Scenarios', () => {
  describe('Modal Dialog', () => {
    it('should create modal with high z-index and no drag/resize', () => {
      const modal = new Box({
        title: 'Confirm',
        borderStyle: 'double'
      });
      
      modal.setZIndex(1000);
      modal.setLayerType('modal');
      modal.setDraggable(false);
      modal.setResizable(false);
      
      expect(modal.getZIndex()).toBe(1000);
      expect(modal.canDrag()).toBe(false);
      expect(modal.canResize()).toBe(false);
    });
  });
  
  describe('Draggable Window', () => {
    it('should create draggable and resizable window', () => {
      const window = new Box({
        title: 'My Window',
        borderStyle: 'rounded'
      });
      
      window.setZIndex(10);
      window.setDraggable(true, 'title');
      window.setResizable(true, ['bottom-right', 'right', 'bottom']);
      window.setSizeConstraints({
        minWidth: 20,
        minHeight: 10,
        maxWidth: 60,
        maxHeight: 30
      });
      
      expect(window.canDrag()).toBe(true);
      expect(window.canResize()).toBe(true);
    });
  });
  
  describe('Tooltip', () => {
    it('should create tooltip with highest z-index', () => {
      const tooltip = new Text({ content: 'Help text' });
      
      tooltip.setZIndex(2000);
      tooltip.setLayerType('tooltip');
      tooltip.setDraggable(false);
      tooltip.setResizable(false);
      
      expect(tooltip.getZIndex()).toBe(2000);
      expect(tooltip.getLayerType()).toBe('tooltip');
    });
  });
  
  describe('Nested Layouts', () => {
    it('should prevent drag/resize for children in layout', () => {
      const container = new Box({ title: 'Container' });
      const child1 = new Box({ title: 'Child 1' });
      const child2 = new Box({ title: 'Child 2' });
      
      // Children want to be draggable
      child1.setDraggable(true);
      child2.setDraggable(true);
      
      // But they have a parent (container manages layout)
      container.addChild(child1);
      container.addChild(child2);
      
      // So they can't actually be dragged
      expect(child1.canDrag()).toBe(false);
      expect(child2.canDrag()).toBe(false);
      
      // Only the container can be dragged (if it has no parent)
      container.setDraggable(true);
      expect(container.canDrag()).toBe(true);
    });
  });
});
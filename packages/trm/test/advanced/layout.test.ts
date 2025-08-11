/**
 * Layout Module Tests
 */

import { it, expect, describe } from 'vitest';

import { x, y, cols, rows } from '../../src/types.js';
import {
  LayoutType,
  createFlexLayout,
  createGridLayout,
  SimpleLayoutItem,
  createStackLayout,
  createLayoutEngine
} from '../../src/advanced/layout.js';

describe('Layout Module', () => {
  describe('LayoutEngine', () => {
    it('should create layout engine', () => {
      const engine = createLayoutEngine();
      
      expect(engine).toBeDefined();
      expect(engine.layouts).toBeDefined();
    });
    
    it('should add and remove layouts', () => {
      const engine = createLayoutEngine();
      const layout = createFlexLayout();
      
      engine.addLayout('main', layout);
      expect(engine.getLayout('main')).toBe(layout);
      
      engine.removeLayout('main');
      expect(engine.getLayout('main')).toBeUndefined();
    });
  });
  
  describe('FlexLayout', () => {
    it('should create flex layout', () => {
      const layout = createFlexLayout({
        direction: 'row',
        gap: 2
      });
      
      expect(layout).toBeDefined();
      expect(layout.type).toBe(LayoutType.Flex);
      expect(layout.direction).toBe('row');
      expect(layout.gap).toBe(2);
    });
    
    it('should add items to layout', () => {
      const layout = createFlexLayout();
      const item = new SimpleLayoutItem(cols(10), rows(5));
      
      layout.add(item);
      expect(layout.children.length).toBe(1);
    });
    
    it('should measure layout size', () => {
      const layout = createFlexLayout({ direction: 'row' });
      const item1 = new SimpleLayoutItem(cols(10), rows(5));
      const item2 = new SimpleLayoutItem(cols(15), rows(5));
      
      layout.add(item1);
      layout.add(item2);
      
      const size = layout.measure({ width: cols(100), height: rows(50) });
      expect(size.width).toBe(25); // 10 + 15
      expect(size.height).toBe(5);  // Max height
    });
    
    it('should arrange items', () => {
      const layout = createFlexLayout({ direction: 'row', gap: 2 });
      const item1 = new SimpleLayoutItem(cols(10), rows(5));
      const item2 = new SimpleLayoutItem(cols(15), rows(5));
      
      layout.add(item1);
      layout.add(item2);
      
      layout.arrange({
        x: x(0),
        y: y(0),
        width: cols(100),
        height: rows(50)
      });
      
      expect(item1.bounds.x).toBe(0);
      expect(item1.bounds.y).toBe(0);
      expect(item1.bounds.width).toBe(10);
      
      expect(item2.bounds.x).toBe(12); // 10 + 2 (gap)
      expect(item2.bounds.y).toBe(0);
      expect(item2.bounds.width).toBe(15);
    });
  });
  
  describe('GridLayout', () => {
    it('should create grid layout', () => {
      const layout = createGridLayout({
        columns: 3,
        rows: 2,
        gap: 1
      });
      
      expect(layout).toBeDefined();
      expect(layout.type).toBe(LayoutType.Grid);
      expect(layout.columns).toBe(3);
      expect(layout.rows).toBe(2);
      expect(layout.gap).toBe(1);
    });
    
    it('should arrange items in grid', () => {
      const layout = createGridLayout({
        columns: 2,
        rows: 2,
        gap: 1
      });
      
      const item1 = new SimpleLayoutItem(cols(10), rows(5));
      const item2 = new SimpleLayoutItem(cols(10), rows(5));
      const item3 = new SimpleLayoutItem(cols(10), rows(5));
      
      layout.add(item1);
      layout.add(item2);
      layout.add(item3);
      
      layout.arrange({
        x: x(0),
        y: y(0),
        width: cols(50),
        height: rows(20)
      });
      
      // First row
      expect(item1.bounds.x).toBe(0);
      expect(item1.bounds.y).toBe(0);
      
      expect(item2.bounds.x).toBeGreaterThan(0); // Next column
      expect(item2.bounds.y).toBe(0);
      
      // Second row
      expect(item3.bounds.x).toBe(0);
      expect(item3.bounds.y).toBeGreaterThan(0); // Next row
    });
  });
  
  describe('StackLayout', () => {
    it('should create stack layout', () => {
      const layout = createStackLayout();
      
      expect(layout).toBeDefined();
      expect(layout.type).toBe(LayoutType.Stack);
    });
    
    it('should stack items on top of each other', () => {
      const layout = createStackLayout();
      const item1 = new SimpleLayoutItem(cols(20), rows(10));
      const item2 = new SimpleLayoutItem(cols(15), rows(8));
      
      layout.add(item1);
      layout.add(item2);
      
      layout.arrange({
        x: x(5),
        y: y(5),
        width: cols(30),
        height: rows(20)
      });
      
      // Both items should be at the same position (stacked)
      expect(item1.bounds.x).toBe(5);
      expect(item1.bounds.y).toBe(5);
      
      expect(item2.bounds.x).toBe(5);
      expect(item2.bounds.y).toBe(5);
    });
  });
});
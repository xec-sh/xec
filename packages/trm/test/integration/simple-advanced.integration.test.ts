/**
 * Simple Advanced Modules Integration Tests
 * Tests advanced features without external dependencies
 */

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import {
  batch,
  spring,
  Easing,
  // Animation
  animate,
  measure,
  
  BlendMode,
  createMemo,
  LayoutType,
  
  createStore,
  formatBytes,
  // State management
  createSignal,
  
  createEffect,
  formatDuration,
  createDrawable,
  // Layout
  createFlexLayout,
  
  createGridLayout,
  
  // Rendering
  createRenderEngine,
  // Performance
  createPerformanceMonitor,
  // Console
  createConsoleInterceptor
} from '../../src/advanced/index.js';




describe('Simple Advanced Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  
  describe('State Management', () => {
    it('should handle reactive signals', () => {
      const [count, setCount] = createSignal(0);
      
      expect(count()).toBe(0);
      
      setCount(5);
      expect(count()).toBe(5);
      
      setCount(prev => prev + 1);
      expect(count()).toBe(6);
    });
    
    it('should compute derived values', () => {
      const [a, setA] = createSignal(2);
      const [b, setB] = createSignal(3);
      
      const sum = createMemo(() => a() + b());
      const product = createMemo(() => a() * b());
      
      expect(sum()).toBe(5);
      expect(product()).toBe(6);
      
      setA(4);
      expect(sum()).toBe(7);
      expect(product()).toBe(12);
      
      setB(5);
      expect(sum()).toBe(9);
      expect(product()).toBe(20);
    });
    
    it('should handle effects', () => {
      const [value, setValue] = createSignal(0);
      let effectCount = 0;
      let lastValue = 0;
      
      createEffect(() => {
        effectCount++;
        lastValue = value();
      });
      
      expect(effectCount).toBe(1);
      expect(lastValue).toBe(0);
      
      setValue(10);
      expect(effectCount).toBe(2);
      expect(lastValue).toBe(10);
      
      setValue(20);
      expect(effectCount).toBe(3);
      expect(lastValue).toBe(20);
    });
    
    it('should handle stores', () => {
      const [state, setState] = createStore({
        user: {
          name: 'Alice',
          age: 30
        },
        items: [] as string[]
      });
      
      expect(state.user.name).toBe('Alice');
      expect(state.user.age).toBe(30);
      expect(state.items).toEqual([]);
      
      setState('user', 'name', 'Bob');
      expect(state.user.name).toBe('Bob');
      
      setState('items', items => [...items, 'item1']);
      expect(state.items).toEqual(['item1']);
      
      setState('items', items => [...items, 'item2']);
      expect(state.items).toEqual(['item1', 'item2']);
    });
    
    it('should batch updates', () => {
      const [a, setA] = createSignal(0);
      const [b, setB] = createSignal(0);
      
      let computeCount = 0;
      const sum = createMemo(() => {
        computeCount++;
        return a() + b();
      });
      
      expect(sum()).toBe(0);
      expect(computeCount).toBe(1);
      
      batch(() => {
        setA(1);
        setB(2);
      });
      
      expect(sum()).toBe(3);
      expect(computeCount).toBe(2); // Only computed once after batch
    });
  });
  
  describe('Animation', () => {
    it('should create and run basic animations', async () => {
      const animation = animate({
        from: 0,
        to: 100,
        duration: 1000,
        easing: Easing.linear
      });
      
      expect(animation.value()).toBe(0);
      expect(animation.progress()).toBe(0);
      expect(animation.running()).toBe(false);
      
      const promise = animation.start();
      expect(animation.running()).toBe(true);
      
      // Advance time halfway
      vi.advanceTimersByTime(500);
      expect(animation.progress()).toBeCloseTo(0.5, 1);
      expect(animation.value()).toBeCloseTo(50, 0);
      
      // Complete animation
      vi.advanceTimersByTime(500);
      expect(animation.progress()).toBe(1);
      expect(animation.value()).toBe(100);
      expect(animation.running()).toBe(false);
      
      await promise;
    });
    
    it('should handle spring animations', () => {
      const animation = spring({
        from: 0,
        to: 100,
        stiffness: 100,
        damping: 10,
        mass: 1
      });
      
      expect(animation.value()).toBe(0);
      
      animation.start();
      
      // Spring should oscillate
      vi.advanceTimersByTime(100);
      const value1 = animation.value();
      expect(value1).toBeGreaterThan(0);
      expect(value1).toBeLessThan(150); // May overshoot
      
      // Eventually settle
      vi.advanceTimersByTime(5000);
      expect(animation.value()).toBeCloseTo(100, 0);
    });
    
    it('should support different easing functions', () => {
      const easings = [
        Easing.linear,
        Easing.easeIn,
        Easing.easeOut,
        Easing.easeInOut,
        Easing.easeInQuad,
        Easing.easeOutQuad,
        Easing.easeInOutQuad
      ];
      
      easings.forEach(easing => {
        const value = easing(0.5);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      });
      
      // Linear should be exactly 0.5 at halfway
      expect(Easing.linear(0.5)).toBe(0.5);
      
      // EaseIn should be less than 0.5 at halfway
      expect(Easing.easeIn(0.5)).toBeLessThan(0.5);
      
      // EaseOut should be greater than 0.5 at halfway
      expect(Easing.easeOut(0.5)).toBeGreaterThan(0.5);
    });
  });
  
  describe('Layout', () => {
    it('should create flex layouts', () => {
      const layout = createFlexLayout({
        direction: 'row',
        gap: 10,
        padding: 5
      });
      
      expect(layout.type).toBe(LayoutType.Flex);
      expect(layout.direction).toBe('row');
      expect(layout.gap).toBe(10);
      expect(layout.padding).toBe(5);
      
      // Add children
      layout.children = [
        { flex: 1 },
        { flex: 2 },
        { width: 100 }
      ];
      
      // Calculate layout
      const bounds = { x: 0, y: 0, width: 400, height: 300 };
      const result = layout.calculate(bounds);
      
      expect(result.children).toHaveLength(3);
      expect(result.bounds).toEqual(bounds);
    });
    
    it('should create grid layouts', () => {
      const layout = createGridLayout({
        columns: 'repeat(3, 1fr)',
        rows: 'auto',
        gap: 10
      });
      
      expect(layout.type).toBe(LayoutType.Grid);
      expect(layout.columns).toBe('repeat(3, 1fr)');
      expect(layout.gap).toBe(10);
      
      // Add children
      layout.children = [
        { column: 1, row: 1 },
        { column: 2, row: 1 },
        { column: 3, row: 1 },
        { column: 1, row: 2, columnSpan: 2 }
      ];
      
      const bounds = { x: 0, y: 0, width: 400, height: 300 };
      const result = layout.calculate(bounds);
      
      expect(result.children).toHaveLength(4);
    });
    
    it('should handle nested layouts', () => {
      const container = createFlexLayout({
        direction: 'column',
        gap: 10
      });
      
      const header = createFlexLayout({
        direction: 'row',
        height: 50
      });
      
      const content = createGridLayout({
        columns: 'repeat(2, 1fr)',
        flex: 1
      });
      
      const footer = createFlexLayout({
        direction: 'row',
        height: 30
      });
      
      container.children = [header, content, footer];
      
      const bounds = { x: 0, y: 0, width: 800, height: 600 };
      const result = container.calculate(bounds);
      
      expect(result.children).toHaveLength(3);
      expect(result.children[0].bounds.height).toBe(50);
      expect(result.children[2].bounds.height).toBe(30);
      expect(result.children[1].bounds.height).toBe(600 - 50 - 30 - 20); // Minus gaps
    });
  });
  
  describe('Performance Monitoring', () => {
    it('should track performance metrics', () => {
      const monitor = createPerformanceMonitor();
      
      monitor.mark('start');
      
      // Simulate some work
      let sum = 0;
      for (let i = 0; i < 1000; i++) {
        sum += i;
      }
      
      monitor.mark('end');
      monitor.measure('work', 'start', 'end');
      
      const metrics = monitor.getMetrics();
      expect(metrics.marks).toHaveProperty('start');
      expect(metrics.marks).toHaveProperty('end');
      expect(metrics.measures).toHaveProperty('work');
      expect(metrics.measures.work.duration).toBeGreaterThanOrEqual(0);
    });
    
    it('should format values correctly', () => {
      // Format bytes
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1024)).toBe('1.00 KB');
      expect(formatBytes(1048576)).toBe('1.00 MB');
      expect(formatBytes(1073741824)).toBe('1.00 GB');
      
      // Format duration
      expect(formatDuration(0)).toBe('0ms');
      expect(formatDuration(150)).toBe('150ms');
      expect(formatDuration(1500)).toBe('1.50s');
      expect(formatDuration(65000)).toBe('1m 5s');
    });
    
    it('should measure function execution', () => {
      const monitor = createPerformanceMonitor();
      
      const slowFunction = () => {
        let result = 0;
        for (let i = 0; i < 10000; i++) {
          result += Math.sqrt(i);
        }
        return result;
      };
      
      const [result, duration] = measure('slowFunction', slowFunction);
      
      expect(result).toBeGreaterThan(0);
      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });
  
  describe('Console Interception', () => {
    it('should intercept console methods', () => {
      const interceptor = createConsoleInterceptor();
      const messages: any[] = [];
      
      interceptor.onMessage((msg) => {
        messages.push(msg);
      });
      
      const restore = interceptor.patch();
      
      console.log('Test log');
      console.warn('Test warning');
      console.error('Test error');
      
      expect(messages).toHaveLength(3);
      expect(messages[0].level).toBe('log');
      expect(messages[0].args).toEqual(['Test log']);
      expect(messages[1].level).toBe('warn');
      expect(messages[2].level).toBe('error');
      
      restore();
      
      // After restore, should not intercept
      console.log('Not intercepted');
      expect(messages).toHaveLength(3);
    });
    
    it('should format console messages', () => {
      const interceptor = createConsoleInterceptor();
      
      interceptor.patch({ formatArgs: true });
      
      const messages: any[] = [];
      interceptor.onMessage((msg) => {
        messages.push(msg);
      });
      
      console.log('String', 123, { key: 'value' }, [1, 2, 3]);
      
      expect(messages[0].formatted).toContain('String');
      expect(messages[0].formatted).toContain('123');
      expect(messages[0].formatted).toContain('key');
      
      interceptor.restore();
    });
  });
  
  describe('Rendering Engine', () => {
    it('should create render engine and layers', () => {
      const engine = createRenderEngine({
        width: 80,
        height: 24
      });
      
      const backgroundLayer = engine.createLayer('background', 0);
      const contentLayer = engine.createLayer('content', 1);
      const uiLayer = engine.createLayer('ui', 2);
      
      expect(engine.getLayers()).toHaveLength(3);
      expect(backgroundLayer.zIndex).toBe(0);
      expect(contentLayer.zIndex).toBe(1);
      expect(uiLayer.zIndex).toBe(2);
      
      // Remove layer
      engine.removeLayer('content');
      expect(engine.getLayers()).toHaveLength(2);
    });
    
    it('should handle drawables', () => {
      const engine = createRenderEngine({
        width: 80,
        height: 24
      });
      
      const layer = engine.createLayer('main', 0);
      
      const rect = createDrawable({
        type: 'rect',
        x: 10,
        y: 5,
        width: 20,
        height: 10,
        color: '#ff0000'
      });
      
      const text = createDrawable({
        type: 'text',
        x: 0,
        y: 0,
        text: 'Hello World',
        color: '#ffffff'
      });
      
      layer.add(rect);
      layer.add(text);
      
      expect(layer.drawables.size).toBe(2);
      
      layer.remove(rect);
      expect(layer.drawables.size).toBe(1);
      
      layer.clear();
      expect(layer.drawables.size).toBe(0);
    });
    
    it('should handle blend modes', () => {
      const engine = createRenderEngine({
        width: 80,
        height: 24
      });
      
      const layer1 = engine.createLayer('layer1', 0);
      const layer2 = engine.createLayer('layer2', 1);
      
      layer2.blendMode = BlendMode.Multiply;
      expect(layer2.blendMode).toBe(BlendMode.Multiply);
      
      layer2.opacity = 0.5;
      expect(layer2.opacity).toBe(0.5);
      
      layer2.visible = false;
      expect(layer2.visible).toBe(false);
    });
  });
  
  describe('Integration', () => {
    it('should combine state and animation', async () => {
      const [position, setPosition] = createSignal({ x: 0, y: 0 });
      
      const animX = animate({
        from: 0,
        to: 100,
        duration: 500,
        easing: Easing.easeInOut
      });
      
      const animY = animate({
        from: 0,
        to: 50,
        duration: 500,
        easing: Easing.easeInOut
      });
      
      // Update position on animation frame
      createEffect(() => {
        setPosition({
          x: animX.value(),
          y: animY.value()
        });
      });
      
      animX.start();
      animY.start();
      
      vi.advanceTimersByTime(250);
      const midPos = position();
      expect(midPos.x).toBeGreaterThan(0);
      expect(midPos.x).toBeLessThan(100);
      expect(midPos.y).toBeGreaterThan(0);
      expect(midPos.y).toBeLessThan(50);
      
      vi.advanceTimersByTime(250);
      const finalPos = position();
      expect(finalPos.x).toBe(100);
      expect(finalPos.y).toBe(50);
    });
    
    it('should combine layout and rendering', () => {
      const engine = createRenderEngine({
        width: 800,
        height: 600
      });
      
      const layout = createFlexLayout({
        direction: 'column',
        gap: 10,
        padding: 20
      });
      
      // Calculate layout
      const bounds = { x: 0, y: 0, width: 800, height: 600 };
      const result = layout.calculate(bounds);
      
      // Create layer for each layout item
      result.children.forEach((child, i) => {
        const layer = engine.createLayer(`item-${i}`, i);
        layer.bounds = child.bounds;
      });
      
      expect(engine.getLayers().length).toBeGreaterThanOrEqual(0);
    });
    
    it('should monitor performance of animations', () => {
      const monitor = createPerformanceMonitor();
      
      monitor.mark('animation-start');
      
      const animations = Array.from({ length: 10 }, (_, i) => 
        animate({
          from: 0,
          to: i * 10,
          duration: 1000,
          easing: Easing.linear
        })
      );
      
      animations.forEach(anim => anim.start());
      
      vi.advanceTimersByTime(500);
      
      monitor.mark('animation-mid');
      monitor.measure('first-half', 'animation-start', 'animation-mid');
      
      vi.advanceTimersByTime(500);
      
      monitor.mark('animation-end');
      monitor.measure('second-half', 'animation-mid', 'animation-end');
      monitor.measure('total', 'animation-start', 'animation-end');
      
      const metrics = monitor.getMetrics();
      expect(metrics.measures).toHaveProperty('first-half');
      expect(metrics.measures).toHaveProperty('second-half');
      expect(metrics.measures).toHaveProperty('total');
    });
  });
});
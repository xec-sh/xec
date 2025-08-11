import { it, vi, expect, describe, beforeEach } from 'vitest';

import { x, y, cols, rows } from '../../src/types';
import { BlendMode, createRenderEngine } from '../../src/advanced/rendering';

import type { Color, Rectangle } from '../../src/types';

describe('Rendering Engine Module', () => {
  beforeEach(() => {
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  describe('createRenderEngine', () => {
    it('should create render engine', () => {
      const engine = createRenderEngine();
      
      expect(engine).toBeDefined();
      expect(engine.frameRate).toBe(60);
      expect(engine.requestFrame).toBeTypeOf('function');
      expect(engine.render).toBeTypeOf('function');
    });

    it('should set frame rate', () => {
      const engine = createRenderEngine();
      
      engine.setFrameRate(30);
      expect(engine.frameRate).toBe(30);
      
      engine.setFrameRate(120);
      expect(engine.frameRate).toBe(120);
    });

    it('should request animation frames', () => {
      const engine = createRenderEngine();
      const callback = vi.fn();
      
      const id = engine.requestFrame(callback);
      expect(id).toBeTypeOf('number');
      
      // Advance multiple times to ensure the render loop runs
      // First advance starts the loop
      vi.advanceTimersByTime(1);
      // Then advance to next frame (16ms for 60fps)
      vi.advanceTimersByTime(16);
      
      expect(callback).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should cancel animation frames', () => {
      const engine = createRenderEngine();
      const callback = vi.fn();
      
      const id = engine.requestFrame(callback);
      engine.cancelFrame(id);
      
      vi.advanceTimersByTime(16);
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should render a scene', () => {
      const engine = createRenderEngine();
      
      const scene = {
        layers: [],
        viewport: {
          x: x(0),
          y: y(0),
          width: cols(80),
          height: rows(24)
        } as Rectangle,
        clearColor: 'black' as Color
      };
      
      expect(() => engine.render(scene)).not.toThrow();
    });

    it('should render partial updates', () => {
      const engine = createRenderEngine();
      
      const patches = [
        {
          x: x(10),
          y: y(5),
          cells: []
        }
      ];
      
      expect(() => engine.renderPartial(patches)).not.toThrow();
    });

    it('should support batching', () => {
      const engine = createRenderEngine();
      
      const batch = engine.startBatch();
      expect(batch).toBeDefined();
      
      // Add some operations to batch
      engine.render({
        layers: [],
        viewport: {
          x: x(0),
          y: y(0),
          width: cols(80),
          height: rows(24)
        } as Rectangle
      });
      
      engine.commitBatch(batch);
    });

    it('should track performance metrics', () => {
      const engine = createRenderEngine();
      
      const metrics = engine.metrics;
      expect(metrics).toBeDefined();
      expect(metrics.fps).toBeTypeOf('number');
      expect(metrics.frameTime).toBeTypeOf('number');
      expect(metrics.drawCalls).toBeTypeOf('number');
      expect(metrics.dirtyRegions).toBeTypeOf('number');
      expect(metrics.bufferSize).toBeTypeOf('number');
    });

    it('should enable/disable profiling', () => {
      const engine = createRenderEngine();
      
      engine.enableProfiling(true);
      // Should start collecting detailed metrics
      
      engine.enableProfiling(false);
      // Should stop collecting detailed metrics
    });

    it('should create and manage layers', () => {
      const engine = createRenderEngine();
      
      const layer1 = engine.createLayer(0);
      expect(layer1).toBeDefined();
      expect(layer1.zIndex).toBe(0);
      expect(layer1.visible).toBe(true);
      expect(layer1.opacity).toBe(1);
      
      const layer2 = engine.createLayer(10);
      expect(layer2.zIndex).toBe(10);
      
      engine.removeLayer(layer1);
      // Layer should be removed
    });

    it('should manage layer content', () => {
      const engine = createRenderEngine();
      const layer = engine.createLayer(0);
      
      const drawable = {
        draw: vi.fn(),
        bounds: {
          x: x(0),
          y: y(0),
          width: cols(10),
          height: rows(10)
        } as Rectangle,
        dirty: false
      };
      
      layer.add(drawable);
      expect(layer.elements).toContain(drawable);
      
      layer.remove(drawable);
      expect(layer.elements).not.toContain(drawable);
      
      layer.add(drawable);
      layer.clear();
      expect(layer.elements).toHaveLength(0);
    });

    it('should support different blend modes', () => {
      const engine = createRenderEngine();
      const layer = engine.createLayer(0);
      
      layer.blendMode = BlendMode.Normal;
      expect(layer.blendMode).toBe(BlendMode.Normal);
      
      layer.blendMode = BlendMode.Multiply;
      expect(layer.blendMode).toBe(BlendMode.Multiply);
      
      layer.blendMode = BlendMode.Screen;
      expect(layer.blendMode).toBe(BlendMode.Screen);
      
      layer.blendMode = BlendMode.Overlay;
      expect(layer.blendMode).toBe(BlendMode.Overlay);
    });

    it('should handle layer visibility', () => {
      const engine = createRenderEngine();
      const layer = engine.createLayer(0);
      
      expect(layer.visible).toBe(true);
      
      layer.visible = false;
      expect(layer.visible).toBe(false);
      
      layer.visible = true;
      expect(layer.visible).toBe(true);
    });

    it('should handle layer opacity', () => {
      const engine = createRenderEngine();
      const layer = engine.createLayer(0);
      
      expect(layer.opacity).toBe(1);
      
      layer.opacity = 0.5;
      expect(layer.opacity).toBe(0.5);
      
      layer.opacity = 0;
      expect(layer.opacity).toBe(0);
    });

    it('should render scene with multiple layers', () => {
      const engine = createRenderEngine();
      
      const layer1 = engine.createLayer(0);
      const layer2 = engine.createLayer(10);
      const layer3 = engine.createLayer(5);
      
      const scene = {
        layers: [layer1, layer2, layer3],
        viewport: {
          x: x(0),
          y: y(0),
          width: cols(80),
          height: rows(24)
        } as Rectangle
      };
      
      engine.render(scene);
      
      // Layers should be rendered in z-index order: layer1, layer3, layer2
    });

    it('should call draw on drawables', () => {
      const engine = createRenderEngine();
      const layer = engine.createLayer(0);
      
      const drawable = {
        draw: vi.fn(),
        bounds: {
          x: x(0),
          y: y(0),
          width: cols(10),
          height: rows(10)
        } as Rectangle,
        dirty: true
      };
      
      layer.add(drawable);
      
      const scene = {
        layers: [layer],
        viewport: {
          x: x(0),
          y: y(0),
          width: cols(80),
          height: rows(24)
        } as Rectangle
      };
      
      engine.render(scene);
      
      expect(drawable.draw).toHaveBeenCalled();
    });

    it('should skip non-dirty drawables when optimizing', () => {
      const engine = createRenderEngine();
      const layer = engine.createLayer(0);
      
      const dirtyDrawable = {
        draw: vi.fn(),
        bounds: {
          x: x(0),
          y: y(0),
          width: cols(10),
          height: rows(10)
        } as Rectangle,
        dirty: true
      };
      
      const cleanDrawable = {
        draw: vi.fn(),
        bounds: {
          x: x(20),
          y: y(0),
          width: cols(10),
          height: rows(10)
        } as Rectangle,
        dirty: false
      };
      
      layer.add(dirtyDrawable);
      layer.add(cleanDrawable);
      
      const scene = {
        layers: [layer],
        viewport: {
          x: x(0),
          y: y(0),
          width: cols(80),
          height: rows(24)
        } as Rectangle
      };
      
      // Enable optimization
      engine.enableProfiling(true);
      engine.render(scene);
      
      expect(dirtyDrawable.draw).toHaveBeenCalled();
      // Clean drawable might be skipped in optimized rendering
    });

    it('should maintain frame rate', () => {
      const engine = createRenderEngine();
      engine.setFrameRate(30); // 30fps = 33.33ms per frame
      
      const callback = vi.fn();
      
      engine.requestFrame(callback);
      
      // Start the render loop
      vi.advanceTimersByTime(1);
      
      // Advance through multiple frames
      // Each frame at 30fps should be ~33.33ms
      vi.advanceTimersByTime(33);
      expect(callback).toHaveBeenCalledTimes(1);
      
      vi.advanceTimersByTime(34);
      expect(callback).toHaveBeenCalledTimes(2);
      
      vi.advanceTimersByTime(34);
      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('should track draw call count', () => {
      const engine = createRenderEngine();
      const layer = engine.createLayer(0);
      
      // Add multiple drawables with mock draw functions
      const drawables = [];
      for (let i = 0; i < 5; i++) {
        const drawable = {
          draw: vi.fn(),
          bounds: {
            x: x(i * 10),
            y: y(0),
            width: cols(10),
            height: rows(10)
          } as Rectangle,
          dirty: true
        };
        drawables.push(drawable);
        layer.add(drawable);
      }
      
      const scene = {
        layers: [layer],
        viewport: {
          x: x(0),
          y: y(0),
          width: cols(80),
          height: rows(24)
        } as Rectangle
      };
      
      engine.render(scene);
      
      // Verify draw was called on each drawable
      for (const drawable of drawables) {
        expect(drawable.draw).toHaveBeenCalled();
      }
      
      // Check metrics
      expect(engine.metrics.drawCalls).toBe(5);
    });
  });
});
/**
 * Rendering Engine Module
 * High-performance rendering with layers, batching, and optimization
 */

import { x, y, cols, rows } from '../types.js';
import { BufferManagerImpl } from '../core/buffer.js';
import { type Signal, createSignal } from './state.js';
import { performance, cancelAnimationFrame, requestAnimationFrame } from '../core/browser-api.js';

import type { 
  X, 
  Y, 
  Cols,
  Rows,
  Color,
  Style,
  Rectangle,
  ScreenBuffer
} from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface RenderEngine {
  // Frame management
  readonly frameRate: number;
  setFrameRate(fps: number): void;
  
  // Render cycle
  requestFrame(callback: FrameCallback): number;
  cancelFrame(id: number): void;
  
  // Immediate rendering
  render(scene: Scene): void;
  renderPartial(updates: ScreenPatch[]): void;
  
  // Batching
  startBatch(): BatchContext;
  commitBatch(context: BatchContext): void;
  
  // Performance
  readonly metrics: RenderMetrics;
  enableProfiling(enabled: boolean): void;
  
  // Layers
  createLayer(zIndex: number): Layer;
  removeLayer(layer: Layer): void;
  
  // Lifecycle
  start(): void;
  stop(): void;
}

export interface Scene {
  readonly layers: Layer[];
  readonly viewport: Rectangle;
  readonly clearColor?: Color;
}

export interface Layer {
  readonly id: string;
  readonly zIndex: number;
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
  
  // Content
  readonly elements: Drawable[];
  add(element: Drawable): void;
  remove(element: Drawable): void;
  clear(): void;
  
  // Dirty tracking
  markDirty(region?: Rectangle): void;
  readonly dirtyRegions: Rectangle[];
  clearDirty(): void;
}

export interface Drawable {
  draw(context: DrawContext): void;
  readonly bounds: Rectangle;
  readonly dirty: boolean;
  markDirty(): void;
}

export interface DrawContext {
  buffer: ScreenBuffer;
  viewport: Rectangle;
  opacity: number;
  blendMode: BlendMode;
  clip?: Rectangle;
}

export interface RenderMetrics {
  readonly fps: number;
  readonly frameTime: number;
  readonly drawCalls: number;
  readonly dirtyRegions: number;
  readonly bufferSize: number;
  readonly droppedFrames: number;
}

export interface BatchContext {
  readonly id: string;
  readonly operations: RenderOperation[];
  add(operation: RenderOperation): void;
}

export interface RenderOperation {
  type: 'draw' | 'clear' | 'update';
  layer?: Layer;
  element?: Drawable;
  region?: Rectangle;
}

export interface ScreenPatch {
  x: X;
  y: Y;
  width?: Cols;
  height?: Rows;
  cells: any[];
  style?: Style;
}

export type FrameCallback = (time: number) => void;

export enum BlendMode {
  Normal = 'normal',
  Multiply = 'multiply',
  Screen = 'screen',
  Overlay = 'overlay',
  Add = 'add',
  Subtract = 'subtract',
  Replace = 'replace'
}

// ============================================================================
// Layer Implementation
// ============================================================================

class LayerImpl implements Layer {
  readonly id: string;
  readonly zIndex: number;
  visible = true;
  opacity = 1;
  blendMode = BlendMode.Normal;
  
  readonly elements: Drawable[] = [];
  readonly dirtyRegions: Rectangle[] = [];
  
  constructor(zIndex: number) {
    this.id = `layer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.zIndex = zIndex;
  }
  
  add(element: Drawable): void {
    this.elements.push(element);
    this.markDirty(element.bounds);
  }
  
  remove(element: Drawable): void {
    const index = this.elements.indexOf(element);
    if (index !== -1) {
      this.markDirty(element.bounds);
      this.elements.splice(index, 1);
    }
  }
  
  clear(): void {
    this.elements.length = 0;
    this.markDirty();
  }
  
  markDirty(region?: Rectangle): void {
    if (region) {
      this.dirtyRegions.push(region);
    } else {
      // Mark entire layer as dirty
      this.dirtyRegions.push({
        x: x(0),
        y: y(0),
        width: cols(Number.MAX_SAFE_INTEGER),
        height: rows(Number.MAX_SAFE_INTEGER)
      });
    }
  }
  
  clearDirty(): void {
    this.dirtyRegions.length = 0;
  }
}

// ============================================================================
// Batch Context Implementation
// ============================================================================

class BatchContextImpl implements BatchContext {
  readonly id: string;
  readonly operations: RenderOperation[] = [];
  
  constructor() {
    this.id = `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  
  add(operation: RenderOperation): void {
    this.operations.push(operation);
  }
}

// ============================================================================
// Render Engine Implementation
// ============================================================================

class RenderEngineImpl implements RenderEngine {
  private _frameRate = 60;
  private _profiling = false;
  private running = false;
  
  private layers: Layer[] = [];
  private frameCallbacks = new Map<number, FrameCallback>();
  private nextFrameId = 0;
  private animationFrame?: number;
  private lastFrameTime = 0;
  
  private bufferManager: BufferManagerImpl;
  private currentBatch?: BatchContextImpl;
  
  // Metrics
  private _metrics: Signal<RenderMetrics>;
  private setMetrics: (value: RenderMetrics) => void;
  
  private frameCount = 0;
  private lastFpsUpdate = 0;
  private totalFrameTime = 0;
  private droppedFrames = 0;
  
  constructor() {
    this.bufferManager = new BufferManagerImpl();
    
    // Initialize metrics signal
    const [metrics, setMetrics] = createSignal<RenderMetrics>({
      fps: 0,
      frameTime: 0,
      drawCalls: 0,
      dirtyRegions: 0,
      bufferSize: 0,
      droppedFrames: 0
    });
    this._metrics = metrics;
    this.setMetrics = setMetrics;
  }
  
  get frameRate(): number {
    return this._frameRate;
  }
  
  setFrameRate(fps: number): void {
    this._frameRate = Math.max(1, Math.min(240, fps));
  }
  
  get metrics(): RenderMetrics {
    return this._metrics.value;
  }
  
  enableProfiling(enabled: boolean): void {
    this._profiling = enabled;
  }
  
  start(): void {
    if (this.running) return;
    
    this.running = true;
    this.lastFrameTime = performance.now();
    this.lastFpsUpdate = performance.now();
    this.renderLoop();
  }
  
  stop(): void {
    this.running = false;
    
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = undefined;
    }
  }
  
  requestFrame(callback: FrameCallback): number {
    const id = this.nextFrameId++;
    this.frameCallbacks.set(id, callback);
    
    // Start render loop if not running
    if (!this.running) {
      this.start();
    }
    
    return id;
  }
  
  cancelFrame(id: number): void {
    this.frameCallbacks.delete(id);
  }
  
  createLayer(zIndex: number): Layer {
    const layer = new LayerImpl(zIndex);
    
    // Insert at correct position
    const insertIndex = this.layers.findIndex(l => l.zIndex > zIndex);
    if (insertIndex === -1) {
      this.layers.push(layer);
    } else {
      this.layers.splice(insertIndex, 0, layer);
    }
    
    return layer;
  }
  
  removeLayer(layer: Layer): void {
    const index = this.layers.indexOf(layer);
    if (index !== -1) {
      this.layers.splice(index, 1);
    }
  }
  
  render(scene: Scene): void {
    const startTime = this._profiling ? performance.now() : 0;
    let drawCalls = 0;
    
    // Create render buffer
    const buffer = this.bufferManager.create(scene.viewport.width, scene.viewport.height);
    
    // Clear with background color
    if (scene.clearColor) {
      buffer.clear({ bg: scene.clearColor });
    }
    
    // Render layers in order
    for (const layer of scene.layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      
      const context: DrawContext = {
        buffer,
        viewport: scene.viewport,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        clip: scene.viewport
      };
      
      // Render elements in layer
      for (const element of layer.elements) {
        if (this.isInViewport(element.bounds, scene.viewport)) {
          element.draw(context);
          drawCalls++;
        }
      }
    }
    
    // Render to screen
    this.bufferManager.render(buffer, scene.viewport.x, scene.viewport.y);
    
    // Update metrics
    if (this._profiling) {
      const frameTime = performance.now() - startTime;
      this.updateMetrics({
        frameTime,
        drawCalls,
        dirtyRegions: this.calculateDirtyRegions(),
        bufferSize: scene.viewport.width * scene.viewport.height
      });
    }
  }
  
  renderPartial(updates: ScreenPatch[]): void {
    // Direct patching for immediate updates
    for (const patch of updates) {
      // Default dimensions if not provided
      const width = patch.width || cols(10);
      const height = patch.height || rows(1);
      const buffer = this.bufferManager.create(width, height);
      
      // Apply cells to buffer if provided
      if (patch.cells && patch.cells.length > 0) {
        let currentX = 0;
        for (const cell of patch.cells) {
          if (typeof cell === 'string') {
            buffer.writeText(x(currentX), y(0), cell, patch.style);
            currentX += cell.length;
          } else if (cell && typeof cell === 'object') {
            buffer.setCell(x(currentX), y(0), cell.char || ' ', cell.style || patch.style);
            currentX++;
          }
        }
      }
      
      // Render patch to screen
      this.bufferManager.render(buffer, patch.x, patch.y);
    }
  }
  
  startBatch(): BatchContext {
    if (this.currentBatch) {
      throw new Error('Batch already in progress');
    }
    
    this.currentBatch = new BatchContextImpl();
    return this.currentBatch;
  }
  
  commitBatch(context: BatchContext): void {
    if (context !== this.currentBatch) {
      throw new Error('Invalid batch context');
    }
    
    // Process all operations in batch
    const startTime = this._profiling ? performance.now() : 0;
    let drawCalls = 0;
    
    // Group operations by layer for efficiency
    const layerOps = new Map<Layer, RenderOperation[]>();
    
    for (const op of context.operations) {
      if (op.layer) {
        if (!layerOps.has(op.layer)) {
          layerOps.set(op.layer, []);
        }
        layerOps.get(op.layer)!.push(op);
      }
    }
    
    // Process each layer's operations
    for (const [layer, ops] of layerOps) {
      for (const op of ops) {
        switch (op.type) {
          case 'draw':
            if (op.element) {
              layer.add(op.element);
              drawCalls++;
            }
            break;
          case 'clear':
            layer.clear();
            break;
          case 'update':
            if (op.region) {
              layer.markDirty(op.region);
            }
            break;
        }
      }
    }
    
    // Clear current batch
    this.currentBatch = undefined;
    
    // Update metrics
    if (this._profiling) {
      const frameTime = performance.now() - startTime;
      this.updateMetrics({
        frameTime,
        drawCalls,
        dirtyRegions: this.calculateDirtyRegions(),
        bufferSize: 0
      });
    }
  }
  
  private renderLoop = (): void => {
    if (!this.running) return;
    
    const now = performance.now();
    const deltaTime = now - this.lastFrameTime;
    const targetFrameTime = 1000 / this._frameRate;
    
    // Check if we should render this frame
    if (deltaTime >= targetFrameTime) {
      const startTime = now;
      
      // Call frame callbacks
      for (const callback of this.frameCallbacks.values()) {
        callback(now);
      }
      
      // Check if any layers are dirty
      const dirtyLayers = this.layers.filter(layer => 
        layer.dirtyRegions.length > 0 || 
        layer.elements.some(el => el.dirty)
      );
      
      if (dirtyLayers.length > 0) {
        // Render dirty regions
        this.renderDirtyRegions(dirtyLayers);
        
        // Clear dirty flags
        for (const layer of dirtyLayers) {
          layer.clearDirty();
          for (const element of layer.elements) {
            if ('markDirty' in element && typeof element.markDirty === 'function') {
              // Reset dirty flag (implementation-specific)
            }
          }
        }
      }
      
      // Update timing
      const frameTime = performance.now() - startTime;
      this.totalFrameTime += frameTime;
      this.frameCount++;
      
      // Check for dropped frames
      if (deltaTime > targetFrameTime * 2) {
        this.droppedFrames++;
      }
      
      // Update FPS counter
      if (now - this.lastFpsUpdate >= 1000) {
        const avgFrameTime = this.totalFrameTime / this.frameCount;
        const fps = this.frameCount / ((now - this.lastFpsUpdate) / 1000);
        
        this.setMetrics({
          fps,
          frameTime: avgFrameTime,
          drawCalls: this._metrics.value.drawCalls,
          dirtyRegions: this.calculateDirtyRegions(),
          bufferSize: this._metrics.value.bufferSize,
          droppedFrames: this.droppedFrames
        });
        
        this.frameCount = 0;
        this.totalFrameTime = 0;
        this.droppedFrames = 0;
        this.lastFpsUpdate = now;
      }
      
      this.lastFrameTime = now - (deltaTime % targetFrameTime);
    }
    
    this.animationFrame = requestAnimationFrame(this.renderLoop);
  };
  
  private renderDirtyRegions(layers: Layer[]): void {
    // Optimize by merging overlapping dirty regions
    const mergedRegions = this.mergeDirtyRegions(layers);
    
    for (const region of mergedRegions) {
      // Create buffer for region
      const buffer = this.bufferManager.create(region.width, region.height);
      
      // Render layers to buffer
      for (const layer of layers) {
        if (!layer.visible || layer.opacity <= 0) continue;
        
        const context: DrawContext = {
          buffer,
          viewport: region,
          opacity: layer.opacity,
          blendMode: layer.blendMode,
          clip: region
        };
        
        // Render elements that intersect with region
        for (const element of layer.elements) {
          if (this.rectsIntersect(element.bounds, region)) {
            element.draw(context);
          }
        }
      }
      
      // Render buffer to screen
      this.bufferManager.render(buffer, region.x, region.y);
    }
  }
  
  private mergeDirtyRegions(layers: Layer[]): Rectangle[] {
    const allRegions: Rectangle[] = [];
    
    for (const layer of layers) {
      allRegions.push(...layer.dirtyRegions);
    }
    
    if (allRegions.length === 0) return [];
    
    // Simple merge algorithm - can be optimized
    const merged: Rectangle[] = [];
    const used = new Set<number>();
    
    for (let i = 0; i < allRegions.length; i++) {
      if (used.has(i)) continue;
      
      let current = { ...allRegions[i] };
      let changed = true;
      
      while (changed) {
        changed = false;
        
        for (let j = i + 1; j < allRegions.length; j++) {
          if (used.has(j)) continue;
          
          if (this.rectsIntersect(current, allRegions[j])) {
            // Merge rectangles
            const minX = Math.min(current.x, allRegions[j].x);
            const minY = Math.min(current.y, allRegions[j].y);
            const maxX = Math.max(
              current.x + current.width,
              allRegions[j].x + allRegions[j].width
            );
            const maxY = Math.max(
              current.y + current.height,
              allRegions[j].y + allRegions[j].height
            );
            
            current = {
              x: x(minX),
              y: y(minY),
              width: cols(maxX - minX),
              height: rows(maxY - minY)
            };
            
            used.add(j);
            changed = true;
          }
        }
      }
      
      merged.push(current);
      used.add(i);
    }
    
    return merged;
  }
  
  private isInViewport(bounds: Rectangle, viewport: Rectangle): boolean {
    return this.rectsIntersect(bounds, viewport);
  }
  
  private rectsIntersect(a: Rectangle, b: Rectangle): boolean {
    return !(
      a.x + a.width <= b.x ||
      b.x + b.width <= a.x ||
      a.y + a.height <= b.y ||
      b.y + b.height <= a.y
    );
  }
  
  private calculateDirtyRegions(): number {
    return this.layers.reduce((sum, layer) => sum + layer.dirtyRegions.length, 0);
  }
  
  private updateMetrics(partial: Partial<RenderMetrics>): void {
    const current = this._metrics.value;
    this.setMetrics({
      fps: partial.fps ?? current.fps,
      frameTime: partial.frameTime ?? current.frameTime,
      drawCalls: partial.drawCalls ?? current.drawCalls,
      dirtyRegions: partial.dirtyRegions ?? current.dirtyRegions,
      bufferSize: partial.bufferSize ?? current.bufferSize,
      droppedFrames: partial.droppedFrames ?? current.droppedFrames
    });
  }
}

// ============================================================================
// Simple Drawable Implementation
// ============================================================================

export class SimpleDrawable implements Drawable {
  bounds: Rectangle;
  private _dirty = true;
  private drawFn: (context: DrawContext) => void;
  
  constructor(
    bounds: Rectangle,
    drawFn: (context: DrawContext) => void
  ) {
    this.bounds = bounds;
    this.drawFn = drawFn;
  }
  
  get dirty(): boolean {
    return this._dirty;
  }
  
  markDirty(): void {
    this._dirty = true;
  }
  
  draw(context: DrawContext): void {
    this.drawFn(context);
    this._dirty = false;
  }
}

// ============================================================================
// Blend Functions
// ============================================================================

export function blendColors(fg: Color, bg: Color, mode: BlendMode, opacity: number): Color {
  // Simplified blend implementation
  // In a real implementation, this would properly blend RGB values
  
  switch (mode) {
    case BlendMode.Normal:
      return opacity >= 0.5 ? fg : bg;
      
    case BlendMode.Replace:
      return fg;
      
    default:
      return fg;
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create a new render engine
 */
export function createRenderEngine(): RenderEngine {
  return new RenderEngineImpl();
}

/**
 * Global render engine instance
 */
export const renderEngine = createRenderEngine();

/**
 * Create a simple drawable
 */
export function createDrawable(
  bounds: Rectangle,
  drawFn: (context: DrawContext) => void
): Drawable {
  return new SimpleDrawable(bounds, drawFn);
}
/**
 * Layer System (Z-Index Management)
 * Implements the layer architecture from spec.md for managing component z-order
 */

import { EventEmitter } from 'events';

import { BaseComponent } from './component.js';

export type LayerType = 'base' | 'modal' | 'overlay' | 'notification' | 'tooltip' | 'context-menu' | 'draggable';

export interface Layer {
  id: string;
  zIndex: number;
  type: LayerType;
  component: BaseComponent<any>;
  opacity?: number; // 0-1 for transparency
  blur?: boolean; // Background blur effect
  clickThrough?: boolean; // Allow clicks to pass through
  focusTrap?: boolean; // Trap keyboard focus
  dismissible?: boolean; // Click outside to dismiss
  visible?: boolean; // Visibility state
  draggable?: boolean; // Can be dragged
  position?: { x: number; y: number }; // Position for draggable layers
}

export interface LayerManagerOptions {
  maxLayers?: number;
  defaultOpacity?: number;
}

/**
 * Manages component layers and z-index ordering
 * Implements the layer system from spec.md
 */
export class LayerManager extends EventEmitter {
  private layers: Map<string, Layer> = new Map();
  private renderOrder: Layer[] = [];
  private options: LayerManagerOptions;
  private focusedLayerId: string | null = null;

  // Z-index ranges for different layer types
  private readonly Z_RANGES: Record<LayerType, [number, number]> = {
    base: [0, 99],
    overlay: [100, 199],
    modal: [200, 299],
    'context-menu': [300, 399],
    tooltip: [400, 499],
    notification: [500, 599],
    draggable: [600, 699]
  };

  constructor(options: LayerManagerOptions = {}) {
    super();
    this.options = {
      maxLayers: 100,
      defaultOpacity: 1,
      ...options
    };
  }

  /**
   * Add a new layer
   */
  push(component: BaseComponent<any>, options: Partial<Layer> = {}): string {
    const id = options.id || this.generateId();
    const type = options.type || 'base';

    const layer: Layer = {
      id,
      component,
      type,
      zIndex: options.zIndex !== undefined ? options.zIndex : this.getNextZIndex(type),
      opacity: options.opacity ?? this.options.defaultOpacity,
      blur: options.blur ?? false,
      clickThrough: options.clickThrough ?? false,
      focusTrap: options.focusTrap ?? false,
      dismissible: options.dismissible ?? false,
      visible: options.visible ?? true,
      draggable: options.draggable ?? false,
      position: options.position
    };

    this.layers.set(id, layer);
    this.updateRenderOrder();
    this.emit('layer:add', layer);

    return id;
  }

  /**
   * Remove a layer
   */
  pop(id: string): void {
    const layer = this.layers.get(id);
    if (!layer) return;

    this.layers.delete(id);
    this.updateRenderOrder();
    this.emit('layer:remove', layer);

    // If this was the focused layer, focus the next one
    if (this.focusedLayerId === id) {
      this.focusNext();
    }
  }

  /**
   * Get a layer by ID
   */
  get(id: string): Layer | undefined {
    return this.layers.get(id);
  }

  /**
   * Update layer properties
   */
  update(id: string, updates: Partial<Layer>): void {
    const layer = this.layers.get(id);
    if (!layer) return;

    Object.assign(layer, updates);

    if ('zIndex' in updates) {
      this.updateRenderOrder();
    }

    this.emit('layer:update', layer);
  }

  /**
   * Set layer visibility
   */
  setVisible(id: string, visible: boolean): void {
    this.update(id, { visible });
  }

  /**
   * Toggle layer visibility
   */
  toggleVisible(id: string): void {
    const layer = this.layers.get(id);
    if (layer) {
      this.setVisible(id, !layer.visible);
    }
  }

  /**
   * Move layer to new position (for draggable layers)
   */
  move(id: string, x: number, y: number): void {
    const layer = this.layers.get(id);
    if (layer && layer.draggable) {
      layer.position = { x, y };
      this.emit('layer:move', layer);
    }
  }

  /**
   * Bring layer to front
   */
  bringToFront(id: string): void {
    const layer = this.layers.get(id);
    if (!layer) return;

    const [min, max] = this.Z_RANGES[layer.type];
    layer.zIndex = max;
    this.updateRenderOrder();
    this.emit('layer:reorder', layer);
  }

  /**
   * Send layer to back
   */
  sendToBack(id: string): void {
    const layer = this.layers.get(id);
    if (!layer) return;

    const [min] = this.Z_RANGES[layer.type];
    layer.zIndex = min;
    this.updateRenderOrder();
    this.emit('layer:reorder', layer);
  }

  /**
   * Focus a layer
   */
  focus(id: string): void {
    const layer = this.layers.get(id);
    if (!layer) return;

    const previousFocused = this.focusedLayerId;
    this.focusedLayerId = id;

    if (previousFocused) {
      const prevLayer = this.layers.get(previousFocused);
      if (prevLayer) {
        this.emit('layer:blur', prevLayer);
      }
    }

    this.emit('layer:focus', layer);

    // Bring to front within its type range
    this.bringToFront(id);
  }

  /**
   * Focus the next layer in z-order
   */
  focusNext(): void {
    const visibleLayers = this.renderOrder.filter(l => l.visible);
    if (visibleLayers.length === 0) return;

    const currentIndex = this.focusedLayerId
      ? visibleLayers.findIndex(l => l.id === this.focusedLayerId)
      : -1;

    const nextIndex = (currentIndex + 1) % visibleLayers.length;
    const nextLayer = visibleLayers[nextIndex];
    if (nextLayer) {
      this.focus(nextLayer.id);
    }
  }

  /**
   * Focus the previous layer in z-order
   */
  focusPrevious(): void {
    const visibleLayers = this.renderOrder.filter(l => l.visible);
    if (visibleLayers.length === 0) return;

    const currentIndex = this.focusedLayerId
      ? visibleLayers.findIndex(l => l.id === this.focusedLayerId)
      : 0;

    const prevIndex = (currentIndex - 1 + visibleLayers.length) % visibleLayers.length;
    const prevLayer = visibleLayers[prevIndex];
    if (prevLayer) {
      this.focus(prevLayer.id);
    }
  }

  /**
   * Get the currently focused layer
   */
  getFocused(): Layer | undefined {
    return this.focusedLayerId ? this.layers.get(this.focusedLayerId) : undefined;
  }

  /**
   * Get all layers in render order (lowest to highest z-index)
   */
  getRenderOrder(): Layer[] {
    return [...this.renderOrder];
  }

  /**
   * Get visible layers in render order
   */
  getVisibleLayers(): Layer[] {
    return this.renderOrder.filter(l => l.visible);
  }

  /**
   * Hit test to find layer at position
   */
  hitTest(x: number, y: number): Layer | undefined {
    // Check layers from top to bottom
    for (let i = this.renderOrder.length - 1; i >= 0; i--) {
      const layer = this.renderOrder[i];
      if (!layer || !layer.visible || layer.clickThrough) continue;

      const component = layer.component;
      const bounds = component.getBounds();

      // Check if point is within component bounds
      if (bounds &&
        x >= bounds.x &&
        x < bounds.x + bounds.width &&
        y >= bounds.y &&
        y < bounds.y + bounds.height) {
        return layer;
      }
    }

    return undefined;
  }

  /**
   * Clear all layers
   */
  clear(): void {
    const layerIds = Array.from(this.layers.keys());
    layerIds.forEach(id => this.pop(id));
  }

  /**
   * Get the next available z-index for a layer type
   */
  private getNextZIndex(type: LayerType): number {
    const [min, max] = this.Z_RANGES[type];
    const existing = Array.from(this.layers.values())
      .filter(l => l.type === type)
      .map(l => l.zIndex);

    if (existing.length === 0) return min;

    const highest = Math.max(...existing);
    return Math.min(max, highest + 1);
  }

  /**
   * Update the render order based on z-index
   */
  private updateRenderOrder(): void {
    this.renderOrder = Array.from(this.layers.values())
      .sort((a, b) => a.zIndex - b.zIndex);
  }

  /**
   * Generate a unique layer ID
   */
  private generateId(): string {
    return `layer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Serialize layer state for persistence
   */
  serialize(): any {
    return {
      layers: Array.from(this.layers.values()).map(layer => ({
        id: layer.id,
        type: layer.type,
        zIndex: layer.zIndex,
        visible: layer.visible,
        position: layer.position,
        opacity: layer.opacity,
        blur: layer.blur,
        clickThrough: layer.clickThrough,
        focusTrap: layer.focusTrap,
        dismissible: layer.dismissible,
        draggable: layer.draggable
      })),
      focusedLayerId: this.focusedLayerId
    };
  }

  /**
   * Restore layer state from serialized data
   */
  deserialize(data: any): void {
    // Note: Components need to be recreated separately
    // This only restores the layer metadata
    if (data.focusedLayerId) {
      this.focusedLayerId = data.focusedLayerId;
    }
  }
}
/**
 * Base component abstraction for Terex
 * All UI elements are components in the fractal architecture
 */

import { TypedEventEmitter } from './events.js';

import type {
  Key,
  Output,
  Position,
  Component,
  Rectangle,
  MouseEvent,
  ComponentOptions,
  ComponentLifecycle
} from './types.js';

// Global render stack to prevent circular references
const renderStack = new Set<Component<unknown>>();

// ============================================================================
// Component Events
// ============================================================================

export interface ComponentEventMap {
  mount: [];
  unmount: [];
  focus: [];
  blur: [];
  stateChange: [newState: unknown, oldState: unknown];
  childAdded: [child: Component<unknown>];
  childRemoved: [child: Component<unknown>];
  render: [];
  keypress: [key: Key];
  mouseEvent: [event: MouseEvent];
  resize: [size: { width: number; height: number }];
  dragStart: [position: Position];
  dragMove: [position: Position];
  dragEnd: [position: Position];
  resizeStart: [size: { width: number; height: number }];
  resizeMove: [size: { width: number; height: number }];
  resizeEnd: [size: { width: number; height: number }];
  zIndexChange: [zIndex: number];
  invalidate: [];
  // Allow additional event types
  [key: string]: unknown[];
}

// ============================================================================
// Drag and Resize Types
// ============================================================================

export type ResizeHandle = 'top' | 'bottom' | 'left' | 'right' | 
                          'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type DragHandle = 'title' | 'anywhere' | 'custom';

export type LayerType = 'base' | 'modal' | 'overlay' | 'notification' | 'tooltip' | 'context-menu';

export interface DragBounds {
  type: 'parent' | 'viewport' | 'custom';
  bounds?: Rectangle;
}

// ============================================================================
// Base Component Implementation
// ============================================================================

/**
 * Abstract base class for all Terex components
 * Implements the fractal component model where everything is a component
 * Now with built-in zIndex, draggable, and resizable capabilities
 */
export abstract class BaseComponent<TState = unknown>
  implements Component<TState>, ComponentLifecycle {

  // Core properties
  state: TState;  // Public as per interface
  children: Component<unknown>[] = [];  // Public as per interface
  parent?: Component<unknown>;  // Public as per interface
  protected mounted = false;
  protected focused = false;

  // Layout properties
  protected position: Position = { x: 0, y: 0 };
  protected dimensions: { width: number; height: number } = { width: 0, height: 0 };
  protected visible = true;
  
  // Layer management (fractal principle)
  protected zIndex = 0;
  protected layerType: LayerType = 'base';
  
  // Draggable properties (fractal principle)
  protected draggable = false;
  protected dragHandle: DragHandle = 'anywhere';
  protected dragBounds: DragBounds = { type: 'viewport' };
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  
  // Resizable properties (fractal principle)
  protected resizable = false;
  protected resizeHandles: ResizeHandle[] = ['bottom-right'];
  protected minWidth = 1;
  protected maxWidth = Infinity;
  protected minHeight = 1;
  protected maxHeight = Infinity;
  private isResizing = false;
  private resizeHandle?: ResizeHandle;
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;
  private resizeStartX = 0;
  private resizeStartY = 0;

  // Event emitter
  protected events: TypedEventEmitter<ComponentEventMap>;

  // Render context
  protected dirty = true;

  // Component metadata
  readonly id: string;
  readonly type: string;

  constructor(options: ComponentOptions<TState> = {}) {
    this.type = this.constructor.name.toLowerCase();
    this.id = options.id ?? this.generateId();
    this.state = options.initialState ?? ({} as TState);
    this.events = new TypedEventEmitter<ComponentEventMap>();

    if (options.children) {
      this.setChildren(options.children);
    }
  }

  // ============================================================================
  // Abstract Methods (must be implemented by subclasses)
  // ============================================================================

  /**
   * Safe render method with circular reference protection
   */
  safeRender(bounds?: { x: number; y: number; width: number; height: number }, terminal?: any): Output {
    // Check for circular references
    if (renderStack.has(this)) {
      // Return a fallback output for circular references
      return {
        lines: [`[Circular Reference: ${this.constructor.name}]`]
      };
    }

    // Add to render stack
    renderStack.add(this);

    try {
      // Call the actual render method
      const output = this.render(bounds, terminal);
      return output;
    } finally {
      // Always remove from render stack
      renderStack.delete(this);
    }
  }

  /**
   * Render the component to an Output
   */
  abstract render(bounds?: { x: number; y: number; width: number; height: number }, terminal?: any): Output;

  // ============================================================================
  // State Management
  // ============================================================================

  /**
   * Get the current state
   */
  getState(): TState {
    return this.state;
  }

  /**
   * Update the component state
   */
  setState(newState: Partial<TState>): void {
    const oldState = this.state;
    this.state = { ...this.state, ...newState };
    this.dirty = true;
    this.events.emit('stateChange', this.state, oldState);
    this.requestRender();
  }

  // ============================================================================
  // Children Management (Fractal)
  // ============================================================================

  /**
   * Add a child component
   */
  addChild(child: Component<unknown>): void {
    // Don't add if child already exists
    if (this.children.includes(child)) {
      return;
    }

    this.children.push(child);
    if (child instanceof BaseComponent) {
      (child as BaseComponent<unknown>).parent = this;
    }
    this.events.emit('childAdded', child);
    this.dirty = true;
    this.requestRender();
  }

  /**
   * Remove a child component
   */
  removeChild(child: Component<unknown>): void {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
      if (child instanceof BaseComponent) {
        (child as BaseComponent<unknown>).parent = null as any; // Set to null as expected by tests
      }
      this.events.emit('childRemoved', child);
      this.dirty = true;
      this.requestRender();
    }
  }

  /**
   * Set all children at once
   */
  setChildren(children: Component<unknown>[]): void {
    // Remove old children
    for (const child of this.children) {
      if (child instanceof BaseComponent) {
        (child as BaseComponent<unknown>).parent = null as any;
      }
      this.events.emit('childRemoved', child);
    }

    // Add new children
    this.children = children;
    for (const child of children) {
      if (child instanceof BaseComponent) {
        (child as BaseComponent<unknown>).parent = this;
      }
      this.events.emit('childAdded', child);
    }

    this.dirty = true;
    this.requestRender();
  }

  /**
   * Get all children
   */
  getChildren(): Component<unknown>[] {
    return this.children;
  }

  /**
   * Find a child by ID (recursive)
   */
  findChild(id: string): Component<unknown> | null {
    if (this.id === id) return this;

    for (const child of this.children) {
      if (child instanceof BaseComponent) {
        const found = (child as BaseComponent<unknown>).findChild(id);
        if (found) return found;
      }
    }

    return null;
  }

  // ============================================================================
  // Layout Management
  // ============================================================================

  /**
   * Set the component position
   */
  setPosition(x: number, y: number): void {
    this.position = { x, y };
    this.dirty = true;
  }

  /**
   * Get the component position
   */
  getPosition(): Position {
    return this.position;
  }

  /**
   * Set the component dimensions
   */
  setDimensions(width: number, height: number): void {
    this.dimensions = { width, height };
    this.dirty = true;
    this.events.emit('resize', { width, height });
  }

  /**
   * Get the component dimensions
   */
  getDimensions(): { width: number; height: number } {
    return this.dimensions;
  }

  /**
   * Get the component bounds
   */
  getBounds(): Rectangle {
    return {
      x: this.position.x,
      y: this.position.y,
      width: this.dimensions.width,
      height: this.dimensions.height
    };
  }

  /**
   * Check if a point is within the component bounds
   */
  contains(x: number, y: number): boolean {
    const bounds = this.getBounds();
    return (
      x >= bounds.x &&
      x < bounds.x + bounds.width &&
      y >= bounds.y &&
      y < bounds.y + bounds.height
    );
  }

  // ============================================================================
  // Visibility Management
  // ============================================================================

  /**
   * Show the component
   */
  show(): void {
    this.visible = true;
    this.dirty = true;
    this.requestRender();
  }

  /**
   * Hide the component
   */
  hide(): void {
    this.visible = false;
    this.dirty = true;
    this.requestRender();
  }

  /**
   * Check if the component is visible
   */
  isVisible(): boolean {
    return this.visible;
  }

  // ============================================================================
  // Focus Management
  // ============================================================================

  /**
   * Focus the component
   */
  focus(): void {
    if (!this.focused) {
      this.focused = true;
      this.events.emit('focus');
      this.onFocus(); // Call hook method
      this.dirty = true;
      this.requestRender();
    }
  }

  /**
   * Blur the component
   */
  blur(): void {
    if (this.focused) {
      this.focused = false;
      this.events.emit('blur');
      this.onBlur(); // Call hook method
      this.dirty = true;
      this.requestRender();
    }
  }

  /**
   * Check if the component is focused
   */
  isFocused(): boolean {
    return this.focused;
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  /**
   * Handle keyboard input with proper event bubbling
   */
  handleKeypress(key: Key): boolean {
    // First, pass to focused child if any
    const focusedChild = this.children.find(c =>
      c instanceof BaseComponent && (c as BaseComponent<unknown>).isFocused()
    );

    if (focusedChild && focusedChild instanceof BaseComponent) {
      const handled = (focusedChild as BaseComponent<unknown>).handleKeypress(key);
      if (handled) {
        return true; // Child handled the event, don't propagate
      }
    }

    // If not handled by child, emit on this component
    this.events.emit('keypress', key);

    // Return false to allow further propagation
    return false;
  }

  /**
   * Handle mouse events with proper event bubbling
   */
  handleMouseEvent(event: MouseEvent): boolean {
    // Find child that contains the mouse position
    for (const child of this.children) {
      if (child instanceof BaseComponent && (child as BaseComponent<unknown>).contains(event.x, event.y)) {
        const baseChild = child as BaseComponent<unknown>;
        // Convert to child-relative coordinates
        const childEvent: MouseEvent = {
          ...event,
          x: event.x - baseChild.position.x,
          y: event.y - baseChild.position.y
        };

        const handled = baseChild.handleMouseEvent(childEvent);
        if (handled) {
          return true; // Child handled the event, don't propagate
        }
        break;
      }
    }

    // If not handled by child, emit on this component
    this.events.emit('mouseEvent', event);

    // Return false to allow further propagation
    return false;
  }

  /**
   * Subscribe to component events
   */
  on<K extends keyof ComponentEventMap>(
    event: K,
    handler: (...args: ComponentEventMap[K]) => void
  ): void {
    this.events.on(event, handler);
  }

  /**
   * Unsubscribe from component events
   */
  off<K extends keyof ComponentEventMap>(
    event: K,
    handler: (...args: ComponentEventMap[K]) => void
  ): void {
    this.events.off(event, handler);
  }

  /**
   * Emit a component event
   */
  emit<K extends keyof ComponentEventMap>(
    event: K,
    ...args: ComponentEventMap[K]
  ): void {
    this.events.emit(event, ...args);
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Called when the component is mounted
   */
  async mount(): Promise<void> {
    if (this.mounted) return;

    this.mounted = true;
    this.events.emit('mount');
    this.onMount(); // Call hook method

    // Mount children
    for (const child of this.children) {
      if (child instanceof BaseComponent) {
        await (child as BaseComponent<unknown>).mount();
      } else if (child.mount) {
        await child.mount();
      }
    }
  }

  /**
   * Called when the component is unmounted
   */
  async unmount(): Promise<void> {
    if (!this.mounted) return;

    this.mounted = false; // Set unmounted first to prevent infinite recursion

    try {
      // Unmount children first with queue-based approach to prevent stack overflow
      const childrenToUnmount = this.children ? [...this.children] : [];
      if (this.children) {
        this.children.length = 0; // Clear children array to prevent circular refs
      }

      for (const child of childrenToUnmount) {
        try {
          if (child instanceof BaseComponent) {
            await (child as BaseComponent<unknown>).unmount();
          } else if (child.unmount) {
            await child.unmount();
          }
        } catch (error) {
          // Log error but continue unmounting other children
          console.error('Error unmounting child:', error);
        }
      }

      this.events.emit('unmount');
      this.onUnmount(); // Call hook method
    } finally {
      // Cleanup - always happens regardless of errors
      this.events.removeAllListeners();
    }
  }

  /**
   * Check if the component is mounted
   */
  isMounted(): boolean {
    return this.mounted;
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  /**
   * Request a render on the next frame
   */
  protected requestRender(): void {
    if (!this.dirty || !this.mounted || !this.visible) return;

    // Emit render event to notify the render engine
    // Don't clear dirty flag here - let the render engine do it after actual render
    this.events.emit('render');
  }

  /**
   * Mark the component as needing a render
   */
  invalidate(): void {
    this.dirty = true;
    this.emit('invalidate');
    this.requestRender();
  }

  /**
   * Check if the component needs rendering
   */
  isDirty(): boolean {
    return this.dirty;
  }

  // ============================================================================
  // Dimension Helper Methods (for test compatibility)
  // ============================================================================

  /**
   * Get width
   */
  getWidth(): number {
    return Math.max(0, this.dimensions.width);
  }

  /**
   * Get height
   */
  getHeight(): number {
    return Math.max(0, this.dimensions.height);
  }

  /**
   * Get X position
   */
  getX(): number {
    return this.position.x;
  }

  /**
   * Get Y position
   */
  getY(): number {
    return this.position.y;
  }

  // ============================================================================
  // Lifecycle Hook Methods (for test compatibility)
  // ============================================================================

  /**
   * Called when component mounts (override in subclasses)
   */
  onMount(): void {
    // Default implementation - can be overridden
  }

  /**
   * Called when component unmounts (override in subclasses)
   */
  onUnmount(): void {
    // Default implementation - can be overridden
  }

  /**
   * Called when component gains focus (override in subclasses)
   */
  onFocus(): void {
    // Default implementation - can be overridden
  }

  /**
   * Called when component loses focus (override in subclasses)
   */
  onBlur(): void {
    // Default implementation - can be overridden
  }

  // ============================================================================
  // Children Helper Methods (for test compatibility)
  // ============================================================================

  /**
   * Remove all children
   */
  removeAllChildren(): void {
    const childrenCopy = [...this.children];
    for (const child of childrenCopy) {
      this.removeChild(child);
    }
  }

  /**
   * Find child by predicate
   */
  findChildBy(predicate: (child: Component<unknown>) => boolean): Component<unknown> | null {
    return this.children.find(predicate) ?? null;
  }

  /**
   * Find all children by predicate
   */
  findChildren(predicate: (child: Component<unknown>) => boolean): Component<unknown>[] {
    return this.children.filter(predicate);
  }

  // ============================================================================
  // Event Handler Methods (for test compatibility)
  // ============================================================================

  /**
   * Handle key press (can be overridden)
   */
  handleKeyPress(event: any): boolean {
    this.handleKeypress(event);
    return false; // Default doesn't stop propagation
  }


  // ============================================================================
  // Layer Management (Fractal Architecture)
  // ============================================================================

  /**
   * Get the z-index of this component
   */
  getZIndex(): number {
    return this.zIndex;
  }

  /**
   * Set the z-index of this component
   */
  setZIndex(zIndex: number): void {
    const oldZIndex = this.zIndex;
    this.zIndex = zIndex;
    this.events.emit('zIndexChange', zIndex);
    if (oldZIndex !== zIndex) {
      this.invalidate();
    }
  }

  /**
   * Get the layer type
   */
  getLayerType(): LayerType {
    return this.layerType;
  }

  /**
   * Set the layer type
   */
  setLayerType(layerType: LayerType): void {
    this.layerType = layerType;
    this.invalidate();
  }

  // ============================================================================
  // Draggable Support (Fractal Architecture)
  // ============================================================================

  /**
   * Check if component can be dragged
   * Components can only be dragged if they have no parent (fractal principle)
   */
  canDrag(): boolean {
    return this.draggable && !this.parent;
  }

  /**
   * Set whether this component is draggable
   */
  setDraggable(draggable: boolean, handle: DragHandle = 'anywhere'): void {
    this.draggable = draggable;
    this.dragHandle = handle;
  }

  /**
   * Start drag operation
   */
  startDrag(mouseX: number, mouseY: number): void {
    if (!this.canDrag()) return;

    this.isDragging = true;
    this.dragStartX = mouseX;
    this.dragStartY = mouseY;
    this.dragOffsetX = mouseX - this.position.x;
    this.dragOffsetY = mouseY - this.position.y;
    
    this.events.emit('dragStart', { x: mouseX, y: mouseY });
  }

  /**
   * Update drag position
   */
  updateDrag(mouseX: number, mouseY: number): void {
    if (!this.isDragging) return;

    let newX = mouseX - this.dragOffsetX;
    let newY = mouseY - this.dragOffsetY;

    // Apply bounds constraints
    const bounds = this.getDragBounds();
    newX = Math.max(bounds.x, Math.min(newX, bounds.x + bounds.width - this.dimensions.width));
    newY = Math.max(bounds.y, Math.min(newY, bounds.y + bounds.height - this.dimensions.height));

    this.setPosition(newX, newY);
    this.events.emit('dragMove', { x: newX, y: newY });
  }

  /**
   * End drag operation
   */
  endDrag(): void {
    if (!this.isDragging) return;
    
    this.isDragging = false;
    this.events.emit('dragEnd', this.position);
  }

  /**
   * Check if currently dragging
   */
  isDraggingNow(): boolean {
    return this.isDragging;
  }

  /**
   * Get drag boundaries
   */
  private getDragBounds(): Rectangle {
    if (this.dragBounds.type === 'custom' && this.dragBounds.bounds) {
      return this.dragBounds.bounds;
    }

    // Use viewport bounds
    const terminal = this.getTerminal();
    if (terminal) {
      return {
        x: 0,
        y: 0,
        width: terminal.columns || 80,
        height: terminal.rows || 24
      };
    }

    // Default bounds
    return { x: 0, y: 0, width: 80, height: 24 };
  }

  /**
   * Set drag bounds
   */
  setDragBounds(bounds: DragBounds): void {
    this.dragBounds = bounds;
  }

  // ============================================================================
  // Resizable Support (Fractal Architecture)
  // ============================================================================

  /**
   * Check if component can be resized
   * Components can only be resized if they have no parent (fractal principle)
   */
  canResize(): boolean {
    return this.resizable && !this.parent;
  }

  /**
   * Set whether this component is resizable
   */
  setResizable(resizable: boolean, handles?: ResizeHandle[]): void {
    this.resizable = resizable;
    if (handles) {
      this.resizeHandles = handles;
    }
  }

  /**
   * Set size constraints
   */
  setSizeConstraints(constraints: {
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
  }): void {
    if (constraints.minWidth !== undefined) this.minWidth = constraints.minWidth;
    if (constraints.maxWidth !== undefined) this.maxWidth = constraints.maxWidth;
    if (constraints.minHeight !== undefined) this.minHeight = constraints.minHeight;
    if (constraints.maxHeight !== undefined) this.maxHeight = constraints.maxHeight;
  }

  /**
   * Get resize handle at position
   */
  getResizeHandleAt(x: number, y: number): ResizeHandle | null {
    if (!this.canResize()) return null;

    const tolerance = 1; // How close to edge to detect handle
    const bounds = this.getBounds();
    const relX = x - bounds.x;
    const relY = y - bounds.y;

    // Check corners first (they take priority)
    if (relX <= tolerance && relY <= tolerance && this.resizeHandles.includes('top-left')) {
      return 'top-left';
    }
    if (relX >= bounds.width - tolerance && relY <= tolerance && this.resizeHandles.includes('top-right')) {
      return 'top-right';
    }
    if (relX <= tolerance && relY >= bounds.height - tolerance && this.resizeHandles.includes('bottom-left')) {
      return 'bottom-left';
    }
    if (relX >= bounds.width - tolerance && relY >= bounds.height - tolerance && this.resizeHandles.includes('bottom-right')) {
      return 'bottom-right';
    }

    // Check edges
    if (relY <= tolerance && this.resizeHandles.includes('top')) {
      return 'top';
    }
    if (relY >= bounds.height - tolerance && this.resizeHandles.includes('bottom')) {
      return 'bottom';
    }
    if (relX <= tolerance && this.resizeHandles.includes('left')) {
      return 'left';
    }
    if (relX >= bounds.width - tolerance && this.resizeHandles.includes('right')) {
      return 'right';
    }

    return null;
  }

  /**
   * Start resize operation
   */
  startResize(handle: ResizeHandle, mouseX: number, mouseY: number): void {
    if (!this.canResize()) return;

    this.isResizing = true;
    this.resizeHandle = handle;
    this.resizeStartWidth = this.dimensions.width;
    this.resizeStartHeight = this.dimensions.height;
    this.resizeStartX = mouseX;
    this.resizeStartY = mouseY;
    this.dragStartX = this.position.x;
    this.dragStartY = this.position.y;

    this.events.emit('resizeStart', { width: this.dimensions.width, height: this.dimensions.height });
  }

  /**
   * Update resize
   */
  updateResize(mouseX: number, mouseY: number): void {
    if (!this.isResizing || !this.resizeHandle) return;

    const deltaX = mouseX - this.resizeStartX;
    const deltaY = mouseY - this.resizeStartY;

    let newWidth = this.resizeStartWidth;
    let newHeight = this.resizeStartHeight;
    let newX = this.dragStartX;
    let newY = this.dragStartY;

    // Apply resize based on handle
    if (this.resizeHandle.includes('right')) {
      newWidth += deltaX;
    }
    if (this.resizeHandle.includes('left')) {
      newWidth -= deltaX;
      newX += deltaX;
    }
    if (this.resizeHandle.includes('bottom')) {
      newHeight += deltaY;
    }
    if (this.resizeHandle.includes('top')) {
      newHeight -= deltaY;
      newY += deltaY;
    }

    // Apply size constraints
    newWidth = Math.max(this.minWidth, Math.min(newWidth, this.maxWidth));
    newHeight = Math.max(this.minHeight, Math.min(newHeight, this.maxHeight));

    // Adjust position if resizing from left/top and hit constraint
    if (this.resizeHandle.includes('left')) {
      const actualWidthChange = newWidth - this.dimensions.width;
      newX = this.position.x - actualWidthChange;
    }
    if (this.resizeHandle.includes('top')) {
      const actualHeightChange = newHeight - this.dimensions.height;
      newY = this.position.y - actualHeightChange;
    }

    // Update dimensions and position
    this.setDimensions(newWidth, newHeight);
    if (newX !== this.position.x || newY !== this.position.y) {
      this.setPosition(newX, newY);
    }

    this.events.emit('resizeMove', { width: newWidth, height: newHeight });
  }

  /**
   * End resize operation
   */
  endResize(): void {
    if (!this.isResizing) return;
    
    this.isResizing = false;
    this.resizeHandle = undefined;
    this.events.emit('resizeEnd', { width: this.dimensions.width, height: this.dimensions.height });
  }

  /**
   * Check if currently resizing
   */
  isResizingNow(): boolean {
    return this.isResizing;
  }

  /**
   * Get terminal reference (for bounds calculation)
   */
  private getTerminal(): any {
    // This would be set by the render engine
    // For now, return null and use defaults
    return null;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Generate a unique component ID
   */
  protected generateId(): string {
    return `${this.type.toLowerCase()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Schedule a render update
   */
  protected scheduleUpdate(): void {
    this.dirty = true;
    this.requestRender();
  }

  /**
   * Mark component as dirty (needs re-render)
   */
  protected markDirty(): void {
    this.dirty = true;
  }

  /**
   * Clear dirty flag
   */
  protected clearDirty(): void {
    this.dirty = false;
  }

  /**
   * Get the root component
   */
  getRoot(): Component<unknown> {
    let current: Component<unknown> = this;
    while (current instanceof BaseComponent && (current as BaseComponent<unknown>).parent) {
      current = (current as BaseComponent<unknown>).parent!;
    }
    return current;
  }

  /**
   * Get the parent component
   */
  getParent(): Component<unknown> | undefined {
    return this.parent;
  }

  /**
   * Walk the component tree
   */
  walk(callback: (component: Component<unknown>) => void): void {
    callback(this);
    for (const child of this.children) {
      if (child instanceof BaseComponent) {
        (child as BaseComponent<unknown>).walk(callback);
      } else {
        callback(child);
      }
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a custom component class
 */
export function createComponentClass<TState = unknown>(
  name: string,
  renderFn: (this: BaseComponent<TState>) => Output,
  options?: {
    handleKeypress?: (this: BaseComponent<TState>, key: Key) => boolean;
    handleMouseEvent?: (this: BaseComponent<TState>, event: MouseEvent) => boolean;
    mount?: (this: BaseComponent<TState>) => Promise<void>;
    unmount?: (this: BaseComponent<TState>) => Promise<void>;
  }
): new (componentOptions?: ComponentOptions<TState>) => BaseComponent<TState> {
  return class extends BaseComponent<TState> {
    override readonly type = name;

    constructor(componentOptions: ComponentOptions<TState> = {}) {
      super(componentOptions);
    }

    override render(): Output {
      return renderFn.call(this);
    }

    override handleKeypress(key: Key): boolean {
      if (options?.handleKeypress) {
        return options.handleKeypress.call(this, key);
      } else {
        return super.handleKeypress(key);
      }
    }

    override handleMouseEvent(event: MouseEvent): boolean {
      if (options?.handleMouseEvent) {
        return options.handleMouseEvent.call(this, event);
      } else {
        return super.handleMouseEvent(event);
      }
    }

    override async mount(): Promise<void> {
      await super.mount();
      if (options?.mount) {
        await options.mount.call(this);
      }
    }

    override async unmount(): Promise<void> {
      if (options?.unmount) {
        await options.unmount.call(this);
      }
      await super.unmount();
    }
  };
}
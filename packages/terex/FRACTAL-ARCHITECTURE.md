# Fractal Architecture: zIndex, Draggable, and Resizable

## Core Principle
**Everything is a component** - dragging, resizing, and layering are **base properties** of all components, not special component types.

## Architecture Design

### 1. BaseComponent Enhanced Properties
Every component inherits these properties:

```typescript
interface BaseComponentProperties {
  // Layer Management
  zIndex: number;           // Default: 0
  layerType?: LayerType;    // 'base' | 'modal' | 'overlay' | 'notification' | 'tooltip'
  
  // Draggable Properties
  draggable: boolean;       // Default: false
  dragHandle?: 'title' | 'anywhere' | 'custom'; // Where to grab for dragging
  dragBounds?: 'parent' | 'viewport' | Rectangle; // Movement constraints
  dragStarted?: boolean;    // Internal state
  dragOffset?: Position;    // Internal state
  
  // Resizable Properties  
  resizable: boolean;       // Default: false
  resizeHandles?: ResizeHandle[]; // Which edges/corners can resize
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  
  // Constraints
  canDrag(): boolean;       // Returns true only if no parent
  canResize(): boolean;     // Returns true only if no parent
}
```

### 2. LayerManager Integration with RenderEngine

The LayerManager becomes part of the RenderEngine, not a separate component:

```typescript
class RenderEngine {
  private layerManager: LayerManager;
  
  // During render, components are sorted by zIndex
  private performRender(): void {
    const sortedComponents = this.layerManager.getSortedComponents();
    
    // Render from lowest to highest zIndex
    for (const component of sortedComponents) {
      if (component.isVisible()) {
        const output = component.render();
        this.applyOutputAtLayer(output, component.zIndex);
      }
    }
  }
  
  // Handle mouse events with layer awareness
  private handleMouseEvent(event: MouseEvent): void {
    // Hit test from highest to lowest zIndex
    const hit = this.layerManager.hitTest(event.x, event.y);
    
    if (hit) {
      // Handle dragging if component is draggable
      if (hit.draggable && hit.canDrag()) {
        this.handleDragOperation(hit, event);
      }
      // Handle resizing if component is resizable
      else if (hit.resizable && hit.canResize()) {
        this.handleResizeOperation(hit, event);
      }
      // Otherwise pass to component
      else {
        hit.handleMouseEvent(event);
      }
    }
  }
}
```

### 3. Component Drag & Resize Implementation

```typescript
class BaseComponent {
  // Properties
  protected zIndex = 0;
  protected draggable = false;
  protected resizable = false;
  protected minWidth = 1;
  protected maxWidth = Infinity;
  protected minHeight = 1;
  protected maxHeight = Infinity;
  
  // Drag state
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  
  // Resize state  
  private isResizing = false;
  private resizeHandle?: ResizeHandle;
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;
  
  // Check if can be dragged (only when no parent)
  canDrag(): boolean {
    return this.draggable && !this.parent;
  }
  
  // Check if can be resized (only when no parent)
  canResize(): boolean {
    return this.resizable && !this.parent;
  }
  
  // Start drag operation
  startDrag(mouseX: number, mouseY: number): void {
    if (!this.canDrag()) return;
    
    this.isDragging = true;
    this.dragStartX = mouseX;
    this.dragStartY = mouseY;
    this.dragOffsetX = mouseX - this.position.x;
    this.dragOffsetY = mouseY - this.position.y;
  }
  
  // Update drag position
  updateDrag(mouseX: number, mouseY: number): void {
    if (!this.isDragging) return;
    
    let newX = mouseX - this.dragOffsetX;
    let newY = mouseY - this.dragOffsetY;
    
    // Apply bounds constraints
    const bounds = this.getDragBounds();
    newX = Math.max(bounds.x, Math.min(newX, bounds.x + bounds.width - this.dimensions.width));
    newY = Math.max(bounds.y, Math.min(newY, bounds.y + bounds.height - this.dimensions.height));
    
    this.setPosition(newX, newY);
  }
  
  // End drag operation
  endDrag(): void {
    this.isDragging = false;
  }
  
  // Get drag boundaries
  private getDragBounds(): Rectangle {
    // If in terminal, use terminal bounds
    const terminal = this.getTerminal();
    if (terminal) {
      return {
        x: 0,
        y: 0,
        width: terminal.columns,
        height: terminal.rows
      };
    }
    
    // Default to reasonable bounds
    return { x: 0, y: 0, width: 80, height: 24 };
  }
  
  // Start resize operation
  startResize(handle: ResizeHandle, mouseX: number, mouseY: number): void {
    if (!this.canResize()) return;
    
    this.isResizing = true;
    this.resizeHandle = handle;
    this.resizeStartWidth = this.dimensions.width;
    this.resizeStartHeight = this.dimensions.height;
    this.dragStartX = mouseX;
    this.dragStartY = mouseY;
  }
  
  // Update resize
  updateResize(mouseX: number, mouseY: number): void {
    if (!this.isResizing || !this.resizeHandle) return;
    
    const deltaX = mouseX - this.dragStartX;
    const deltaY = mouseY - this.dragStartY;
    
    let newWidth = this.resizeStartWidth;
    let newHeight = this.resizeStartHeight;
    let newX = this.position.x;
    let newY = this.position.y;
    
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
    
    // Update dimensions and position
    this.setDimensions(newWidth, newHeight);
    if (newX !== this.position.x || newY !== this.position.y) {
      this.setPosition(newX, newY);
    }
  }
  
  // End resize operation
  endResize(): void {
    this.isResizing = false;
    this.resizeHandle = undefined;
  }
}
```

### 4. Removal of Special Components

The following components should be refactored or removed:
- `DraggablePanel` - Should just be a regular Box/Panel with `draggable: true`
- Special layer components - All components now have zIndex

### 5. Usage Examples

```typescript
// Creating a draggable window
const window = new Box({
  title: 'My Window',
  draggable: true,
  resizable: true,
  zIndex: 10,
  minWidth: 20,
  minHeight: 10,
  maxWidth: 60,
  maxHeight: 30
});

// Creating a modal overlay
const modal = new Box({
  layerType: 'modal',
  zIndex: 1000, // Or auto-calculated based on layerType
  draggable: false,
  resizable: false
});

// Creating a tooltip
const tooltip = new Text({
  content: 'Tooltip text',
  layerType: 'tooltip',
  zIndex: 2000,
  draggable: false
});
```

### 6. Benefits of This Architecture

1. **True Fractal Design**: Every component has the same capabilities
2. **Simplified Mental Model**: No special "draggable" components
3. **Proper Separation**: Layout managers handle positioned children, only free components can drag/resize
4. **Performance**: LayerManager at render engine level enables optimizations
5. **Consistency**: All components follow the same patterns

### 7. Migration Path

1. Add new properties to BaseComponent
2. Integrate LayerManager into RenderEngine
3. Add drag/resize handling to RenderEngine mouse event processing
4. Deprecate DraggablePanel
5. Update all components to use new properties
6. Remove old layer-specific components

## Implementation Priority

1. **Phase 1**: Add zIndex property and layer sorting in RenderEngine
2. **Phase 2**: Add draggable property and basic drag handling
3. **Phase 3**: Add resizable property and resize handling
4. **Phase 4**: Add constraints and boundaries
5. **Phase 5**: Migrate existing components and remove deprecated ones
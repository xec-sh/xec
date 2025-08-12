/**
 * Layout Module
 * Advanced layout system with flex, grid, and other layout types
 */

import { x, y, cols, rows } from '../types.js';

import type { X, Y, Cols, Rows, Rectangle } from '../types.js';

// Re-export for convenience
export { x, y, cols, rows } from '../types.js';
export type { Rectangle } from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface LayoutEngine {
  // Layout creation
  createLayout(type: LayoutType, options?: LayoutOptions): Layout;

  // Global constraints
  setViewport(rect: Rectangle): void;
  readonly viewport: Rectangle;

  // Layout management
  readonly layouts: Map<string, Layout>;
  addLayout(name: string, layout: Layout): void;
  removeLayout(name: string): void;
  getLayout(name: string): Layout | undefined;
}

export interface Layout {
  readonly type: LayoutType;
  readonly bounds: Rectangle;
  readonly children: ReadonlyArray<{ item: LayoutItem; constraints?: LayoutConstraints }>;

  // Child management
  add(child: LayoutItem, constraints?: LayoutConstraints): void;
  remove(child: LayoutItem): void;
  clear(): void;

  // Layout calculation
  measure(availableSpace: Size): Size;
  arrange(finalRect: Rectangle): void;

  // Invalidation
  invalidate(): void;
  readonly needsLayout: boolean;
}

export enum LayoutType {
  Absolute = 'absolute',
  Flex = 'flex',
  Grid = 'grid',
  Stack = 'stack',
  Dock = 'dock',
  Wrap = 'wrap'
}

export interface LayoutOptions {
  padding?: Spacing | number;
  margin?: Spacing | number;
  gap?: number;
}

export interface FlexLayout extends Layout {
  direction: FlexDirection;
  justifyContent: JustifyContent;
  alignItems: AlignItems;
  gap: number;
  wrap: boolean;
}

export interface GridLayout extends Layout {
  columns: GridTrack[] | number;
  rows: GridTrack[] | number;
  gap: number;
  autoFlow: GridAutoFlow;
}

export type GridTrack =
  | { type: 'fixed'; size: number }
  | { type: 'fraction'; size: number }
  | { type: 'auto' }
  | { type: 'minmax'; min: number; max: number };

export type GridAutoFlow = 'row' | 'column' | 'dense';

export interface LayoutConstraints {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  flex?: number;
  alignSelf?: AlignItems;
  margin?: Spacing;
  padding?: Spacing;

  // Grid-specific
  gridColumn?: GridPlacement;
  gridRow?: GridPlacement;

  // Dock-specific
  dock?: DockPosition;

  // Absolute-specific
  position?: Position;
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
}

export type FlexDirection = 'row' | 'column' | 'row-reverse' | 'column-reverse';

export type JustifyContent =
  | 'flex-start'
  | 'flex-end'
  | 'center'
  | 'space-between'
  | 'space-around'
  | 'space-evenly';

export type AlignItems =
  | 'flex-start'
  | 'flex-end'
  | 'center'
  | 'stretch'
  | 'baseline';

export type DockPosition = 'top' | 'right' | 'bottom' | 'left' | 'fill';

export type Position = 'relative' | 'absolute';

export interface GridPlacement {
  start?: number;
  end?: number;
  span?: number;
}

export interface Spacing {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface Size {
  width: Cols;
  height: Rows;
}

export interface LayoutItem {
  readonly bounds: Rectangle;
  measure(availableSpace: Size): Size;
  arrange(finalRect: Rectangle): void;
}

// ============================================================================
// Spacing Helpers
// ============================================================================

function normalizeSpacing(spacing?: Spacing | number): Required<Spacing> {
  if (typeof spacing === 'number') {
    return { top: spacing, right: spacing, bottom: spacing, left: spacing };
  }
  return {
    top: spacing?.top ?? 0,
    right: spacing?.right ?? 0,
    bottom: spacing?.bottom ?? 0,
    left: spacing?.left ?? 0
  };
}

function applySpacing(rect: Rectangle, spacing: Required<Spacing>): Rectangle {
  return {
    x: x(rect.x + spacing.left),
    y: y(rect.y + spacing.top),
    width: cols(Math.max(0, rect.width - spacing.left - spacing.right)),
    height: rows(Math.max(0, rect.height - spacing.top - spacing.bottom))
  };
}

// ============================================================================
// Base Layout Implementation
// ============================================================================

abstract class BaseLayout implements Layout {
  readonly type: LayoutType;
  bounds: Rectangle;
  protected _children: Array<{ item: LayoutItem; constraints?: LayoutConstraints }> = [];
  protected _needsLayout = true;
  protected padding: Required<Spacing>;
  protected margin: Required<Spacing>;
  gap: number;

  get children(): ReadonlyArray<{ item: LayoutItem; constraints?: LayoutConstraints }> {
    return this._children;
  }

  constructor(type: LayoutType, options?: LayoutOptions) {
    this.type = type;
    this.bounds = { x: x(0), y: y(0), width: cols(0), height: rows(0) };
    this.padding = normalizeSpacing(options?.padding);
    this.margin = normalizeSpacing(options?.margin);
    this.gap = options?.gap ?? 0;
  }

  get needsLayout(): boolean {
    return this._needsLayout;
  }

  add(child: LayoutItem, constraints?: LayoutConstraints): void {
    this._children.push({ item: child, constraints });
    this.invalidate();
  }

  remove(child: LayoutItem): void {
    const index = this._children.findIndex(c => c.item === child);
    if (index !== -1) {
      this._children.splice(index, 1);
      this.invalidate();
    }
  }

  clear(): void {
    this._children = [];
    this.invalidate();
  }

  invalidate(): void {
    this._needsLayout = true;
  }

  abstract measure(availableSpace: Size): Size;
  abstract arrange(finalRect: Rectangle): void;
}

// ============================================================================
// Absolute Layout Implementation
// ============================================================================

class AbsoluteLayout extends BaseLayout {
  constructor(options?: LayoutOptions) {
    super(LayoutType.Absolute, options);
  }

  measure(availableSpace: Size): Size {
    let maxWidth = 0;
    let maxHeight = 0;

    for (const { item, constraints } of this._children) {
      const childSize = item.measure(availableSpace);

      const left = constraints?.left ?? 0;
      const top = constraints?.top ?? 0;

      maxWidth = Math.max(maxWidth, left + childSize.width);
      maxHeight = Math.max(maxHeight, top + childSize.height);
    }

    return {
      width: cols(maxWidth + this.padding.left + this.padding.right),
      height: rows(maxHeight + this.padding.top + this.padding.bottom)
    };
  }

  arrange(finalRect: Rectangle): void {
    this.bounds = finalRect;
    const contentRect = applySpacing(finalRect, this.padding);

    for (const { item, constraints } of this._children) {
      const left = constraints?.left ?? 0;
      const top = constraints?.top ?? 0;
      const right = constraints?.right;
      const bottom = constraints?.bottom;

      let width: number;
      let height: number;
      let posX: number;
      let posY: number;

      if (right !== undefined && left !== undefined) {
        posX = contentRect.x + left;
        width = contentRect.width - left - right;
      } else if (right !== undefined) {
        const childSize = item.measure({ width: contentRect.width, height: contentRect.height });
        width = childSize.width;
        posX = contentRect.x + contentRect.width - right - width;
      } else {
        posX = contentRect.x + left;
        const childSize = item.measure({ width: contentRect.width, height: contentRect.height });
        width = childSize.width;
      }

      if (bottom !== undefined && top !== undefined) {
        posY = contentRect.y + top;
        height = contentRect.height - top - bottom;
      } else if (bottom !== undefined) {
        const childSize = item.measure({ width: contentRect.width, height: contentRect.height });
        height = childSize.height;
        posY = contentRect.y + contentRect.height - bottom - height;
      } else {
        posY = contentRect.y + top;
        const childSize = item.measure({ width: contentRect.width, height: contentRect.height });
        height = childSize.height;
      }

      item.arrange({
        x: posX as X,
        y: posY as Y,
        width: cols(width),
        height: rows(height)
      });
    }

    this._needsLayout = false;
  }
}

// ============================================================================
// Flex Layout Implementation
// ============================================================================

class FlexLayoutImpl extends BaseLayout implements FlexLayout {
  direction: FlexDirection = 'row';
  justifyContent: JustifyContent = 'flex-start';
  alignItems: AlignItems = 'stretch';
  wrap = false;

  constructor(options?: LayoutOptions & Partial<FlexLayout>) {
    super(LayoutType.Flex, options);
    if (options?.direction) this.direction = options.direction;
    if (options?.justifyContent) this.justifyContent = options.justifyContent;
    if (options?.alignItems) this.alignItems = options.alignItems;
    if (options?.wrap !== undefined) this.wrap = options.wrap;
  }

  measure(availableSpace: Size): Size {
    const isRow = this.direction === 'row' || this.direction === 'row-reverse';
    const mainSize = isRow ? availableSpace.width : availableSpace.height;
    const crossSize = isRow ? availableSpace.height : availableSpace.width;

    let totalMainSize = 0;
    let maxCrossSize = 0;
    let totalFlex = 0;

    // Measure children
    const childSizes: Size[] = [];
    for (const { item, constraints } of this._children) {
      const flex = constraints?.flex ?? 0;
      totalFlex += flex;

      // Calculate available space for flex children
      const childAvailableSpace = flex > 0 && totalFlex > 0
        ? {
          width: isRow ? cols(Math.floor((mainSize * flex) / totalFlex)) : availableSpace.width,
          height: !isRow ? rows(Math.floor((mainSize * flex) / totalFlex)) : availableSpace.height
        }
        : availableSpace;

      const childSize = item.measure(childAvailableSpace);
      childSizes.push(childSize);

      if (flex === 0) {
        totalMainSize += isRow ? childSize.width : childSize.height;
      }

      const crossChildSize = isRow ? childSize.height : childSize.width;
      maxCrossSize = Math.max(maxCrossSize, Math.min(crossChildSize, crossSize));
    }

    // Add gaps
    if (this._children.length > 1) {
      totalMainSize += this.gap * (this._children.length - 1);
    }

    // Calculate final size - use available space for flex layouts
    const finalMainSize = totalFlex > 0
      ? mainSize
      : Math.max(totalMainSize, isRow ? this.padding.left + this.padding.right : this.padding.top + this.padding.bottom);
    const finalCrossSize = maxCrossSize + (isRow ? this.padding.top + this.padding.bottom : this.padding.left + this.padding.right);

    return isRow
      ? { width: cols(finalMainSize), height: rows(finalCrossSize) }
      : { width: cols(finalCrossSize), height: rows(finalMainSize) };
  }

  arrange(finalRect: Rectangle): void {
    this.bounds = finalRect;
    const contentRect = applySpacing(finalRect, this.padding);

    const isRow = this.direction === 'row' || this.direction === 'row-reverse';
    const isReverse = this.direction === 'row-reverse' || this.direction === 'column-reverse';

    const mainSize = isRow ? contentRect.width : contentRect.height;
    const crossSize = isRow ? contentRect.height : contentRect.width;

    // Calculate flex distribution
    let totalFlex = 0;
    let totalFixedSize = 0;
    const childSizes: Size[] = [];

    for (const { item, constraints } of this._children) {
      const flex = constraints?.flex ?? 0;
      totalFlex += flex;

      const childSize = item.measure({ width: contentRect.width, height: contentRect.height });
      childSizes.push(childSize);

      if (flex === 0) {
        totalFixedSize += isRow ? childSize.width : childSize.height;
      }
    }

    // Add gaps to fixed size
    if (this._children.length > 1) {
      totalFixedSize += this.gap * (this._children.length - 1);
    }

    const remainingSpace = Math.max(0, mainSize - totalFixedSize);
    const flexUnit = totalFlex > 0 ? remainingSpace / totalFlex : 0;

    // Calculate positions based on justifyContent
    let mainPos = 0;
    let spacing = 0;

    switch (this.justifyContent) {
      case 'flex-end':
        mainPos = mainSize - totalFixedSize;
        break;
      case 'center':
        mainPos = (mainSize - totalFixedSize) / 2;
        break;
      case 'space-between':
        spacing = this._children.length > 1 ? remainingSpace / (this._children.length - 1) : 0;
        break;
      case 'space-around':
        spacing = remainingSpace / this._children.length;
        mainPos = spacing / 2;
        break;
      case 'space-evenly':
        spacing = remainingSpace / (this._children.length + 1);
        mainPos = spacing;
        break;
      case 'flex-start':
      default:
        // flex-start is the default - mainPos and spacing already initialized to 0
        break;
    }

    // Arrange children
    const childrenToArrange = isReverse ? [...this._children].reverse() : this._children;

    for (let i = 0; i < childrenToArrange.length; i++) {
      const { item, constraints } = childrenToArrange[i];
      const childSize = childSizes[i];
      const flex = constraints?.flex ?? 0;

      // Calculate main axis size
      const childMainSize = flex > 0
        ? flexUnit * flex
        : (isRow ? childSize.width : childSize.height);

      // Calculate cross axis size and position
      let childCrossSize = isRow ? childSize.height : childSize.width;
      let crossPos = 0;

      const alignSelf = constraints?.alignSelf ?? this.alignItems;

      switch (alignSelf) {
        case 'flex-end':
          crossPos = crossSize - childCrossSize;
          break;
        case 'center':
          crossPos = (crossSize - childCrossSize) / 2;
          break;
        case 'stretch':
          childCrossSize = crossSize;
          break;
        case 'flex-start':
        case 'baseline':
        default:
          // flex-start and baseline - crossPos already initialized to 0
          break;
      }

      // Apply child margin
      const childMargin = normalizeSpacing(constraints?.margin);

      // Calculate final rectangle
      const childRect: Rectangle = isRow ? {
        x: x(contentRect.x + mainPos + childMargin.left),
        y: y(contentRect.y + crossPos + childMargin.top),
        width: cols(childMainSize - childMargin.left - childMargin.right),
        height: rows(childCrossSize - childMargin.top - childMargin.bottom)
      } : {
        x: x(contentRect.x + crossPos + childMargin.left),
        y: y(contentRect.y + mainPos + childMargin.top),
        width: cols(childCrossSize - childMargin.left - childMargin.right),
        height: rows(childMainSize - childMargin.top - childMargin.bottom)
      };

      item.arrange(childRect);

      // Update main position
      mainPos += childMainSize + this.gap;

      // Add spacing for justify-content
      if (this.justifyContent === 'space-around' || this.justifyContent === 'space-evenly') {
        mainPos += spacing;
      }
    }

    this._needsLayout = false;
  }
}

// ============================================================================
// Grid Layout Implementation
// ============================================================================

class GridLayoutImpl extends BaseLayout implements GridLayout {
  private _columns: GridTrack[] = [];
  private _rows: GridTrack[] = [];
  autoFlow: GridAutoFlow = 'row';

  get columns(): GridTrack[] | number {
    // If all tracks are the same type, return the count
    if (this._columns.length > 0 && this._columns.every(t => t.type === 'fraction' && t.size === 1)) {
      return this._columns.length;
    }
    return this._columns;
  }

  set columns(value: GridTrack[] | number) {
    if (typeof value === 'number') {
      this._columns = Array(value).fill(null).map(() => ({ type: 'fraction' as const, size: 1 }));
    } else {
      this._columns = value;
    }
  }

  get rows(): GridTrack[] | number {
    // If all tracks are auto, return the count
    if (this._rows.length > 0 && this._rows.every(t => t.type === 'auto')) {
      return this._rows.length;
    }
    return this._rows;
  }

  set rows(value: GridTrack[] | number) {
    if (typeof value === 'number') {
      this._rows = Array(value).fill(null).map(() => ({ type: 'auto' as const }));
    } else {
      this._rows = value;
    }
  }

  constructor(options?: LayoutOptions & Partial<GridLayout> & { columns?: number | GridTrack[]; rows?: number | GridTrack[] }) {
    super(LayoutType.Grid, options);

    // Handle simplified columns/rows as numbers
    if (options?.columns !== undefined) {
      this.columns = options.columns;
    }

    if (options?.rows !== undefined) {
      this.rows = options.rows;
    }

    if (options?.autoFlow) this.autoFlow = options.autoFlow;
  }

  measure(availableSpace: Size): Size {
    const { columnSizes, rowSizes } = this.calculateTrackSizes(availableSpace);

    const totalWidth = columnSizes.reduce((sum, size) => sum + size, 0) +
      (columnSizes.length - 1) * this.gap +
      this.padding.left + this.padding.right;

    const totalHeight = rowSizes.reduce((sum, size) => sum + size, 0) +
      (rowSizes.length - 1) * this.gap +
      this.padding.top + this.padding.bottom;

    return {
      width: cols(totalWidth),
      height: rows(totalHeight)
    };
  }

  arrange(finalRect: Rectangle): void {
    this.bounds = finalRect;
    const contentRect = applySpacing(finalRect, this.padding);

    const { columnSizes, rowSizes } = this.calculateTrackSizes({
      width: contentRect.width,
      height: contentRect.height
    });

    // Calculate grid positions
    const columnPositions: number[] = [0];
    let colPos = 0;
    for (let i = 0; i < columnSizes.length; i++) {
      columnPositions[i] = colPos;
      colPos += columnSizes[i] + (i < columnSizes.length - 1 ? this.gap : 0);
    }

    const rowPositions: number[] = [0];
    let rowPos = 0;
    for (let i = 0; i < rowSizes.length; i++) {
      rowPositions[i] = rowPos;
      rowPos += rowSizes[i] + (i < rowSizes.length - 1 ? this.gap : 0);
    }

    // Place children in grid
    const grid: boolean[][] = Array(rowSizes.length)
      .fill(null)
      .map(() => Array(columnSizes.length).fill(false));

    for (const { item, constraints } of this._children) {
      let col = 0;
      let row = 0;
      let colSpan = 1;
      let rowSpan = 1;

      // Handle explicit placement
      if (constraints?.gridColumn) {
        col = (constraints.gridColumn.start ?? 1) - 1;
        colSpan = constraints.gridColumn.span ?? 1;
      } else if (constraints?.gridRow) {
        row = (constraints.gridRow.start ?? 1) - 1;
        rowSpan = constraints.gridRow.span ?? 1;
      } else {
        // Auto-place item
        let placed = false;
        for (let r = 0; r < rowSizes.length && !placed; r++) {
          for (let c = 0; c < columnSizes.length && !placed; c++) {
            if (!grid[r][c]) {
              col = c;
              row = r;
              placed = true;
            }
          }
        }
      }

      // Mark cells as occupied
      for (let r = row; r < Math.min(row + rowSpan, rowSizes.length); r++) {
        for (let c = col; c < Math.min(col + colSpan, columnSizes.length); c++) {
          if (grid[r] && grid[r][c] !== undefined) {
            grid[r][c] = true;
          }
        }
      }

      // Calculate item rectangle
      const itemX = contentRect.x + columnPositions[col];
      const itemY = contentRect.y + rowPositions[row];
      const itemWidth = columnSizes[col];
      const itemHeight = rowSizes[row];

      item.arrange({
        x: x(itemX),
        y: y(itemY),
        width: cols(itemWidth),
        height: rows(itemHeight)
      });
    }

    this._needsLayout = false;
  }

  private calculateTrackSizes(availableSpace: Size): { columnSizes: number[]; rowSizes: number[] } {
    const calculateSizes = (tracks: GridTrack[], availableSize: number): number[] => {
      const sizes: number[] = [];
      let totalFixed = 0;
      let totalFractions = 0;

      // First pass: calculate fixed and auto sizes
      for (const track of tracks) {

        switch (track.type) {
          case 'fixed':
            sizes.push(track.size);
            totalFixed += track.size;
            break;
          case 'auto':
            // For auto, use minimum content size (simplified)
            sizes.push(0);
            break;
          case 'fraction':
            sizes.push(0);
            totalFractions += track.size;
            break;
          case 'minmax':
            sizes.push(track.min);
            totalFixed += track.min;
            break;
          default:
            // Unknown track type - treat as auto
            sizes.push(0);
            break;
        }
      }

      // Second pass: distribute remaining space to fractions
      const remainingSpace = Math.max(0, availableSize - totalFixed - (tracks.length - 1) * this.gap);
      const fractionUnit = totalFractions > 0 ? remainingSpace / totalFractions : 0;

      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        if (track.type === 'fraction') {
          sizes[i] = fractionUnit * track.size;
        } else if (track.type === 'minmax') {
          sizes[i] = Math.min(track.max, Math.max(track.min, sizes[i]));
        }
      }

      return sizes;
    };

    const columnSizes = this._columns.length > 0
      ? calculateSizes(this._columns, availableSpace.width - this.padding.left - this.padding.right)
      : [availableSpace.width - this.padding.left - this.padding.right];

    const rowSizes = this._rows.length > 0
      ? calculateSizes(this._rows, availableSpace.height - this.padding.top - this.padding.bottom)
      : [availableSpace.height - this.padding.top - this.padding.bottom];

    return { columnSizes, rowSizes };
  }
}

// ============================================================================
// Stack Layout Implementation
// ============================================================================

class StackLayout extends BaseLayout {
  constructor(options?: LayoutOptions) {
    super(LayoutType.Stack, options);
  }

  measure(availableSpace: Size): Size {
    let maxWidth = 0;
    let maxHeight = 0;

    for (const { item } of this._children) {
      const childSize = item.measure(availableSpace);
      maxWidth = Math.max(maxWidth, childSize.width);
      maxHeight = Math.max(maxHeight, childSize.height);
    }

    return {
      width: cols(maxWidth + this.padding.left + this.padding.right),
      height: rows(maxHeight + this.padding.top + this.padding.bottom)
    };
  }

  arrange(finalRect: Rectangle): void {
    this.bounds = finalRect;
    const contentRect = applySpacing(finalRect, this.padding);

    // Stack children on top of each other (last child on top)
    for (const { item } of this._children) {
      item.arrange(contentRect);
    }

    this._needsLayout = false;
  }
}

// ============================================================================
// Dock Layout Implementation
// ============================================================================

class DockLayout extends BaseLayout {
  constructor(options?: LayoutOptions) {
    super(LayoutType.Dock, options);
  }

  measure(availableSpace: Size): Size {
    // For dock layout, use full available space
    return availableSpace;
  }

  arrange(finalRect: Rectangle): void {
    this.bounds = finalRect;
    let contentRect = applySpacing(finalRect, this.padding);

    // Process docked children first
    const fillChildren: Array<{ item: LayoutItem; constraints?: LayoutConstraints }> = [];

    for (const child of this._children) {
      const dock = child.constraints?.dock;

      if (!dock || dock === 'fill') {
        fillChildren.push(child);
        continue;
      }

      const childSize = child.item.measure({
        width: contentRect.width,
        height: contentRect.height
      });

      switch (dock) {
        case 'top':
          child.item.arrange({
            x: contentRect.x,
            y: contentRect.y,
            width: contentRect.width,
            height: childSize.height
          });
          contentRect = {
            x: contentRect.x,
            y: y(contentRect.y + childSize.height),
            width: contentRect.width,
            height: rows(contentRect.height - childSize.height)
          };
          break;

        case 'bottom':
          child.item.arrange({
            x: contentRect.x,
            y: y(contentRect.y + contentRect.height - childSize.height),
            width: contentRect.width,
            height: childSize.height
          });
          contentRect = {
            x: contentRect.x,
            y: contentRect.y,
            width: contentRect.width,
            height: rows(contentRect.height - childSize.height)
          };
          break;

        case 'left':
          child.item.arrange({
            x: contentRect.x,
            y: contentRect.y,
            width: childSize.width,
            height: contentRect.height
          });
          contentRect = {
            x: x(contentRect.x + childSize.width),
            y: contentRect.y,
            width: cols(contentRect.width - childSize.width),
            height: contentRect.height
          };
          break;

        case 'right':
          child.item.arrange({
            x: x(contentRect.x + contentRect.width - childSize.width),
            y: contentRect.y,
            width: childSize.width,
            height: contentRect.height
          });
          contentRect = {
            x: contentRect.x,
            y: contentRect.y,
            width: cols(contentRect.width - childSize.width),
            height: contentRect.height
          };
          break;
          
        default:
          // Unknown dock position - skip this child
          break;
      }
    }

    // Fill remaining space with fill children
    for (const child of fillChildren) {
      child.item.arrange(contentRect);
    }

    this._needsLayout = false;
  }
}

// ============================================================================
// Wrap Layout Implementation
// ============================================================================

class WrapLayout extends BaseLayout {
  constructor(options?: LayoutOptions) {
    super(LayoutType.Wrap, options);
  }

  measure(availableSpace: Size): Size {
    const contentWidth = availableSpace.width - this.padding.left - this.padding.right;

    let currentX = 0;
    let currentY = 0;
    let rowHeight = 0;
    let maxWidth = 0;

    for (const { item } of this._children) {
      const childSize = item.measure(availableSpace);

      if (currentX + childSize.width > contentWidth && currentX > 0) {
        // Wrap to next line
        currentX = 0;
        currentY += rowHeight + this.gap;
        rowHeight = 0;
      }

      currentX += childSize.width + this.gap;
      rowHeight = Math.max(rowHeight, childSize.height);
      maxWidth = Math.max(maxWidth, currentX);
    }

    return {
      width: cols(maxWidth + this.padding.left + this.padding.right),
      height: rows(currentY + rowHeight + this.padding.top + this.padding.bottom)
    };
  }

  arrange(finalRect: Rectangle): void {
    this.bounds = finalRect;
    const contentRect = applySpacing(finalRect, this.padding);

    let currentX = 0;
    let currentY = 0;
    let rowHeight = 0;
    const rowChildren: Array<{ item: LayoutItem; x: number; width: number; height: number }> = [];

    const arrangeRow = () => {
      for (const child of rowChildren) {
        child.item.arrange({
          x: x(contentRect.x + child.x),
          y: y(contentRect.y + currentY),
          width: cols(child.width),
          height: rows(child.height)
        });
      }
      rowChildren.length = 0;
    };

    for (const { item } of this._children) {
      const childSize = item.measure({
        width: contentRect.width,
        height: contentRect.height
      });

      if (currentX + childSize.width > contentRect.width && currentX > 0) {
        // Arrange current row and move to next
        arrangeRow();
        currentX = 0;
        currentY += rowHeight + this.gap;
        rowHeight = 0;
      }

      rowChildren.push({
        item,
        x: currentX,
        width: childSize.width,
        height: childSize.height
      });

      currentX += childSize.width + this.gap;
      rowHeight = Math.max(rowHeight, childSize.height);
    }

    // Arrange last row
    if (rowChildren.length > 0) {
      arrangeRow();
    }

    this._needsLayout = false;
  }
}

// ============================================================================
// Layout Engine Implementation
// ============================================================================

class LayoutEngineImpl implements LayoutEngine {
  private _viewport: Rectangle = {
    x: x(0),
    y: y(0),
    width: cols(80),
    height: rows(24)
  };

  readonly layouts = new Map<string, Layout>();

  get viewport(): Rectangle {
    return this._viewport;
  }

  setViewport(rect: Rectangle): void {
    this._viewport = rect;
  }

  addLayout(name: string, layout: Layout): void {
    this.layouts.set(name, layout);
  }

  removeLayout(name: string): void {
    this.layouts.delete(name);
  }

  getLayout(name: string): Layout | undefined {
    return this.layouts.get(name);
  }

  createLayout(type: LayoutType, options?: LayoutOptions): Layout {
    switch (type) {
      case LayoutType.Absolute:
        return new AbsoluteLayout(options);
      case LayoutType.Flex:
        return new FlexLayoutImpl(options);
      case LayoutType.Grid:
        return new GridLayoutImpl(options);
      case LayoutType.Stack:
        return new StackLayout(options);
      case LayoutType.Dock:
        return new DockLayout(options);
      case LayoutType.Wrap:
        return new WrapLayout(options);
      default:
        throw new Error(`Unknown layout type: ${type}`);
    }
  }
}

// ============================================================================
// Simple Layout Item Implementation
// ============================================================================

export class SimpleLayoutItem implements LayoutItem {
  bounds: Rectangle;
  private preferredSize: Size;

  constructor(width: Cols, height: Rows);
  constructor(preferredSize: Size);
  constructor(widthOrSize: Cols | Size, height?: Rows) {
    if (typeof widthOrSize === 'number' && height !== undefined) {
      // Constructor with width and height
      this.preferredSize = { width: widthOrSize as Cols, height };
    } else {
      // Constructor with Size object
      this.preferredSize = widthOrSize as Size;
    }

    this.bounds = {
      x: x(0),
      y: y(0),
      width: this.preferredSize.width,
      height: this.preferredSize.height
    };
  }

  measure(availableSpace: Size): Size {
    return {
      width: Math.min(this.preferredSize.width, availableSpace.width) as Cols,
      height: Math.min(this.preferredSize.height, availableSpace.height) as Rows
    };
  }

  arrange(finalRect: Rectangle): void {
    this.bounds = finalRect;
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create a new layout engine
 */
export function createLayoutEngine(): LayoutEngine {
  return new LayoutEngineImpl();
}

/**
 * Global layout engine instance
 */
export const layoutEngine = createLayoutEngine();

/**
 * Create a flex layout
 */
export function createFlexLayout(options?: LayoutOptions & Partial<FlexLayout>): FlexLayout {
  return layoutEngine.createLayout(LayoutType.Flex, options) as FlexLayout;
}

/**
 * Create a grid layout
 */
export function createGridLayout(options?: LayoutOptions & Partial<GridLayout> & { columns?: number | GridTrack[]; rows?: number | GridTrack[] }): GridLayout {
  return layoutEngine.createLayout(LayoutType.Grid, options) as GridLayout;
}

/**
 * Create a stack layout
 */
export function createStackLayout(options?: LayoutOptions): Layout {
  return layoutEngine.createLayout(LayoutType.Stack, options);
}

/**
 * Create a dock layout
 */
export function createDockLayout(options?: LayoutOptions): Layout {
  return layoutEngine.createLayout(LayoutType.Dock, options);
}

/**
 * Create a wrap layout
 */
export function createWrapLayout(options?: LayoutOptions): Layout {
  return layoutEngine.createLayout(LayoutType.Wrap, options);
}

/**
 * Create an absolute layout
 */
export function createAbsoluteLayout(options?: LayoutOptions): Layout {
  return layoutEngine.createLayout(LayoutType.Absolute, options);
}
/**
 * Grid component - Simple grid layout container for terminal UIs
 */

import { BaseComponent } from '../../core/component.js';
import { overlayChildOutput } from '../../utils/index.js';

import type { 
  Output, 
  Component, 
  ComponentOptions
} from '../../core/types.js';

// ============================================================================
// Types
// ============================================================================

export type GridAlignment = 'start' | 'center' | 'end' | 'stretch';
export type GridAutoFlow = 'row' | 'column' | 'dense';

export interface GridState {
  readonly columns: number;
  readonly rows: number;
  readonly templateColumns?: readonly string[];
  readonly templateRows?: readonly string[];
  readonly gap: number;
  readonly columnGap: number;
  readonly rowGap: number;
  readonly autoFlow: GridAutoFlow;
  readonly justifyItems: GridAlignment;
  readonly alignItems: GridAlignment;
  readonly justifyContent: GridAlignment;
  readonly alignContent: GridAlignment;
}

export interface GridOptions extends ComponentOptions<GridState> {
  readonly columns?: number;
  readonly rows?: number;
  readonly templateColumns?: readonly string[];
  readonly templateRows?: readonly string[];
  readonly gap?: number;
  readonly columnGap?: number;
  readonly rowGap?: number;
  readonly autoFlow?: GridAutoFlow;
  readonly justifyItems?: GridAlignment;
  readonly alignItems?: GridAlignment;
  readonly justifyContent?: GridAlignment;
  readonly alignContent?: GridAlignment;
}

interface CellPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ============================================================================
// Grid Component
// ============================================================================

export class Grid extends BaseComponent<GridState> {
  public override readonly type = 'grid';

  constructor(options: GridOptions = {}) {
    super({
      ...options,
      initialState: {
        columns: Math.max(1, Math.min(options.columns ?? 1, 1000)),
        rows: Math.max(1, Math.min(options.rows ?? 1, 1000)),
        templateColumns: options.templateColumns,
        templateRows: options.templateRows,
        gap: options.gap ?? 0,
        columnGap: options.columnGap ?? options.gap ?? 0,
        rowGap: options.rowGap ?? options.gap ?? 0,
        autoFlow: options.autoFlow ?? 'row',
        justifyItems: options.justifyItems ?? 'stretch',
        alignItems: options.alignItems ?? 'stretch',
        justifyContent: options.justifyContent ?? 'start',
        alignContent: options.alignContent ?? 'start',
        ...options.initialState
      }
    });
  }

  render(): Output {
    const { width, height } = this.getDimensions();
    const { columns, rows, columnGap, rowGap, justifyContent, alignContent } = this.state;

    if (width <= 0 || height <= 0 || columns <= 0 || rows <= 0) {
      return { lines: [] };
    }

    // Create output buffer
    const lines: string[] = [];
    for (let i = 0; i < height; i++) {
      lines.push(' '.repeat(width));
    }

    // Calculate cell layout
    const cellLayout = this.calculateCellLayout(width, height, columns, rows, columnGap, rowGap);
    const gridLayout = this.calculateGridAlignment(cellLayout, width, height, justifyContent, alignContent);

    // Render children in their grid positions
    this.renderGridChildren(lines, gridLayout, width, height);

    return { lines };
  }

  /**
   * Add a child to the grid
   */
  appendChild(child: Component<unknown>): void {
    this.addChild(child);
  }

  /**
   * Set grid dimensions
   */
  setGridSize(columns: number, rows: number): void {
    this.setState({ columns, rows });
  }

  /**
   * Set gap values
   */
  setGap(gap: number): void;
  setGap(columnGap: number, rowGap: number): void;
  setGap(gapOrColumnGap: number, rowGap?: number): void {
    if (rowGap !== undefined) {
      this.setState({ columnGap: gapOrColumnGap, rowGap });
    } else {
      this.setState({ gap: gapOrColumnGap, columnGap: gapOrColumnGap, rowGap: gapOrColumnGap });
    }
  }

  /**
   * Set template columns
   */
  setTemplateColumns(templateColumns: readonly string[]): void {
    this.setState({ templateColumns });
  }

  /**
   * Set template rows
   */
  setTemplateRows(templateRows: readonly string[]): void {
    this.setState({ templateRows });
  }

  /**
   * Set number of columns
   */
  setColumns(columns: number): void {
    this.setState({ columns });
  }

  /**
   * Get template columns
   */
  getTemplateColumns(): readonly string[] | undefined {
    return this.state.templateColumns;
  }

  /**
   * Get auto flow setting
   */
  getAutoFlow(): GridAutoFlow {
    return this.state.autoFlow;
  }

  /**
   * Set align items
   */
  setAlignItems(alignItems: GridAlignment): void {
    this.setState({ alignItems });
  }

  /**
   * Set number of rows
   */
  setRows(rows: number): void {
    this.setState({ rows });
  }

  /**
   * Get template rows
   */
  getTemplateRows(): readonly string[] | undefined {
    return this.state.templateRows;
  }

  /**
   * Set column ratios (convenience method for fractional units)
   */
  setColumnRatios(ratios: number[]): void {
    const templateColumns = ratios.map(ratio => `${ratio}fr`);
    this.setState({ templateColumns, columns: ratios.length });
  }

  /**
   * Set row ratios (convenience method for fractional units)  
   */
  setRowRatios(ratios: number[]): void {
    const templateRows = ratios.map(ratio => `${ratio}fr`);
    this.setState({ templateRows, rows: ratios.length });
  }

  /**
   * Calculate cell positions and sizes
   */
  private calculateCellLayout(
    containerWidth: number,
    containerHeight: number,
    columns: number,
    rows: number,
    columnGap: number,
    rowGap: number
  ): CellPosition[][] {
    const { templateColumns, templateRows } = this.state;

    // Calculate column widths
    const totalColumnGaps = Math.max(0, columns - 1) * columnGap;
    const availableWidth = containerWidth - totalColumnGaps;
    const columnWidths = this.calculateTrackSizes(templateColumns, availableWidth, columns);

    // Calculate row heights
    const totalRowGaps = Math.max(0, rows - 1) * rowGap;
    const availableHeight = containerHeight - totalRowGaps;
    const rowHeights = this.calculateTrackSizes(templateRows, availableHeight, rows);

    // Build cell position matrix
    const cellLayout: CellPosition[][] = [];
    let currentY = 0;

    for (let row = 0; row < rows; row++) {
      const cellRow: CellPosition[] = [];
      let currentX = 0;

      for (let col = 0; col < columns; col++) {
        const cellWidth = columnWidths[col] || 0;
        const cellHeight = rowHeights[row] || 0;

        cellRow.push({
          x: currentX,
          y: currentY,
          width: cellWidth,
          height: cellHeight
        });

        currentX += cellWidth + columnGap;
      }

      cellLayout.push(cellRow);
      currentY += (rowHeights[row] || 0) + rowGap;
    }

    return cellLayout;
  }

  /**
   * Calculate track sizes (columns or rows)
   */
  private calculateTrackSizes(
    template: readonly string[] | undefined,
    availableSpace: number,
    trackCount: number
  ): number[] {
    if (!template || template.length === 0) {
      // Equal distribution - handle invalid track count
      const validTrackCount = Math.max(1, Math.min(trackCount, 1000)); // Cap at reasonable limit
      const trackSize = Math.floor(availableSpace / validTrackCount);
      return Array(validTrackCount).fill(trackSize);
    }

    // Expand repeat() functions
    const expandedTemplate = this.expandRepeatFunction(template);

    const sizes: number[] = [];
    let usedSpace = 0;
    let frUnits = 0;
    const frIndices: number[] = [];

    // First pass: calculate fixed sizes and count fr units
    for (let i = 0; i < trackCount; i++) {
      const trackTemplate = expandedTemplate[i % expandedTemplate.length] || '1fr';

      if (trackTemplate === 'auto') {
        // For auto tracks, we'll calculate content size later
        // For now, give them a reasonable minimum size
        sizes[i] = 0;
      } else if (trackTemplate.endsWith('px')) {
        const pixels = parseInt(trackTemplate.replace('px', ''), 10) || 0;
        sizes[i] = Math.min(pixels, availableSpace);
        usedSpace += sizes[i] || 0;
      } else if (trackTemplate.endsWith('%')) {
        const percentage = parseInt(trackTemplate.replace('%', ''), 10) || 0;
        sizes[i] = Math.floor(availableSpace * percentage / 100);
        usedSpace += sizes[i] || 0;
      } else if (trackTemplate.endsWith('fr')) {
        const fr = parseFloat(trackTemplate.replace('fr', '')) || 1;
        frUnits += fr;
        frIndices.push(i);
        sizes[i] = fr; // Temporary storage
      } else {
        // Fallback: treat as equal share
        sizes[i] = 0;
        frIndices.push(i);
        frUnits += 1;
      }
    }

    // Second pass: distribute remaining space to fr units
    const remainingSpace = Math.max(0, availableSpace - usedSpace);
    const frUnit = frUnits > 0 ? remainingSpace / frUnits : 0;

    for (const index of frIndices) {
      const frValue = sizes[index] || 1;
      sizes[index] = Math.floor(frValue * frUnit);
    }

    // Handle auto tracks (distribute remaining space equally)
    const autoIndices = sizes.map((size, index) => size === 0 ? index : -1).filter(i => i !== -1);
    if (autoIndices.length > 0) {
      const totalUsedSpace = sizes.reduce((sum, size) => sum + size, 0);
      const autoSpace = Math.max(0, availableSpace - totalUsedSpace);
      const autoSize = Math.floor(autoSpace / autoIndices.length);
      for (const index of autoIndices) {
        sizes[index] = Math.max(1, autoSize); // Ensure minimum of 1 character width
      }
    }

    return sizes.map(size => Math.max(0, size));
  }

  /**
   * Expand repeat() functions in template
   */
  private expandRepeatFunction(template: readonly string[]): string[] {
    const expanded: string[] = [];
    
    for (const item of template) {
      if (typeof item === 'string' && item.startsWith('repeat(')) {
        // Parse repeat(count, value)
        const match = item.match(/repeat\(\s*(\d+)\s*,\s*(.+)\s*\)/);
        if (match && match[1] && match[2]) {
          const count = parseInt(match[1], 10);
          const value = match[2].trim();
          for (let i = 0; i < count; i++) {
            expanded.push(value);
          }
        } else {
          // Fallback if parsing fails
          expanded.push(item);
        }
      } else {
        expanded.push(item);
      }
    }
    
    return expanded;
  }

  /**
   * Calculate grid alignment offset
   */
  private calculateGridAlignment(
    cellLayout: CellPosition[][],
    containerWidth: number,
    containerHeight: number,
    justifyContent: GridAlignment,
    alignContent: GridAlignment
  ): CellPosition[][] {
    if (cellLayout.length === 0 || cellLayout[0]?.length === 0) {
      return cellLayout;
    }

    // Calculate total grid size
    const lastRow = cellLayout[cellLayout.length - 1];
    const lastCell = lastRow?.[lastRow.length - 1];
    const gridWidth = lastCell ? lastCell.x + lastCell.width : 0;
    const lastRowFirstCell = cellLayout[cellLayout.length - 1]?.[0];
    const gridHeight = cellLayout.length > 0 ? 
      (lastRowFirstCell?.y || 0) + (lastRowFirstCell?.height || 0) : 0;

    // Calculate content alignment offsets
    let offsetX = 0;
    let offsetY = 0;

    switch (justifyContent) {
      case 'center':
        offsetX = Math.max(0, Math.floor((containerWidth - gridWidth) / 2));
        break;
      case 'end':
        offsetX = Math.max(0, containerWidth - gridWidth);
        break;
    }

    switch (alignContent) {
      case 'center':
        offsetY = Math.max(0, Math.floor((containerHeight - gridHeight) / 2));
        break;
      case 'end':
        offsetY = Math.max(0, containerHeight - gridHeight);
        break;
    }

    // Apply offsets if needed
    if (offsetX === 0 && offsetY === 0) {
      return cellLayout;
    }

    return cellLayout.map(row => 
      row.map(cell => ({
        ...cell,
        x: cell.x + offsetX,
        y: cell.y + offsetY
      }))
    );
  }

  /**
   * Render children into their grid positions
   */
  private renderGridChildren(
    parentLines: string[],
    cellLayout: CellPosition[][],
    parentWidth: number,
    parentHeight: number
  ): void {
    const { columns, rows, autoFlow, justifyItems, alignItems } = this.state;

    for (let i = 0; i < this.children.length && i < columns * rows; i++) {
      const child = this.children[i];
      
      if (!(child instanceof BaseComponent)) continue;

      // Calculate grid position based on auto flow
      const { row, col } = this.calculateChildPosition(i, columns, rows, autoFlow);
      
      if (row >= cellLayout.length || col >= (cellLayout[row]?.length || 0)) {
        continue;
      }

      const cell = cellLayout[row]?.[col];
      if (!cell || cell.width <= 0 || cell.height <= 0) {
        continue;
      }

      // Calculate item position within cell based on alignment
      const itemPos = this.calculateItemAlignment(
        cell, child, justifyItems, alignItems
      );

      // Set child dimensions and position
      child.setDimensions(itemPos.width, itemPos.height);
      child.setPosition(itemPos.x, itemPos.y);

      const childOutput = child.render();

      // Overlay child output
      overlayChildOutput(
        parentLines,
        childOutput,
        itemPos.x,
        itemPos.y,
        itemPos.width,
        itemPos.height,
        parentWidth
      );
    }
  }

  /**
   * Calculate child position based on index and auto-flow
   */
  private calculateChildPosition(
    index: number,
    columns: number,
    rows: number,
    autoFlow: GridAutoFlow
  ): { row: number; col: number } {
    if (autoFlow === 'column') {
      return {
        row: index % rows,
        col: Math.floor(index / rows)
      };
    } else {
      // 'row' or 'dense' (simplified implementation)
      return {
        row: Math.floor(index / columns),
        col: index % columns
      };
    }
  }

  /**
   * Calculate item position within its grid cell
   */
  private calculateItemAlignment(
    cell: CellPosition,
    child: Component<unknown>,
    justifyItems: GridAlignment,
    alignItems: GridAlignment
  ): CellPosition {
    // For now, use the full cell size
    // Advanced alignment would require measuring child content
    return {
      x: cell.x,
      y: cell.y,
      width: cell.width,
      height: cell.height
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Factory function to create a Grid component
 */
export function createGrid(options?: GridOptions): Grid {
  return new Grid(options);
}
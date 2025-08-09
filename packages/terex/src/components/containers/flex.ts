/**
 * Flex component - flexible layout container with flexbox-like behavior
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

export type FlexDirection = 'row' | 'column';

export type JustifyContent =
  | 'flex-start'
  | 'flex-end'
  | 'center'
  | 'space-between'
  | 'space-around'
  | 'space-evenly';

export type AlignItems = 'flex-start' | 'flex-end' | 'center' | 'stretch';

export type FlexWrap = 'nowrap' | 'wrap' | 'wrap-reverse';

export interface FlexState {
  readonly direction: FlexDirection;
  readonly justifyContent: JustifyContent;
  readonly alignItems: AlignItems;
  readonly gap: number;
  readonly wrap: FlexWrap;
}

export interface FlexOptions extends ComponentOptions<FlexState> {
  readonly direction?: FlexDirection;
  readonly justifyContent?: JustifyContent;
  readonly alignItems?: AlignItems;
  readonly gap?: number;
  readonly wrap?: FlexWrap;
}

// ============================================================================
// Flex Component
// ============================================================================

export class Flex extends BaseComponent<FlexState> {
  constructor(options: FlexOptions = {}) {
    super({
      ...options,
      initialState: {
        direction: options.direction ?? 'row',
        justifyContent: options.justifyContent ?? 'flex-start',
        alignItems: options.alignItems ?? 'stretch',
        gap: options.gap ?? 0,
        wrap: options.wrap ?? 'nowrap',
        ...options.initialState
      }
    });
  }

  render(): Output {
    const { width, height } = this.getDimensions();
    const { direction, justifyContent, alignItems, gap, wrap } = this.state;

    if (width <= 0 || height <= 0) {
      return { lines: [] };
    }

    // Handle empty container case
    if (this.children.length === 0) {
      // In inline mode (height = 1), return single line
      // Otherwise fill the specified height
      const lines: string[] = [];
      const actualHeight = Math.max(1, height);
      for (let i = 0; i < actualHeight; i++) {
        lines.push(' '.repeat(width));
      }
      return { lines };
    }

    // Calculate layout
    const layout = this.calculateLayout(width, height, justifyContent, alignItems, gap);

    // Calculate actual height needed based on children positions
    let actualHeight = height;
    if (height === 1 && direction === 'row') {
      // In inline mode with row direction, only use 1 line
      actualHeight = 1;
    } else if (height === 1 && direction === 'column') {
      // In inline mode with column direction, calculate needed height
      actualHeight = Math.max(1, this.children.length + (this.children.length - 1) * gap);
    }

    // Create output buffer with actual height
    const lines: string[] = [];
    for (let i = 0; i < actualHeight; i++) {
      lines.push(' '.repeat(width));
    }

    // Render each child into the buffer
    for (let i = 0; i < this.children.length && i < layout.length; i++) {
      const child = this.children[i];
      const childLayout = layout[i];

      if (child instanceof BaseComponent && childLayout) {
        // Set child dimensions and position
        child.setDimensions(childLayout.width, childLayout.height);
        child.setPosition(childLayout.x, childLayout.y);

        const childOutput = child.render();

        // Overlay child output onto our buffer
        overlayChildOutput(
          lines,
          childOutput,
          childLayout.x,
          childLayout.y,
          childLayout.width,
          childLayout.height,
          width
        );
      }
    }

    return { lines };
  }

  /**
   * Set flex direction
   */
  setDirection(direction: FlexDirection): void {
    this.setState({ direction });
  }

  /**
   * Set justify content
   */
  setJustifyContent(justifyContent: JustifyContent): void {
    this.setState({ justifyContent });
  }

  /**
   * Get the current direction
   */
  getDirection(): FlexDirection {
    return this.state.direction;
  }

  /**
   * Set align items
   */
  setAlignItems(alignItems: AlignItems): void {
    this.setState({ alignItems });
  }

  /**
   * Set align (alias for setAlignItems)
   */
  setAlign(alignItems: AlignItems): void {
    this.setAlignItems(alignItems);
  }

  /**
   * Get align items
   */
  getAlign(): AlignItems {
    return this.state.alignItems;
  }

  /**
   * Get the current gap
   */
  getGap(): number {
    return this.state.gap;
  }

  /**
   * Get the current wrap setting
   */
  getWrap(): FlexWrap {
    return this.state.wrap;
  }

  /**
   * Set gap between items
   */
  setGap(gap: number): void {
    this.setState({ gap });
  }

  /**
   * Set wrap behavior
   */
  setWrap(wrap: FlexWrap): void {
    this.setState({ wrap });
  }

  /**
   * Add child - alias for appendChild to match test expectations
   */
  appendChild(child: Component<unknown>): void {
    this.addChild(child);
  }

  /**
   * Clear all children - matches test expectations
   */
  clearChildren(): void {
    this.removeAllChildren();
  }

  /**
   * Calculate layout for all children
   */
  private calculateLayout(
    containerWidth: number,
    containerHeight: number,
    justify: JustifyContent,
    align: AlignItems,
    gap: number
  ): Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> {
    const { direction, wrap } = this.state;
    const childCount = this.children.length;

    if (childCount === 0) return [];

    const isRow = direction === 'row';
    const mainSize = isRow ? containerWidth : containerHeight;
    const crossSize = isRow ? containerHeight : containerWidth;

    // First, calculate the natural size of children
    const childSizes: Array<{ mainSize: number; crossSize: number }> = [];
    let totalChildMainSize = 0;

    for (const child of this.children) {
      if (child instanceof BaseComponent) {
        // For text components, use the content length as natural size
        if (child.type === 'text') {
          const textContent = (child as any).state?.content || '';
          const lines = textContent.split(/\r?\n/);
          const naturalMainSize = isRow
            ? Math.max(...lines.map(line => line.length), 1)
            : lines.length;
          const naturalCrossSize = isRow
            ? lines.length
            : Math.max(...lines.map(line => line.length), 1);

          childSizes.push({
            mainSize: naturalMainSize,
            crossSize: naturalCrossSize
          });
          totalChildMainSize += naturalMainSize;
        } else {
          // For other components, use current dimensions or defaults
          const { width: w, height: h } = child.getDimensions();
          const naturalMainSize = isRow ? (w > 0 ? w : 10) : (h > 0 ? h : 1);
          const naturalCrossSize = isRow ? (h > 0 ? h : 1) : (w > 0 ? w : 10);

          childSizes.push({
            mainSize: naturalMainSize,
            crossSize: naturalCrossSize
          });
          totalChildMainSize += naturalMainSize;
        }
      }
    }

    const layouts: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];

    // Handle wrapping if enabled
    if (wrap !== 'nowrap') {
      // Group children into lines based on available space
      const lines: Array<Array<{ index: number; size: { mainSize: number; crossSize: number } }>> = [];
      let currentLine: Array<{ index: number; size: { mainSize: number; crossSize: number } }> = [];
      let currentLineSize = 0;

      for (let i = 0; i < childCount; i++) {
        const childSize = childSizes[i];
        if (!childSize) continue;

        const requiredSpace = currentLineSize === 0
          ? childSize.mainSize
          : childSize.mainSize + gap;

        if (currentLineSize === 0 || currentLineSize + requiredSpace <= mainSize) {
          // Fits in current line
          currentLine.push({ index: i, size: childSize });
          currentLineSize += requiredSpace;
        } else {
          // Start new line
          if (currentLine.length > 0) {
            lines.push(currentLine);
          }
          currentLine = [{ index: i, size: childSize }];
          currentLineSize = childSize.mainSize;
        }
      }

      if (currentLine.length > 0) {
        lines.push(currentLine);
      }

      // Layout each line
      let currentCrossPos = 0;
      for (const line of lines) {
        const lineContentSize = line.reduce((sum, item, idx) =>
          sum + item.size.mainSize + (idx > 0 ? gap : 0), 0);

        // Calculate line start position based on justify-content
        let lineMainStart = 0;
        let lineSpacing = 0;

        // eslint-disable-next-line default-case
        switch (justify) {
          case 'center':
            lineMainStart = Math.floor((mainSize - lineContentSize) / 2);
            break;
          case 'flex-end':
            lineMainStart = mainSize - lineContentSize;
            break;
          case 'space-between':
            if (line.length > 1) {
              const totalItemSize = line.reduce((sum, item) => sum + item.size.mainSize, 0);
              lineSpacing = Math.floor((mainSize - totalItemSize) / (line.length - 1));
            }
            break;
          case 'space-around':
            {
              const totalItemSize = line.reduce((sum, item) => sum + item.size.mainSize, 0);
              lineSpacing = Math.floor((mainSize - totalItemSize) / line.length);
              lineMainStart = Math.floor(lineSpacing / 2);
              break;
            }
          case 'space-evenly':
            {
              const totalItemSizeEvenly = line.reduce((sum, item) => sum + item.size.mainSize, 0);
              lineSpacing = Math.floor((mainSize - totalItemSizeEvenly) / (line.length + 1));
              lineMainStart = lineSpacing;
              break;
            }
        }

        // Layout items in this line
        let currentMainPos = Math.max(0, lineMainStart);
        const lineCrossSize = Math.max(...line.map(item => item.size.crossSize));

        for (const item of line) {
          const childMainSize = item.size.mainSize;
          const childCrossSize = Math.min(item.size.crossSize, crossSize);

          // Calculate cross-axis position based on align
          let crossStart = currentCrossPos;
          let actualChildCrossSize = childCrossSize;

          // eslint-disable-next-line default-case
          switch (align) {
            case 'center':
              crossStart = currentCrossPos + Math.floor((lineCrossSize - childCrossSize) / 2);
              break;
            case 'flex-end':
              crossStart = currentCrossPos + (lineCrossSize - childCrossSize);
              break;
            case 'stretch':
              actualChildCrossSize = lineCrossSize;
              break;
          }

          // Create layout based on direction
          const layout = isRow ? {
            x: Math.max(0, Math.min(currentMainPos, containerWidth)),
            y: Math.max(0, Math.min(crossStart, containerHeight)),
            width: Math.max(0, Math.min(childMainSize, containerWidth - currentMainPos)),
            height: Math.max(0, Math.min(actualChildCrossSize, containerHeight - crossStart))
          } : {
            x: Math.max(0, Math.min(crossStart, containerWidth)),
            y: Math.max(0, Math.min(currentMainPos, containerHeight)),
            width: Math.max(0, Math.min(actualChildCrossSize, containerWidth - crossStart)),
            height: Math.max(0, Math.min(childMainSize, containerHeight - currentMainPos))
          };

          layouts[item.index] = layout;

          // Move to next position in line
          if (justify === 'space-between' || justify === 'space-around' || justify === 'space-evenly') {
            currentMainPos += childMainSize + lineSpacing;
          } else {
            currentMainPos += childMainSize + gap;
          }
        }

        // Move to next line
        currentCrossPos += lineCrossSize + gap;
      }
    } else {
      // No wrapping - single line layout
      // Calculate available space (accounting for gaps)
      const totalGaps = Math.max(0, childCount - 1) * gap;

      // Calculate positions based on justify content
      let mainStart = 0;
      let spacing = 0;

      // For natural sizing, use the actual content sizes for positioning
      const totalContentSize = totalChildMainSize + totalGaps;

      // eslint-disable-next-line default-case
      switch (justify) {
        case 'center':
          mainStart = Math.floor((mainSize - totalContentSize) / 2);
          break;
        case 'flex-end':
          mainStart = mainSize - totalContentSize;
          break;
        case 'space-between':
          if (childCount > 1) {
            spacing = Math.floor((mainSize - totalChildMainSize) / (childCount - 1));
          }
          break;
        case 'space-around':
          spacing = Math.floor((mainSize - totalChildMainSize) / childCount);
          mainStart = Math.floor(spacing / 2);
          break;
        case 'space-evenly':
          spacing = Math.floor((mainSize - totalChildMainSize) / (childCount + 1));
          mainStart = spacing;
          break;
      }

      // Layout children
      let currentMainPos = Math.max(0, mainStart);

      for (let i = 0; i < childCount; i++) {
        const childSize = childSizes[i];
        if (!childSize) continue;

        const childMainSize = childSize.mainSize;
        const childCrossSize = Math.min(childSize.crossSize, crossSize);

        // Calculate cross-axis position based on align
        let crossStart = 0;
        let actualChildCrossSize = childCrossSize;

        // eslint-disable-next-line default-case
        switch (align) {
          case 'center':
            crossStart = Math.floor((crossSize - childCrossSize) / 2);
            break;
          case 'flex-end':
            crossStart = crossSize - childCrossSize;
            break;
          case 'stretch':
            actualChildCrossSize = crossSize;
            break;
        }

        // Create layout based on direction
        const layout = isRow ? {
          x: Math.max(0, Math.min(currentMainPos, containerWidth)),
          y: Math.max(0, Math.min(crossStart, containerHeight)),
          width: Math.max(0, Math.min(childMainSize, containerWidth - currentMainPos)),
          height: Math.max(0, Math.min(actualChildCrossSize, containerHeight - crossStart))
        } : {
          x: Math.max(0, Math.min(crossStart, containerWidth)),
          y: Math.max(0, Math.min(currentMainPos, containerHeight)),
          width: Math.max(0, Math.min(actualChildCrossSize, containerWidth - crossStart)),
          height: Math.max(0, Math.min(childMainSize, containerHeight - currentMainPos))
        };

        layouts.push(layout);

        // Move to next position
        if (justify === 'space-between' || justify === 'space-around' || justify === 'space-evenly') {
          currentMainPos += childMainSize + spacing;
        } else {
          currentMainPos += childMainSize + gap;
        }
      }
    }

    return layouts;
  }

}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Factory function to create a Flex component
 */
export function createFlex(options?: FlexOptions): Flex {
  return new Flex(options);
}
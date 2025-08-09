/**
 * Box component - fundamental container with borders, padding, and styling
 */

import { BaseComponent } from '../../core/component.js';

import type { 
  Style, 
  Color, 
  Output, 
  Padding,
  Component,
  ComponentOptions
} from '../../core/types.js';

// ============================================================================
// Types
// ============================================================================

export type BorderStyle = 'none' | 'single' | 'double' | 'rounded' | 'thick';

export interface BoxState {
  readonly title?: string;
  readonly footer?: string;
  readonly borderStyle: BorderStyle;
  readonly borderColor?: Color;
  readonly focusBorderColor?: Color;
  readonly padding: Padding;
  readonly margin?: number;
  readonly backgroundColor?: Color;
  readonly shadowEnabled: boolean;
  readonly shadowColor: Color;
  readonly overflow?: 'visible' | 'hidden' | 'scroll';
}

export interface BoxOptions extends ComponentOptions<BoxState> {
  readonly width?: number;
  readonly height?: number;
  readonly title?: string;
  readonly borderStyle?: BorderStyle;
  readonly borderColor?: Color;
  readonly focusBorderColor?: Color;
  readonly padding?: number | Padding;
  readonly margin?: number;
  readonly backgroundColor?: Color;
  readonly shadowEnabled?: boolean;
  readonly shadowColor?: Color;
  readonly overflow?: 'visible' | 'hidden' | 'scroll';
}

// ============================================================================
// Border Characters
// ============================================================================

const BORDER_CHARS: Record<BorderStyle, {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
}> = {
  none: {
    topLeft: '', topRight: '', bottomLeft: '', bottomRight: '',
    horizontal: '', vertical: ''
  },
  single: {
    topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘',
    horizontal: '─', vertical: '│'
  },
  double: {
    topLeft: '╔', topRight: '╗', bottomLeft: '╚', bottomRight: '╝',
    horizontal: '═', vertical: '║'
  },
  rounded: {
    topLeft: '╭', topRight: '╮', bottomLeft: '╰', bottomRight: '╯',
    horizontal: '─', vertical: '│'
  },
  thick: {
    topLeft: '┏', topRight: '┓', bottomLeft: '┗', bottomRight: '┛',
    horizontal: '━', vertical: '┃'
  }
};

// ============================================================================
// Box Component
// ============================================================================

export class Box extends BaseComponent<BoxState> {
  constructor(options: BoxOptions = {}) {
    const padding = normalizePadding(options.padding ?? 0);
    
    super({
      ...options,
      initialState: {
        title: options.title,
        borderStyle: options.borderStyle ?? 'none',
        borderColor: options.borderColor,
        focusBorderColor: options.focusBorderColor,
        padding,
        margin: options.margin,
        backgroundColor: options.backgroundColor,
        shadowEnabled: options.shadowEnabled ?? false,
        shadowColor: options.shadowColor ?? 'gray',
        overflow: options.overflow ?? 'visible',
        ...options.initialState
      }
    });
    
    // Set dimensions if provided
    if (options.width !== undefined || options.height !== undefined) {
      this.setDimensions(options.width ?? 0, options.height ?? 0);
    }
  }

  render(): Output {
    const { width, height } = this.getDimensions();
    const { 
      title, 
      borderStyle, 
      borderColor,
      focusBorderColor,
      padding, 
      backgroundColor, 
      shadowEnabled,
      shadowColor 
    } = this.state;

    if (width <= 0 || height <= 0) {
      return { lines: [] };
    }

    const lines: string[] = [];
    const borderChars = BORDER_CHARS[borderStyle];
    const hasBorder = borderStyle !== 'none';
    const borderWidth = hasBorder ? 1 : 0;
    const shadowOffset = shadowEnabled ? 1 : 0;

    // Calculate content area
    const contentWidth = width - (borderWidth * 2) - padding.left - padding.right - shadowOffset;
    const contentHeight = height - (borderWidth * 2) - padding.top - padding.bottom - shadowOffset;

    // Render children to get their output
    const childrenOutput = this.renderChildren(contentWidth, contentHeight);

    // Build the box
    for (let y = 0; y < height; y++) {
      let line = '';

      // Shadow column (rightmost)
      if (shadowEnabled && y > 0) {
        for (let x = 0; x < width - shadowOffset; x++) {
          line += ' ';
        }
        line += this.styleText(' ', { foreground: shadowColor });
        continue;
      }

      for (let x = 0; x < width - shadowOffset; x++) {
        let char = ' ';

        // Border rendering
        if (hasBorder) {
          let borderChar = '';
          if (y === 0) {
            // Top border
            if (x === 0) {
              borderChar = borderChars.topLeft;
            } else if (x === width - shadowOffset - 1) {
              borderChar = borderChars.topRight;
            } else {
              borderChar = borderChars.horizontal;
            }
          } else if (y === height - shadowOffset - 1) {
            // Bottom border
            if (x === 0) {
              borderChar = borderChars.bottomLeft;
            } else if (x === width - shadowOffset - 1) {
              borderChar = borderChars.bottomRight;
            } else {
              borderChar = borderChars.horizontal;
            }
          } else {
            // Side borders
            if (x === 0 || x === width - shadowOffset - 1) {
              borderChar = borderChars.vertical;
            }
          }
          
          if (borderChar) {
            // Apply border color if specified
            const effectiveBorderColor = (this.focused && focusBorderColor) ? focusBorderColor : borderColor;
            char = effectiveBorderColor ? this.styleText(borderChar, { foreground: effectiveBorderColor }) : borderChar;
          }
        }

        // Content area (works for both bordered and non-bordered boxes)
        const isInContentArea = hasBorder 
          ? (y > 0 && y < height - shadowOffset - 1 && x > 0 && x < width - shadowOffset - 1)
          : (y >= 0 && y < height - shadowOffset && x >= 0 && x < width - shadowOffset);
        
        if (isInContentArea) {
          const contentX = x - borderWidth - padding.left;
          const contentY = y - borderWidth - padding.top;

          if (
            contentX >= 0 && 
            contentX < contentWidth && 
            contentY >= 0 && 
            contentY < contentHeight &&
            contentY < childrenOutput.length &&
            childrenOutput[contentY] !== undefined &&
            contentX < childrenOutput[contentY].length
          ) {
            const childChar = childrenOutput[contentY][contentX];
            if (childChar !== undefined && childChar !== ' ') {
              char = childChar;
            }
          }
        }

        // Apply background color if specified
        if (backgroundColor) {
          char = this.styleText(char, { background: backgroundColor });
        }

        line += char;
      }

      // Add title to top border
      if (hasBorder && y === 0 && title && title.length > 0) {
        const titleStart = Math.max(2, Math.floor((width - shadowOffset - title.length - 2) / 2));
        const styledTitle = ` ${title} `;
        
        if (titleStart + styledTitle.length < width - shadowOffset - 1) {
          line = (
            line.substring(0, titleStart) +
            styledTitle +
            line.substring(titleStart + styledTitle.length)
          );
        }
      }

      lines.push(line);
    }

    // Add shadow bottom line
    if (shadowEnabled) {
      let shadowLine = ' '; // Offset for shadow
      for (let x = 1; x < width; x++) {
        shadowLine += this.styleText(' ', { foreground: shadowColor });
      }
      lines.push(shadowLine);
    }

    return {
      lines,
      style: { background: backgroundColor }
    };
  }

  /**
   * Set the box title
   */
  setTitle(title: string): void {
    this.setState({ title });
  }

  /**
   * Set the border style
   */
  setBorderStyle(borderStyle: BorderStyle): void {
    this.setState({ borderStyle });
  }

  /**
   * Set padding
   */
  setPadding(padding: number | Padding): void {
    this.setState({ padding: normalizePadding(padding) });
  }

  /**
   * Get the current border style
   */
  getBorderStyle(): BorderStyle {
    return this.state.borderStyle;
  }

  /**
   * Get the current padding
   */
  getPadding(): Padding {
    return this.state.padding;
  }

  /**
   * Set the border color
   */
  setBorderColor(color: Color): void {
    this.setState({ borderColor: color });
  }

  /**
   * Set the footer text
   */
  setFooter(footer: string): void {
    this.setState({ footer });
  }

  /**
   * Get the current title
   */
  getTitle(): string | undefined {
    return this.state.title;
  }

  /**
   * Get the current border color
   */
  getBorderColor(): Color | undefined {
    return this.state.borderColor;
  }

  /**
   * Set background color
   */
  setBackgroundColor(color: Color): void {
    this.setState({ backgroundColor: color });
  }

  /**
   * Enable or disable shadow
   */
  setShadow(enabled: boolean, color?: Color): void {
    this.setState({ 
      shadowEnabled: enabled,
      ...(color && { shadowColor: color })
    });
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
   * Get content area dimensions considering border and padding
   */
  getContentArea(): { x: number; y: number; width: number; height: number } {
    const { width, height } = this.getDimensions();
    const { borderStyle, padding } = this.state;
    const hasBorder = borderStyle !== 'none';
    const borderWidth = hasBorder ? 1 : 0;
    
    const contentWidth = Math.max(0, width - (borderWidth * 2) - padding.left - padding.right);
    const contentHeight = Math.max(0, height - (borderWidth * 2) - padding.top - padding.bottom);
    
    return {
      x: borderWidth + padding.left,
      y: borderWidth + padding.top,
      width: contentWidth,
      height: contentHeight
    };
  }

  /**
   * Render children into the content area
   */
  private renderChildren(contentWidth: number, contentHeight: number): string[] {
    const lines: string[] = [];
    
    if (!this.children || this.children.length === 0) {
      return lines;
    }

    // For each child, set its dimensions and position, then render
    let currentY = 0;
    
    for (const child of this.children) {
      if (child instanceof BaseComponent) {

        // Set child dimensions to fit content area
        // For simple components like Text, only allocate 1 line unless they need more
        const remainingHeight = contentHeight - currentY;
        let childHeight = remainingHeight;
        
        // If it's a Text component, only give it 1 line by default
        if (child.constructor.name === 'Text') {
          childHeight = Math.min(1, remainingHeight);
        }
        
        child.setDimensions(contentWidth, childHeight);
        child.setPosition(0, currentY);

        const childOutput = child.safeRender ? child.safeRender() : child.render();
        
        // Add child lines to our output
        for (let i = 0; i < Math.min(childOutput.lines.length, childHeight); i++) {
          const lineIndex = currentY + i;
          if (lineIndex < contentHeight) {
            // Ensure we have enough lines
            while (lines.length <= lineIndex) {
              lines.push(' '.repeat(contentWidth));
            }
            
            // Overlay child content
            const childLine = childOutput.lines[i];
            if (childLine !== undefined) {
              const paddedLine = childLine.padEnd(contentWidth, ' ').substring(0, contentWidth);
              lines[lineIndex] = paddedLine;
            }
          }
        }
        
        currentY += childOutput.lines.length;
        if (currentY >= contentHeight) break;
      }
    }

    // Fill remaining lines with spaces
    while (lines.length < contentHeight) {
      lines.push(' '.repeat(contentWidth));
    }

    return lines;
  }

  /**
   * Apply styling to text with ANSI escape codes
   */
  private styleText(text: string, style: Style): string {
    let result = text;
    
    if (style.foreground) {
      result = this.applyColor(result, style.foreground, false);
    }
    
    if (style.background) {
      result = this.applyColor(result, style.background, true);
    }
    
    return result;
  }
  
  /**
   * Apply ANSI color codes
   */
  private applyColor(text: string, color: Color, isBackground: boolean): string {
    // Handle string color names (AnsiColor)
    if (typeof color === 'string') {
      const ansiColorCodes: Record<string, string> = {
        black: isBackground ? '40' : '30',
        red: isBackground ? '41' : '31', 
        green: isBackground ? '42' : '32',
        yellow: isBackground ? '43' : '33',
        blue: isBackground ? '44' : '34',
        magenta: isBackground ? '45' : '35',
        cyan: isBackground ? '46' : '36',
        white: isBackground ? '47' : '37',
        gray: isBackground ? '100' : '90',
        brightRed: isBackground ? '101' : '91',
        brightGreen: isBackground ? '102' : '92',
        brightYellow: isBackground ? '103' : '93',
        brightBlue: isBackground ? '104' : '94',
        brightMagenta: isBackground ? '105' : '95',
        brightCyan: isBackground ? '106' : '96',
        brightWhite: isBackground ? '107' : '97'
      };
      
      const code = ansiColorCodes[color];
      if (code) {
        return `\x1b[${code}m${text}\x1b[0m`;
      }
      
      // Handle hex colors (if supported)
      if (color.startsWith('#')) {
        // Convert hex to RGB
        const hex = color.slice(1);
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return this.applyRGBColor(text, { r, g, b }, isBackground);
      }
    }
    
    // Handle RGB colors
    if (typeof color === 'object' && 'r' in color && 'g' in color && 'b' in color) {
      return this.applyRGBColor(text, color, isBackground);
    }
    
    // Handle HSL colors (convert to RGB first)
    if (typeof color === 'object' && 'h' in color && 's' in color && 'l' in color) {
      const rgb = this.hslToRgb(color);
      return this.applyRGBColor(text, rgb, isBackground);
    }
    
    return text;
  }
  
  /**
   * Apply RGB color using 24-bit true color ANSI codes
   */
  private applyRGBColor(text: string, rgb: { r: number; g: number; b: number }, isBackground: boolean): string {
    const prefix = isBackground ? '48' : '38';
    return `\x1b[${prefix};2;${rgb.r};${rgb.g};${rgb.b}m${text}\x1b[0m`;
  }
  
  /**
   * Convert HSL to RGB
   */
  private hslToRgb(hsl: { h: number; s: number; l: number }): { r: number; g: number; b: number } {
    const h = hsl.h / 360;
    const s = hsl.s / 100;
    const l = hsl.l / 100;
    
    let r, g, b;
    
    if (s === 0) {
      r = g = b = l; // achromatic
    } else {
      const hue2rgb = (p: number, q: number, t: number): number => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize padding input to Padding object
 */
function normalizePadding(padding: number | Padding): Padding {
  if (typeof padding === 'number') {
    return {
      top: padding,
      right: padding,
      bottom: padding,
      left: padding
    };
  }
  return padding;
}

/**
 * Factory function to create a Box component
 */
export function createBox(options?: BoxOptions): Box {
  return new Box(options);
}
/**
 * Style system implementation
 * Provides style application and builder for terminal text
 */

import { ansi } from './ansi.js';
import { ColorSystem } from './color.js';
import { ColorDepth } from '../types.js';

import type {
  Style,
  Color,
  Colors,
  Styles,
  StyleBuilder
} from '../types.js';

/**
 * Style builder implementation
 */
class StyleBuilderImpl implements StyleBuilder {
  private style: any = {}; // Use mutable internal representation
  private styles: Styles;

  constructor(styles?: Styles, initialStyle?: Style) {
    // Create default Styles instance if not provided
    this.styles = styles || new StylesImpl();
    // Clone initial style
    this.style = initialStyle ? { ...initialStyle } : {};
  }

  fg(color: Color): this {
    // Clone the style to ensure immutability
    const newBuilder = new StyleBuilderImpl(this.styles, { ...this.style });
    newBuilder.style.fg = color;
    return newBuilder as this;
  }

  bg(color: Color): this {
    // Clone the style to ensure immutability
    const newBuilder = new StyleBuilderImpl(this.styles, { ...this.style });
    newBuilder.style.bg = color;
    return newBuilder as this;
  }

  bold(enabled = true): this {
    const newBuilder = new StyleBuilderImpl(this.styles, { ...this.style });
    if (enabled) newBuilder.style.bold = true;
    else delete newBuilder.style.bold;
    return newBuilder as this;
  }

  italic(enabled = true): this {
    const newBuilder = new StyleBuilderImpl(this.styles, { ...this.style });
    if (enabled) newBuilder.style.italic = true;
    else delete newBuilder.style.italic;
    return newBuilder as this;
  }

  underline(enabled = true): this {
    const newBuilder = new StyleBuilderImpl(this.styles, { ...this.style });
    if (enabled) newBuilder.style.underline = true;
    else delete newBuilder.style.underline;
    return newBuilder as this;
  }

  strike(enabled = true): this {
    return this.strikethrough(enabled);
  }

  strikethrough(enabled = true): this {
    const newBuilder = new StyleBuilderImpl(this.styles, { ...this.style });
    if (enabled) newBuilder.style.strikethrough = true;
    else delete newBuilder.style.strikethrough;
    return newBuilder as this;
  }

  dim(enabled = true): this {
    const newBuilder = new StyleBuilderImpl(this.styles, { ...this.style });
    if (enabled) newBuilder.style.dim = true;
    else delete newBuilder.style.dim;
    return newBuilder as this;
  }

  inverse(enabled = true): this {
    const newBuilder = new StyleBuilderImpl(this.styles, { ...this.style });
    if (enabled) newBuilder.style.inverse = true;
    else delete newBuilder.style.inverse;
    return newBuilder as this;
  }

  hidden(enabled = true): this {
    const newBuilder = new StyleBuilderImpl(this.styles, { ...this.style });
    if (enabled) newBuilder.style.hidden = true;
    else delete newBuilder.style.hidden;
    return newBuilder as this;
  }

  blink(enabled = true): this {
    const newBuilder = new StyleBuilderImpl(this.styles, { ...this.style });
    if (enabled) newBuilder.style.blink = true;
    else delete newBuilder.style.blink;
    return newBuilder as this;
  }

  overline(enabled = true): this {
    const newBuilder = new StyleBuilderImpl(this.styles, { ...this.style });
    if (enabled) newBuilder.style.overline = true;
    else delete newBuilder.style.overline;
    return newBuilder as this;
  }

  merge(other: Style): this {
    const newBuilder = new StyleBuilderImpl(this.styles, { ...this.style, ...other });
    return newBuilder as this;
  }

  inherit(parent: Style): this {
    const newBuilder = new StyleBuilderImpl(this.styles, { ...parent, ...this.style });
    return newBuilder as this;
  }

  build(): Style {
    // Return a copy of the style
    return { ...this.style };
  }

  toSequence(): string {
    return this.styles.apply(this.style);
  }

  toString(): string {
    return this.styles.apply(this.style);
  }
}

/**
 * Style system implementation
 */
export class StylesImpl implements Styles {
  private colors: Colors;

  constructor(colors?: Colors) {
    // Default to TrueColor for full RGB support
    this.colors = colors || new ColorSystem(ColorDepth.TrueColor);
  }

  /**
   * Apply a style and return the escape sequence
   */
  apply(style: Style): string {
    const codes: string[] = [];

    // Apply colors
    if (style.fg) {
      codes.push(this.colors.toForeground(style.fg));
    }
    if (style.bg) {
      codes.push(this.colors.toBackground(style.bg));
    }

    // Apply text decorations
    if (style.bold) codes.push(ansi.bold());
    if (style.italic) codes.push(ansi.italic());
    if (style.underline) codes.push(ansi.underline());
    if (style.strikethrough) codes.push(ansi.strikethrough());
    if (style.dim) codes.push(ansi.dim());
    if (style.inverse) codes.push(ansi.inverse());
    if (style.hidden) codes.push(ansi.hidden());
    if (style.blink) {
      codes.push(ansi.blink());
    }
    if (style.overline) codes.push(ansi.overline());

    // Handle underline style variants
    if (style.underlineStyle) {
      switch (style.underlineStyle) {
        case 'single':
          codes.push(ansi.underline());
          break;
        case 'double':
          codes.push('\x1b[21m'); // Double underline
          break;
        case 'curly':
          codes.push('\x1b[4:3m'); // Curly underline
          break;
        case 'dotted':
          codes.push('\x1b[4:4m'); // Dotted underline
          break;
        case 'dashed':
          codes.push('\x1b[4:5m'); // Dashed underline
          break;
        default:
          // Unknown underline style - use single underline as fallback
          codes.push(ansi.underline());
          break;
      }
    }

    return codes.join('');
  }

  /**
   * Merge multiple styles into one
   */
  merge(...styles: Style[]): Style {
    const merged = {} as any;

    for (const style of styles) {
      if (style.fg !== undefined) merged.fg = style.fg;
      if (style.bg !== undefined) merged.bg = style.bg;
      if (style.bold !== undefined) merged.bold = style.bold;
      if (style.italic !== undefined) merged.italic = style.italic;
      if (style.underline !== undefined) merged.underline = style.underline;
      if (style.strikethrough !== undefined) merged.strikethrough = style.strikethrough;
      if (style.dim !== undefined) merged.dim = style.dim;
      if (style.inverse !== undefined) merged.inverse = style.inverse;
      if (style.hidden !== undefined) merged.hidden = style.hidden;
      if (style.blink !== undefined) merged.blink = style.blink;
      if (style.overline !== undefined) merged.overline = style.overline;
      if (style.underlineColor !== undefined) merged.underlineColor = style.underlineColor;
      if (style.underlineStyle !== undefined) merged.underlineStyle = style.underlineStyle;
    }

    return merged as Style;
  }

  /**
   * Reset all styles
   */
  reset(): string {
    return ansi.reset();
  }

  /**
   * Reset all styles and colors
   */
  resetAll(): string {
    return ansi.reset();
  }

  /**
   * Individual style codes
   */
  bold(): string {
    return ansi.bold();
  }

  italic(): string {
    return ansi.italic();
  }

  underline(): string {
    return ansi.underline();
  }

  strikethrough(): string {
    return ansi.strikethrough();
  }

  dim(): string {
    return ansi.dim();
  }

  bright(): string {
    // Bright is typically represented as bold in ANSI
    return ansi.bold();
  }

  inverse(): string {
    return ansi.inverse();
  }

  hidden(): string {
    return ansi.hidden();
  }

  blink(): string {
    return ansi.blink();
  }

  overline(): string {
    return ansi.overline();
  }

  /**
   * Reset individual styles
   */
  resetBold(): string {
    return ansi.resetBold();
  }

  resetItalic(): string {
    return ansi.resetItalic();
  }

  resetUnderline(): string {
    return ansi.resetUnderline();
  }

  resetStrikethrough(): string {
    return ansi.resetStrikethrough();
  }

  resetDim(): string {
    return ansi.resetDim();
  }

  resetBright(): string {
    // Reset bright is typically same as reset bold
    return ansi.resetBold();
  }

  resetInverse(): string {
    return ansi.resetInverse();
  }

  resetHidden(): string {
    return ansi.resetHidden();
  }

  resetBlink(): string {
    return ansi.resetBlink();
  }

  resetOverline(): string {
    return ansi.resetOverline();
  }

  /**
   * Create a style builder
   */
  builder(): StyleBuilder {
    return new StyleBuilderImpl(this);
  }

  /**
   * Create a style builder (alias for tests)
   */
  create(): StyleBuilder {
    return new StyleBuilderImpl(this);
  }
}

// Export the implementation class
// Export aliases for backward compatibility with tests
export { StylesImpl as Styles };
export { StyleBuilderImpl as StyleBuilder };

export default StylesImpl;
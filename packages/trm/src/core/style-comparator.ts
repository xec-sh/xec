/**
 * Efficient style comparison utilities
 * Replaces slow JSON.stringify comparisons with optimized hash-based approach
 */

import type { Style, Color } from '../types.js';

/**
 * Fast style comparator using caching and efficient comparison
 */
export class StyleComparator {
  private cache = new WeakMap<Style, string>();
  private colorCache = new Map<Color, string>();
  
  /**
   * Generate a hash for a style object
   * Uses cached results when possible
   */
  hash(style: Style | undefined): string {
    if (!style) return '';
    
    // Check cache first
    const cached = this.cache.get(style);
    if (cached !== undefined) return cached;
    
    // Build hash from style properties
    const parts: string[] = [];
    
    // Add color properties
    if (style.fg !== undefined) {
      parts.push('fg:' + this.colorToString(style.fg));
    }
    if (style.bg !== undefined) {
      parts.push('bg:' + this.colorToString(style.bg));
    }
    
    // Add boolean properties (only if true)
    if (style.bold) parts.push('b');
    if (style.italic) parts.push('i');
    if (style.underline) parts.push('u');
    if (style.strikethrough) parts.push('s');
    if (style.dim) parts.push('d');
    if (style.inverse) parts.push('v');
    if (style.hidden) parts.push('h');
    if (style.blink) parts.push('k');
    if (style.overline) parts.push('o');
    
    // Add underline style if present
    if (style.underlineStyle) {
      parts.push('us:' + style.underlineStyle);
    }
    
    const hash = parts.join('|');
    this.cache.set(style, hash);
    return hash;
  }
  
  /**
   * Compare two styles for equality
   * Much faster than JSON.stringify comparison
   */
  equals(a: Style | undefined, b: Style | undefined): boolean {
    // Fast path for same reference or both undefined
    if (a === b) return true;
    if (!a || !b) return false;
    
    // Compare using hash (which is cached)
    return this.hash(a) === this.hash(b);
  }
  
  /**
   * Check if styles differ
   */
  differs(a: Style | undefined, b: Style | undefined): boolean {
    return !this.equals(a, b);
  }
  
  /**
   * Convert a color to a string representation
   */
  private colorToString(color: Color): string {
    // Check cache first
    const cached = this.colorCache.get(color);
    if (cached !== undefined) return cached;
    
    let str: string;
    
    // Handle string colors (default, transparent)
    if (typeof color === 'string') {
      str = color;
    } else if (typeof color === 'object' && color !== null) {
      // Check color type based on properties
      if ('name' in color && 'bright' in color) {
        // AnsiColor
        str = `ansi:${color.name}:${color.bright}`;
      } else if ('value' in color) {
        // Ansi256Color
        str = `ansi256:${color.value}`;
      } else if ('r' in color && 'g' in color && 'b' in color) {
        // RGBColor
        str = `rgb(${color.r},${color.g},${color.b})`;
      } else if ('h' in color && 's' in color && 'l' in color) {
        // HSLColor
        str = `hsl(${color.h},${color.s},${color.l})`;
      } else {
        // Fallback for unknown color objects
        str = JSON.stringify(color);
      }
    } else {
      // Fallback for unknown types
      str = String(color);
    }
    
    // Cache the result
    if (this.colorCache.size > 1000) {
      // Prevent unbounded cache growth
      this.colorCache.clear();
    }
    this.colorCache.set(color, str);
    
    return str;
  }
  
  /**
   * Clear all caches
   */
  clearCache(): void {
    // WeakMap clears automatically
    this.colorCache.clear();
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): {
    colorCacheSize: number;
  } {
    return {
      colorCacheSize: this.colorCache.size
    };
  }
}

// Export a singleton instance for convenience
export const styleComparator = new StyleComparator();
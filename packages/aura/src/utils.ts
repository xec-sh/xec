import { TextAttributes } from "./types.js"

export function createTextAttributes({
  bold = false,
  italic = false,
  underline = false,
  dim = false,
  blink = false,
  inverse = false,
  hidden = false,
  strikethrough = false,
}: {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  dim?: boolean
  blink?: boolean
  inverse?: boolean
  hidden?: boolean
  strikethrough?: boolean
} = {}): number {
  let attributes = TextAttributes.NONE

  if (bold) attributes |= TextAttributes.BOLD
  if (italic) attributes |= TextAttributes.ITALIC
  if (underline) attributes |= TextAttributes.UNDERLINE
  if (dim) attributes |= TextAttributes.DIM
  if (blink) attributes |= TextAttributes.BLINK
  if (inverse) attributes |= TextAttributes.INVERSE
  if (hidden) attributes |= TextAttributes.HIDDEN
  if (strikethrough) attributes |= TextAttributes.STRIKETHROUGH

  return attributes
}


/**
 * Calculate the visual width of a string in terminal columns
 * @param str - The string to measure
 * @returns The visual width in terminal columns
 */
export function stringWidth(str: string): number {
  if (!str || str.length === 0) return 0;

  // Remove ANSI escape codes
  const ansiRegex = /\x1b\[[\d;]*m/g;
  const cleaned = str.replace(ansiRegex, '');

  let width = 0;
  for (const char of cleaned) {
    const code = char.charCodeAt(0);

    // Basic width calculation:
    // - ASCII characters: width 1
    // - CJK characters: width 2
    // - Zero-width characters: width 0

    if (code === 0 || code === 0x0008 || (code >= 0x0000D && code <= 0x0001F)) {
      // Control characters
      width += 0;
    } else if (code >= 0x1100 && code <= 0x115F) {
      // Hangul Jamo
      width += 2;
    } else if (code >= 0x2E80 && code <= 0x9FFF) {
      // CJK characters
      width += 2;
    } else if (code >= 0xAC00 && code <= 0xD7AF) {
      // Hangul Syllables
      width += 2;
    } else if (code >= 0xF900 && code <= 0xFAFF) {
      // CJK Compatibility Ideographs
      width += 2;
    } else if (code >= 0xFE30 && code <= 0xFE6F) {
      // CJK Compatibility Forms
      width += 2;
    } else if (code >= 0xFF00 && code <= 0xFF60) {
      // Fullwidth Forms
      width += 2;
    } else if (code >= 0xFFE0 && code <= 0xFFE6) {
      // Fullwidth Forms
      width += 2;
    } else {
      // Default: single width
      width += 1;
    }
  }

  return width;
}

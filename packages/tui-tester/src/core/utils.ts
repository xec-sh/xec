/**
 * E2E Testing Utilities
 * Helper functions for terminal output parsing and manipulation
 */

import type { Point, Rectangle, AssertionOptions } from './types.js';

/**
 * Strip ANSI escape codes from text
 */
export function stripAnsi(text: string): string {
  // Comprehensive ANSI escape sequence removal
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')     // CSI sequences
    .replace(/\x1b\][0-9];[^\x07]*\x07/g, '')   // OSC sequences
    .replace(/\x1b[PX^_].*?\x1b\\/g, '')        // DCS/SOS/PM/APC sequences
    .replace(/\x1b[=><!~]/g, '')                // Various other escapes
    .replace(/\x1b\[[0-9;]*[mGKHfJ]/g, '')      // Common CSI codes
    .replace(/\x1b\[[\d;]*\d*[A-Za-z]/g, '')    // General CSI
    .replace(/\x1b\(\w/g, '')                   // Character set selection
    .replace(/\x1b\[\?[\d;]*[hlc]/g, '')        // Private mode sequences
    .replace(/\x08/g, '');                      // Backspace
}

/**
 * Parse screen content into a 2D grid
 */
export function parseScreen(content: string, cols: number, rows: number): string[][] {
  const lines = content.split('\n');
  const grid: string[][] = [];

  for (let y = 0; y < rows; y++) {
    grid[y] = [];
    const line = lines[y] || '';
    for (let x = 0; x < cols; x++) {
      grid[y][x] = line[x] || ' ';
    }
  }

  return grid;
}

/**
 * Find text position in screen content
 */
export function findText(content: string, searchText: string): Point[] {
  const positions: Point[] = [];
  const lines = content.split('\n');

  for (let y = 0; y < lines.length; y++) {
    let x = lines[y].indexOf(searchText);
    while (x !== -1) {
      positions.push({ x, y });
      x = lines[y].indexOf(searchText, x + 1);
    }
  }

  return positions;
}

/**
 * Extract a rectangular region from screen content
 */
export function extractRegion(content: string, region: Rectangle): string {
  const lines = content.split('\n');
  const extracted: string[] = [];

  for (let y = region.y; y < region.y + region.height && y < lines.length; y++) {
    const line = lines[y] || '';
    const start = region.x;
    const end = Math.min(region.x + region.width, line.length);
    extracted.push(line.substring(start, end));
  }

  return extracted.join('\n');
}

/**
 * Normalize text for comparison
 */
export function normalizeText(text: string, options: AssertionOptions = {}): string {
  let normalized = text;

  if (options.ignoreAnsi) {
    normalized = stripAnsi(normalized);
  }

  if (options.normalizeLineEndings) {
    normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  if (options.trimLines) {
    normalized = normalized.split('\n').map(line => line.trim()).join('\n');
  }

  if (options.ignoreWhitespace) {
    normalized = normalized.replace(/\s+/g, ' ').trim();
  }

  if (options.ignoreCase) {
    normalized = normalized.toLowerCase();
  }

  return normalized;
}

/**
 * Compare two screen contents with options
 */
export function compareScreens(actual: string, expected: string, options: AssertionOptions = {}): boolean {
  const normalizedActual = normalizeText(actual, options);
  const normalizedExpected = normalizeText(expected, options);
  return normalizedActual === normalizedExpected;
}

/**
 * Generate diff between two screen contents
 */
export function screenDiff(actual: string, expected: string): string {
  const actualLines = actual.split('\n');
  const expectedLines = expected.split('\n');
  const diff: string[] = [];

  const maxLines = Math.max(actualLines.length, expectedLines.length);

  for (let i = 0; i < maxLines; i++) {
    const actualLine = actualLines[i] || '';
    const expectedLine = expectedLines[i] || '';

    if (actualLine !== expectedLine) {
      diff.push(`Line ${i + 1}:`);
      diff.push(`  Expected: "${expectedLine}"`);
      diff.push(`  Actual:   "${actualLine}"`);
    }
  }

  return diff.join('\n');
}

/**
 * Wait with timeout
 */
export async function waitFor<T>(
  fn: () => Promise<T | undefined>,
  options: { timeout?: number; interval?: number; message?: string } = {}
): Promise<T> {
  const timeout = options.timeout ?? 5000;
  const interval = options.interval ?? 100;
  const message = options.message ?? 'Timeout waiting for condition';

  const startTime = Date.now();

  while (true) {
    const result = await fn();
    if (result !== undefined) {
      return result;
    }

    if (Date.now() - startTime > timeout) {
      throw new Error(`${message} (timeout: ${timeout}ms)`);
    }

    await sleep(interval);
  }
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Alias for compatibility
export const delay = sleep;

/**
 * Format timestamp for logging
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toISOString().replace('T', ' ').substring(0, 23);
}

/**
 * Generate session name
 */
export function generateSessionName(prefix?: string): string {
  const p = prefix || 'tui-test';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${p}-${timestamp}-${random}`;
}

/**
 * Parse screen lines from content
 */
export function parseScreenLines(content: string): string[] {
  // Normalize line endings first, then split and strip ANSI
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized.split('\n').map(line => stripAnsi(line));
}

/**
 * Wait for a condition to be met
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<boolean> {
  const timeout = options.timeout ?? 5000;
  const interval = options.interval ?? 100;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await condition();
    if (result) {
      return true;
    }
    await sleep(interval);
  }

  return false;
}

/**
 * Escape regex special characters
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalize line endings
 */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Trim empty lines from screen content
 */
export function trimScreenContent(content: string | string[]): string | string[] {
  // Handle both string and array inputs
  const isArray = Array.isArray(content);
  const lines = isArray ? content : content.split('\n');

  // Remove empty lines from start
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }

  // Remove empty lines from end
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  return isArray ? lines : lines.join('\n');
}

/**
 * Check if a command is available
 */
export async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);

    const cmd = command.split(' ')[0];
    
    // Check with extended PATH to include common installation locations
    const env = {
      ...process.env,
      PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`
    };
    
    await execAsync(`which ${cmd}`, { env });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get terminal size
 */
export function getTerminalSize(): { cols: number; rows: number } {
  if (typeof process !== 'undefined' && process.stdout && process.stdout.isTTY) {
    return {
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 24
    };
  }
  return { cols: 80, rows: 24 };
}

/**
 * Escape shell arguments
 */
export function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Parse tmux key notation
 */
export function parseTmuxKey(key: string, modifiers?: { ctrl?: boolean; alt?: boolean; shift?: boolean }): string {
  const keyMap: Record<string, string> = {
    'enter': 'Enter',
    'return': 'Enter',
    'tab': 'Tab',
    'escape': 'Escape',
    'esc': 'Escape',
    'space': 'Space',
    'backspace': 'BSpace',
    'delete': 'Delete',
    'up': 'Up',
    'down': 'Down',
    'left': 'Left',
    'right': 'Right',
    'home': 'Home',
    'end': 'End',
    'pageup': 'PageUp',
    'pagedown': 'PageDown',
    'insert': 'Insert',
    'f1': 'F1',
    'f2': 'F2',
    'f3': 'F3',
    'f4': 'F4',
    'f5': 'F5',
    'f6': 'F6',
    'f7': 'F7',
    'f8': 'F8',
    'f9': 'F9',
    'f10': 'F10',
    'f11': 'F11',
    'f12': 'F12',
  };

  let tmuxKey = keyMap[key.toLowerCase()] || key;

  // Apply modifiers
  if (modifiers) {
    const prefixes: string[] = [];
    if (modifiers.ctrl) prefixes.push('C-');
    if (modifiers.alt) prefixes.push('M-');
    if (modifiers.shift) prefixes.push('S-');

    if (prefixes.length > 0 && tmuxKey.length === 1) {
      // For single characters with modifiers
      tmuxKey = prefixes.join('') + tmuxKey.toLowerCase();
    } else if (prefixes.length > 0) {
      // For special keys with modifiers
      tmuxKey = prefixes.join('') + tmuxKey;
    }
  }

  return tmuxKey;
}

/**
 * Parse mouse event for tmux
 */
export function parseTmuxMouse(x: number, y: number, button: 'left' | 'middle' | 'right' = 'left'): string {
  // Tmux mouse events use different formats depending on the mode
  // This is a simplified version - real implementation would need more detail
  const buttonMap = {
    'left': 0,
    'middle': 1,
    'right': 2
  };

  // Convert to tmux mouse sequence (SGR mode)
  return `\x1b[<${buttonMap[button]};${x + 1};${y + 1}M`;
}

/**
 * Extract cursor position from ANSI sequence
 */
export function extractCursorPosition(ansiResponse: string): Point | null {
  // Parse cursor position report: ESC[<row>;<col>R
  const match = ansiResponse.match(/\x1b\[(\d+);(\d+)R/);
  if (match) {
    return {
      x: parseInt(match[2]) - 1, // Convert from 1-based to 0-based
      y: parseInt(match[1]) - 1
    };
  }
  return null;
}

/**
 * Split text into lines preserving empty lines
 */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/**
 * Join lines with proper line endings
 */
export function joinLines(lines: string[], lineEnding: '\n' | '\r\n' = '\n'): string {
  return lines.join(lineEnding);
}

/**
 * Calculate text dimensions (accounting for wide characters)
 */
export function getTextDimensions(text: string): { width: number; height: number } {
  const lines = splitLines(text);
  const height = lines.length;
  const width = Math.max(...lines.map(line => getStringWidth(line)));
  return { width, height };
}

/**
 * Get display width of a string (accounting for wide characters)
 */
export function getStringWidth(str: string): number {
  let width = 0;
  for (const char of str) {
    width += getCharWidth(char);
  }
  return width;
}

/**
 * Get display width of a character
 */
export function getCharWidth(char: string): number {
  const code = char.charCodeAt(0);

  // Control characters
  if (code < 0x20 || (code >= 0x7F && code < 0xA0)) {
    return 0;
  }

  // Wide characters (simplified check)
  if (
    (code >= 0x1100 && code <= 0x115F) || // Hangul Jamo
    (code >= 0x2E80 && code <= 0x9FFF) || // CJK
    (code >= 0xAC00 && code <= 0xD7AF) || // Hangul Syllables
    (code >= 0xF900 && code <= 0xFAFF) || // CJK Compatibility
    (code >= 0xFE30 && code <= 0xFE4F) || // CJK Compatibility Forms
    (code >= 0xFF00 && code <= 0xFF60) || // Fullwidth Forms
    (code >= 0xFFE0 && code <= 0xFFE6)    // Fullwidth Forms
  ) {
    return 2;
  }

  return 1;
}

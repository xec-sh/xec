/**
 * ANSI escape sequence generation
 * Provides low-level terminal control sequences
 */

import { type ANSI, MouseMode, CursorShape } from '../types.js';

// Control sequence introducers
const ESC = '\x1b';
const CSI = `${ESC}[`;
const OSC = `${ESC}]`;
const DCS = `${ESC}P`;
const ST = `${ESC}\\`;
const BEL = '\x07';

/**
 * ANSI escape sequence generator
 * All methods return strings that can be written to the terminal
 */
export class ANSISequences implements ANSI {
  // ============================================================================
  // Cursor Movement
  // ============================================================================
  
  cursorUp(n = 1): string {
    return `${CSI}${n}A`;
  }
  
  cursorDown(n = 1): string {
    return `${CSI}${n}B`;
  }
  
  cursorForward(n = 1): string {
    return `${CSI}${n}C`;
  }
  
  cursorBack(n = 1): string {
    return `${CSI}${n}D`;
  }
  
  cursorPosition(row: number, col: number): string {
    return `${CSI}${row};${col}H`;
  }
  
  cursorColumn(col: number): string {
    return `${CSI}${col}G`;
  }
  
  cursorHome(): string {
    return `${CSI}H`;
  }
  
  cursorHorizontalAbsolute(col: number): string {
    return `${CSI}${col}G`;
  }
  
  cursorNextLine(n = 1): string {
    return `${CSI}${n}E`;
  }
  
  cursorPreviousLine(n = 1): string {
    return `${CSI}${n}F`;
  }
  
  // ============================================================================
  // Cursor Visibility & Style
  // ============================================================================
  
  cursorShow(): string {
    return `${CSI}?25h`;
  }
  
  cursorHide(): string {
    return `${CSI}?25l`;
  }
  
  cursorShape(shape: CursorShape): string {
    // Use DECSCUSR sequences - map to test expectations
    return `${CSI}${shape} q`;
  }
  
  cursorBlink(enable: boolean): string {
    return enable ? `${CSI}?12h` : `${CSI}?12l`;
  }
  
  // Save/Restore cursor position
  cursorSave(): string {
    return `${ESC}7`;
  }
  
  saveCursor(): string {
    return `${ESC}7`;
  }
  
  cursorRestore(): string {
    return `${ESC}8`;
  }
  
  restoreCursor(): string {
    return `${ESC}8`;
  }
  
  // Alternative save/restore (DECSC/DECRC)
  cursorSavePosition(): string {
    return `${CSI}s`;
  }
  
  cursorRestorePosition(): string {
    return `${CSI}u`;
  }
  
  // ============================================================================
  // Screen Control
  // ============================================================================
  
  clearScreen(): string {
    return `${CSI}2J`;
  }
  
  clearScreenDown(): string {
    return `${CSI}0J`;
  }
  
  clearScreenUp(): string {
    return `${CSI}1J`;
  }
  
  clearLine(): string {
    return `${CSI}2K`;
  }
  
  clearLineRight(): string {
    return `${CSI}0K`;
  }
  
  clearLineLeft(): string {
    return `${CSI}1K`;
  }
  
  clearToEndOfLine(): string {
    return `${CSI}0K`;
  }
  
  clearToStartOfLine(): string {
    return `${CSI}1K`;
  }
  
  clearFromCursorDown(): string {
    return `${CSI}0J`;
  }
  
  clearFromCursorUp(): string {
    return `${CSI}1J`;
  }
  
  // ============================================================================
  // Scrolling
  // ============================================================================
  
  scrollUp(n = 1): string {
    return `${CSI}${n}S`;
  }
  
  scrollDown(n = 1): string {
    return `${CSI}${n}T`;
  }
  
  setScrollRegion(top: number, bottom: number): string {
    return `${CSI}${top};${bottom}r`;
  }
  
  resetScrollRegion(): string {
    return `${CSI}r`;
  }
  
  // ============================================================================
  // Alternative Buffer
  // ============================================================================
  
  alternateBufferEnable(): string {
    return `${CSI}?1049h`;
  }
  
  alternateBufferDisable(): string {
    return `${CSI}?1049l`;
  }
  
  // Alternative sequences for compatibility
  alternateScreenEnable(): string {
    return `${CSI}?47h`;
  }
  
  alternateScreenDisable(): string {
    return `${CSI}?47l`;
  }
  
  saveScreen(): string {
    return `${CSI}?47h`;
  }
  
  restoreScreen(): string {
    return `${CSI}?47l`;
  }
  
  // ============================================================================
  // Mouse Support
  // ============================================================================
  
  mouseEnable(mode?: MouseMode): string {
    if (!mode || mode === MouseMode.Click) {
      return `${CSI}?1000h`;
    } else if (mode === MouseMode.Drag) {
      return `${CSI}?1002h`;
    } else if (mode === MouseMode.Movement) {
      return `${CSI}?1003h`;
    }
    return `${CSI}?1000h`;
  }
  
  mouseDisable(): string {
    return `${CSI}?1000l${CSI}?1002l${CSI}?1003l`;
  }
  
  mouseEnableAll(): string {
    // Enable all mouse events (1000 = normal, 1002 = drag, 1003 = all motion)
    return `${CSI}?1000h${CSI}?1002h${CSI}?1003h`;
  }
  
  mouseDisableAll(): string {
    return `${CSI}?1000l${CSI}?1002l${CSI}?1003l`;
  }
  
  mouseEnableSGR(): string {
    // Enable SGR mouse mode (better than default, supports larger coordinates)
    return `${CSI}?1006h`;
  }
  
  mouseDisableSGR(): string {
    return `${CSI}?1006l`;
  }
  
  mouseEnableUrxvt(): string {
    // Enable urxvt mouse mode
    return `${CSI}?1015h`;
  }
  
  mouseDisableUrxvt(): string {
    return `${CSI}?1015l`;
  }
  
  // ============================================================================
  // Bracketed Paste Mode
  // ============================================================================
  
  bracketedPasteEnable(): string {
    return `${CSI}?2004h`;
  }
  
  bracketedPasteDisable(): string {
    return `${CSI}?2004l`;
  }
  
  // ============================================================================
  // Focus Tracking
  // ============================================================================
  
  focusTrackingEnable(): string {
    return `${CSI}?1004h`;
  }
  
  focusTrackingDisable(): string {
    return `${CSI}?1004l`;
  }
  
  // ============================================================================
  // Colors and Styling
  // ============================================================================
  
  reset(): string {
    return `${CSI}0m`;
  }
  
  bold(): string {
    return `${CSI}1m`;
  }
  
  dim(): string {
    return `${CSI}2m`;
  }
  
  italic(): string {
    return `${CSI}3m`;
  }
  
  underline(): string {
    return `${CSI}4m`;
  }
  
  blink(): string {
    return `${CSI}5m`;
  }
  
  inverse(): string {
    return `${CSI}7m`;
  }
  
  hidden(): string {
    return `${CSI}8m`;
  }
  
  strikethrough(): string {
    return `${CSI}9m`;
  }
  
  overline(): string {
    return `${CSI}53m`;
  }
  
  // Reset individual styles
  resetBold(): string {
    return `${CSI}22m`;
  }
  
  resetDim(): string {
    return `${CSI}22m`;
  }
  
  resetItalic(): string {
    return `${CSI}23m`;
  }
  
  resetUnderline(): string {
    return `${CSI}24m`;
  }
  
  resetBlink(): string {
    return `${CSI}25m`;
  }
  
  resetInverse(): string {
    return `${CSI}27m`;
  }
  
  resetHidden(): string {
    return `${CSI}28m`;
  }
  
  resetStrikethrough(): string {
    return `${CSI}29m`;
  }
  
  resetOverline(): string {
    return `${CSI}55m`;
  }
  
  // Foreground colors
  fgColor(n: number): string {
    if (n < 8) {
      return `${CSI}${30 + n}m`;
    } else if (n < 16) {
      return `${CSI}${90 + (n - 8)}m`;
    } else {
      return `${CSI}38;5;${n}m`;
    }
  }
  
  foreground(n: number): string {
    if (n < 8) {
      return `${CSI}${30 + n}m`;
    } else if (n < 16) {
      return `${CSI}${90 + (n - 8)}m`;
    } else {
      return `${CSI}38;5;${n}m`;
    }
  }
  
  fgRGB(r: number, g: number, b: number): string {
    return `${CSI}38;2;${r};${g};${b}m`;
  }
  
  fgColor256(n: number): string {
    return `${CSI}38;5;${n}m`;
  }
  
  fgColorRGB(r: number, g: number, b: number): string {
    return `${CSI}38;2;${r};${g};${b}m`;
  }
  
  fgDefault(): string {
    return `${CSI}39m`;
  }
  
  // Background colors
  bgColor(n: number): string {
    if (n < 8) {
      return `${CSI}${40 + n}m`;
    } else if (n < 16) {
      return `${CSI}${100 + (n - 8)}m`;
    } else {
      return `${CSI}48;5;${n}m`;
    }
  }
  
  background(n: number): string {
    if (n < 8) {
      return `${CSI}${40 + n}m`;
    } else if (n < 16) {
      return `${CSI}${100 + (n - 8)}m`;
    } else {
      return `${CSI}48;5;${n}m`;
    }
  }
  
  bgRGB(r: number, g: number, b: number): string {
    return `${CSI}48;2;${r};${g};${b}m`;
  }
  
  bgColor256(n: number): string {
    return `${CSI}48;5;${n}m`;
  }
  
  bgColorRGB(r: number, g: number, b: number): string {
    return `${CSI}48;2;${r};${g};${b}m`;
  }
  
  bgDefault(): string {
    return `${CSI}49m`;
  }
  
  // Underline colors (not widely supported)
  underlineColor(n: number): string {
    return `${CSI}58;5;${n}m`;
  }
  
  underlineRGB(r: number, g: number, b: number): string {
    return `${CSI}58;2;${r};${g};${b}m`;
  }
  
  underlineDefault(): string {
    return `${CSI}59m`;
  }
  
  // ============================================================================
  // Line Drawing & Box Characters
  // ============================================================================
  
  enableLineDrawing(): string {
    return `${ESC}(0`;
  }
  
  disableLineDrawing(): string {
    return `${ESC}(B`;
  }
  
  // ============================================================================
  // Terminal Modes
  // ============================================================================
  
  applicationKeypad(): string {
    return `${CSI}?1h`;
  }
  
  normalKeypad(): string {
    return `${CSI}?1l`;
  }
  
  // ============================================================================
  // Device Control
  // ============================================================================
  
  deviceStatusReport(): string {
    return `${CSI}5n`;
  }
  
  getCursorPosition(): string {
    return `${CSI}6n`;
  }
  
  getTerminalSize(): string {
    return `${CSI}18t`;
  }
  
  // ============================================================================
  // Window Title
  // ============================================================================
  
  setTitle(title: string): string {
    return `${OSC}0;${title}${BEL}`;
  }
  
  title(title: string): string {
    return `${OSC}0;${title}${BEL}`;
  }
  
  setIconName(name: string): string {
    return `${OSC}1;${name}${BEL}`;
  }
  
  setWindowTitle(title: string): string {
    return `${OSC}2;${title}${BEL}`;
  }
  
  // ============================================================================
  // Hyperlinks (OSC 8)
  // ============================================================================
  
  link(url: string, text?: string): string {
    if (text) {
      return `${OSC}8;;${url}${BEL}${text}${OSC}8;;${BEL}`;
    }
    return `${OSC}8;;${url}${BEL}`;
  }
  
  hyperlink(url: string, text?: string): string {
    if (text) {
      return `${OSC}8;;${url}${BEL}${text}${OSC}8;;${BEL}`;
    }
    return `${OSC}8;;${url}${BEL}`;
  }
  
  endLink(): string {
    return `${OSC}8;;${BEL}`;
  }
  
  // ============================================================================
  // Notifications (OSC 777)
  // ============================================================================
  
  notify(message: string, title?: string): string {
    if (title) {
      return `${OSC}777;notify;${title};${message}${BEL}`;
    }
    return `${OSC}777;notify;;${message}${BEL}`;
  }
  
  // ============================================================================
  // Erase Functions
  // ============================================================================
  
  eraseInDisplay(mode = 0): string {
    return `${CSI}${mode}J`;
  }
  
  eraseInLine(mode = 0): string {
    return `${CSI}${mode}K`;
  }
  
  // ============================================================================
  // Bell
  // ============================================================================
  
  bell(): string {
    return BEL;
  }
  
  visualBell(): string {
    // Flash the screen (not universally supported)
    return `${ESC}[?5h${ESC}[?5l`;
  }
  
  // ============================================================================
  // Custom Sequences
  // ============================================================================
  
  csi(params: string | number[], code: string): string {
    const paramStr = Array.isArray(params) ? params.join(';') : params;
    return `${CSI}${paramStr}${code}`;
  }
  
  osc(params: string | number[]): string {
    const paramStr = Array.isArray(params) ? params.join(';') : params;
    return `${OSC}${paramStr}${BEL}`;
  }
  
  dcs(params: string): string {
    return `${DCS}${params}${ST}`;
  }
  
  // ============================================================================
  // Soft Reset
  // ============================================================================
  
  softReset(): string {
    return `${CSI}!p`;
  }
  
  // ============================================================================
  // Character Sets
  // ============================================================================
  
  charset(g: 0 | 1 | 2 | 3, charset: string): string {
    const prefixes = ['(', ')', '*', '+'];
    return `${ESC}${prefixes[g]}${charset}`;
  }
  
  // ============================================================================
  // Tab Stops
  // ============================================================================
  
  setTabStop(): string {
    return `${ESC}H`;
  }
  
  clearTabStop(): string {
    return `${CSI}0g`;
  }
  
  clearAllTabStops(): string {
    return `${CSI}3g`;
  }
}

// Export singleton instance
export const ansi = new ANSISequences();

// Also export the class for extension
export default ANSISequences;
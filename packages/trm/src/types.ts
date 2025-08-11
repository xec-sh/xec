/**
 * Core type definitions for the TRM terminal library
 * These types provide compile-time safety and clear contracts
 */

// ============================================================================
// Branded Types for Type Safety
// ============================================================================

/**
 * Branded numeric types for coordinates and dimensions
 * These prevent mixing up different numeric values at compile time
 */
export type Rows = number & { readonly __brand: 'rows' };
export type Cols = number & { readonly __brand: 'cols' };
export type X = number & { readonly __brand: 'x' };
export type Y = number & { readonly __brand: 'y' };

/**
 * Helper functions to create branded types
 */
export const rows = (n: number): Rows => n as Rows;
export const cols = (n: number): Cols => n as Cols;
export const x = (n: number): X => n as X;
export const y = (n: number): Y => n as Y;

// ============================================================================
// Platform Types
// ============================================================================

export type Runtime = 'node' | 'deno' | 'bun' | 'browser';
export type OS = 'windows' | 'darwin' | 'linux' | 'freebsd' | 'openbsd' | 'sunos' | 'aix' | 'unknown';

export interface Platform {
  readonly runtime: Runtime;
  readonly os: OS;
  readonly terminal: string; // $TERM value
  readonly shell?: string;   // $SHELL value
  readonly isWSL?: boolean;  // Windows Subsystem for Linux
  readonly isSSH?: boolean;  // SSH session detection
}

// ============================================================================
// Stream Types
// ============================================================================

export type BufferEncoding =
  | 'utf8'
  | 'utf-8'
  | 'utf16le'
  | 'latin1'
  | 'base64'
  | 'hex'
  | 'ascii'
  | 'binary'
  | 'ucs2';

export interface Disposable {
  readonly disposed?: boolean;
  dispose(): void;
  [Symbol.dispose]?(): void; // For using with 'using' statement
}

// ============================================================================
// Color Types
// ============================================================================

export enum ColorDepth {
  None = 0,         // No colors
  Basic = 4,        // 4-bit (16 colors)
  Extended = 8,     // 8-bit (256 colors)
  TrueColor = 24    // 24-bit (16.7M colors)
}

export type AnsiColorName =
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white';

export interface AnsiColor {
  readonly type: 'ansi';
  readonly value: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly bright?: boolean;
}

export interface Ansi256Color {
  readonly type: 'ansi256';
  readonly value: number; // 0-255
}

export interface RGBColor {
  readonly type: 'rgb';
  readonly r: number; // 0-255
  readonly g: number; // 0-255
  readonly b: number; // 0-255
}

export interface HSLColor {
  readonly type: 'hsl';
  readonly h: number; // 0-360
  readonly s: number; // 0-100
  readonly l: number; // 0-100
}

export type Color =
  | AnsiColor
  | Ansi256Color
  | RGBColor
  | HSLColor
  | 'default'
  | 'transparent';

// ============================================================================
// Style Types
// ============================================================================

export interface Style {
  // Colors
  readonly fg?: Color;
  readonly bg?: Color;

  // Text decorations
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strikethrough?: boolean;

  // Effects
  readonly dim?: boolean;
  readonly inverse?: boolean;
  readonly hidden?: boolean;
  readonly blink?: boolean;
  readonly overline?: boolean;

  // Advanced
  readonly underlineColor?: Color;
  readonly underlineStyle?: 'single' | 'double' | 'curly' | 'dotted' | 'dashed';
}

// ============================================================================
// Cursor Types
// ============================================================================

export enum CursorShape {
  Block = 0,
  Underline = 1,
  Bar = 2,
  BlinkingBlock = 3,
  BlinkingUnderline = 4,
  BlinkingBar = 5
}

export interface CursorPosition {
  readonly x: X;
  readonly y: Y;
}

// ============================================================================
// Input Types
// ============================================================================

export interface KeyEvent {
  readonly type: 'key';
  readonly key: string;          // The character or key name
  readonly char?: string;        // The actual character (for non-special keys)
  readonly code?: string;        // KeyboardEvent.code equivalent
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly meta: boolean;

  // Special key detection
  readonly isSpecial: boolean;
  readonly name?: string;        // 'enter', 'tab', 'up', 'down', etc.
  readonly sequence: string;     // Raw escape sequence
}

export enum MouseButton {
  Left = 0,
  Middle = 1,
  Right = 2,
  None = 3,
  ScrollUp = 4,
  ScrollDown = 5
}

export enum MouseMode {
  None = 0,
  Click = 1,
  Drag = 2,
  Movement = 3
}

export enum MouseAction {
  Press = 'press',
  Release = 'release',
  Move = 'move',
  Drag = 'drag',
  ScrollUp = 'scrollUp',
  ScrollDown = 'scrollDown'
}

export interface MouseEvent {
  readonly type: 'mouse';
  readonly x: X;
  readonly y: Y;
  readonly button: MouseButton;
  readonly action: MouseAction;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly meta: boolean;
}

export interface ResizeEvent {
  readonly type: 'resize';
  readonly rows: Rows;
  readonly cols: Cols;
  readonly previousRows: Rows;
  readonly previousCols: Cols;
}

export interface FocusEvent {
  readonly type: 'focus';
  readonly focused: boolean;
}

export interface PasteEvent {
  readonly type: 'paste';
  readonly data: string;
  readonly bracketed: boolean; // Bracketed paste mode
}

export type InputEvent =
  | KeyEvent
  | MouseEvent
  | ResizeEvent
  | FocusEvent
  | PasteEvent;

// ============================================================================
// Buffer Types
// ============================================================================

export interface Cell {
  char: string;
  width: number;      // Character width (0, 1, or 2 for wide chars)
  style?: Style;
  dirty?: boolean;    // For diff tracking
}

export interface BufferPatch {
  readonly x: X;
  readonly y: Y;
  readonly cells: ReadonlyArray<Cell>;
}

export interface ScreenBuffer {
  readonly width: Cols;
  readonly height: Rows;

  // Cell access
  setCell(x: X, y: Y, char: string, style?: Style): void;
  getCell(x: X, y: Y): Cell | undefined;

  // Text operations
  writeText(x: X, y: Y, text: string, style?: Style): void;
  writeLine(y: Y, text: string, style?: Style): void;

  // Clear operations
  clear(style?: Style): void;
  clearLine(y: Y, style?: Style): void;
  clearRect(x: X, y: Y, width: Cols, height: Rows, style?: Style): void;

  // Fill operations
  fill(char: string, style?: Style): void;
  fillRect(x: X, y: Y, width: Cols, height: Rows, char: string, style?: Style): void;

  // Copy operations
  copyFrom(
    source: ScreenBuffer,
    sx: X, sy: Y,
    dx: X, dy: Y,
    width: Cols, height: Rows
  ): void;

  // Scrolling
  scrollUp(lines: number): void;
  scrollDown(lines: number): void;

  // Clone
  clone(): ScreenBuffer;

  // Export
  toArray(): ReadonlyArray<ReadonlyArray<Cell>>;
}

// ============================================================================
// Terminal Stream Interface
// ============================================================================

export interface TerminalStream {
  // Stream access
  readonly stdin: ReadableStream<Uint8Array> | NodeJS.ReadStream;
  readonly stdout: WritableStream<Uint8Array> | NodeJS.WriteStream;
  readonly stderr: WritableStream<Uint8Array> | NodeJS.WriteStream;

  // Terminal properties
  readonly rows: Rows;
  readonly cols: Cols;
  readonly isTTY: boolean;
  readonly colorDepth: ColorDepth;

  // Raw mode control
  setRawMode(enabled: boolean): void;
  readonly isRaw: boolean;

  // Buffer control
  useAlternateBuffer(): Disposable;
  clearScreen(): void;

  // Platform info
  readonly platform: Platform;
  readonly encoding: BufferEncoding;

  // Write methods
  write(data: string | Uint8Array): void;
  writeLine(data: string): void;
  writeError(data: string | Uint8Array): void;

  // Flush output
  flush(): Promise<void>;
}

// ============================================================================
// Screen Interface
// ============================================================================

export interface Screen {
  // Dimensions
  readonly width: Cols;
  readonly height: Rows;

  // Basic operations
  clear(): void;
  clearLine(y: Y): void;
  clearToEndOfLine(x: X, y: Y): void;
  clearToStartOfLine(x: X, y: Y): void;
  clearRect(x: X, y: Y, width: Cols, height: Rows): void;

  // Scrolling
  scrollUp(lines: number): void;
  scrollDown(lines: number): void;
  setScrollRegion(top: Y, bottom: Y): void;
  resetScrollRegion(): void;

  // Cell operations
  write(text: string): void;
  writeStyled(text: string, style: Style): void;
  writeAt(x: X, y: Y, text: string, style?: Style): void;
  writeStyledAt(x: X, y: Y, text: string, style: Style): void;
  writeLineAt(y: Y, text: string, style?: Style): void;
  writeBox(x: X, y: Y, width: Cols, height: Rows, style?: Style): void;

  // Save/Restore screen
  save(): void;
  restore(): void;

  // Bell
  bell(): void;
  visualBell(): void;
}

// ============================================================================
// Cursor Interface
// ============================================================================

export interface Cursor {
  // Position
  moveTo(x: X, y: Y): void;
  moveUp(lines: number): void;
  moveDown(lines: number): void;
  moveLeft(cols: number): void;
  moveRight(cols: number): void;
  moveToColumn(col: X): void;
  moveToNextLine(lines?: number): void;
  moveToPreviousLine(lines?: number): void;

  // Position queries
  getPosition(): Promise<CursorPosition>;
  readonly position: CursorPosition;

  // Visibility
  show(): void;
  hide(): void;
  readonly visible: boolean;

  // Style
  setShape(shape: CursorShape): void;
  readonly shape: CursorShape;

  // Blinking
  enableBlink(): void;
  disableBlink(): void;
  readonly blinking: boolean;

  // Save/Restore position
  save(): void;
  restore(): void;
}

// ============================================================================
// Input Interface
// ============================================================================

export interface Input {
  // Raw input stream
  readonly stream: AsyncIterable<Uint8Array>;

  // Parsed events
  readonly events: AsyncIterable<InputEvent>;

  // Enable/disable features
  enableMouse(): void;
  disableMouse(): void;
  enableKeyboard(): void;
  disableKeyboard(): void;
  enableBracketedPaste(): void;
  disableBracketedPaste(): void;
  enableFocusTracking(): void;
  disableFocusTracking(): void;

  // Query state
  readonly mouseEnabled: boolean;
  readonly keyboardEnabled: boolean;
  readonly bracketedPasteEnabled: boolean;
  readonly focusTrackingEnabled: boolean;

  // Close input
  close(): void;
}

// ============================================================================
// Color System Interface
// ============================================================================

export interface Colors {
  // Color creation
  ansi(name: AnsiColorName, bright?: boolean): AnsiColor;
  ansi256(value: number): Ansi256Color;
  rgb(r: number, g: number, b: number): RGBColor;
  hsl(h: number, s: number, l: number): HSLColor;
  hex(hex: string): RGBColor;

  // Color conversion
  toAnsi256(color: Color): Ansi256Color;
  toRGB(color: Color): RGBColor;
  toHSL(color: Color): HSLColor;
  toHex(color: Color): string;

  // Convert to escape sequence
  toForeground(color: Color): string;
  toBackground(color: Color): string;

  // Reset
  reset(): string;
  resetForeground(): string;
  resetBackground(): string;

  // Standard colors (convenience)
  readonly black: AnsiColor;
  readonly red: AnsiColor;
  readonly green: AnsiColor;
  readonly yellow: AnsiColor;
  readonly blue: AnsiColor;
  readonly magenta: AnsiColor;
  readonly cyan: AnsiColor;
  readonly white: AnsiColor;
  readonly gray: AnsiColor;

  // Bright variants
  readonly brightBlack: AnsiColor;
  readonly brightRed: AnsiColor;
  readonly brightGreen: AnsiColor;
  readonly brightYellow: AnsiColor;
  readonly brightBlue: AnsiColor;
  readonly brightMagenta: AnsiColor;
  readonly brightCyan: AnsiColor;
  readonly brightWhite: AnsiColor;
}

// ============================================================================
// Style System Interface
// ============================================================================

export interface Styles {
  // Apply style
  apply(style: Style): string;

  // Merge styles
  merge(...styles: Style[]): Style;

  // Reset all styles
  reset(): string;

  // Individual style codes
  bold(): string;
  italic(): string;
  underline(): string;
  strikethrough(): string;
  dim(): string;
  inverse(): string;
  hidden(): string;
  blink(): string;
  overline(): string;

  // Reset individual styles
  resetBold(): string;
  resetItalic(): string;
  resetUnderline(): string;
  resetStrikethrough(): string;
  resetDim(): string;
  resetInverse(): string;
  resetHidden(): string;
  resetBlink(): string;
  resetOverline(): string;

  // Style builder
  builder(): StyleBuilder;
}

export interface StyleBuilder {
  // Colors
  fg(color: Color): this;
  bg(color: Color): this;

  // Decorations
  bold(enabled?: boolean): this;
  italic(enabled?: boolean): this;
  underline(enabled?: boolean): this;
  strikethrough(enabled?: boolean): this;
  dim(enabled?: boolean): this;
  inverse(enabled?: boolean): this;
  hidden(enabled?: boolean): this;
  blink(enabled?: boolean): this;
  overline(enabled?: boolean): this;

  // Build
  build(): Style;
  toString(): string;
}

// ============================================================================
// Geometry Types for Drawing Operations
// ============================================================================

export interface Point {
  x: X;
  y: Y;
}

export interface Rectangle {
  x: X;
  y: Y;
  width: Cols;
  height: Rows;
}

export interface LineStyle {
  char?: string;
  style?: Style;
  type?: 'single' | 'double' | 'thick' | 'dashed';
}

export interface BoxStyle {
  style?: Style;
  type?: 'single' | 'double' | 'rounded' | 'thick';
  fill?: boolean;
}

// ============================================================================
// Buffer Management Interface
// ============================================================================

export interface BufferManager {
  // Create buffer
  create(width: Cols, height: Rows): ScreenBuffer;

  // Write buffer to screen
  render(buffer: ScreenBuffer, x?: X, y?: Y): void;

  // Diff buffers
  diff(a: ScreenBuffer, b: ScreenBuffer): BufferPatch[];

  // Apply patches
  applyPatch(buffer: ScreenBuffer, patch: BufferPatch): void;
  applyPatches(buffer: ScreenBuffer, patches: BufferPatch[]): void;

  // Optimize patches
  optimizePatches(patches: BufferPatch[]): BufferPatch[];
}

// ============================================================================
// ANSI Escape Sequences Interface
// ============================================================================

export interface ANSI {
  // Cursor movement
  cursorUp(n?: number): string;
  cursorDown(n?: number): string;
  cursorForward(n?: number): string;
  cursorBack(n?: number): string;
  cursorPosition(row: number, col: number): string;
  cursorColumn(col: number): string;

  // Cursor visibility
  cursorShow(): string;
  cursorHide(): string;

  // Cursor shape
  cursorShape(shape: CursorShape): string;

  // Screen
  clearScreen(): string;
  clearScreenDown(): string;
  clearScreenUp(): string;
  clearLine(): string;
  clearLineRight(): string;
  clearLineLeft(): string;

  // Scrolling
  scrollUp(n?: number): string;
  scrollDown(n?: number): string;

  // Alternative buffer
  alternateBufferEnable(): string;
  alternateBufferDisable(): string;

  // Mouse
  mouseEnable(): string;
  mouseDisable(): string;
  mouseEnableAll(): string;
  mouseEnableSGR(): string;

  // Bracketed paste
  bracketedPasteEnable(): string;
  bracketedPasteDisable(): string;

  // Focus tracking
  focusTrackingEnable(): string;
  focusTrackingDisable(): string;

  // Build custom sequence
  csi(params: string | number[], code: string): string;
  osc(params: string | number[]): string;
  dcs(params: string): string;

  // Device control
  deviceStatusReport(): string;
  getCursorPosition(): string;

  // Links
  link(url: string, text?: string): string;

  // Bell
  bell(): string;
}

// ============================================================================
// Event System
// ============================================================================

export interface EventEmitter<T extends Record<string, any[]>> {
  on<K extends keyof T>(event: K, handler: (...args: T[K]) => void): Disposable;
  off<K extends keyof T>(event: K, handler: (...args: T[K]) => void): void;
  once<K extends keyof T>(event: K, handler: (...args: T[K]) => void): Disposable;
  emit<K extends keyof T>(event: K, ...args: T[K]): void;
  removeAllListeners<K extends keyof T>(event?: K): void;
  listenerCount<K extends keyof T>(event: K): number;
  getListeners<K extends keyof T>(event: K): Array<(...args: T[K]) => void>;
}

// Terminal events
export interface TerminalEvents extends Record<string, any[]> {
  'resize': [rows: Rows, cols: Cols];
  'focus': [focused: boolean];
  'blur': [];
  'error': [error: Error];
  'close': [];
  'data': [data: Uint8Array];
  'key': [event: KeyEvent];
  'mouse': [event: MouseEvent];
  'paste': [event: PasteEvent];
}

// ============================================================================
// Error Types
// ============================================================================

export class TerminalError extends Error {
  readonly code: string;
  readonly recoverable: boolean;

  constructor(message: string, code: string, recoverable = false) {
    super(message);
    this.name = 'TerminalError';
    this.code = code;
    this.recoverable = recoverable;
  }
}

export enum ErrorCode {
  NOT_TTY = 'NOT_TTY',
  NOT_SUPPORTED = 'NOT_SUPPORTED',
  INVALID_COLOR_DEPTH = 'INVALID_COLOR_DEPTH',
  RAW_MODE_ERROR = 'RAW_MODE_ERROR',
  STREAM_CLOSED = 'STREAM_CLOSED',
  PLATFORM_ERROR = 'PLATFORM_ERROR',
  INVALID_SEQUENCE = 'INVALID_SEQUENCE',
  TIMEOUT = 'TIMEOUT'
}

// ============================================================================
// Terminal Options
// ============================================================================

export interface TerminalOptions {
  stdin?: ReadableStream<Uint8Array> | NodeJS.ReadStream;
  stdout?: WritableStream<Uint8Array> | NodeJS.WriteStream;
  stderr?: WritableStream<Uint8Array> | NodeJS.WriteStream;

  // Render mode (default: 'inline')
  mode?: 'inline' | 'fullscreen';
  // Clear rendered content on exit (only for inline mode)
  clearOnExit?: boolean;

  // Color support
  colors?: boolean | ColorDepth;
  forceColor?: boolean;

  // Terminal modes
  rawMode?: boolean;
  alternateBuffer?: boolean;
  mouse?: boolean;
  keyboard?: boolean;
  bracketedPaste?: boolean;
  focusTracking?: boolean;

  // Cursor
  cursorHidden?: boolean;
  cursorShape?: CursorShape;

  // Performance
  bufferSize?: number;
  flushInterval?: number;

  // Platform override
  platform?: Partial<Platform>;

  // Debug
  debug?: boolean;
  logLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
}

// ============================================================================
// Terminal Interface
// ============================================================================

export interface Terminal {
  readonly stream: TerminalStream;
  readonly screen: Screen;
  readonly cursor: Cursor;
  readonly colors: Colors;
  readonly styles: Styles;
  readonly input: Input;
  readonly buffer: BufferManager;
  readonly ansi: ANSI;
  readonly events: EventEmitter<TerminalEvents>;

  // Lifecycle
  init(): Promise<void>;
  close(): Promise<void>;

  // State
  readonly initialized: boolean;
  readonly closed: boolean;

  // Utilities
  write(data: string | Uint8Array): void;
  writeLine(data: string): void;
  update(content: string): void;
  clearLastOutput(): void;
  flush(): Promise<void>;

  // Size
  getSize(): { rows: Rows; cols: Cols };

  // Save/Restore state
  saveState(): TerminalState;
  restoreState(state: TerminalState): void;
}

export interface TerminalState {
  readonly cursorPosition: CursorPosition;
  readonly cursorVisible: boolean;
  readonly cursorShape: CursorShape;
  readonly scrollRegion?: { top: Y; bottom: Y };
  readonly alternateBuffer: boolean;
  readonly rawMode: boolean;
  readonly mouseEnabled: boolean;
}

// ============================================================================
// Mock Terminal for Testing
// ============================================================================

export interface MockTerminal extends Terminal {
  // Input simulation
  sendKey(key: string, modifiers?: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
  }): void;
  sendText(text: string): void;
  sendMouse(x: X, y: Y, button: MouseButton, action: MouseAction): void;
  sendResize(rows: Rows, cols: Cols): void;
  sendFocus(focused: boolean): void;
  sendPaste(data: string): void;

  // Output capture
  getOutput(): string;
  getBuffer(): ScreenBuffer;
  getCursorPosition(): CursorPosition;
  getLastWrite(): string;

  // Time control
  tick(ms: number): void;
  flush(): Promise<void>;

  // State inspection
  getRawMode(): boolean;
  getAlternateBuffer(): boolean;
  getMouseEnabled(): boolean;
}

// ============================================================================
// Factory Functions
// ============================================================================

export type TerminalFactory = (options?: TerminalOptions) => Terminal;
export type MockTerminalFactory = (options?: TerminalOptions) => MockTerminal;
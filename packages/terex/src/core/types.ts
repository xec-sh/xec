/**
 * Core type definitions for Terex
 * No any types, no unknown types - everything is strictly typed
 */

// ============================================================================
// Terminal Types
// ============================================================================

export interface TerminalSize {
  readonly width: number;
  readonly height: number;
  readonly rows: number;
  readonly columns: number;
}

export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface Rectangle extends Position {
  readonly width: number;
  readonly height: number;
}

// Alias for Rectangle - used in some components
export type Bounds = Rectangle;

export interface Padding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

// ============================================================================
// Color Types
// ============================================================================

export type ColorMode = 'none' | '16' | '256' | 'truecolor';

export type AnsiColor = 
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'gray'
  | 'brightRed'
  | 'brightGreen'
  | 'brightYellow'
  | 'brightBlue'
  | 'brightMagenta'
  | 'brightCyan'
  | 'brightWhite';

export interface RGB {
  readonly r: number; // 0-255
  readonly g: number; // 0-255
  readonly b: number; // 0-255
}

export interface HSL {
  readonly h: number; // 0-360
  readonly s: number; // 0-100
  readonly l: number; // 0-100
}

export type Color = AnsiColor | RGB | HSL | string; // string for hex colors

export interface Style {
  readonly foreground?: Color;
  readonly background?: Color;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strikethrough?: boolean;
  readonly dim?: boolean;
  readonly inverse?: boolean;
  readonly hidden?: boolean;
  readonly blink?: boolean;
}

// ============================================================================
// Input Types
// ============================================================================

export interface Key {
  readonly sequence: string;
  readonly name: string;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
  readonly code?: string;
}

export interface MouseEvent {
  readonly type: 'click' | 'dblclick' | 'mousedown' | 'mouseup' | 'mousemove' | 'wheel';
  readonly x: number;
  readonly y: number;
  readonly button?: 'left' | 'right' | 'middle';
  readonly modifiers: {
    readonly ctrl: boolean;
    readonly meta: boolean;
    readonly shift: boolean;
    readonly alt: boolean;
  };
}

// ============================================================================
// Component Types
// ============================================================================

export interface ComponentConfig<TState = Record<string, never>> {
  readonly id?: string;
  readonly className?: string;
  readonly style?: Style;
  readonly layout?: Layout;
  readonly visible?: boolean;
  readonly focusable?: boolean;
  readonly tabIndex?: number;
  readonly state?: TState;
}

export interface ComponentOptions<TState = Record<string, never>> {
  readonly id?: string;
  readonly initialState?: TState;
  readonly children?: Component[];
}

export type ComponentState = Record<string, unknown>;

export interface Layout {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number | 'auto' | `${number}%`;
  readonly height?: number | 'auto' | `${number}%`;
  readonly padding?: number | Padding;
  readonly margin?: number | Padding;
  readonly zIndex?: number;
}

export interface ComponentLifecycle {
  mount?(): void | Promise<void>;
  unmount?(): void | Promise<void>;
  beforeRender?(): void;
  afterRender?(): void;
}

export interface ComponentEventHandlers {
  onKeyPress?(key: Key): void | boolean; // return true to prevent bubbling
  onMouseEvent?(event: MouseEvent): void | boolean;
  onFocus?(): void;
  onBlur?(): void;
  onResize?(size: TerminalSize): void;
}

export interface Component<TState = Record<string, never>> 
  extends ComponentLifecycle, ComponentEventHandlers {
  readonly id: string;
  readonly type: string;
  readonly children?: ReadonlyArray<Component<unknown>>;
  readonly parent?: Component<unknown>;
  readonly state?: TState;
  
  render(): Output;
  setState?(updates: Partial<TState>): void;
  addChild?(child: Component): void;
  removeChild?(child: Component): void;
  focus?(): void;
  blur?(): void;
}

// ============================================================================
// Render Types
// ============================================================================

export interface Output {
  readonly lines: ReadonlyArray<string>;
  readonly cursor?: Position;
  readonly style?: Style;
}

export interface RenderContext {
  readonly width: number;
  readonly height: number;
  readonly focused: boolean;
  readonly theme: Theme;
}

export interface Change {
  readonly line: number;
  readonly content: string;
  readonly style?: Style;
}

// ============================================================================
// State Types
// ============================================================================

export type StateListener<T> = (newState: T, oldState: T) => void;

export interface StateManager<T> {
  get(): T;
  set(updates: Partial<T>): void;
  subscribe(listener: StateListener<T>): () => void; // returns unsubscribe
  transaction(fn: () => void): void;
}

// ============================================================================
// Event Types
// ============================================================================

export interface EventEmitter<TEvents extends Record<string, unknown[]>> {
  on<K extends keyof TEvents>(event: K, handler: (...args: TEvents[K]) => void): void;
  off<K extends keyof TEvents>(event: K, handler: (...args: TEvents[K]) => void): void;
  emit<K extends keyof TEvents>(event: K, ...args: TEvents[K]): void;
  once<K extends keyof TEvents>(event: K, handler: (...args: TEvents[K]) => void): void;
}

// ============================================================================
// Theme Types
// ============================================================================

export interface ColorPalette {
  readonly primary: Color;
  readonly secondary: Color;
  readonly background: Color;
  readonly surface: Color;
  readonly text: Color;
  readonly textMuted: Color;
  readonly accent: Color;
  readonly success: Color;
  readonly warning: Color;
  readonly error: Color;
  readonly info: Color;
}

export interface Typography {
  readonly fonts: {
    readonly mono: string;
    readonly sans: string;
  };
  readonly sizes: {
    readonly xs: number;
    readonly sm: number;
    readonly md: number;
    readonly lg: number;
    readonly xl: number;
  };
}

export interface BorderStyles {
  readonly none: string;
  readonly solid: string;
  readonly double: string;
  readonly rounded: string;
  readonly thick: string;
}

export interface Theme {
  readonly name: string;
  readonly colors: ColorPalette;
  readonly typography: Typography;
  readonly borders: BorderStyles;
  readonly spacing: {
    readonly unit: number;
  };
}

// ============================================================================
// Stream Types
// ============================================================================

export interface TerminalStream {
  readonly input: NodeJS.ReadStream;
  readonly output: NodeJS.WriteStream;
  readonly isTTY: boolean;
  readonly colorMode: ColorMode;
}

// ============================================================================
// Utility Types
// ============================================================================

export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Branded<T, B> = T & { readonly __brand: B };

export type Pixel = Branded<number, 'Pixel'>;
export type Percentage = Branded<number, 'Percentage'>;
export type Milliseconds = Branded<number, 'Milliseconds'>;

// ============================================================================
// Test Types
// ============================================================================

export interface TestHarness {
  readonly terminal: MockTerminal;
  render(component: Component<unknown>): Promise<void>;
  sendKey(key: Partial<Key>): void;
  sendMouse(event: Partial<MouseEvent>): void;
  sendInput(text: string): void;
  getOutput(): ReadonlyArray<string>;
  clear(): void;
}

export interface MockTerminal extends TerminalStream {
  readonly mockInput: ReadonlyArray<string>;
  readonly mockOutput: ReadonlyArray<string>;
  setSize(size: TerminalSize): void;
  pushInput(input: string): void;
  getLastOutput(): string;
  getAllOutput(): string;
}
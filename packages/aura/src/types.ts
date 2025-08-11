/**
 * Core type definitions for Aura framework
 */

import type { 
  Style, 
  KeyEvent, 
  MouseEvent
} from '@xec-sh/trm';

// ============================================================================
// Reactive System Types
// ============================================================================

export interface Signal<T> {
  (): T;                                          // Getter
  peek(): T;                                      // Get value without tracking
  subscribe(fn: (value: T) => void): () => void; // Subscribe to changes
}

export interface WritableSignal<T> extends Signal<T> {
  set(value: T | ((prev: T) => T)): void;        // Setter
  update(fn: (prev: T) => T): void;              // Functional update
  mutate(fn: (value: T) => void): void;          // Mutate objects
}

export interface ComputedSignal<T> extends Signal<T> {
  readonly value: T;
}

export interface Store<T extends object> {
  get<K extends keyof T>(key: K): T[K];
  set<K extends keyof T>(key: K, value: T[K]): void;
  update(updates: Partial<T>): void;
  subscribe(fn: (state: T) => void): () => void;
  transaction(fn: (state: T) => void): void;
}

export interface Resource<T> {
  (): T | undefined;
  loading(): boolean;
  error(): Error | undefined;
  refetch(): void;
}

export interface Disposable {
  dispose(): void;
}

// ============================================================================
// Component Types
// ============================================================================

export type AuraType = 
  // Layout containers
  | 'box' | 'flex' | 'grid' | 'stack' | 'dock' | 'wrap'
  // Basic components
  | 'text' | 'input' | 'select' | 'button'
  // Data structures
  | 'table' | 'tabs' | 'tree' | 'list'
  // Visualization
  | 'chart' | 'graph' | 'sparkline'
  // Low-level
  | 'canvas' | 'terminal'
  // Indicators
  | 'spinner' | 'progress' | 'gauge'
  // Overlays
  | 'dialog' | 'modal' | 'notify';

// Position and size types
export type Position = number | 'auto' | 'center' | `${number}%`;
export type Size = number | 'auto' | 'content' | `${number}%` | `${number}fr`;

// Spacing type (top, right, bottom, left)
export type Spacing = number | [number, number] | [number, number, number, number];

// ============================================================================
// Base Props for all Aura components
// ============================================================================

export interface BaseAuraProps {
  // Children
  children?: Aura[] | Signal<Aura[]>;
  
  // Position and size
  x?: Position | Signal<Position>;
  y?: Position | Signal<Position>;
  width?: Size | Signal<Size>;
  height?: Size | Signal<Size>;
  
  // Visibility and layering
  hidden?: boolean | Signal<boolean>;
  layer?: number | Signal<number>;
  
  // Styling
  style?: Style | Signal<Style>;
  class?: string | string[];
  padding?: Spacing | number;
  margin?: Spacing | number;
  
  // Event handlers
  onKey?: (event: KeyEvent) => void | boolean;
  onMouse?: (event: MouseEvent) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  
  // Focus management
  focusable?: boolean;
  tabIndex?: number;
  
  // Animation
  animate?: AnimationOptions;
  transition?: TransitionOptions;
  
  // Accessibility
  ariaLabel?: string;
  
  // Testing
  testId?: string;
  
  // Reference
  ref?: Ref<AuraElement>;
}

// ============================================================================
// Component-specific Props
// ============================================================================

export interface BoxProps extends BaseAuraProps {
  // Box is just a container with absolute positioning
}

export interface FlexProps extends BaseAuraProps {
  direction?: 'row' | 'column' | Signal<'row' | 'column'>;
  gap?: number | Signal<number>;
  justifyContent?: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly';
  alignItems?: 'start' | 'center' | 'end' | 'stretch';
  wrap?: boolean | 'wrap' | 'nowrap' | 'wrap-reverse';
}

export interface GridProps extends BaseAuraProps {
  columns?: number | string | Signal<number | string>;
  rows?: number | string | Signal<number | string>;
  gap?: number | [number, number] | Signal<number | [number, number]>;
  autoFlow?: 'row' | 'column' | 'dense';
  justifyItems?: 'start' | 'center' | 'end' | 'stretch';
  alignItems?: 'start' | 'center' | 'end' | 'stretch';
}

export interface TextProps extends BaseAuraProps {
  value: string | Signal<string>;
  wrap?: 'none' | 'word' | 'char' | 'smart';
  align?: 'left' | 'center' | 'right' | 'justify';
  truncate?: boolean | { length: number; suffix?: string };
  markdown?: boolean;
  language?: string; // For syntax highlighting
}

export interface InputProps extends BaseAuraProps {
  value: WritableSignal<string>;
  type?: 'text' | 'password' | 'number' | 'email' | 'url' | 'search';
  placeholder?: string;
  multiline?: boolean | { minRows?: number; maxRows?: number };
  validate?: (value: string) => ValidationResult;
  mask?: string | RegExp;
  suggestions?: string[] | ((input: string) => Promise<string[]>);
  maxLength?: number;
  debounce?: number;
  readonly?: boolean;
  disabled?: boolean;
}

export interface SelectOption<T = any> {
  value: T;
  label: string;
  disabled?: boolean;
  group?: string;
  icon?: string;
}

export interface SelectProps<T = any> extends BaseAuraProps {
  options: SelectOption<T>[] | Signal<SelectOption<T>[]>;
  value: WritableSignal<T | T[]>;
  multiple?: boolean;
  searchable?: boolean;
  placeholder?: string;
  renderOption?: (option: SelectOption<T>) => Aura;
  groupBy?: (option: SelectOption<T>) => string;
  disabled?: boolean;
}

export interface ButtonProps extends BaseAuraProps {
  label: string | Signal<string>;
  onClick?: () => void | Promise<void>;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean | Signal<boolean>;
  loading?: boolean | Signal<boolean>;
  icon?: string;
  shortcut?: string;
}

// ============================================================================
// Aura Component Instance
// ============================================================================

export interface Aura<T extends AuraType = AuraType> {
  type: T;
  props: AuraProps<T>;
  id: string;
  parent?: Aura;
  children?: Aura[];
  element?: AuraElement;
}

export type AuraProps<T extends AuraType> = 
  T extends 'box' ? BoxProps :
  T extends 'flex' ? FlexProps :
  T extends 'grid' ? GridProps :
  T extends 'text' ? TextProps :
  T extends 'input' ? InputProps :
  T extends 'select' ? SelectProps :
  T extends 'button' ? ButtonProps :
  BaseAuraProps;

// ============================================================================
// Element Reference
// ============================================================================

export interface AuraElement {
  focus(): void;
  blur(): void;
  scrollIntoView(): void;
  getBoundingRect(): { x: number; y: number; width: number; height: number };
  setAttribute(name: string, value: any): void;
  getAttribute(name: string): any;
}

export interface Ref<T> {
  current: T | null;
}

// ============================================================================
// Animation and Transitions
// ============================================================================

export interface AnimationOptions {
  duration: number;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | ((t: number) => number);
  delay?: number;
  iterations?: number | 'infinite';
  direction?: 'normal' | 'reverse' | 'alternate';
  fill?: 'none' | 'forwards' | 'backwards' | 'both';
}

export interface TransitionOptions {
  duration: number;
  easing?: string | ((t: number) => number);
  properties?: string[];
}

// ============================================================================
// Validation
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  message?: string;
  level?: 'error' | 'warning' | 'info';
}

// ============================================================================
// Focus Events
// ============================================================================

export interface FocusEvent {
  target: AuraElement;
  relatedTarget?: AuraElement;
  type: 'focus' | 'blur';
}

// ============================================================================
// Lifecycle Hooks
// ============================================================================

export type LifecycleHook = () => void | (() => void);

export interface LifecycleHooks {
  onMount?: LifecycleHook;
  onUpdate?: LifecycleHook;
  onCleanup?: LifecycleHook;
}
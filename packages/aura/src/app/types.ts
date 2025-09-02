/**
 * Aura Next - Type Definitions
 * Core types for the reactive TUI framework
 */

import type {
  Signal,
  WritableSignal,
  ComputedSignal
} from 'vibrancy';

import {
  TextComponent,
  type TextProps
} from '../components/text.js';

import type {
  BoxProps,
  BoxComponent
} from '../components/box.js';
import type {
  TabsProps,
  TabsComponent
} from '../components/tabs.js';
import type {
  InputProps,
  InputComponent
} from '../components/input.js';
import type {
  TableProps,
  TableComponent
} from '../components/table.js';
import type {
  SelectProps,
  SelectComponent
} from '../components/select.js';
import type {
  ASCIIFontProps,
  ASCIIFontComponent
} from '../components/ascii-font.js';
import type {
  ScrollBarProps,
  ScrollBarComponent
} from '../components/scroll-bar.js';
import type {
  ScrollBoxProps,
  ScrollBoxComponent
} from '../components/scroll-box.js';
import type {
  FrameBufferProps,
  FrameBufferComponent
} from '../components/frame-buffer.js';

// Component type mapping
export type ComponentType =
  | 'box'
  | 'text'
  | 'input'
  | 'select'
  | 'table'
  | 'tabs'
  | 'frame-buffer'
  | 'ascii-font'
  | 'scroll-bar'
  | 'scroll-box';

// Props type mapping for each component
export type ComponentPropsMap = {
  'box': ReactiveProps<BoxProps>;
  'text': ReactiveProps<TextProps>;
  'input': ReactiveProps<InputProps>;
  'select': ReactiveProps<SelectProps>;
  'table': ReactiveProps<TableProps>;
  'tabs': ReactiveProps<TabsProps>;
  'frame-buffer': ReactiveProps<FrameBufferProps>;
  'ascii-font': ReactiveProps<ASCIIFontProps>;
  'scroll-bar': ReactiveProps<ScrollBarProps>;
  'scroll-box': ReactiveProps<ScrollBoxProps>;
};

// Component instance mapping
export type ComponentInstanceMap = {
  'box': BoxComponent;
  'text': TextComponent;
  'input': InputComponent;
  'select': SelectComponent;
  'table': TableComponent;
  'tabs': TabsComponent;
  'frame-buffer': FrameBufferComponent;
  'ascii-font': ASCIIFontComponent;
  'scroll-bar': ScrollBarComponent;
  'scroll-box': ScrollBoxComponent;
};

// Make props reactive - any prop can be a signal
export type ReactiveProps<T> = {
  [K in keyof T]: T[K] | Signal<T[K]> | ComputedSignal<T[K]>;
};

// Extract component props type
export type ComponentProps<T extends ComponentType> = ComponentPropsMap[T];

// Extract component instance type
export type ComponentInstance<T extends ComponentType> = ComponentInstanceMap[T];

// Aura element - a reactive wrapper around components
export interface AuraElement<T extends ComponentType = ComponentType> {
  type: T;
  props: ComponentProps<T>;
  instance?: ComponentInstance<T>;
  children?: AnyAuraElement[];
  /**
   * Optional key used as component ID.
   * If provided, will be used as the component's unique identifier.
   * Useful for maintaining component identity during updates.
   */
  key?: string | number;
  /**
   * Optional ref to get direct access to the component instance.
   * The signal will be set to the component instance after mounting.
   */
  ref?: WritableSignal<ComponentInstance<T> | null>;
  // Lifecycle hooks
  onMount?: () => void | (() => void);
  onCleanup?: () => void;
  onUpdate?: () => void;
}

/**
 * Type-safe union of all possible AuraElement types
 * This provides full type safety while allowing any component type
 */
export type AnyAuraElement =
  | AuraElement<'box'>
  | AuraElement<'text'>
  | AuraElement<'input'>
  | AuraElement<'select'>
  | AuraElement<'table'>
  | AuraElement<'tabs'>
  | AuraElement<'frame-buffer'>
  | AuraElement<'ascii-font'>
  | AuraElement<'scroll-bar'>
  | AuraElement<'scroll-box'>;

// Control flow helpers
export interface ShowOptions<T> {
  when: Signal<T | undefined | null | false>;
  fallback?: () => AnyAuraElement;
  children: (value: T) => AnyAuraElement | AnyAuraElement[];
}

export interface ForEachOptions<T> {
  each: Signal<T[]> | T[];
  children: (item: T, index: Signal<number>) => AnyAuraElement;
  fallback?: () => AnyAuraElement;
}

export interface SwitchOptions<T> {
  value: Signal<T> | T;
  cases: Record<string | number, () => AnyAuraElement>;
  default?: () => AnyAuraElement;
}

// Context type for dependency injection
export interface Context<T> {
  id: symbol;
  defaultValue: T;
  Provider: (props: { value: T; children: AnyAuraElement[] }) => AnyAuraElement;
}

// Hook types
export type EffectCleanup = void | (() => void);
export type EffectCallback = () => EffectCleanup;

// Type guards for runtime type checking
export function isAuraElement(value: unknown): value is AnyAuraElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'props' in value &&
    typeof (value as AnyAuraElement).type === 'string'
  );
}

// Utility types for extracting props
export type ExtractProps<T> = T extends AuraElement<infer U> ? ComponentProps<U> : never;
export type ExtractInstance<T> = T extends AuraElement<infer U> ? ComponentInstance<U> : never;

// Component registry for extensibility
export interface ComponentRegistry {
  register<T extends ComponentType>(
    type: T,
    factory: (ctx: any, props: ComponentProps<T>) => ComponentInstance<T>
  ): void;

  create<T extends ComponentType>(
    type: T,
    props: ComponentProps<T>,
    ctx: any
  ): ComponentInstance<T>;

  has(type: string): boolean;

  getTypes(): ComponentType[];
  clear(): void;
  clone(): ComponentRegistry;
}

// Render context for passing down renderer and other services
export interface RenderContext {
  renderer: any; // Will be properly typed when renderer is refactored
  registry?: ComponentRegistry;
  parentContext?: Map<symbol, unknown>;
}

// Props validation
export type PropsValidator<T> = (props: T) => string | undefined;

// Component metadata for better debugging and tooling
export interface ComponentMetadata {
  displayName?: string;
  description?: string;
  version?: string;
  deprecated?: boolean | string;
}

// Enhanced AuraElement with metadata
export interface EnhancedAuraElement<T extends ComponentType = ComponentType> extends AuraElement<T> {
  metadata?: ComponentMetadata;
  validate?: PropsValidator<ComponentProps<T>>;
}
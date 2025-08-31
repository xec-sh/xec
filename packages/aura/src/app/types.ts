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

import type { GroupComponent } from '../components/group.js';
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
import type { Component, ComponentProps as BaseComponentProps } from '../component.js';
import type {
  ASCIIFontProps,
  ASCIIFontComponent
} from '../components/ascii-font.js';
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
  | 'group'
  | 'frame-buffer'
  | 'ascii-font';

// Props type mapping for each component
export type ComponentPropsMap = {
  'box': ReactiveProps<BoxProps>;
  'text': ReactiveProps<TextProps>;
  'input': ReactiveProps<InputProps>;
  'select': ReactiveProps<SelectProps>;
  'table': ReactiveProps<TableProps>;
  'tabs': ReactiveProps<TabsProps>;
  'group': ReactiveProps<BaseComponentProps>;
  'frame-buffer': ReactiveProps<FrameBufferProps>;
  'ascii-font': ReactiveProps<ASCIIFontProps>;
};

// Component instance mapping
export type ComponentInstanceMap = {
  'box': BoxComponent;
  'text': TextComponent;
  'input': InputComponent;
  'select': SelectComponent;
  'table': TableComponent;
  'tabs': TabsComponent;
  'group': GroupComponent;
  'frame-buffer': FrameBufferComponent;
  'ascii-font': ASCIIFontComponent;
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
 * Improved Application Options
 * Allows multiple components to be added to the root
 */
// Type alias for any AuraElement regardless of specific component type
// Uses a more flexible definition to avoid ref type conflicts
export type AnyAuraElement = {
  type: ComponentType;
  props: any;
  instance?: Component;
  children?: AnyAuraElement[];
  key?: string | number;
  ref?: WritableSignal<any>;
  onMount?: () => void | (() => void);
  onCleanup?: () => void;
  onUpdate?: () => void;
};

// Control flow helpers
export interface ShowOptions<T> {
  when: Signal<T | undefined | null | false>;
  fallback?: () => AuraElement;
  children: (value: T) => AuraElement | AuraElement[];
}

export interface ForEachOptions<T> {
  each: Signal<T[]> | T[];
  children: (item: T, index: Signal<number>) => AuraElement;
  fallback?: () => AuraElement;
}

export interface SwitchOptions<T> {
  value: Signal<T> | T;
  cases: Record<string | number, () => AuraElement>;
  default?: () => AuraElement;
}

// Context type for dependency injection
export interface Context<T> {
  id: symbol;
  defaultValue: T;
  Provider: (props: { value: T; children: AuraElement[] }) => AuraElement;
}

// Hook types
export type EffectCleanup = void | (() => void);
export type EffectCallback = () => EffectCleanup;
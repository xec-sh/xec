// Core type definitions for @xec-sh/kit

import type { StreamHandler } from './stream-handler.js';

export type Primitive = string | number | boolean | null | undefined;

export interface Key {
  sequence: string;
  name?: string;
  char?: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}

export interface Theme {
  colors: {
    primary: string;
    secondary: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    muted: string;
  };
  symbols: {
    question: string;
    success: string;
    error: string;
    warning: string;
    info: string;
    bullet: string;
    arrow: string;
    pointer: string;
    checkbox: {
      checked: string;
      unchecked: string;
      cursor: string;
    };
    radio: {
      active: string;
      inactive: string;
      cursor: string;
    };
    spinner: {
      frames: string[];
      interval: number;
    };
  };
  formatters: {
    primary: (text: string) => string;
    bold: (text: string) => string;
    highlight: (text: string) => string;
    muted: (text: string) => string;
    error: (text: string) => string;
    success: (text: string) => string;
    warning: (text: string) => string;
    info: (text: string) => string;
    inverse: (text: string) => string;
    secondary: (text: string) => string;
  };
}

export interface PromptConfig<TValue = any, TConfig = {}> {
  message: string;
  initialValue?: TValue;
  theme?: Partial<Theme>;
  validate?: (value: TValue) => string | undefined | Promise<string | undefined>;
  placeholder?: string;
  stream?: StreamHandler; // Allow injecting a shared stream
  sharedStream?: boolean; // Create a shared stream if not provided
}

export type PromptState = 'idle' | 'active' | 'submit' | 'cancel' | 'error' | 'done';

export enum PromptLifecycle {
  Created = 'created',
  Initialized = 'initialized',
  Active = 'active',
  Completed = 'completed',
  Disposed = 'disposed'
}

export interface PromptEvents {
  start: () => void;
  submit: (value: any) => void;
  cancel: () => void;
  error: (error: Error) => void;
  keypress: (key: Key) => void;
  resize: (size: { width: number; height: number }) => void;
}

export interface RenderContext {
  width: number;
  height: number;
  theme: Theme;
  state: PromptState;
  error?: string;
}

export type StateSubscriber<T> = (state: T, prevState: T) => void;

export interface Dimensions {
  width: number;
  height: number;
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type RenderNode = {
  type: 'text' | 'box' | 'line' | 'group';
  content?: string;
  children?: RenderNode[];
  style?: {
    fg?: string;
    bg?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    dim?: boolean;
  };
};

// Symbols for internal use
export const cancelSymbol = Symbol.for('kit.cancel');
export const backSymbol = Symbol.for('kit.back');
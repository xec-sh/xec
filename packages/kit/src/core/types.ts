import type { Key } from 'node:readline';
import type { Action } from './utils/settings.js';

/**
 * The state of the prompt
 */
export type ClackState = 'initial' | 'active' | 'cancel' | 'submit' | 'error';

/**
 * Typed event emitter for clack
 */
export interface ClackEvents<TValue> {
  initial: (value?: TValue) => void;
  active: (value?: TValue) => void;
  cancel: (value?: TValue) => void;
  submit: (value?: TValue) => void;
  error: (value?: TValue) => void;
  cursor: (key?: Action) => void;
  key: (key: string | undefined, info: Key) => void;
  value: (value?: TValue) => void;
  userInput: (value: string) => void;
  confirm: (value?: boolean) => void;
  finalize: () => void;
  beforePrompt: () => void;
}

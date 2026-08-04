import type { Key } from 'node:readline';

import prism from '../../prism/index.js';
import { findTextCursor } from '../utils/cursor.js';
import Prompt, { type PromptOptions } from './prompt.js';

type CursorAction = 'up' | 'down' | 'left' | 'right';
const cursorActions = new Set<CursorAction>(['up', 'down', 'left', 'right']);

/** Length in UTF-16 code units of the code point starting at `index`. */
function codePointLengthAt(text: string, index: number): number {
  const code = text.codePointAt(index);
  return code !== undefined && code > 0xffff ? 2 : 1;
}

/** Length in UTF-16 code units of the code point ending right before `index`. */
function codePointLengthBefore(text: string, index: number): number {
  const high = text.charCodeAt(index - 2);
  const low = text.charCodeAt(index - 1);
  return high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff ? 2 : 1;
}

/** Snap an offset that landed inside a surrogate pair back to its start. */
function snapToCodePoint(text: string, offset: number): number {
  const low = text.charCodeAt(offset);
  const high = text.charCodeAt(offset - 1);
  return low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff ? offset - 1 : offset;
}

interface MultiLineOptions extends PromptOptions<string, MultiLinePrompt> {
  placeholder?: string;
  defaultValue?: string;
  showSubmit?: boolean;
}

export default class MultiLinePrompt extends Prompt<string> {
  #lastKeyWasReturn = false;
  #showSubmit: boolean;
  public focused: 'editor' | 'submit' = 'editor';

  get userInputWithCursor() {
    if (this.state === 'submit') {
      return this.userInput;
    }
    const userInput = this.userInput;
    if (this.cursor >= userInput.length) {
      return `${userInput}█`;
    }
    const charLength = codePointLengthAt(userInput, this.cursor);
    const preCursor = userInput.slice(0, this.cursor);
    const cursorChar = userInput.slice(this.cursor, this.cursor + charLength);
    const rest = userInput.slice(this.cursor + charLength);
    if (cursorChar === '\n') {
      return `${preCursor}█\n${rest}`;
    }
    return `${preCursor}${prism.inverse(cursorChar)}${rest}`;
  }

  get cursor() {
    return this._cursor;
  }

  #insertAtCursor(text: string) {
    if (this.userInput.length === 0) {
      this._setUserInput(text);
      return;
    }
    this._setUserInput(
      this.userInput.slice(0, this.cursor) + text + this.userInput.slice(this.cursor)
    );
  }

  #handleCursor(action: CursorAction) {
    const text = this.value ?? '';
    switch (action) {
      case 'up':
        this._cursor = snapToCodePoint(text, findTextCursor(this._cursor, 0, -1, text));
        return;
      case 'down':
        this._cursor = snapToCodePoint(text, findTextCursor(this._cursor, 0, 1, text));
        return;
      case 'left':
        this._cursor = findTextCursor(
          this._cursor,
          -codePointLengthBefore(text, this._cursor),
          0,
          text
        );
        return;
      case 'right':
        this._cursor = findTextCursor(this._cursor, codePointLengthAt(text, this._cursor), 0, text);
        return;
      // no default
    }
  }

  protected override _shouldSubmit(_char: string | undefined, _key: Key): boolean {
    if (this.#showSubmit) {
      if (this.focused === 'submit') {
        return true;
      }
      this.#insertAtCursor('\n');
      this._cursor++;
      return false;
    }
    const wasReturn = this.#lastKeyWasReturn;
    this.#lastKeyWasReturn = true;
    if (wasReturn && this.cursor === this.userInput.length) {
      if (this.userInput[this.cursor - 1] === '\n') {
        this._setUserInput(
          this.userInput.slice(0, this.cursor - 1) + this.userInput.slice(this.cursor)
        );
        this._cursor--;
      }
      return true;
    }
    this.#insertAtCursor('\n');
    this._cursor++;
    return false;
  }

  constructor(opts: MultiLineOptions) {
    const initialUserInput = opts.initialUserInput ?? opts.initialValue;

    super(
      {
        ...opts,
        initialUserInput,
      },
      false
    );

    if (initialUserInput !== undefined) {
      this._cursor = initialUserInput.length;
    }

    this.#showSubmit = opts.showSubmit === true;

    this.on('key', (char, key) => {
      if (key?.name && cursorActions.has(key.name as CursorAction)) {
        this.#lastKeyWasReturn = false;
        this.#handleCursor(key.name as CursorAction);
        return;
      }
      if (char === '\t' && this.#showSubmit) {
        this.focused = this.focused === 'editor' ? 'submit' : 'editor';
        return;
      }
      if (key?.name === 'return') {
        return;
      }
      this.#lastKeyWasReturn = false;
      if (key?.name === 'backspace') {
        if (this.cursor > 0) {
          const charLength = codePointLengthBefore(this.userInput, this.cursor);
          this._setUserInput(
            this.userInput.slice(0, this.cursor - charLength) + this.userInput.slice(this.cursor)
          );
          this._cursor -= charLength;
        }
        return;
      }
      if (key?.name === 'delete') {
        if (this.cursor < this.userInput.length) {
          const charLength = codePointLengthAt(this.userInput, this.cursor);
          this._setUserInput(
            this.userInput.slice(0, this.cursor) + this.userInput.slice(this.cursor + charLength)
          );
        }
        return;
      }
      // The key event delivers the char with its original casing (upstream
      // #534), so it can be inserted directly. `char` is only defined for
      // text-producing keypresses; navigation and function keys carry escape
      // sequences in key.sequence that must never be inserted.
      if (char) {
        if (this.#showSubmit && this.focused === 'submit') {
          this.focused = 'editor';
        }
        this.#insertAtCursor(char);
        this._cursor += char.length;
      }
    });

    this.on('userInput', (input) => {
      this._setValue(input);
    });
    this.on('finalize', () => {
      if (!this.value) {
        this.value = opts.defaultValue;
      }
      if (this.value === undefined) {
        this.value = '';
      }
    });
  }
}

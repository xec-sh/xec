/**
 * Adapted from Clack (https://github.com/bombshell-dev/clack).
 *
 * Copyright (c) Nate Moore
 * Licensed under the MIT License. See the NOTICE file at the root of this
 * package for the full attribution and license text.
 */

import type { Key } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

import { cursor } from 'sisteransi';
import * as readline from 'node:readline';
import { stdin, stdout } from 'node:process';

import { wrapAnsi } from './wrap-ansi.js';
import stringWidth from './string-width.js';
import { isActionKey } from './settings.js';

export * from './theme.js';
export * from './string.js';
export * from './cursor.js';
export * from './settings.js';
export * from './validation.js';
export type { StandardSchemaV1 } from './standard-schema.js';

export const CANCEL_SYMBOL = Symbol('clack:cancel');

export function isCancel(value: unknown): value is typeof CANCEL_SYMBOL {
  return value === CANCEL_SYMBOL;
}

export function setRawMode(input: Readable, value: boolean) {
  const i = input as typeof stdin;

  if (i.isTTY) i.setRawMode(value);
}

interface BlockOptions {
  input?: Readable;
  output?: Writable;
  overwrite?: boolean;
  hideCursor?: boolean;
  onCancel?: () => void;
}

export function block({
  input = stdin,
  output = stdout,
  overwrite = true,
  hideCursor = true,
  onCancel,
}: BlockOptions = {}) {
  const wasRaw = 'isRaw' in input && input.isRaw === true;
  const wasFlowing = input.readableFlowing === true;
  const rl = readline.createInterface({ input, output, prompt: '', tabSize: 1 });
  readline.emitKeypressEvents(input, rl);
  let closed = false;

  const release = () => {
    if (closed) return;
    closed = true;
    input.off('keypress', clear);
    // The interface must not reset a terminal owned by its caller.
    Object.assign(rl, { terminal: false });
    rl.close();
    setRawMode(input, wasRaw);
    if (wasFlowing) input.resume();
    else input.pause();
    if (hideCursor && !output.destroyed) output.write(cursor.show);
  };
  const clear = (data: Buffer | string | undefined, { name, sequence }: Key) => {
    if (closed) return;
    if (isActionKey([data === undefined ? undefined : String(data), name, sequence], 'cancel')) {
      release();
      if (onCancel) onCancel();
      else process.exit(130);
      return;
    }
    if (!overwrite) return;
    readline.moveCursor(output, name === 'return' ? 0 : -1, name === 'return' ? -1 : 0, () => {
      if (closed) return;
      readline.clearLine(output, 1, () => {
        if (!closed) input.once('keypress', clear);
      });
    });
  };
  try {
    setRawMode(input, true);
    if (hideCursor) output.write(cursor.hide);
    input.once('keypress', clear);
    return release;
  } catch (error) {
    release();
    throw error;
  }
}

export const getColumns = (output: Writable): number => {
  if (
    'columns' in output &&
    typeof output.columns === 'number' &&
    Number.isFinite(output.columns) &&
    output.columns >= 1
  ) {
    return Math.floor(output.columns);
  }
  return 80;
};

export const getRows = (output: Writable): number => {
  if (
    'rows' in output &&
    typeof output.rows === 'number' &&
    Number.isFinite(output.rows) &&
    output.rows >= 1
  ) {
    return Math.floor(output.rows);
  }
  return 20;
};

export function wrapTextWithPrefix(
  output: Writable | undefined,
  text: string,
  prefix: string,
  startPrefix: string = prefix,
  endPrefix: string = prefix,
  lineFormatter?: (line: string, index: number) => string
): string {
  const columns = getColumns(output ?? stdout);
  const wrapped = wrapAnsi(
    text,
    Math.max(
      1,
      columns - Math.max(stringWidth(prefix), stringWidth(startPrefix), stringWidth(endPrefix))
    ),
    {
      hard: true,
      trim: false,
    }
  );
  return wrapped
    .split('\n')
    .map((line: string, index: number, lines: string[]) => {
      const formatted = lineFormatter ? lineFormatter(line, index) : line;
      if (index === 0) {
        return `${startPrefix}${formatted}`;
      }
      if (index === lines.length - 1) {
        return `${endPrefix}${formatted}`;
      }
      return `${prefix}${formatted}`;
    })
    .join('\n');
}

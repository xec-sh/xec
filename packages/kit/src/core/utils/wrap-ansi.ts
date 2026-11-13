/**
 * Adapted from Clack (https://github.com/bombshell-dev/clack).
 *
 * Copyright (c) Nate Moore
 * Licensed under the MIT License. See the NOTICE file at the root of this
 * package for the full attribution and license text.
 */

import stringWidth from './string-width.js';
import { terminalSegments } from './string-truncated-width.js';

const ESC = '\x1B';
const CSI = '\x9B';

const END_CODE = 39;
const ANSI_ESCAPE_BELL = '\u0007';
const ANSI_CSI = '[';
const ANSI_OSC = ']';
const ANSI_SGR_TERMINATOR = 'm';
const ANSI_ESCAPE_LINK = `${ANSI_OSC}8;;`;
const GROUP_REGEX = new RegExp(
  `(?:\\${ANSI_CSI}(?<code>\\d+)m|\\${ANSI_ESCAPE_LINK}(?<uri>.*)${ANSI_ESCAPE_BELL})`,
  'y'
);

const getClosingCode = (openingCode: number): number | undefined => {
  if (openingCode >= 30 && openingCode <= 37) return 39;
  if (openingCode >= 90 && openingCode <= 97) return 39;
  if (openingCode >= 40 && openingCode <= 47) return 49;
  if (openingCode >= 100 && openingCode <= 107) return 49;
  if (openingCode === 1 || openingCode === 2) return 22;
  if (openingCode === 3) return 23;
  if (openingCode === 4) return 24;
  if (openingCode === 7) return 27;
  if (openingCode === 8) return 28;
  if (openingCode === 9) return 29;
  if (openingCode === 0) return 0;
  return undefined;
};

const wrapAnsiCode = (code: number): string => `${ESC}${ANSI_CSI}${code}${ANSI_SGR_TERMINATOR}`;
const wrapAnsiHyperlink = (url: string): string =>
  `${ESC}${ANSI_ESCAPE_LINK}${url}${ANSI_ESCAPE_BELL}`;

const wordLengths = (words: string[]): number[] => words.map((character) => stringWidth(character));

const wrapWord = (rows: string[], word: string, columns: number) => {
  let visible = stringWidth(rows.at(-1) ?? '');
  for (const part of terminalSegments(word)) {
    const width = part.escape ? 0 : stringWidth(part.text);
    if (width > 0 && visible > 0 && visible + width > columns) {
      rows.push('');
      visible = 0;
    }
    rows[rows.length - 1] += part.text;
    visible += width;
  }
};

const stringVisibleTrimSpacesRight = (string: string): string => {
  const words = string.split(' ');
  let last = words.length;

  while (last > 0) {
    const word = words[last - 1];
    if (word !== undefined && stringWidth(word) > 0) {
      break;
    }

    last--;
  }

  if (last === words.length) {
    return string;
  }

  return words.slice(0, last).join(' ') + words.slice(last).join('');
};

export interface WrapAnsiOptions {
  trim?: boolean;
  wordWrap?: boolean;
  hard?: boolean;
}

const exec = (string: string, columns: number, options: WrapAnsiOptions = {}): string => {
  if (options.trim !== false && string.trim() === '') {
    return '';
  }

  let returnValue = '';
  let escapeCode;
  let escapeUrl;

  const words = string.split(' ');
  const lengths = wordLengths(words);
  let rows = [''];

  for (const [index, word] of words.entries()) {
    if (options.trim !== false) {
      rows[rows.length - 1] = (rows.at(-1) ?? '').trimStart();
    }

    let rowLength = stringWidth(rows.at(-1) ?? '');

    if (index !== 0) {
      if (rowLength >= columns && (options.wordWrap === false || options.trim === false)) {
        rows.push('');
        rowLength = 0;
      }

      if (rowLength > 0 || options.trim === false) {
        rows[rows.length - 1] += ' ';
        rowLength++;
      }
    }

    const wordLength = lengths[index] ?? 0;

    if (options.hard && wordLength > columns) {
      const remainingColumns = columns - rowLength;
      const breaksStartingThisLine = 1 + Math.floor((wordLength - remainingColumns - 1) / columns);
      const breaksStartingNextLine = Math.floor((wordLength - 1) / columns);
      if (breaksStartingNextLine < breaksStartingThisLine) {
        rows.push('');
      }

      wrapWord(rows, word, columns);
      continue;
    }

    if (rowLength + wordLength > columns && rowLength > 0 && wordLength > 0) {
      if (options.wordWrap === false && rowLength < columns) {
        wrapWord(rows, word, columns);
        continue;
      }

      rows.push('');
    }

    if (rowLength + wordLength > columns && options.wordWrap === false) {
      wrapWord(rows, word, columns);
      continue;
    }

    rows[rows.length - 1] += word;
  }

  if (options.trim !== false) {
    rows = rows.map((row) => stringVisibleTrimSpacesRight(row));
  }

  const preString = rows.join('\n');
  const pre = preString[Symbol.iterator]();
  let currentPre = pre.next();
  let nextPre = pre.next();

  // We need to keep a separate index as `String#slice()` works on Unicode code units, while `pre` is an array of codepoints.
  let preStringIndex = 0;

  while (!currentPre.done) {
    const character = currentPre.value;
    const nextCharacter = nextPre.value;

    returnValue += character;

    if (character === ESC || character === CSI) {
      GROUP_REGEX.lastIndex = preStringIndex + 1;
      const groupsResult = GROUP_REGEX.exec(preString);

      const groups = groupsResult?.groups;

      if (groups?.['code'] !== undefined) {
        const code = Number.parseFloat(groups['code']);
        escapeCode = code === END_CODE ? undefined : code;
      } else if (groups?.['uri'] !== undefined) {
        escapeUrl = groups['uri'].length === 0 ? undefined : groups['uri'];
      }
    }

    const closingCode = escapeCode ? getClosingCode(escapeCode) : undefined;

    if (nextCharacter === '\n') {
      if (escapeUrl) {
        returnValue += wrapAnsiHyperlink('');
      }

      if (escapeCode && closingCode) {
        returnValue += wrapAnsiCode(closingCode);
      }
    } else if (character === '\n') {
      if (escapeCode && closingCode) {
        returnValue += wrapAnsiCode(escapeCode);
      }

      if (escapeUrl) {
        returnValue += wrapAnsiHyperlink(escapeUrl);
      }
    }

    preStringIndex += character.length;

    currentPre = nextPre;
    nextPre = pre.next();
  }

  return returnValue;
};

export function wrapAnsi(string: string, columns: number, options?: WrapAnsiOptions) {
  if (Number.isNaN(columns) || columns < 1) throw new RangeError('Wrap width must be positive');
  return String(string)
    .normalize()
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => exec(line, columns, options))
    .join('\n');
}

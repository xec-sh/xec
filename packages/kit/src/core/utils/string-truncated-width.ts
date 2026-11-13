/**
 * Adapted from Clack (https://github.com/bombshell-dev/clack).
 *
 * Copyright (c) Nate Moore
 * Licensed under the MIT License. See the NOTICE file at the root of this
 * package for the full attribution and license text.
 */

/* MAIN */

export type TruncationOptions = {
  limit?: number;
  ellipsis?: string;
  ellipsisWidth?: number;
};

export type WidthOptions = {
  /* SPECIAL */
  controlWidth?: number;
  tabWidth?: number;
  /* OTHERS */
  emojiWidth?: number;
  regularWidth?: number;
  wideWidth?: number;
};

export type Result = {
  width: number;
  index: number;
  truncated: boolean;
  ellipsed: boolean;
};

/* MAIN */

const isFullWidth = (x: number): boolean =>
  x === 0x3000 || (x >= 0xff01 && x <= 0xff60) || (x >= 0xffe0 && x <= 0xffe6);

const isWideNotCJKTNotEmoji = (x: number): boolean =>
  x === 0x231b ||
  x === 0x2329 ||
  (x >= 0x2ff0 && x <= 0x2fff) ||
  (x >= 0x3001 && x <= 0x303e) ||
  (x >= 0x3099 && x <= 0x30ff) ||
  (x >= 0x3105 && x <= 0x312f) ||
  (x >= 0x3131 && x <= 0x318e) ||
  (x >= 0x3190 && x <= 0x31e3) ||
  (x >= 0x31ef && x <= 0x321e) ||
  (x >= 0x3220 && x <= 0x3247) ||
  (x >= 0x3250 && x <= 0x4dbf) ||
  (x >= 0xfe10 && x <= 0xfe19) ||
  (x >= 0xfe30 && x <= 0xfe52) ||
  (x >= 0xfe54 && x <= 0xfe66) ||
  (x >= 0xfe68 && x <= 0xfe6b) ||
  (x >= 0x1f200 && x <= 0x1f202) ||
  (x >= 0x1f210 && x <= 0x1f23b) ||
  (x >= 0x1f240 && x <= 0x1f248) ||
  (x >= 0x20000 && x <= 0x2fffd) ||
  (x >= 0x30000 && x <= 0x3fffd);

/* EXPORT */

export { isFullWidth, isWideNotCJKTNotEmoji };

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
// CSI, OSC, DCS and two-byte escape sequences occupy no display columns.
 
/* eslint-disable no-control-regex */
const ANSI_RE =
  /(?:\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[P^_][\s\S]*?\x1b\\|(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]|\x1b[ -/]*[@-Z\\-_])/g;
/* eslint-enable no-control-regex */
const EMOJI_RE =
  /\p{Emoji_Presentation}|\p{Extended_Pictographic}.*\uFE0F|\p{Emoji_Modifier}|\u20E3/u;
const WIDE_RE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Tangut}]/u;

/** Iterate printable graphemes and complete terminal escapes with source offsets. */
export function* terminalSegments(
  input: string
): Generator<{ text: string; index: number; escape: boolean }> {
  let start = 0;
  for (const match of input.matchAll(ANSI_RE)) {
    for (const item of graphemes.segment(input.slice(start, match.index))) {
      yield { text: item.segment, index: start + item.index, escape: false };
    }
    yield { text: match[0], index: match.index, escape: true };
    start = match.index + match[0].length;
  }
  for (const item of graphemes.segment(input.slice(start))) {
    yield { text: item.segment, index: start + item.index, escape: false };
  }
}

function graphemeWidth(text: string, options: WidthOptions): number {
  if (text === '\t') return options.tabWidth ?? 8;
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x1f\x7f-\x9f]+$/.test(text)) return text.length * (options.controlWidth ?? 0);
  if (/^[\p{Mark}\p{Default_Ignorable_Code_Point}]+$/u.test(text)) return 0;
  if (EMOJI_RE.test(text)) return options.emojiWidth ?? 2;
  const point = text.codePointAt(0) ?? 0;
  if (isFullWidth(point)) return 2;
  if (isWideNotCJKTNotEmoji(point) || ((point < 0xff61 || point > 0xff9f) && WIDE_RE.test(text))) {
    return options.wideWidth ?? 2;
  }
  return options.regularWidth ?? 1;
}

const getStringTruncatedWidth = (
  input: string,
  truncationOptions: TruncationOptions = {},
  widthOptions: WidthOptions = {}
): Result => {
  const limit = Math.max(0, truncationOptions.limit ?? Infinity);
  const ellipsisWidth =
    truncationOptions.ellipsisWidth ??
    (truncationOptions.ellipsis
      ? getStringTruncatedWidth(truncationOptions.ellipsis, {}, widthOptions).width
      : 0);
  const contentLimit = Math.max(0, limit - ellipsisWidth);
  let width = 0;
  let contentWidth = 0;
  let contentEnd = 0;
  let contentComplete = false;

  // Most table cells and instructions are plain ASCII. Keep their width path constant-time.
  if (/^[\x20-\x7e]*$/.test(input)) {
    const unit = widthOptions.regularWidth ?? 1;
    width = input.length * unit;
    if (width <= limit) return { width, index: input.length, truncated: false, ellipsed: false };
    const count = Math.max(0, Math.floor(contentLimit / unit));
    return { width: count * unit, index: count, truncated: true, ellipsed: limit >= ellipsisWidth };
  }

  for (const part of terminalSegments(input)) {
    const nextWidth = width + (part.escape ? 0 : graphemeWidth(part.text, widthOptions));
    if (!contentComplete && nextWidth <= contentLimit) {
      contentWidth = nextWidth;
      contentEnd = part.index + part.text.length;
    } else contentComplete = true;
    if (nextWidth > limit) {
      return {
        width: contentWidth,
        index: contentEnd,
        truncated: true,
        ellipsed: limit >= ellipsisWidth,
      };
    }
    width = nextWidth;
  }
  return { width, index: input.length, truncated: false, ellipsed: false };
};

export default getStringTruncatedWidth;

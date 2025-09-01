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

 
const ANSI_RE =
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]|\u001b\]8;[^;]*;.*?(?:\u0007|\u001b\u005c)/y;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\x00-\x08\x0A-\x1F\x7F-\x9F]{1,1000}/y;
const CJKT_WIDE_RE =
  /(?:(?![\uFF61-\uFF9F\uFF00-\uFFEF])[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Tangut}]){1,1000}/uy;
const TAB_RE = /\t{1,1000}/y;
const EMOJI_RE =
  /[\u{1F1E6}-\u{1F1FF}]{2}|\u{1F3F4}[\u{E0061}-\u{E007A}]{2}[\u{E0030}-\u{E0039}\u{E0061}-\u{E007A}]{1,3}\u{E007F}|(?:\p{Emoji}\uFE0F\u20E3?|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Emoji_Presentation})(?:\u200D(?:\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Emoji_Presentation}|\p{Emoji}\uFE0F\u20E3?))*/uy;
const LATIN_RE = /(?:[\x20-\x7E\xA0-\xFF](?!\uFE0F)){1,1000}/y;
const MODIFIER_RE = /\p{M}+/gu;
const NO_TRUNCATION: TruncationOptions = { limit: Infinity, ellipsis: '' };

/* MAIN */

const getStringTruncatedWidth = (
  input: string,
  truncationOptions: TruncationOptions = {},
  widthOptions: WidthOptions = {}
): Result => {
  /* CONSTANTS */

  const LIMIT = truncationOptions.limit ?? Infinity;
  const ELLIPSIS = truncationOptions.ellipsis ?? '';
  const ELLIPSIS_WIDTH =
    truncationOptions?.ellipsisWidth ??
    (ELLIPSIS ? getStringTruncatedWidth(ELLIPSIS, NO_TRUNCATION, widthOptions).width : 0);

  const ANSI_WIDTH = 0;
  const CONTROL_WIDTH = widthOptions.controlWidth ?? 0;
  const TAB_WIDTH = widthOptions.tabWidth ?? 8;

  const EMOJI_WIDTH = widthOptions.emojiWidth ?? 2;
  const FULL_WIDTH_WIDTH = 2;
  const REGULAR_WIDTH = widthOptions.regularWidth ?? 1;
  const WIDE_WIDTH = widthOptions.wideWidth ?? FULL_WIDTH_WIDTH;

  const PARSE_BLOCKS: [RegExp, number][] = [
    [LATIN_RE, REGULAR_WIDTH],
    [ANSI_RE, ANSI_WIDTH],
    [CONTROL_RE, CONTROL_WIDTH],
    [TAB_RE, TAB_WIDTH],
    [EMOJI_RE, EMOJI_WIDTH],
    [CJKT_WIDE_RE, WIDE_WIDTH],
  ];

  /* STATE */

  let indexPrev = 0;
  let index = 0;
  const length = input.length;
  let lengthExtra = 0;
  let truncationEnabled = false;
  let truncationIndex = length;
  const truncationLimit = Math.max(0, LIMIT - ELLIPSIS_WIDTH);
  let unmatchedStart = 0;
  let unmatchedEnd = 0;
  let width = 0;
  let widthExtra = 0;

  /* PARSE LOOP */

  outer: while (true) {
    /* UNMATCHED */

    if (unmatchedEnd > unmatchedStart || (index >= length && index > indexPrev)) {
      const unmatched = input.slice(unmatchedStart, unmatchedEnd) || input.slice(indexPrev, index);

      lengthExtra = 0;

      for (const char of unmatched.replaceAll(MODIFIER_RE, '')) {
        const codePoint = char.codePointAt(0) || 0;

        if (isFullWidth(codePoint)) {
          widthExtra = FULL_WIDTH_WIDTH;
        } else if (isWideNotCJKTNotEmoji(codePoint)) {
          widthExtra = WIDE_WIDTH;
        } else {
          widthExtra = REGULAR_WIDTH;
        }

        if (width + widthExtra > truncationLimit) {
          truncationIndex = Math.min(
            truncationIndex,
            Math.max(unmatchedStart, indexPrev) + lengthExtra
          );
        }

        if (width + widthExtra > LIMIT) {
          truncationEnabled = true;
          break outer;
        }

        lengthExtra += char.length;
        width += widthExtra;
      }

      unmatchedStart = unmatchedEnd = 0;
    }

    /* EXITING */

    if (index >= length) {
      break outer;
    }

    /* PARSE BLOCKS */

    for (let i = 0, l = PARSE_BLOCKS.length; i < l; i++) {
      const block = PARSE_BLOCKS[i];
      if (!block) continue;

      const [BLOCK_RE, BLOCK_WIDTH] = block;

      BLOCK_RE.lastIndex = index;

      if (BLOCK_RE.test(input)) {
        lengthExtra = BLOCK_RE === EMOJI_RE ? 1 : BLOCK_RE.lastIndex - index;
        widthExtra = lengthExtra * BLOCK_WIDTH;

        if (width + widthExtra > truncationLimit) {
          truncationIndex = Math.min(
            truncationIndex,
            index + Math.floor((truncationLimit - width) / BLOCK_WIDTH)
          );
        }

        if (width + widthExtra > LIMIT) {
          truncationEnabled = true;
          break outer;
        }

        width += widthExtra;
        unmatchedStart = indexPrev;
        unmatchedEnd = index;
        index = indexPrev = BLOCK_RE.lastIndex;

        continue outer;
      }
    }

    /* UNMATCHED INDEX */

    index += 1;
  }

  /* RETURN */

  return {
    width: truncationEnabled ? truncationLimit : width,
    index: truncationEnabled ? truncationIndex : length,
    truncated: truncationEnabled,
    ellipsed: truncationEnabled && LIMIT >= ELLIPSIS_WIDTH,
  };
};

export default getStringTruncatedWidth;

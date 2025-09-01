import fastStringTruncatedWidth from './string-truncated-width.js';

import type { TruncationOptions, WidthOptions as Options } from './string-truncated-width.js';

const NO_TRUNCATION: TruncationOptions = {
  limit: Infinity,
  ellipsis: '',
  ellipsisWidth: 0,
};

const fastStringWidth = (input: string, options: Options = {}): number =>
  fastStringTruncatedWidth(input, NO_TRUNCATION, options).width;

export default fastStringWidth;
export type { Options };

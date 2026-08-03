/**
 * Adapted from Clack (https://github.com/bombshell-dev/clack).
 *
 * Copyright (c) Nate Moore
 * Licensed under the MIT License. See the NOTICE file at the root of this
 * package for the full attribution and license text.
 */

import type { TruncationOptions, WidthOptions as Options } from './string-truncated-width.js';

import fastStringTruncatedWidth from './string-truncated-width.js';

const NO_TRUNCATION: TruncationOptions = {
  limit: Infinity,
  ellipsis: '',
  ellipsisWidth: 0,
};

const fastStringWidth = (input: string, options: Options = {}): number =>
  fastStringTruncatedWidth(input, NO_TRUNCATION, options).width;

export default fastStringWidth;
export type { Options };

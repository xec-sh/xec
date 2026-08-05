import type { Writable } from 'node:stream';

import prism from '../prism/index.js';
import { wrapAnsi } from '../core/utils/wrap-ansi.js';
import { settings, getColumns } from '../core/index.js';
import stringWidth from '../core/utils/string-width.js';
import {
  S_BAR,
  S_BAR_H,
  S_BAR_END,
  S_BAR_START,
  S_BAR_END_RIGHT,
  S_BAR_START_RIGHT,
  S_CORNER_TOP_LEFT,
  type CommonOptions,
  S_CORNER_TOP_RIGHT,
  S_CORNER_BOTTOM_LEFT,
  S_CORNER_BOTTOM_RIGHT,
} from '../utilities/common.js';

export type BoxAlignment = 'left' | 'center' | 'right';

type BoxSymbols = [topLeft: string, topRight: string, bottomLeft: string, bottomRight: string];

const roundedSymbols: BoxSymbols = [
  S_CORNER_TOP_LEFT,
  S_CORNER_TOP_RIGHT,
  S_CORNER_BOTTOM_LEFT,
  S_CORNER_BOTTOM_RIGHT,
];
const squareSymbols: BoxSymbols = [S_BAR_START, S_BAR_START_RIGHT, S_BAR_END, S_BAR_END_RIGHT];

export interface BoxOptions extends CommonOptions {
  contentAlign?: BoxAlignment;
  titleAlign?: BoxAlignment;
  width?: number | 'auto';
  titlePadding?: number;
  contentPadding?: number;
  rounded?: boolean;
  formatBorder?: (text: string) => string;
}

function getPaddingForLine(
  lineLength: number,
  innerWidth: number,
  padding: number,
  contentAlign: BoxAlignment | undefined
): [number, number] {
  let leftPadding = padding;
  if (contentAlign === 'center') {
    leftPadding = Math.floor((innerWidth - lineLength) / 2);
  } else if (contentAlign === 'right') {
    leftPadding = innerWidth - lineLength - padding;
  }

  // In a terminal narrower than the content, both paddings go negative and
  // String.repeat throws — the release command died mid-plan inside a PTY
  // that reported zero columns. A cramped box misaligns its right border;
  // it does not take the process down.
  leftPadding = Math.max(leftPadding, 0);
  const rightPadding = Math.max(innerWidth - leftPadding - lineLength, 0);

  return [leftPadding, rightPadding];
}

const defaultFormatBorder = (text: string) => text;

export const box = (message = '', title = '', opts?: BoxOptions) => {
  const output: Writable = opts?.output ?? process.stdout;
  const columns = getColumns(output);
  const borderWidth = 1;
  const borderTotalWidth = borderWidth * 2;
  const titlePadding = opts?.titlePadding ?? 1;
  const contentPadding = opts?.contentPadding ?? 2;
  const width = opts?.width === undefined || opts.width === 'auto' ? 1 : Math.min(1, opts.width);
  // The guide column follows the global setting like every other component
  // (the old `includePrefix` flag was box-private and defaulted the bar off).
  const hasGuide = (opts?.withGuide ?? settings.withGuide) !== false;
  const linePrefix = hasGuide ? `${prism.gray(S_BAR)} ` : '';
  const formatBorder = opts?.formatBorder ?? defaultFormatBorder;
  const symbols = (opts?.rounded ? roundedSymbols : squareSymbols).map(formatBorder);
  const hSymbol = formatBorder(S_BAR_H);
  const vSymbol = formatBorder(S_BAR);
  const linePrefixWidth = stringWidth(linePrefix);
  const titleWidth = stringWidth(title);
  const maxBoxWidth = columns - linePrefixWidth;
  let boxWidth = Math.floor(columns * width) - linePrefixWidth;
  if (opts?.width === 'auto') {
    const lines = message.split('\n');
    let longestLine = titleWidth + titlePadding * 2;
    for (const line of lines) {
      const lineWithPadding = stringWidth(line) + contentPadding * 2;
      if (lineWithPadding > longestLine) {
        longestLine = lineWithPadding;
      }
    }
    const longestLineWidth = longestLine + borderTotalWidth;
    if (longestLineWidth < boxWidth) {
      boxWidth = longestLineWidth;
    }
  }
  if (boxWidth % 2 !== 0) {
    if (boxWidth < maxBoxWidth) {
      boxWidth++;
    } else {
      boxWidth--;
    }
  }
  // Never below one column of interior: a zero-width PTY (CI, script(1))
  // reports columns the arithmetic below turns negative otherwise.
  const innerWidth = Math.max(boxWidth - borderTotalWidth, 1);
  const maxTitleLength = Math.max(innerWidth - titlePadding * 2, 1);
  // For truncation, we need to handle by visual width not character count
  let truncatedTitle = title;
  if (titleWidth > maxTitleLength) {
    // Simple truncation - could be improved with proper Unicode truncation
    let w = 0;
    let truncateAt = 0;
    for (const char of title) {
      w += stringWidth(char);
      if (w > maxTitleLength - 3) {
        break;
      }
      truncateAt++;
    }
    truncatedTitle = title.slice(0, truncateAt) + '...';
  }
  const [titlePaddingLeft, titlePaddingRight] = getPaddingForLine(
    stringWidth(truncatedTitle),
    innerWidth,
    titlePadding,
    opts?.titleAlign
  );
  const wrappedMessage = wrapAnsi(message, Math.max(innerWidth - contentPadding * 2, 1), {
    hard: true,
    trim: false,
  });
  output.write(
    `${linePrefix}${symbols[0]}${hSymbol.repeat(titlePaddingLeft)}${truncatedTitle}${hSymbol.repeat(titlePaddingRight)}${symbols[1]}\n`
  );
  const wrappedLines = wrappedMessage.split('\n');
  for (const line of wrappedLines) {
    const [leftLinePadding, rightLinePadding] = getPaddingForLine(
      stringWidth(line),
      innerWidth,
      contentPadding,
      opts?.contentAlign
    );
    output.write(
      `${linePrefix}${vSymbol}${' '.repeat(leftLinePadding)}${line}${' '.repeat(rightLinePadding)}${vSymbol}\n`
    );
  }
  output.write(`${linePrefix}${symbols[2]}${hSymbol.repeat(innerWidth)}${symbols[3]}\n`);
};

import type { Writable } from 'node:stream';

import process from 'node:process';

import prism from '../prism/index.js';
import { wrapAnsi } from '../core/utils/wrap-ansi.js';
import stringWidth from '../core/utils/string-width.js';
import {
  S_BAR,
  S_BAR_H,
  S_STEP_SUBMIT,
  S_CONNECT_LEFT,
  type CommonOptions,
  S_CORNER_TOP_RIGHT,
  S_CORNER_BOTTOM_RIGHT,
} from '../utilities/common.js';

export interface NoteOptions extends CommonOptions {
  format?: (line: string) => string;
}

const defaultNoteFormatter = (line: string): string => prism.dim(line);

const wrapWithFormat = (message: string, width: number, format: NoteOptions['format']): string => {
  const wrapMsg = wrapAnsi(message, width).split('\n');
  const maxWidthNormal = wrapMsg.reduce(
    (sum: number, ln: string) => Math.max(stringWidth(ln), sum),
    0
  );
  const formatFn = format ?? ((line: string) => line);
  const maxWidthFormat = wrapMsg
    .map(formatFn)
    .reduce((sum: number, ln: string) => Math.max(stringWidth(ln), sum), 0);
  const wrapWidth = width - (maxWidthFormat - maxWidthNormal);
  return wrapAnsi(message, wrapWidth);
};

export const note = (message = '', title = '', opts?: NoteOptions) => {
  const output: Writable = opts?.output ?? process.stdout;
  const format = opts?.format ?? defaultNoteFormatter;
  const columns = (output as any).columns ?? 80; // Default to 80 if columns not available
  const wrapMsg = wrapWithFormat(message, columns - 6, format);
  const lines = ['', ...wrapMsg.split('\n').map(format), ''];
  const titleLen = stringWidth(title);
  const len =
    Math.max(
      lines.reduce((sum, ln) => {
        const lineWidth = stringWidth(ln);
        return lineWidth > sum ? lineWidth : sum;
      }, 0),
      titleLen
    ) + 2;
  const msg = lines
    .map(
      (ln) => `${prism.gray(S_BAR)}  ${ln}${' '.repeat(len - stringWidth(ln))}${prism.gray(S_BAR)}`
    )
    .join('\n');
  output.write(
    `${prism.gray(S_BAR)}\n${prism.green(S_STEP_SUBMIT)}  ${prism.reset(title)} ${prism.gray(
      S_BAR_H.repeat(Math.max(len - titleLen - 1, 1)) + S_CORNER_TOP_RIGHT
    )}\n${msg}\n${prism.gray(S_CONNECT_LEFT + S_BAR_H.repeat(len + 2) + S_CORNER_BOTTOM_RIGHT)}\n`
  );
};

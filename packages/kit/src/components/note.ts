import type { Writable } from 'node:stream';

import process from 'node:process';

import prism from '../prism/index.js';
import { settings, getColumns } from '../core/index.js';
import stringWidth from '../core/utils/string-width.js';
import { wrapAnsi, WrapAnsiOptions } from '../core/utils/wrap-ansi.js';
import {
  S_BAR,
  S_BAR_H,
  S_STEP_SUBMIT,
  S_CONNECT_LEFT,
  type CommonOptions,
  S_CORNER_TOP_RIGHT,
  S_CORNER_BOTTOM_LEFT,
  S_CORNER_BOTTOM_RIGHT,
} from '../utilities/common.js';

type FormatFn = (line: string) => string;
export interface NoteOptions extends CommonOptions {
  format?: FormatFn;
}

// Content renders untouched (upstream #568): a note is body text, not a hint —
// dimming it made the box read as disabled.
const defaultNoteFormatter = (line: string): string => line;

const wrapWithFormat = (message: string, width: number, format: FormatFn): string => {
  const opts: WrapAnsiOptions = {
    hard: true,
    trim: false,
  };
  const wrapMsg = wrapAnsi(message, width, opts).split('\n');
  const maxWidthNormal = wrapMsg.reduce((sum, ln) => Math.max(stringWidth(ln), sum), 0);
  const maxWidthFormat = wrapMsg.map(format).reduce((sum, ln) => Math.max(stringWidth(ln), sum), 0);
  const wrapWidth = width - (maxWidthFormat - maxWidthNormal);
  return wrapAnsi(message, Math.max(1, wrapWidth), opts);
};

export const note = (message = '', title = '', opts?: NoteOptions) => {
  const output: Writable = opts?.output ?? process.stdout;
  const format = opts?.format ?? defaultNoteFormatter;
  const hasGuide = (opts?.withGuide ?? settings.withGuide) !== false;
  const leadingBorder = hasGuide ? `${prism.gray(S_BAR)}\n` : '';
  const columns = getColumns(output);
  // A narrow terminal may have no room for both the frame and formatted content.
  if (columns < 7 || stringWidth(format('M')) > columns - 6 || stringWidth(title) > columns - 6) {
    const content = [title, ...message.split('\n').map(format)].filter(Boolean);
    output.write(
      `${content.map((line) => wrapAnsi(line, columns, { hard: true, trim: false })).join('\n')}\n`
    );
    return;
  }
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
  // Without a guide there is no vertical bar to connect to, so the bottom
  // border closes with a corner instead of a tee.
  const bottomLeft = hasGuide ? S_CONNECT_LEFT : S_CORNER_BOTTOM_LEFT;
  output.write(
    `${leadingBorder}${settings.theme.success(S_STEP_SUBMIT)}  ${prism.reset(title)} ${prism.gray(
      S_BAR_H.repeat(Math.max(len - titleLen - 1, 1)) + S_CORNER_TOP_RIGHT
    )}\n${msg}\n${prism.gray(bottomLeft + S_BAR_H.repeat(len + 2) + S_CORNER_BOTTOM_RIGHT)}\n`
  );
};

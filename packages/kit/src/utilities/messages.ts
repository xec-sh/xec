import type { Writable } from 'node:stream';

import prism from '../prism/index.js';
import { settings } from '../core/index.js';
import { S_BAR, S_BAR_END, S_BAR_START, type CommonOptions } from './common.js';

export const cancel = (message = '', opts?: CommonOptions) => {
  const output: Writable = opts?.output ?? process.stdout;
  const hasGuide = (opts?.withGuide ?? settings.withGuide) !== false;
  // The indent belongs to the guide column: with the guide off the message
  // starts at column zero instead of hanging two spaces in.
  const prefix = hasGuide ? `${prism.gray(S_BAR_END)}  ` : '';
  output.write(`${prefix}${settings.theme.error(message)}\n\n`);
};

export const intro = (title = '', opts?: CommonOptions) => {
  const output: Writable = opts?.output ?? process.stdout;
  const hasGuide = (opts?.withGuide ?? settings.withGuide) !== false;
  const prefix = hasGuide ? `${prism.gray(S_BAR_START)}  ` : '';
  output.write(`${prefix}${title}\n`);
};

export const outro = (message = '', opts?: CommonOptions) => {
  const output: Writable = opts?.output ?? process.stdout;
  const hasGuide = (opts?.withGuide ?? settings.withGuide) !== false;
  const prefix = hasGuide ? `${prism.gray(S_BAR)}\n${prism.gray(S_BAR_END)}  ` : '';
  output.write(`${prefix}${message}\n\n`);
};

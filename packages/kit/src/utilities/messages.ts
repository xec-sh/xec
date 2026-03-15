import type { Writable } from 'node:stream';

import prism from '../prism/index.js';
import { settings } from '../core/index.js';
import { S_BAR, S_BAR_END, S_BAR_START, type CommonOptions } from './common.js';

export const cancel = (message = '', opts?: CommonOptions) => {
  const output: Writable = opts?.output ?? process.stdout;
  const hasGuide = (opts?.withGuide ?? settings.withGuide) !== false;
  const prefix = hasGuide ? prism.gray(S_BAR_END) : '';
  output.write(`${prefix}  ${prism.red(message)}\n\n`);
};

export const intro = (title = '', opts?: CommonOptions) => {
  const output: Writable = opts?.output ?? process.stdout;
  const hasGuide = (opts?.withGuide ?? settings.withGuide) !== false;
  const prefix = hasGuide ? prism.gray(S_BAR_START) : '';
  output.write(`${prefix}  ${title}\n`);
};

export const outro = (message = '', opts?: CommonOptions) => {
  const output: Writable = opts?.output ?? process.stdout;
  const hasGuide = (opts?.withGuide ?? settings.withGuide) !== false;
  const leadingBar = hasGuide ? `${prism.gray(S_BAR)}\n` : '';
  const prefix = hasGuide ? prism.gray(S_BAR_END) : '';
  output.write(`${leadingBar}${prefix}  ${message}\n\n`);
};

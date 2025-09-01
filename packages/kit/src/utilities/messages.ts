import type { Writable } from 'node:stream';

import prism from '../prism/index.js';
import { S_BAR, S_BAR_END, S_BAR_START, type CommonOptions } from './common.js';

export const cancel = (message = '', opts?: CommonOptions) => {
  const output: Writable = opts?.output ?? process.stdout;
  output.write(`${prism.gray(S_BAR_END)}  ${prism.red(message)}\n\n`);
};

export const intro = (title = '', opts?: CommonOptions) => {
  const output: Writable = opts?.output ?? process.stdout;
  output.write(`${prism.gray(S_BAR_START)}  ${title}\n`);
};

export const outro = (message = '', opts?: CommonOptions) => {
  const output: Writable = opts?.output ?? process.stdout;
  output.write(`${prism.gray(S_BAR)}\n${prism.gray(S_BAR_END)}  ${message}\n\n`);
};

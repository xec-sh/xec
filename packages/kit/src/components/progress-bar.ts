import prism from '../prism/index.js';
import { unicodeOr } from '../utilities/common.js';
import { spinner, type SpinnerResult, type SpinnerOptions } from './spinner.js';

import type { State } from '../core/index.js';

const S_PROGRESS_CHAR: Record<NonNullable<ProgressOptions['style']>, string> = {
  light: unicodeOr('─', '-'),
  heavy: unicodeOr('━', '='),
  block: unicodeOr('█', '#'),
};

export interface ProgressOptions {
  message?: string;
  style?: 'light' | 'heavy' | 'block';
  max?: number;
  size?: number;
  input?: SpinnerOptions['input'];
  output?: SpinnerOptions['output'];
  signal?: SpinnerOptions['signal'];
}

export interface ProgressResult extends SpinnerResult {
  advance(step?: number, msg?: string): void;
}

export function progress({
  message,
  style = 'heavy',
  max: userMax = 100,
  size: userSize = 40,
  input,
  output,
  signal,
}: ProgressOptions = {}): ProgressResult {
  const spin = spinner({ input, output, signal });
  let value = 0;
  let previousMessage = '';

  const max = Math.max(1, userMax);
  const size = Math.max(1, userSize);

  const activeStyle = (state: State) => {
    switch (state) {
      case 'initial':
      case 'active':
        return prism.magenta;
      case 'error':
      case 'cancel':
        return prism.red;
      case 'submit':
        return prism.green;
      default:
        return prism.magenta;
    }
  };
  const drawProgress = (state: State, msg: string) => {
    const active = Math.floor((value / max) * size);
    return `${activeStyle(state)(S_PROGRESS_CHAR[style].repeat(active))}${prism.dim(S_PROGRESS_CHAR[style].repeat(size - active))} ${msg}`;
  };

  const start = (msg = '') => {
    previousMessage = msg;
    spin.start(drawProgress('initial', msg));
  };
  const advance = (step = 1, msg?: string): void => {
    value = Math.min(max, step + value);
    spin.message(drawProgress('active', msg ?? previousMessage));
    previousMessage = msg ?? previousMessage;
  };
  return {
    start,
    stop: spin.stop,
    advance,
    isCancelled: spin.isCancelled,
    message: (msg: string) => advance(0, msg),
  };
}

import type { State } from '../core/index.js';

import prism from '../prism/index.js';
import { settings } from '../core/index.js';
import { unicodeOr } from '../utilities/common.js';
import { spinner, type SpinnerResult, type SpinnerOptions } from './spinner.js';

const S_PROGRESS_CHAR: Record<NonNullable<ProgressOptions['style']>, string> = {
  light: unicodeOr('─', '-'),
  heavy: unicodeOr('━', '='),
  block: unicodeOr('█', '#'),
};

// `style` names the bar characters here; the spinner's own frame preset of the
// same name is excluded — its frames/delay/styleFrame pass-throughs cover it.
export interface ProgressOptions extends Omit<SpinnerOptions, 'style'> {
  style?: 'light' | 'heavy' | 'block';
  max?: number;
  size?: number;
}

export interface ProgressResult extends SpinnerResult {
  advance(step?: number, msg?: string): void;
}

export function progress({
  style = 'heavy',
  max: userMax = 100,
  size: userSize = 40,
  ...spinnerOptions
}: ProgressOptions = {}): ProgressResult {
  const spin = spinner(spinnerOptions);
  let value = 0;
  let previousMessage = '';

  const max = Math.max(1, userMax);
  const size = Math.max(1, userSize);

  const activeStyle = (state: State) => {
    switch (state) {
      case 'initial':
      case 'active':
        return settings.theme.activity;
      case 'error':
      case 'cancel':
        return settings.theme.error;
      case 'submit':
        return settings.theme.success;
      default:
        return settings.theme.activity;
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
    // Clamp to [0, max] — a negative running total would make
    // `repeat(active)` throw RangeError while drawing the bar
    value = Math.min(max, Math.max(0, step + value));
    spin.message(drawProgress('active', msg ?? previousMessage));
    previousMessage = msg ?? previousMessage;
  };
  return {
    start,
    stop: (msg?: string) => spin.stop(msg),
    cancel: (msg?: string) => spin.cancel(msg),
    error: (msg?: string) => spin.error(msg),
    clear: () => spin.clear(),
    advance,
    get isCancelled() {
      return spin.isCancelled;
    },
    message: (msg?: string) => advance(0, msg),
  };
}

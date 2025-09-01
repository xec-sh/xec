import { erase, cursor } from 'sisteransi';

import prism from '../prism/index.js';
import { wrapAnsi } from '../core/utils/wrap-ansi.js';
import { block, settings, getColumns } from '../core/index.js';
import {
  S_BAR,
  unicode,
  S_STEP_ERROR,
  S_STEP_CANCEL,
  S_STEP_SUBMIT,
  isCI as isCIFn,
  type CommonOptions,
} from '../utilities/common.js';

// Spinner frame sets for different animation styles
export const SPINNER_FRAMES = {
  // Classic smooth spinning (default)
  braille: {
    unicode: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    ascii: ['/', '-', '\\', '|'],
    delay: { unicode: 80, ascii: 120 },
  },

  // Traditional circle
  circle: {
    unicode: ['◐', '◓', '◑', '◒'],
    ascii: ['•', 'o', 'O', '0'],
    delay: { unicode: 120, ascii: 150 },
  },

  // Pulsing dots
  dots: {
    unicode: ['⠄', '⠆', '⠇', '⠋', '⠙', '⠸', '⠰', '⠠', '⠰', '⠸', '⠙', '⠋', '⠇', '⠆'],
    ascii: ['.', '..', '...', '   '],
    delay: { unicode: 100, ascii: 200 },
  },

  // Minimal line
  line: {
    unicode: ['─', '\\', '|', '/'],
    ascii: ['-', '\\', '|', '/'],
    delay: { unicode: 100, ascii: 120 },
  },

  // Arrow rotation
  arrow: {
    unicode: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
    ascii: ['<', '^', '>', 'v'],
    delay: { unicode: 100, ascii: 150 },
  },

  // Binary style
  binary: {
    unicode: ['0', '1'],
    ascii: ['0', '1'],
    delay: { unicode: 150, ascii: 200 },
  },

  // Moon phases
  moon: {
    unicode: ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'],
    ascii: ['(', 'O', ')'],
    delay: { unicode: 200, ascii: 300 },
  },
} as const;

export type SpinnerFrameStyle = keyof typeof SPINNER_FRAMES;

export interface SpinnerOptions extends CommonOptions {
  indicator?: 'dots' | 'timer';
  onCancel?: () => void;
  cancelMessage?: string;
  errorMessage?: string;
  frames?: readonly string[];
  delay?: number;
  /** Built-in spinner frame style (overrides frames and delay) */
  style?: SpinnerFrameStyle;
}

export interface SpinnerResult {
  start(msg?: string): void;
  stop(msg?: string, code?: number): void;
  message(msg?: string): void;
  readonly isCancelled: boolean;
}

export const spinner = ({
  indicator = 'dots',
  onCancel,
  output = process.stdout,
  cancelMessage,
  errorMessage,
  frames,
  delay,
  style = 'braille',
  signal,
}: SpinnerOptions = {}): SpinnerResult => {
  // Use built-in style if no custom frames provided
  if (!frames) {
    const frameSet = SPINNER_FRAMES[style];
    frames = unicode ? frameSet.unicode : frameSet.ascii;
    if (!delay) {
      delay = unicode ? frameSet.delay.unicode : frameSet.delay.ascii;
    }
  }
  const isCI = isCIFn();

  let unblock: () => void;
  let loop: NodeJS.Timeout;
  let isSpinnerActive = false;
  let isCancelled = false;
  let _message = '';
  let _prevMessage: string | undefined;
  let _origin: number = performance.now();
  const columns = getColumns(output);

  const handleExit = (code: number) => {
    const msg =
      code > 1
        ? (errorMessage ?? settings.messages.error)
        : (cancelMessage ?? settings.messages.cancel);
    isCancelled = code === 1;
    if (isSpinnerActive) {
      stop(msg, code);
      if (isCancelled && typeof onCancel === 'function') {
        onCancel();
      }
    }
  };

  const errorEventHandler = () => handleExit(2);
  const signalEventHandler = () => handleExit(1);

  const registerHooks = () => {
    // Reference: https://nodejs.org/api/process.html#event-uncaughtexception
    process.on('uncaughtExceptionMonitor', errorEventHandler);
    // Reference: https://nodejs.org/api/process.html#event-unhandledrejection
    process.on('unhandledRejection', errorEventHandler);
    // Reference Signal Events: https://nodejs.org/api/process.html#signal-events
    process.on('SIGINT', signalEventHandler);
    process.on('SIGTERM', signalEventHandler);
    process.on('exit', handleExit);

    if (signal) {
      signal.addEventListener('abort', signalEventHandler);
    }
  };

  const clearHooks = () => {
    process.removeListener('uncaughtExceptionMonitor', errorEventHandler);
    process.removeListener('unhandledRejection', errorEventHandler);
    process.removeListener('SIGINT', signalEventHandler);
    process.removeListener('SIGTERM', signalEventHandler);
    process.removeListener('exit', handleExit);

    if (signal) {
      signal.removeEventListener('abort', signalEventHandler);
    }
  };

  const clearPrevMessage = () => {
    if (_prevMessage === undefined) return;
    if (isCI) output.write('\n');
    const wrapped = wrapAnsi(_prevMessage, columns, {
      hard: true,
      trim: false,
    });
    const prevLines = wrapped.split('\n');
    if (prevLines.length > 1) {
      output.write(cursor.up(prevLines.length - 1));
    }
    output.write(cursor.to(0));
    output.write(erase.down());
  };

  const removeTrailingDots = (msg: string): string => msg.replace(/\.+$/, '');

  const formatTimer = (origin: number): string => {
    const duration = (performance.now() - origin) / 1000;
    const min = Math.floor(duration / 60);
    const secs = Math.floor(duration % 60);
    return min > 0 ? `[${min}m ${secs}s]` : `[${secs}s]`;
  };

  const start = (msg = ''): void => {
    isSpinnerActive = true;
    unblock = block({ output });
    _message = removeTrailingDots(msg);
    _origin = performance.now();
    output.write(`${prism.gray(S_BAR)}\n`);
    let frameIndex = 0;
    let indicatorTimer = 0;
    registerHooks();
    loop = setInterval(() => {
      if (isCI && _message === _prevMessage) {
        return;
      }
      clearPrevMessage();
      _prevMessage = _message;
      const frame = prism.magenta(frames[frameIndex]);
      let outputMessage: string;

      if (isCI) {
        outputMessage = `${frame}  ${_message}...`;
      } else if (indicator === 'timer') {
        outputMessage = `${frame}  ${_message} ${formatTimer(_origin)}`;
      } else {
        const loadingDots = '.'.repeat(Math.floor(indicatorTimer)).slice(0, 3);
        outputMessage = `${frame}  ${_message}${loadingDots}`;
      }

      const wrapped = wrapAnsi(outputMessage, columns, {
        hard: true,
        trim: false,
      });
      output.write(wrapped);

      frameIndex = frameIndex + 1 < frames.length ? frameIndex + 1 : 0;
      // indicator increase by 1 every 8 frames
      indicatorTimer = indicatorTimer < 4 ? indicatorTimer + 0.125 : 0;
    }, delay);
  };

  const stop = (msg = '', code = 0): void => {
    if (!isSpinnerActive) return;
    isSpinnerActive = false;
    clearInterval(loop);
    clearPrevMessage();
    const step =
      code === 0
        ? prism.green(S_STEP_SUBMIT)
        : code === 1
          ? prism.red(S_STEP_CANCEL)
          : prism.red(S_STEP_ERROR);
    _message = msg ?? _message;
    if (indicator === 'timer') {
      output.write(`${step}  ${_message} ${formatTimer(_origin)}\n`);
    } else {
      output.write(`${step}  ${_message}\n`);
    }
    clearHooks();
    unblock();
  };

  const message = (msg = ''): void => {
    _message = removeTrailingDots(msg ?? _message);
  };

  return {
    start,
    stop,
    message,
    get isCancelled() {
      return isCancelled;
    },
  };
};

import timers from 'node:timers';
import { erase, cursor } from 'sisteransi';

import prism from '../prism/index.js';
import { wrapAnsi } from '../core/utils/wrap-ansi.js';
import { sanitizeTerminalText } from '../prism/utils/ansi.js';
import { block, settings, getColumns, isAccessible } from '../core/index.js';
import {
  S_BAR,
  isTTY,
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
  /** Disable all indicator output and terminal hooks while retaining its state API. */
  enabled?: boolean;
  /** Append-only output, also enabled by global settings or ACCESSIBLE. */
  accessible?: boolean;
  onCancel?: () => void;
  cancelMessage?: string;
  errorMessage?: string;
  frames?: readonly string[];
  delay?: number;
  /** Built-in frame preset, used unless frames or delay are provided */
  style?: SpinnerFrameStyle;
  /** Custom function to style the spinner frame character */
  styleFrame?: (frame: string) => string;
}

export interface SpinnerResult {
  start(msg?: string): void;
  stop(msg?: string): void;
  cancel(msg?: string): void;
  error(msg?: string): void;
  clear(): void;
  message(msg?: string): void;
  readonly isCancelled: boolean;
}

export const spinner = ({
  indicator = 'dots',
  enabled = true,
  onCancel,
  input = process.stdin,
  output = process.stdout,
  cancelMessage,
  errorMessage,
  frames: suppliedFrames,
  delay: suppliedDelay,
  style = 'braille',
  signal,
  styleFrame,
  withGuide,
  accessible,
}: SpinnerOptions = {}): SpinnerResult => {
  const preset = SPINNER_FRAMES[style];
  if (!preset) throw new RangeError('Unknown spinner style');
  const frames = suppliedFrames ?? (unicode ? preset.unicode : preset.ascii);
  const delay = suppliedDelay ?? (unicode ? preset.delay.unicode : preset.delay.ascii);
  if (!frames.length || !Number.isFinite(delay) || delay <= 0) {
    throw new RangeError('Spinner requires frames and a finite positive delay');
  }
  const staticOutput = isAccessible(accessible) || isCIFn() || !isTTY(output);
  const hasGuide = (withGuide ?? settings.withGuide) !== false;
  const formatFrame = styleFrame ?? ((frame: string) => settings.theme.activity(frame));
  let unblock: (() => void) | undefined;
  let loop: NodeJS.Timeout | undefined;
  let active = false;
  let cancelled = false;
  let currentMessage = '';
  let previousFrame = '';
  let origin = performance.now();
  let frameIndex = 0;

  const plain = (message: string) => sanitizeTerminalText(message, false);
  const clearFrame = () => {
    if (!previousFrame || staticOutput) return;
    const lines = wrapAnsi(previousFrame, getColumns(output), { hard: true, trim: false }).split(
      '\n'
    ).length;
    if (lines > 1) output.write(cursor.up(lines - 1));
    output.write(cursor.to(0));
    output.write(erase.down());
    previousFrame = '';
  };
  const detach = () => {
    timers.clearInterval(loop);
    loop = undefined;
    process.removeListener('uncaughtExceptionMonitor', onFailure);
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
    process.removeListener('exit', onExit);
    signal?.removeEventListener('abort', onAbort);
    output.off('resize', render);
    output.off('error', onOutputError);
    unblock?.();
    unblock = undefined;
  };
  const finish = (message: string, code: number, silent = false) => {
    if (!active) return;
    active = false;
    cancelled = code === 1;
    if (!enabled) return;
    try {
      if (!output.destroyed) {
        clearFrame();
        if (!silent) {
          if (staticOutput) output.write(`${plain(message)}\n`);
          else {
            const icon =
              code === 0
                ? settings.theme.success(S_STEP_SUBMIT)
                : settings.theme.error(code === 1 ? S_STEP_CANCEL : S_STEP_ERROR);
            output.write(`${icon}  ${message}\n`);
          }
        }
      }
    } finally {
      detach();
    }
  };
  const onAbort = () => {
    const wasActive = active;
    finish(cancelMessage ?? settings.messages.cancel, 1);
    if (wasActive) onCancel?.();
  };
  const onInterrupt = (fromKeyboard = false) => {
    onAbort();
    if (!onCancel) {
      if (process.listenerCount('SIGINT') === 0) process.exit(130);
      else if (fromKeyboard) process.emit('SIGINT');
    }
  };
  const onTerminate = () => {
    onAbort();
    if (!onCancel && process.listenerCount('SIGTERM') === 0) process.exit(143);
  };
  const onFailure = () => {
    try {
      finish(errorMessage ?? settings.messages.error, 2);
    } catch {
      detach();
    }
  };
  const onOutputError = () => {
    active = false;
    detach();
  };
  const onExit = (code: number) =>
    finish(
      code === 0 ? currentMessage : (errorMessage ?? settings.messages.error),
      code === 0 ? 0 : 2
    );
  const writeStatus = (message: string) => {
    try {
      output.write(`${plain(message)}\n`);
    } catch (error) {
      active = false;
      detach();
      throw error;
    }
  };
  const render = () => {
    if (!active || staticOutput) return;
    try {
      clearFrame();
      const elapsed = Math.floor((performance.now() - origin) / 1000);
      const suffix =
        indicator === 'timer' ? ` [${elapsed}s]` : '.'.repeat(Math.floor(frameIndex / 8) % 4);
      previousFrame = `${formatFrame(frames[frameIndex % frames.length] ?? '')}  ${currentMessage}${suffix}`;
      output.write(wrapAnsi(previousFrame, getColumns(output), { hard: true, trim: false }));
      frameIndex++;
    } catch (error) {
      active = false;
      detach();
      throw error;
    }
  };
  const start = (message = '') => {
    currentMessage = message.replace(/\.+$/, '');
    cancelled = false;
    if (!enabled) {
      cancelled = signal?.aborted ?? false;
      active = !cancelled;
      return;
    }
    if (signal?.aborted) {
      cancelled = true;
      output.write(`${plain(cancelMessage ?? settings.messages.cancel)}\n`);
      return;
    }
    const wasActive = active;
    timers.clearInterval(loop);
    origin = performance.now();
    frameIndex = 0;
    active = true;
    try {
      if (!wasActive) {
        process.on('uncaughtExceptionMonitor', onFailure);
        process.on('SIGINT', onInterrupt);
        process.on('SIGTERM', onTerminate);
        process.on('exit', onExit);
        signal?.addEventListener('abort', onAbort, { once: true });
        output.on('error', onOutputError);
        if (!staticOutput) {
          output.on('resize', render);
          unblock = block({ input, output, onCancel: () => onInterrupt(true) });
          if (hasGuide) output.write(`${prism.gray(S_BAR)}\n`);
        }
      }
      if (staticOutput) {
        writeStatus(currentMessage);
        loop = timers.setInterval(() => writeStatus(`Still working — ${currentMessage}`), 30_000);
      } else loop = timers.setInterval(render, delay);
      loop.unref();
    } catch (error) {
      active = false;
      detach();
      throw error;
    }
  };
  return {
    start,
    stop: (message = currentMessage) => finish(message, 0),
    cancel: (message = cancelMessage ?? settings.messages.cancel) => finish(message, 1),
    error: (message = errorMessage ?? settings.messages.error) => finish(message, 2),
    clear: () => finish('', 0, true),
    message: (message = currentMessage) => {
      const next = message.replace(/\.+$/, '');
      if (enabled && active && staticOutput && next !== currentMessage) writeStatus(next);
      currentMessage = next;
    },
    get isCancelled() {
      return cancelled;
    },
  };
};

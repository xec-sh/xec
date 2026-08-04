import prism from '../prism/index.js';
import { settings } from '../core/index.js';
import {
  S_BAR,
  S_INFO,
  S_WARN,
  S_ERROR,
  S_SUCCESS,
  S_STEP_SUBMIT,
  type CommonOptions,
} from './common.js';

export interface LogMessageOptions extends CommonOptions {
  symbol?: string;
  spacing?: number;
  secondarySymbol?: string;
}

export const log = {
  message: (
    message: string | string[] = [],
    {
      symbol = prism.gray(S_BAR),
      secondarySymbol = prism.gray(S_BAR),
      output = process.stdout,
      spacing = 1,
      withGuide,
    }: LogMessageOptions = {}
  ) => {
    const hasGuide = (withGuide ?? settings.withGuide) !== false;
    const parts: string[] = [];
    // With the guide off, spacing rows stay blank and no symbol column is
    // printed — the message starts at column zero (upstream behaviour).
    const spacingString = hasGuide ? secondarySymbol : '';
    const prefix = hasGuide ? `${symbol}  ` : '';
    const secondaryPrefix = hasGuide ? `${secondarySymbol}  ` : '';

    for (let i = 0; i < spacing; i++) {
      parts.push(spacingString);
    }

    const messageParts = Array.isArray(message) ? message : message.split('\n');
    if (messageParts.length > 0) {
      const [firstLine, ...lines] = messageParts;
      if (firstLine && firstLine.length > 0) {
        parts.push(`${prefix}${firstLine}`);
      } else {
        parts.push(hasGuide ? symbol : '');
      }
      for (const ln of lines) {
        if (ln.length > 0) {
          parts.push(`${secondaryPrefix}${ln}`);
        } else {
          parts.push(hasGuide ? secondarySymbol : '');
        }
      }
    }
    output.write(`${parts.join('\n')}\n`);
  },
  info: (message: string, opts?: LogMessageOptions) => {
    log.message(message, { ...opts, symbol: settings.theme.info(S_INFO) });
  },
  success: (message: string, opts?: LogMessageOptions) => {
    log.message(message, { ...opts, symbol: settings.theme.success(S_SUCCESS) });
  },
  step: (message: string, opts?: LogMessageOptions) => {
    log.message(message, { ...opts, symbol: settings.theme.success(S_STEP_SUBMIT) });
  },
  warn: (message: string, opts?: LogMessageOptions) => {
    log.message(message, { ...opts, symbol: settings.theme.warning(S_WARN) });
  },
  /** alias for `log.warn()`. */
  warning: (message: string, opts?: LogMessageOptions) => {
    log.warn(message, opts);
  },
  error: (message: string, opts?: LogMessageOptions) => {
    log.message(message, { ...opts, symbol: settings.theme.error(S_ERROR) });
  },
};

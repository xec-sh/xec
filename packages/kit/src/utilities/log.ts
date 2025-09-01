import prism from '../prism/index.js';
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
    }: LogMessageOptions = {}
  ) => {
    const parts: string[] = [];
    for (let i = 0; i < spacing; i++) {
      parts.push(`${secondarySymbol}`);
    }
    const messageParts = Array.isArray(message) ? message : message.split('\n');
    if (messageParts.length > 0) {
      const [firstLine, ...lines] = messageParts;
      if (firstLine && firstLine.length > 0) {
        parts.push(`${symbol}  ${firstLine}`);
      } else {
        parts.push(symbol);
      }
      for (const ln of lines) {
        if (ln.length > 0) {
          parts.push(`${secondarySymbol}  ${ln}`);
        } else {
          parts.push(secondarySymbol);
        }
      }
    }
    output.write(`${parts.join('\n')}\n`);
  },
  info: (message: string, opts?: LogMessageOptions) => {
    log.message(message, { ...opts, symbol: prism.blue(S_INFO) });
  },
  success: (message: string, opts?: LogMessageOptions) => {
    log.message(message, { ...opts, symbol: prism.green(S_SUCCESS) });
  },
  step: (message: string, opts?: LogMessageOptions) => {
    log.message(message, { ...opts, symbol: prism.green(S_STEP_SUBMIT) });
  },
  warn: (message: string, opts?: LogMessageOptions) => {
    log.message(message, { ...opts, symbol: prism.yellow(S_WARN) });
  },
  /** alias for `log.warn()`. */
  warning: (message: string, opts?: LogMessageOptions) => {
    log.warn(message, opts);
  },
  error: (message: string, opts?: LogMessageOptions) => {
    log.message(message, { ...opts, symbol: prism.red(S_ERROR) });
  },
};

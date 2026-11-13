import type { LogMessageOptions } from './log.js';

import stringWidth from '../core/utils/string-width.js';
import { settings, getColumns, isAccessible } from '../core/index.js';
import { terminalSegments } from '../core/utils/string-truncated-width.js';
import { S_BAR, S_INFO, S_WARN, S_ERROR, S_SUCCESS, S_STEP_SUBMIT } from './common.js';
import { RESET, hasAnsi, TerminalTextDecoder, sanitizeTerminalText } from '../prism/utils/ansi.js';

async function message(
  iterable: Iterable<string> | AsyncIterable<string>,
  options: LogMessageOptions = {}
): Promise<void> {
  const output = options.output ?? process.stdout;
  const plain = isAccessible(options.accessible);
  const guide = (options.withGuide ?? settings.withGuide) !== false;
  const symbol = options.symbol ?? settings.theme.muted(S_BAR);
  const secondary = options.secondarySymbol ?? S_BAR;
  const spacing = options.spacing ?? 1;
  if (!Number.isSafeInteger(spacing) || spacing < 0) throw new RangeError('spacing must be a nonnegative integer');
  options.signal?.throwIfAborted();
  let failure: Error | undefined;
  const onError = (error: Error) => { failure = error; };
  output.on('error', onError);
  const write = async (text: string) => {
    if (failure) throw failure;
    await new Promise<void>((resolve, reject) => {
      output.write(plain ? sanitizeTerminalText(text, false) : text, error => error ? reject(error) : resolve());
    });
  };
  const decoder = new TerminalTextDecoder(!plain);
  let styled = false;
  let width = 0;
  let pending = '';
  const prefix = (first: boolean) => {
    const text = guide ? `${first ? symbol : secondary}  ` : '';
    return stringWidth(text) < getColumns(output) ? text : '';
  };
  const render = (text: string) => {
    let rendered = '';
    for (const part of terminalSegments(text)) {
      if (part.text === '\n') {
        const continuation = prefix(false);
        rendered += `\n${continuation}`;
        width = stringWidth(continuation);
        continue;
      }
      const size = part.escape ? 0 : stringWidth(part.text);
      if (size > 0 && width + size > getColumns(output)) {
        const continuation = prefix(false);
        rendered += `\n${continuation}`;
        width = stringWidth(continuation);
      }
      rendered += part.text;
      width += size;
    }
    return rendered;
  };
  try {
    for (let i = 0; i < spacing; i++) await write(guide ? `${secondary}\n` : '\n');
    const first = prefix(true);
    width = stringWidth(first);
    await write(first);
    for await (const chunk of iterable) {
      options.signal?.throwIfAborted();
      const text = pending + decoder.write(chunk);
      styled ||= hasAnsi(text);
      const parts = Array.from(terminalSegments(text));
      const last = parts.at(-1);
      const hold = last && !last.escape && last.text !== '\n' ? last.index : text.length;
      pending = text.slice(hold);
      await write(render(text.slice(0, hold)));
    }
    options.signal?.throwIfAborted();
    await write(render(pending) + (styled ? RESET : '') + '\n');
    styled = false;
  } catch (error) {
    if (!failure && !output.destroyed) {
      try {
        await write(render(pending) + (styled ? RESET : '') + (pending ? '\n' : ''));
        styled = false;
      } catch (writeError) {
        throw new AggregateError([error, writeError], 'Stream source and destination failed', { cause: writeError });
      }
    }
    throw error;
  } finally {
    if (styled && !output.destroyed && !failure) output.write(RESET);
    output.off('error', onError);
  }
}

/** Incremental text output with the same destination and guide options as log. */
export const stream = {
  message,
  info: (iterable: Iterable<string> | AsyncIterable<string>, options?: LogMessageOptions) =>
    message(iterable, { ...options, symbol: settings.theme.info(S_INFO) }),
  success: (iterable: Iterable<string> | AsyncIterable<string>, options?: LogMessageOptions) =>
    message(iterable, { ...options, symbol: settings.theme.success(S_SUCCESS) }),
  step: (iterable: Iterable<string> | AsyncIterable<string>, options?: LogMessageOptions) =>
    message(iterable, { ...options, symbol: settings.theme.success(S_STEP_SUBMIT) }),
  warn: (iterable: Iterable<string> | AsyncIterable<string>, options?: LogMessageOptions) =>
    message(iterable, { ...options, symbol: settings.theme.warning(S_WARN) }),
  warning: (iterable: Iterable<string> | AsyncIterable<string>, options?: LogMessageOptions) =>
    message(iterable, { ...options, symbol: settings.theme.warning(S_WARN) }),
  error: (iterable: Iterable<string> | AsyncIterable<string>, options?: LogMessageOptions) =>
    message(iterable, { ...options, symbol: settings.theme.error(S_ERROR) }),
};

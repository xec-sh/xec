import type { Writable } from 'node:stream';

import { erase } from 'sisteransi';

import prism from '../prism/index.js';
import { log } from '../utilities/log.js';
import stringWidth from '../core/utils/string-width.js';
import { getColumns, isAccessible } from '../core/index.js';
import { TerminalTextDecoder, sanitizeTerminalText } from '../prism/utils/ansi.js';
import {
  S_BAR,
  S_STEP_SUBMIT,
  isCI as isCIFn,
  isTTY as isTTYFn,
  type CommonOptions,
} from '../utilities/common.js';

export interface TaskLogOptions extends CommonOptions {
  title: string;
  limit?: number;
  spacing?: number;
  retainLog?: boolean;
}

export interface TaskLogMessageOptions {
  raw?: boolean;
}

export interface TaskLogCompletionOptions {
  showLog?: boolean;
}

interface BufferEntry {
  header?: string;
  value: string;
  full: string;
  lastMessageWasRaw?: boolean;
  decoder?: TerminalTextDecoder;
  result?: {
    status: 'success' | 'error';
    message: string;
  };
}

/**
 * Renders a log which clears on success and remains on failure
 */
export const taskLog = (opts: TaskLogOptions) => {
  const output: Writable = opts.output ?? process.stdout;
  const secondarySymbol = prism.gray(S_BAR);
  const spacing = opts.spacing ?? 1;
  const barSize = 3;
  const retainLog = opts.retainLog === true;
  const accessible = isAccessible(opts.accessible);
  const isTTY = !accessible && !isCIFn() && isTTYFn(output);
  if (!Number.isSafeInteger(spacing) || spacing < 0) throw new RangeError('spacing must be a nonnegative integer');
  if (opts.limit !== undefined && (!Number.isSafeInteger(opts.limit) || opts.limit < 0)) {
    throw new RangeError('limit must be a nonnegative integer');
  }
  const display = (text: string) => sanitizeTerminalText(text, !accessible);
  const write = (text: string) => output.write(accessible ? prism.strip(text) : text);

  write(`${secondarySymbol}\n`);
  write(`${prism.green(S_STEP_SUBMIT)}  ${display(opts.title)}\n`);
  for (let i = 0; i < spacing; i++) {
    write(`${secondarySymbol}\n`);
  }

  const buffers: BufferEntry[] = [
    {
      value: '',
      full: '',
    },
  ];

  let rawBuffer: BufferEntry | undefined;
  const finishRawLine = () => {
    if (rawBuffer) write('\n');
    rawBuffer = undefined;
  };

  const clear = (clearTitle: boolean): void => {
    // Erase sequences are meaningless outside a live terminal and would
    // pollute CI logs / piped output with control garbage
    if (!isTTY) {
      return;
    }
    if (buffers.length === 0) {
      return;
    }

    let lines = 0;

    if (clearTitle) {
      lines += spacing + 2;
    }

    for (const buffer of buffers) {
      const { value, result } = buffer;
      let text = result?.message ?? value;

      if (text.length === 0) {
        continue;
      }

      if (result === undefined && buffer.header !== undefined && buffer.header !== '') {
        text += `\n${buffer.header}`;
      }

      const bufferHeight = text.split('\n').reduce((count, line) => {
        if (line === '') {
          return count + 1;
        }
        // Visual width, not char count: ANSI codes take no columns and
        // CJK takes two — .length would erase too many / too few lines
        return count + Math.ceil((stringWidth(line) + barSize) / getColumns(output));
      }, 0);

      lines += bufferHeight;
    }

    if (lines > 0) {
      lines += 1;
      output.write(erase.lines(lines));
    }
  };
  const printBuffer = (buffer: BufferEntry, messageSpacing?: number, full?: boolean): void => {
    const messages = full ? `${buffer.full}\n${buffer.value}` : buffer.value;
    if (buffer.header !== undefined && buffer.header !== '') {
      log.message(buffer.header.split('\n').map(line => prism.bold(line)), {
        output,
        accessible,
        secondarySymbol,
        symbol: secondarySymbol,
        spacing: 0,
      });
    }
    log.message(messages.split('\n').map(line => prism.dim(line)), {
      output,
      accessible,
      secondarySymbol,
      symbol: secondarySymbol,
      spacing: messageSpacing ?? spacing,
    });
  };
  const renderBuffer = (): void => {
    for (const buffer of buffers) {
      const { header, value, full } = buffer;
      if ((header === undefined || header.length === 0) && value.length === 0) {
        continue;
      }
      printBuffer(buffer, undefined, retainLog === true && full.length > 0);
    }
  };
  const message = (buffer: BufferEntry, msg: string, mopts?: TaskLogMessageOptions) => {
    clear(false);
    if ((mopts?.raw !== true || !buffer.lastMessageWasRaw) && buffer.value !== '') {
      buffer.value += '\n';
    }
    if (!mopts?.raw || !buffer.lastMessageWasRaw) buffer.decoder = new TerminalTextDecoder(!accessible);
    const text = buffer.decoder?.write(msg) ?? display(msg);
    buffer.value += text;
    buffer.lastMessageWasRaw = mopts?.raw === true;
    if (opts.limit !== undefined) {
      const lines = buffer.value.split('\n');
      const linesToRemove = lines.length - opts.limit;
      if (linesToRemove > 0) {
        const removedLines = lines.splice(0, linesToRemove);
        if (retainLog) {
          buffer.full += (buffer.full === '' ? '' : '\n') + removedLines.join('\n');
        }
      }
      buffer.value = lines.join('\n');
    }
    if (isTTY) {
      printBuffers();
    } else if (mopts?.raw) {
      if (rawBuffer !== buffer) {
        finishRawLine();
        write(`${secondarySymbol}  ${buffer.header ? `${buffer.header}: ` : ''}`);
      }
      write(text);
      rawBuffer = text.endsWith('\n') ? undefined : buffer;
    } else {
      finishRawLine();
      const labelled = buffer.header ? `${buffer.header}: ${text}` : text;
      log.message(labelled, { output, accessible, symbol: secondarySymbol, spacing: 0 });
    }
  };
  const printBuffers = (): void => {
    for (const buffer of buffers) {
      if (buffer.result) {
        if (buffer.result.status === 'error') {
          log.error(buffer.result.message, { output, accessible, secondarySymbol, spacing: 0 });
        } else {
          log.success(buffer.result.message, { output, accessible, secondarySymbol, spacing: 0 });
        }
      } else if (buffer.value !== '') {
        printBuffer(buffer, 0);
      }
    }
  };
  const completeBuffer = (buffer: BufferEntry, result: BufferEntry['result']): void => {
    clear(false);

    buffer.result = result && { ...result, message: display(result.message) };

    if (isTTY) {
      printBuffers();
    } else if (buffer.result) {
      finishRawLine();
      log[buffer.result.status](buffer.result.message, { output, accessible, spacing: 0 });
    }
  };

  return {
    message(msg: string, mopts?: TaskLogMessageOptions) {
      const firstBuffer = buffers[0];
      if (firstBuffer) {
        message(firstBuffer, msg, mopts);
      }
    },
    group(name: string) {
      const buffer: BufferEntry = {
        header: display(name),
        value: '',
        full: '',
      };
      buffers.push(buffer);
      return {
        message(msg: string, mopts?: TaskLogMessageOptions) {
          message(buffer, msg, mopts);
        },
        error(msg: string) {
          completeBuffer(buffer, {
            status: 'error',
            message: msg,
          });
        },
        success(msg: string) {
          completeBuffer(buffer, {
            status: 'success',
            message: msg,
          });
        },
      };
    },
    error(msg: string, completionOpts?: TaskLogCompletionOptions): void {
      clear(true);
      finishRawLine();
      log.error(display(msg), { output, accessible, secondarySymbol, spacing: 1 });
      if (isTTY && completionOpts?.showLog !== false) {
        renderBuffer();
      }
      // clear buffer since error is an end state
      buffers.splice(1, buffers.length - 1);
      if (buffers[0]) {
        buffers[0].value = '';
        buffers[0].full = '';
        buffers[0].lastMessageWasRaw = false;
        buffers[0].decoder = undefined;
      }
    },
    success(msg: string, completionOpts?: TaskLogCompletionOptions): void {
      clear(true);
      finishRawLine();
      log.success(display(msg), { output, accessible, secondarySymbol, spacing: 1 });
      if (isTTY && completionOpts?.showLog === true) {
        renderBuffer();
      }
      // clear buffer since success is an end state
      buffers.splice(1, buffers.length - 1);
      if (buffers[0]) {
        buffers[0].value = '';
        buffers[0].full = '';
        buffers[0].lastMessageWasRaw = false;
        buffers[0].decoder = undefined;
      }
    },
  };
};

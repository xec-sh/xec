import type { TextOptions } from './text.js';

import prism from '../prism/index.js';
import { S_BAR, symbol, S_BAR_END } from '../utilities/common.js';
import { settings, MultiLinePrompt, wrapTextWithPrefix } from '../core/index.js';

/**
 * Options for the {@link multiline} prompt.
 */
export interface MultiLineOptions extends TextOptions {
  /**
   * Render a `[ submit ]` button below the editor. The button is focused
   * with `Tab`; pressing `Enter` while it is focused submits the input,
   * and `Enter` inside the editor always inserts a newline.
   * When disabled, pressing `Enter` twice at the end of the input submits.
   *
   * @default false
   */
  showSubmit?: boolean;
}

/**
 * The multi-line prompt accepts several lines of text input.
 * `Enter` inserts a newline; pressing `Enter` twice at the end of the
 * input submits it. With `showSubmit`, submission happens through a
 * `[ submit ]` button focused with `Tab` instead.
 *
 * @param opts - Prompt options
 * @returns The entered text, or the cancel symbol (check with `isCancel`)
 *
 * @example
 * ```typescript
 * import { multiline, isCancel } from '@xec-sh/kit';
 *
 * const bio = await multiline({
 *   message: 'Enter your bio',
 *   placeholder: 'Tell us about yourself...',
 * });
 * if (isCancel(bio)) process.exit(0);
 * ```
 */
export const multiline = (opts: MultiLineOptions) =>
  new MultiLinePrompt({
    validate: opts.validate,
    placeholder: opts.placeholder,
    defaultValue: opts.defaultValue,
    initialValue: opts.initialValue,
    showSubmit: opts.showSubmit,
    output: opts.output,
    signal: opts.signal,
    input: opts.input,
    render() {
      const hasGuide = (opts?.withGuide ?? settings.withGuide) !== false;
      const titlePrefix = `${hasGuide ? `${prism.gray(S_BAR)}\n` : ''}${symbol(this.state)}  `;
      const title = `${titlePrefix}${opts.message}\n`;
      const placeholder = opts.placeholder
        ? prism.inverse(opts.placeholder[0]) + prism.dim(opts.placeholder.slice(1))
        : prism.inverse(prism.hidden('_'));
      const userInput = !this.userInput ? placeholder : this.userInputWithCursor;
      const value = this.value ?? '';
      const submitButton = opts.showSubmit
        ? `\n  ${this.focused === 'submit' ? prism.cyan('[ submit ]') : prism.dim('[ submit ]')}`
        : '';

      switch (this.state) {
        case 'error': {
          const errorPrefix = `${prism.yellow(S_BAR)}  `;
          const lines = hasGuide
            ? wrapTextWithPrefix(opts.output, userInput, errorPrefix)
            : userInput;
          const errorPrefixEnd = hasGuide ? prism.yellow(S_BAR_END) : '';
          return `${title}${lines}\n${errorPrefixEnd}  ${prism.yellow(this.error)}${submitButton}\n`;
        }
        case 'submit': {
          const submitPrefix = `${prism.gray(S_BAR)}  `;
          const lines = hasGuide
            ? wrapTextWithPrefix(opts.output, value, submitPrefix, undefined, undefined, (line) =>
                prism.dim(line)
              )
            : value
              ? prism.dim(value)
              : '';
          return `${title}${lines}`;
        }
        case 'cancel': {
          const cancelPrefix = `${prism.gray(S_BAR)}  `;
          const lines = hasGuide
            ? wrapTextWithPrefix(opts.output, value, cancelPrefix, undefined, undefined, (line) =>
                prism.strikethrough(prism.dim(line))
              )
            : value
              ? prism.strikethrough(prism.dim(value))
              : '';
          return `${title}${lines}${value.trim() && hasGuide ? `\n${prism.gray(S_BAR)}` : ''}`;
        }
        default: {
          const defaultPrefix = hasGuide ? `${prism.cyan(S_BAR)}  ` : '';
          const lines = hasGuide
            ? wrapTextWithPrefix(opts.output, userInput, defaultPrefix)
            : userInput;
          const defaultPrefixEnd = hasGuide ? prism.cyan(S_BAR_END) : '';
          return `${title}${lines}\n${defaultPrefixEnd}${submitButton}\n`;
        }
      }
    },
  }).prompt() as Promise<string | symbol>;

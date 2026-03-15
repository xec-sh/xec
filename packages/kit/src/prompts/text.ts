import prism from '../prism/index.js';
import { TextPrompt, settings } from '../core/index.js';
import { S_BAR, symbol, S_BAR_END, type CommonOptions } from '../utilities/common.js';

export interface TextOptions extends CommonOptions {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  initialValue?: string;
  validate?: (value: string | undefined) => string | Error | undefined;
}

export const text = (opts: TextOptions) =>
  new TextPrompt({
    validate: opts.validate,
    placeholder: opts.placeholder,
    defaultValue: opts.defaultValue,
    initialValue: opts.initialValue,
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

      switch (this.state) {
        case 'error': {
          const errorText = this.error ? `  ${prism.yellow(this.error)}` : '';
          const errorPrefix = hasGuide ? `${prism.yellow(S_BAR)}  ` : '';
          const errorPrefixEnd = hasGuide ? prism.yellow(S_BAR_END) : '';
          return `${title.trim()}\n${errorPrefix}${userInput}\n${errorPrefixEnd}${errorText}\n`;
        }
        case 'submit': {
          const valueText = value ? `  ${prism.dim(value)}` : '';
          const submitPrefix = hasGuide ? prism.gray(S_BAR) : '';
          return `${title}${submitPrefix}${valueText}`;
        }
        case 'cancel': {
          const valueText = value ? `  ${prism.strikethrough(prism.dim(value))}` : '';
          const cancelPrefix = hasGuide ? prism.gray(S_BAR) : '';
          return `${title}${cancelPrefix}${valueText}${value.trim() ? `\n${cancelPrefix}` : ''}`;
        }
        default: {
          const defaultPrefix = hasGuide ? `${prism.cyan(S_BAR)}  ` : '';
          const defaultPrefixEnd = hasGuide ? prism.cyan(S_BAR_END) : '';
          return `${title}${defaultPrefix}${userInput}\n${defaultPrefixEnd}\n`;
        }
      }
    },
  }).prompt() as Promise<string | symbol>;

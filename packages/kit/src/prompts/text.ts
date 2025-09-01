import prism from '../prism/index.js';
import { TextPrompt } from '../core/index.js';
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
      const title = `${prism.gray(S_BAR)}\n${symbol(this.state)}  ${opts.message}\n`;
      const placeholder = opts.placeholder
        ? prism.inverse(opts.placeholder[0]) + prism.dim(opts.placeholder.slice(1))
        : prism.inverse(prism.hidden('_'));
      const userInput = !this.userInput ? placeholder : this.userInputWithCursor;
      const value = this.value ?? '';

      switch (this.state) {
        case 'error': {
          const errorText = this.error ? `  ${prism.yellow(this.error)}` : '';
          return `${title.trim()}\n${prism.yellow(S_BAR)}  ${userInput}\n${prism.yellow(
            S_BAR_END
          )}${errorText}\n`;
        }
        case 'submit': {
          const valueText = value ? `  ${prism.dim(value)}` : '';
          return `${title}${prism.gray(S_BAR)}${valueText}`;
        }
        case 'cancel': {
          const valueText = value ? `  ${prism.strikethrough(prism.dim(value))}` : '';
          return `${title}${prism.gray(S_BAR)}${valueText}${value.trim() ? `\n${prism.gray(S_BAR)}` : ''}`;
        }
        default:
          return `${title}${prism.cyan(S_BAR)}  ${userInput}\n${prism.cyan(S_BAR_END)}\n`;
      }
    },
  }).prompt() as Promise<string | symbol>;

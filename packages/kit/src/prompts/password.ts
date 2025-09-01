import prism from '../prism/index.js';
import { PasswordPrompt } from '../core/index.js';
import {
  S_BAR,
  symbol,
  S_BAR_END,
  S_PASSWORD_MASK,
  type CommonOptions,
} from '../utilities/common.js';

export interface PasswordOptions extends CommonOptions {
  message: string;
  mask?: string;
  validate?: (value: string | undefined) => string | Error | undefined;
  clearOnError?: boolean;
}
export const password = (opts: PasswordOptions) =>
  new PasswordPrompt({
    validate: opts.validate,
    mask: opts.mask ?? S_PASSWORD_MASK,
    signal: opts.signal,
    input: opts.input,
    output: opts.output,
    render() {
      const title = `${prism.gray(S_BAR)}\n${symbol(this.state)}  ${opts.message}\n`;
      const userInput = this.userInputWithCursor;
      const masked = this.masked;

      switch (this.state) {
        case 'error': {
          const maskedText = masked ? `  ${masked}` : '';
          if (opts.clearOnError) {
            this.clear();
          }
          return `${title.trim()}\n${prism.yellow(S_BAR)}${maskedText}\n${prism.yellow(
            S_BAR_END
          )}  ${prism.yellow(this.error)}\n`;
        }
        case 'submit': {
          const maskedText = masked ? `  ${prism.dim(masked)}` : '';
          return `${title}${prism.gray(S_BAR)}${maskedText}`;
        }
        case 'cancel': {
          const maskedText = masked ? `  ${prism.strikethrough(prism.dim(masked))}` : '';
          return `${title}${prism.gray(S_BAR)}${maskedText}${
            masked ? `\n${prism.gray(S_BAR)}` : ''
          }`;
        }
        default:
          return `${title}${prism.cyan(S_BAR)}  ${userInput}\n${prism.cyan(S_BAR_END)}\n`;
      }
    },
  }).prompt() as Promise<string | symbol>;

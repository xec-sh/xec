import prism from '../prism/index.js';
import { settings, PasswordPrompt } from '../core/index.js';
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
      const hasGuide = (opts?.withGuide ?? settings.withGuide) !== false;
      const titlePrefix = `${hasGuide ? `${prism.gray(S_BAR)}\n` : ''}${symbol(this.state)}  `;
      const title = `${titlePrefix}${opts.message}\n`;
      const userInput = this.userInputWithCursor;
      const masked = this.masked;

      switch (this.state) {
        case 'error': {
          const maskedText = masked ? `  ${masked}` : '';
          if (opts.clearOnError) {
            this.clear();
          }
          const errorPrefix = hasGuide ? prism.yellow(S_BAR) : '';
          const errorEnd = hasGuide ? prism.yellow(S_BAR_END) : '';
          return `${title.trim()}\n${errorPrefix}${maskedText}\n${errorEnd}  ${prism.yellow(this.error)}\n`;
        }
        case 'submit': {
          const maskedText = masked ? `  ${prism.dim(masked)}` : '';
          const submitPrefix = hasGuide ? prism.gray(S_BAR) : '';
          return `${title}${submitPrefix}${maskedText}`;
        }
        case 'cancel': {
          const maskedText = masked ? `  ${prism.strikethrough(prism.dim(masked))}` : '';
          const cancelPrefix = hasGuide ? prism.gray(S_BAR) : '';
          return `${title}${cancelPrefix}${maskedText}${
            masked ? `\n${cancelPrefix}` : ''
          }`;
        }
        default: {
          const defaultPrefix = hasGuide ? `${prism.cyan(S_BAR)}  ` : '';
          const defaultEnd = hasGuide ? prism.cyan(S_BAR_END) : '';
          return `${title}${defaultPrefix}${userInput}\n${defaultEnd}\n`;
        }
      }
    },
  }).prompt() as Promise<string | symbol>;

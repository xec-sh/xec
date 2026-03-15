import prism from '../prism/index.js';
import { settings, ConfirmPrompt } from '../core/index.js';
import {
  S_BAR,
  symbol,
  S_BAR_END,
  S_RADIO_ACTIVE,
  S_RADIO_INACTIVE,
  type CommonOptions,
} from '../utilities/common.js';

export interface ConfirmOptions extends CommonOptions {
  message: string;
  active?: string;
  inactive?: string;
  initialValue?: boolean;
  vertical?: boolean;
}
export const confirm = (opts: ConfirmOptions) => {
  const active = opts.active ?? 'Yes';
  const inactive = opts.inactive ?? 'No';
  return new ConfirmPrompt({
    active,
    inactive,
    signal: opts.signal,
    input: opts.input,
    output: opts.output,
    initialValue: opts.initialValue ?? true,
    render() {
      const hasGuide = (opts?.withGuide ?? settings.withGuide) !== false;
      const titlePrefix = `${hasGuide ? `${prism.gray(S_BAR)}\n` : ''}${symbol(this.state)}  `;
      const title = `${titlePrefix}${opts.message}\n`;
      const value = this.value ? active : inactive;

      switch (this.state) {
        case 'submit': {
          const submitPrefix = hasGuide ? prism.gray(S_BAR) : '';
          return `${title}${submitPrefix}  ${prism.dim(value)}`;
        }
        case 'cancel': {
          const cancelPrefix = hasGuide ? prism.gray(S_BAR) : '';
          return `${title}${cancelPrefix}  ${prism.strikethrough(
            prism.dim(value)
          )}\n${cancelPrefix}`;
        }
        default: {
          const barChar = hasGuide ? prism.cyan(S_BAR) : '';
          const barEnd = hasGuide ? prism.cyan(S_BAR_END) : '';
          const separator = opts.vertical
            ? (hasGuide ? `\n${barChar}  ` : '\n')
            : ` ${prism.dim('/')} `;

          const activeOption = this.value
            ? `${prism.green(S_RADIO_ACTIVE)} ${active}`
            : `${prism.dim(S_RADIO_INACTIVE)} ${prism.dim(active)}`;
          const inactiveOption = !this.value
            ? `${prism.green(S_RADIO_ACTIVE)} ${inactive}`
            : `${prism.dim(S_RADIO_INACTIVE)} ${prism.dim(inactive)}`;

          return `${title}${barChar}  ${activeOption}${separator}${inactiveOption}\n${barEnd}\n`;
        }
      }
    },
  }).prompt() as Promise<boolean | symbol>;
};

import prism from '../prism/index.js';
import { ConfirmPrompt } from '../core/index.js';
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
      const title = `${prism.gray(S_BAR)}\n${symbol(this.state)}  ${opts.message}\n`;
      const value = this.value ? active : inactive;

      switch (this.state) {
        case 'submit':
          return `${title}${prism.gray(S_BAR)}  ${prism.dim(value)}`;
        case 'cancel':
          return `${title}${prism.gray(S_BAR)}  ${prism.strikethrough(
            prism.dim(value)
          )}\n${prism.gray(S_BAR)}`;
        default: {
          return `${title}${prism.cyan(S_BAR)}  ${
            this.value
              ? `${prism.green(S_RADIO_ACTIVE)} ${active}`
              : `${prism.dim(S_RADIO_INACTIVE)} ${prism.dim(active)}`
          } ${prism.dim('/')} ${
            !this.value
              ? `${prism.green(S_RADIO_ACTIVE)} ${inactive}`
              : `${prism.dim(S_RADIO_INACTIVE)} ${prism.dim(inactive)}`
          }\n${prism.cyan(S_BAR_END)}\n`;
        }
      }
    },
  }).prompt() as Promise<boolean | symbol>;
};

import prism from '../prism/index.js';
import { settings, ConfirmPrompt, wrapTextWithPrefix } from '../core/index.js';
import {
  S_BAR,
  symbol,
  symbolBar,
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
      const titlePrefix = `${symbol(this.state)}  `;
      const titlePrefixBar = `${symbolBar(this.state)}  `;
      const messageLines = wrapTextWithPrefix(
        opts.output,
        opts.message,
        titlePrefixBar,
        titlePrefix
      );
      const title = `${hasGuide ? `${prism.gray(S_BAR)}\n` : ''}${messageLines}\n`;
      const value = this.value ? active : inactive;

      switch (this.state) {
        case 'submit': {
          const submitPrefix = hasGuide ? `${prism.gray(S_BAR)}  ` : '';
          const wrappedValue = wrapTextWithPrefix(opts.output, prism.dim(value), submitPrefix);
          return `${title}${wrappedValue}`;
        }
        case 'cancel': {
          const cancelPrefix = hasGuide ? `${prism.gray(S_BAR)}  ` : '';
          const wrappedValue = wrapTextWithPrefix(
            opts.output,
            prism.strikethrough(prism.dim(value)),
            cancelPrefix
          );
          return `${title}${wrappedValue}${hasGuide ? `\n${prism.gray(S_BAR)}` : ''}`;
        }
        default: {
          const barChar = hasGuide ? settings.theme.accent(S_BAR) : '';
          const barEnd = hasGuide ? settings.theme.accent(S_BAR_END) : '';
          const separator = opts.vertical
            ? hasGuide
              ? `\n${barChar}  `
              : '\n'
            : ` ${prism.dim('/')} `;

          const activeOption = this.value
            ? `${settings.theme.success(S_RADIO_ACTIVE)} ${active}`
            : `${prism.dim(S_RADIO_INACTIVE)} ${prism.dim(active)}`;
          const inactiveOption = !this.value
            ? `${settings.theme.success(S_RADIO_ACTIVE)} ${inactive}`
            : `${prism.dim(S_RADIO_INACTIVE)} ${prism.dim(inactive)}`;

          return `${title}${barChar}${hasGuide ? '  ' : ''}${activeOption}${separator}${inactiveOption}\n${barEnd}\n`;
        }
      }
    },
  }).prompt() as Promise<boolean | symbol>;
};

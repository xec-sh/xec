import prism from '../prism/index.js';
import { limitOptions } from '../utilities/limit-options.js';
import { settings, SelectPrompt, wrapTextWithPrefix } from '../core/index.js';
import {
  S_BAR,
  symbol,
  symbolBar,
  S_BAR_END,
  computeLabel,
  S_RADIO_ACTIVE,
  S_RADIO_INACTIVE,
  type CommonOptions,
  formatInstructionFooter,
} from '../utilities/common.js';

/** Key hints shown below the option list; styled by {@link formatInstructionFooter}. */
export const SELECT_INSTRUCTIONS = ['↑/↓ to navigate', 'Enter: confirm'];

type Primitive = Readonly<string | boolean | number>;

export type Option<Value> = Value extends Primitive
  ? {
      value: Value;
      label?: string;
      hint?: string;
      disabled?: boolean;
    }
  : {
      value: Value;
      label: string;
      hint?: string;
      disabled?: boolean;
    };

export interface SelectOptions<Value> extends CommonOptions {
  message: string;
  options: Option<Value>[];
  initialValue?: Value;
  maxItems?: number;
  /**
   * Show keyboard instructions below the option list.
   * @default true
   */
  showInstructions?: boolean;
}

export const select = <Value>(opts: SelectOptions<Value>) => {
  const opt = (
    option: Option<Value> | undefined,
    state: 'inactive' | 'active' | 'selected' | 'cancelled' | 'disabled'
  ) => {
    if (option === undefined) {
      return '';
    }
    const label = option.label ?? String(option.value);
    switch (state) {
      case 'selected':
        return `${computeLabel(label, prism.dim)}`;
      case 'active':
        return `${settings.theme.success(S_RADIO_ACTIVE)} ${label}${
          option.hint ? ` ${settings.theme.muted(`(${option.hint})`)}` : ''
        }`;
      case 'cancelled':
        return `${computeLabel(label, (str) => prism.strikethrough(prism.dim(str)))}`;
      case 'disabled':
        return `${settings.theme.muted(S_RADIO_INACTIVE)} ${computeLabel(label, (str) =>
          prism.strikethrough(settings.theme.muted(str))
        )}`;
      default:
        return `${prism.dim(S_RADIO_INACTIVE)} ${computeLabel(label, prism.dim)}`;
    }
  };

  const showInstructions = opts.showInstructions ?? true;

  return new SelectPrompt({
    options: opts.options,
    signal: opts.signal,
    input: opts.input,
    output: opts.output,
    initialValue: opts.initialValue,
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

      switch (this.state) {
        case 'submit': {
          const submitPrefix = hasGuide ? `${prism.gray(S_BAR)}  ` : '';
          const wrappedLines = wrapTextWithPrefix(
            opts.output,
            opt(this.options[this.cursor], 'selected'),
            submitPrefix
          );
          return `${title}${wrappedLines}`;
        }
        case 'cancel': {
          const cancelPrefix = hasGuide ? `${prism.gray(S_BAR)}  ` : '';
          const wrappedLines = wrapTextWithPrefix(
            opts.output,
            opt(this.options[this.cursor], 'cancelled'),
            cancelPrefix
          );
          return `${title}${wrappedLines}${hasGuide ? `\n${prism.gray(S_BAR)}` : ''}`;
        }
        default: {
          const prefix = hasGuide ? `${settings.theme.accent(S_BAR)}  ` : '';
          const titleLineCount = title.split('\n').length;
          const footerLines = showInstructions
            ? formatInstructionFooter(SELECT_INSTRUCTIONS, hasGuide)
            : hasGuide
              ? [settings.theme.accent(S_BAR_END)]
              : [];
          const footerText = footerLines.join('\n');
          const footerLineCount = footerLines.length + 1;
          return `${title}${prefix}${limitOptions({
            output: opts.output,
            cursor: this.cursor,
            options: this.options,
            maxItems: opts.maxItems,
            columnPadding: prefix.length,
            rowPadding: titleLineCount + footerLineCount,
            style: (item, active) =>
              opt(item, item.disabled ? 'disabled' : active ? 'active' : 'inactive'),
          }).join(`\n${prefix}`)}\n${footerText}\n`;
        }
      }
    },
  }).prompt() as Promise<Value | symbol>;
};

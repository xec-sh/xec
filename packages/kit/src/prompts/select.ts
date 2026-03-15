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
} from '../utilities/common.js';

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
}

export const select = <Value>(opts: SelectOptions<Value>) => {
  const opt = (
    option: Option<Value>,
    state: 'inactive' | 'active' | 'selected' | 'cancelled' | 'disabled'
  ) => {
    const label = option.label ?? String(option.value);
    switch (state) {
      case 'selected':
        return `${computeLabel(label, prism.dim)}`;
      case 'active':
        return `${prism.green(S_RADIO_ACTIVE)} ${label}${
          option.hint ? ` ${prism.dim(`(${option.hint})`)}` : ''
        }`;
      case 'cancelled':
        return `${computeLabel(label, (str) => prism.strikethrough(prism.dim(str)))}`;
      case 'disabled':
        return `${prism.dim(S_RADIO_INACTIVE)} ${computeLabel(label, (str) => prism.strikethrough(prism.dim(str)))}`;
      default:
        return `${prism.dim(S_RADIO_INACTIVE)} ${computeLabel(label, prism.dim)}`;
    }
  };

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
          const selectedOption = this.options[this.cursor];
          if (!selectedOption) return title;
          const submitPrefix = hasGuide ? prism.gray(S_BAR) : '';
          return `${title}${submitPrefix}  ${opt(selectedOption, 'selected')}`;
        }
        case 'cancel': {
          const selectedOption = this.options[this.cursor];
          if (!selectedOption) return title;
          const cancelPrefix = hasGuide ? prism.gray(S_BAR) : '';
          return `${title}${cancelPrefix}  ${opt(
            selectedOption,
            'cancelled'
          )}\n${cancelPrefix}`;
        }
        default: {
          const barChar = hasGuide ? prism.cyan(S_BAR) : '';
          const barEnd = hasGuide ? prism.cyan(S_BAR_END) : '';
          const prefix = `${barChar}  `;
          const titleLineCount = title.split('\n').length;
          const footerLineCount = 2;
          return `${title}${prefix}${limitOptions({
            output: opts.output,
            cursor: this.cursor,
            options: this.options,
            maxItems: opts.maxItems,
            columnPadding: prefix.length,
            rowPadding: titleLineCount + footerLineCount,
            style: (item, active) =>
              item.disabled ? opt(item, 'disabled') : opt(item, active ? 'active' : 'inactive'),
          }).join(`\n${prefix}`)}\n${barEnd}\n`;
        }
      }
    },
  }).prompt() as Promise<Value | symbol>;
};

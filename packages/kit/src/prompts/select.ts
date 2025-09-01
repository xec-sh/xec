import prism from '../prism/index.js';
import { SelectPrompt } from '../core/index.js';
import { limitOptions } from '../utilities/limit-options.js';
import {
  S_BAR,
  symbol,
  S_BAR_END,
  S_RADIO_ACTIVE,
  S_RADIO_INACTIVE,
  type CommonOptions,
} from '../utilities/common.js';

type Primitive = Readonly<string | boolean | number>;

export type Option<Value> = Value extends Primitive
  ? {
      /**
       * Internal data for this option.
       */
      value: Value;
      /**
       * The optional, user-facing text for this option.
       *
       * By default, the `value` is converted to a string.
       */
      label?: string;
      /**
       * An optional hint to display to the user when
       * this option might be selected.
       *
       * By default, no `hint` is displayed.
       */
      hint?: string;
    }
  : {
      /**
       * Internal data for this option.
       */
      value: Value;
      /**
       * Required. The user-facing text for this option.
       */
      label: string;
      /**
       * An optional hint to display to the user when
       * this option might be selected.
       *
       * By default, no `hint` is displayed.
       */
      hint?: string;
    };

export interface SelectOptions<Value> extends CommonOptions {
  message: string;
  options: Option<Value>[];
  initialValue?: Value;
  maxItems?: number;
}

export const select = <Value>(opts: SelectOptions<Value>) => {
  const opt = (option: Option<Value>, state: 'inactive' | 'active' | 'selected' | 'cancelled') => {
    const label = option.label ?? String(option.value);
    switch (state) {
      case 'selected':
        return `${prism.dim(label)}`;
      case 'active':
        return `${prism.green(S_RADIO_ACTIVE)} ${label}${
          option.hint ? ` ${prism.dim(`(${option.hint})`)}` : ''
        }`;
      case 'cancelled':
        return `${prism.strikethrough(prism.dim(label))}`;
      default:
        return `${prism.dim(S_RADIO_INACTIVE)} ${prism.dim(label)}`;
    }
  };

  return new SelectPrompt({
    options: opts.options,
    signal: opts.signal,
    input: opts.input,
    output: opts.output,
    initialValue: opts.initialValue,
    render() {
      const title = `${prism.gray(S_BAR)}\n${symbol(this.state)}  ${opts.message}\n`;

      switch (this.state) {
        case 'submit': {
          const selectedOption = this.options[this.cursor];
          if (!selectedOption) return title;
          return `${title}${prism.gray(S_BAR)}  ${opt(selectedOption, 'selected')}`;
        }
        case 'cancel': {
          const selectedOption = this.options[this.cursor];
          if (!selectedOption) return title;
          return `${title}${prism.gray(S_BAR)}  ${opt(
            selectedOption,
            'cancelled'
          )}\n${prism.gray(S_BAR)}`;
        }
        default: {
          return `${title}${prism.cyan(S_BAR)}  ${limitOptions({
            output: opts.output,
            cursor: this.cursor,
            options: this.options,
            maxItems: opts.maxItems,
            style: (item, active) => opt(item, active ? 'active' : 'inactive'),
          }).join(`\n${prism.cyan(S_BAR)}  `)}\n${prism.cyan(S_BAR_END)}\n`;
        }
      }
    },
  }).prompt() as Promise<Value | symbol>;
};

import prism from '../prism/index.js';
import { MultiSelectPrompt } from '../core/index.js';
import { limitOptions } from '../utilities/limit-options.js';
import {
  S_BAR,
  symbol,
  S_BAR_END,
  S_CHECKBOX_ACTIVE,
  type CommonOptions,
  S_CHECKBOX_INACTIVE,
  S_CHECKBOX_SELECTED,
} from '../utilities/common.js';

import type { Option } from './select.js';

export interface MultiSelectOptions<Value> extends CommonOptions {
  message: string;
  options: Option<Value>[];
  initialValues?: Value[];
  maxItems?: number;
  required?: boolean;
  cursorAt?: Value;
}
export const multiselect = <Value>(opts: MultiSelectOptions<Value>) => {
  const opt = (
    option: Option<Value>,
    state: 'inactive' | 'active' | 'selected' | 'active-selected' | 'submitted' | 'cancelled'
  ) => {
    const label = option.label ?? String(option.value);
    if (state === 'active') {
      return `${prism.cyan(S_CHECKBOX_ACTIVE)} ${label}${
        option.hint ? ` ${prism.dim(`(${option.hint})`)}` : ''
      }`;
    }
    if (state === 'selected') {
      return `${prism.green(S_CHECKBOX_SELECTED)} ${prism.dim(label)}${
        option.hint ? ` ${prism.dim(`(${option.hint})`)}` : ''
      }`;
    }
    if (state === 'cancelled') {
      return `${prism.strikethrough(prism.dim(label))}`;
    }
    if (state === 'active-selected') {
      return `${prism.green(S_CHECKBOX_SELECTED)} ${label}${
        option.hint ? ` ${prism.dim(`(${option.hint})`)}` : ''
      }`;
    }
    if (state === 'submitted') {
      return `${prism.dim(label)}`;
    }
    return `${prism.dim(S_CHECKBOX_INACTIVE)} ${prism.dim(label)}`;
  };
  const required = opts.required ?? true;

  return new MultiSelectPrompt({
    options: opts.options,
    signal: opts.signal,
    input: opts.input,
    output: opts.output,
    initialValues: opts.initialValues,
    required,
    cursorAt: opts.cursorAt,
    validate(selected: Value[] | undefined) {
      if (required && (selected === undefined || selected.length === 0))
        return `Please select at least one option.\n${prism.reset(
          prism.dim(
            `Press ${prism.gray(prism.bgWhite(prism.inverse(' space ')))} to select, ${prism.gray(
              prism.bgWhite(prism.inverse(' enter '))
            )} to submit`
          )
        )}`;
      return undefined;
    },
    render() {
      const title = `${prism.gray(S_BAR)}\n${symbol(this.state)}  ${opts.message}\n`;
      const value = this.value ?? [];

      const styleOption = (option: Option<Value>, active: boolean) => {
        const selected = value.includes(option.value);
        if (active && selected) {
          return opt(option, 'active-selected');
        }
        if (selected) {
          return opt(option, 'selected');
        }
        return opt(option, active ? 'active' : 'inactive');
      };

      switch (this.state) {
        case 'submit': {
          return `${title}${prism.gray(S_BAR)}  ${
            this.options
              .filter(({ value: optionValue }) => value.includes(optionValue))
              .map((option) => opt(option, 'submitted'))
              .join(prism.dim(', ')) || prism.dim('none')
          }`;
        }
        case 'cancel': {
          const label = this.options
            .filter(({ value: optionValue }) => value.includes(optionValue))
            .map((option) => opt(option, 'cancelled'))
            .join(prism.dim(', '));
          return `${title}${prism.gray(S_BAR)}${
            label.trim() ? `  ${label}\n${prism.gray(S_BAR)}` : ''
          }`;
        }
        case 'error': {
          const footer = this.error
            .split('\n')
            .map((ln, i) =>
              i === 0 ? `${prism.yellow(S_BAR_END)}  ${prism.yellow(ln)}` : `   ${ln}`
            )
            .join('\n');
          return `${title + prism.yellow(S_BAR)}  ${limitOptions({
            output: opts.output,
            options: this.options,
            cursor: this.cursor,
            maxItems: opts.maxItems,
            style: styleOption,
          }).join(`\n${prism.yellow(S_BAR)}  `)}\n${footer}\n`;
        }
        default: {
          return `${title}${prism.cyan(S_BAR)}  ${limitOptions({
            output: opts.output,
            options: this.options,
            cursor: this.cursor,
            maxItems: opts.maxItems,
            style: styleOption,
          }).join(`\n${prism.cyan(S_BAR)}  `)}\n${prism.cyan(S_BAR_END)}\n`;
        }
      }
    },
  }).prompt() as Promise<Value[] | symbol>;
};

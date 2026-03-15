import prism from '../prism/index.js';
import { SelectKeyPrompt, settings } from '../core/index.js';
import { S_BAR, symbol, S_BAR_END, type CommonOptions } from '../utilities/common.js';

import type { Option } from './select.js';

export interface SelectKeyOptions<Value extends string> extends CommonOptions {
  message: string;
  options: Option<Value>[];
  initialValue?: Value;
  caseSensitive?: boolean;
}

export const selectKey = <Value extends string>(opts: SelectKeyOptions<Value>) => {
  const opt = (
    option: Option<Value>,
    state: 'inactive' | 'active' | 'selected' | 'cancelled' = 'inactive'
  ) => {
    const label = option.label ?? String(option.value);
    if (state === 'selected') {
      return `${prism.dim(label)}`;
    }
    if (state === 'cancelled') {
      return `${prism.strikethrough(prism.dim(label))}`;
    }
    if (state === 'active') {
      return `${prism.bgCyan(prism.gray(` ${option.value} `))} ${label} ${
        option.hint ? prism.dim(`(${option.hint})`) : ''
      }`;
    }
    return `${prism.gray(prism.bgWhite(prism.inverse(` ${option.value} `)))} ${label} ${
      option.hint ? prism.dim(`(${option.hint})`) : ''
    }`;
  };

  return new SelectKeyPrompt({
    options: opts.options,
    signal: opts.signal,
    input: opts.input,
    output: opts.output,
    initialValue: opts.initialValue,
    caseSensitive: opts.caseSensitive,
    render() {
      const hasGuide = (opts?.withGuide ?? settings.withGuide) !== false;
      const titlePrefix = `${hasGuide ? `${prism.gray(S_BAR)}\n` : ''}${symbol(this.state)}  `;
      const title = `${titlePrefix}${opts.message}\n`;

      switch (this.state) {
        case 'submit': {
          const selectedOption =
            this.options.find((option) => option.value === this.value) ?? opts.options[0];
          if (!selectedOption) return title;
          const submitPrefix = hasGuide ? prism.gray(S_BAR) : '';
          return `${title}${submitPrefix}  ${opt(selectedOption, 'selected')}`;
        }
        case 'cancel': {
          const firstOption = this.options[0];
          if (!firstOption) return title;
          const cancelPrefix = hasGuide ? prism.gray(S_BAR) : '';
          return `${title}${cancelPrefix}  ${opt(firstOption, 'cancelled')}\n${cancelPrefix}`;
        }
        default: {
          const barChar = hasGuide ? prism.cyan(S_BAR) : '';
          const barEnd = hasGuide ? prism.cyan(S_BAR_END) : '';
          return `${title}${barChar}  ${this.options
            .map((option, i) => opt(option, i === this.cursor ? 'active' : 'inactive'))
            .join(`\n${barChar}  `)}\n${barEnd}\n`;
        }
      }
    },
  }).prompt() as Promise<Value | symbol>;
};

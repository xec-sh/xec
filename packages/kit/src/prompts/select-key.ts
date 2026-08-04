import type { Option } from './select.js';

import prism from '../prism/index.js';
import { settings, SelectKeyPrompt, wrapTextWithPrefix } from '../core/index.js';
import { S_BAR, symbol, S_BAR_END, type CommonOptions } from '../utilities/common.js';

export interface SelectKeyOptions<Value extends string> extends CommonOptions {
  message: string;
  options: Option<Value>[];
  initialValue?: Value;
  caseSensitive?: boolean;
}

export const selectKey = <Value extends string>(opts: SelectKeyOptions<Value>) => {
  const opt = (
    option: Option<Value> | undefined,
    state: 'inactive' | 'active' | 'selected' | 'cancelled' = 'inactive'
  ) => {
    if (option === undefined) {
      return '';
    }
    const label = option.label ?? String(option.value);
    if (state === 'selected') {
      return `${prism.dim(label)}`;
    }
    if (state === 'cancelled') {
      return `${prism.strikethrough(prism.dim(label))}`;
    }
    if (state === 'active') {
      return `${prism.bgCyan(prism.gray(` ${option.value} `))} ${label} ${
        option.hint ? settings.theme.muted(`(${option.hint})`) : ''
      }`;
    }
    return `${prism.gray(prism.bgWhite(prism.inverse(` ${option.value} `)))} ${label} ${
      option.hint ? settings.theme.muted(`(${option.hint})`) : ''
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
          const submitPrefix = hasGuide ? `${prism.gray(S_BAR)}  ` : '';
          const selectedOption =
            this.options.find((option) => option.value === this.value) ?? opts.options[0];
          const wrapped = wrapTextWithPrefix(
            opts.output,
            opt(selectedOption, 'selected'),
            submitPrefix
          );
          return `${title}${wrapped}`;
        }
        case 'cancel': {
          const cancelPrefix = hasGuide ? `${prism.gray(S_BAR)}  ` : '';
          const wrapped = wrapTextWithPrefix(opts.output, opt(this.options[0], 'cancelled'), cancelPrefix);
          return `${title}${wrapped}${hasGuide ? `\n${prism.gray(S_BAR)}` : ''}`;
        }
        default: {
          const defaultPrefix = hasGuide ? `${settings.theme.accent(S_BAR)}  ` : '';
          const defaultPrefixEnd = hasGuide ? settings.theme.accent(S_BAR_END) : '';
          const wrapped = this.options
            .map((option, i) =>
              wrapTextWithPrefix(
                opts.output,
                opt(option, i === this.cursor ? 'active' : 'inactive'),
                defaultPrefix
              )
            )
            .join('\n');
          return `${title}${wrapped}\n${defaultPrefixEnd}\n`;
        }
      }
    },
  }).prompt() as Promise<Value | symbol>;
};

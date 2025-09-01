import color from 'picocolors';

import { SelectKeyPrompt } from '../core/index.js';
import { S_BAR, symbol, S_BAR_END } from '../utilities/common.js';

import type { Option, SelectOptions } from './select.js';

export const selectKey = <Value extends string>(opts: SelectOptions<Value>) => {
	const opt = (
		option: Option<Value>,
		state: 'inactive' | 'active' | 'selected' | 'cancelled' = 'inactive'
	) => {
		const label = option.label ?? String(option.value);
		if (state === 'selected') {
			return `${color.dim(label)}`;
		}
		if (state === 'cancelled') {
			return `${color.strikethrough(color.dim(label))}`;
		}
		if (state === 'active') {
			return `${color.bgCyan(color.gray(` ${option.value} `))} ${label} ${option.hint ? color.dim(`(${option.hint})`) : ''
				}`;
		}
		return `${color.gray(color.bgWhite(color.inverse(` ${option.value} `)))} ${label} ${option.hint ? color.dim(`(${option.hint})`) : ''
			}`;
	};

	return new SelectKeyPrompt({
		options: opts.options,
		signal: opts.signal,
		input: opts.input,
		output: opts.output,
		initialValue: opts.initialValue,
		render() {
			const title = `${color.gray(S_BAR)}\n${symbol(this.state)}  ${opts.message}\n`;

			switch (this.state) {
				case 'submit': {
					const selectedOption = this.options.find((option) => option.value === this.value) ?? opts.options[0];
					if (!selectedOption) return title;
					return `${title}${color.gray(S_BAR)}  ${opt(
						selectedOption,
						'selected'
					)}`;
				}
				case 'cancel': {
					const firstOption = this.options[0];
					if (!firstOption) return title;
					return `${title}${color.gray(S_BAR)}  ${opt(firstOption, 'cancelled')}\n${color.gray(
						S_BAR
					)}`;
				}
				default: {
					return `${title}${color.cyan(S_BAR)}  ${this.options
						.map((option, i) => opt(option, i === this.cursor ? 'active' : 'inactive'))
						.join(`\n${color.cyan(S_BAR)}  `)}\n${color.cyan(S_BAR_END)}\n`;
				}
			}
		},
	}).prompt() as Promise<Value | symbol>;
};

import type { Option } from './select.js';

import prism from '../prism/index.js';
import { limitOptions } from '../utilities/limit-options.js';
import { settings, MultiSelectPrompt, wrapTextWithPrefix } from '../core/index.js';
import {
  S_BAR,
  symbol,
  symbolBar,
  S_BAR_END,
  computeLabel,
  S_CHECKBOX_ACTIVE,
  type CommonOptions,
  S_CHECKBOX_INACTIVE,
  S_CHECKBOX_SELECTED,
  formatInstructionFooter,
} from '../utilities/common.js';

/** Key hints shown below the option list; styled by {@link formatInstructionFooter}. */
export const MULTISELECT_INSTRUCTIONS = ['↑/↓ to navigate', 'Space: select', 'Enter: confirm'];

export interface MultiSelectOptions<Value> extends CommonOptions {
  message: string;
  options: Option<Value>[];
  initialValues?: Value[];
  maxItems?: number;
  required?: boolean;
  cursorAt?: Value;
  /**
   * Show keyboard instructions below the option list.
   * @default true
   */
  showInstructions?: boolean;
}
export const multiselect = <Value>(opts: MultiSelectOptions<Value>) => {
  const opt = (
    option: Option<Value>,
    state:
      | 'inactive'
      | 'active'
      | 'selected'
      | 'active-selected'
      | 'submitted'
      | 'cancelled'
      | 'disabled'
  ) => {
    const label = option.label ?? String(option.value);
    if (state === 'disabled') {
      return `${settings.theme.muted(S_CHECKBOX_INACTIVE)} ${computeLabel(label, (str) =>
        prism.strikethrough(settings.theme.muted(str))
      )}`;
    }
    if (state === 'active') {
      return `${settings.theme.accent(S_CHECKBOX_ACTIVE)} ${label}${
        option.hint ? ` ${settings.theme.muted(`(${option.hint})`)}` : ''
      }`;
    }
    if (state === 'selected') {
      return `${settings.theme.success(S_CHECKBOX_SELECTED)} ${computeLabel(label, prism.dim)}${
        option.hint ? ` ${settings.theme.muted(`(${option.hint})`)}` : ''
      }`;
    }
    if (state === 'cancelled') {
      return `${computeLabel(label, (str) => prism.strikethrough(prism.dim(str)))}`;
    }
    if (state === 'active-selected') {
      return `${settings.theme.success(S_CHECKBOX_SELECTED)} ${label}${
        option.hint ? ` ${settings.theme.muted(`(${option.hint})`)}` : ''
      }`;
    }
    if (state === 'submitted') {
      return `${computeLabel(label, prism.dim)}`;
    }
    return `${prism.dim(S_CHECKBOX_INACTIVE)} ${computeLabel(label, prism.dim)}`;
  };
  const required = opts.required ?? true;
  const showInstructions = opts.showInstructions ?? true;

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
      const hasGuide = (opts?.withGuide ?? settings.withGuide) !== false;
      const titlePrefix = `${symbol(this.state)}  `;
      const titlePrefixBar = `${symbolBar(this.state)}  `;
      const wrappedMessage = wrapTextWithPrefix(
        opts.output,
        opts.message,
        titlePrefixBar,
        titlePrefix
      );
      const title = `${hasGuide ? `${prism.gray(S_BAR)}\n` : ''}${wrappedMessage}\n`;
      const value = this.value ?? [];

      const styleOption = (option: Option<Value>, active: boolean) => {
        if (option.disabled) {
          return opt(option, 'disabled');
        }
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
          const submitPrefix = hasGuide ? `${prism.gray(S_BAR)}  ` : '';
          const submitText =
            this.options
              .filter(({ value: optionValue }) => value.includes(optionValue))
              .map((option) => opt(option, 'submitted'))
              .join(prism.dim(', ')) || prism.dim('none');
          const wrappedSubmitText = wrapTextWithPrefix(opts.output, submitText, submitPrefix);
          return `${title}${wrappedSubmitText}`;
        }
        case 'cancel': {
          const cancelPrefix = hasGuide ? `${prism.gray(S_BAR)}  ` : '';
          const label = this.options
            .filter(({ value: optionValue }) => value.includes(optionValue))
            .map((option) => opt(option, 'cancelled'))
            .join(prism.dim(', '));
          if (label.trim() === '') {
            return `${title}${hasGuide ? prism.gray(S_BAR) : ''}`;
          }
          const wrappedLabel = wrapTextWithPrefix(opts.output, label, cancelPrefix);
          return `${title}${wrappedLabel}${hasGuide ? `\n${prism.gray(S_BAR)}` : ''}`;
        }
        case 'error': {
          const prefix = hasGuide ? `${settings.theme.warning(S_BAR)}  ` : '';
          const errorEnd = hasGuide ? `${settings.theme.warning(S_BAR_END)}  ` : '';
          const footer = this.error
            .split('\n')
            .map((ln, i) => (i === 0 ? `${errorEnd}${settings.theme.warning(ln)}` : `   ${ln}`))
            .join('\n');
          const titleLineCount = title.split('\n').length;
          const footerLineCount = footer.split('\n').length + 1;
          return `${title}${prefix}${limitOptions({
            output: opts.output,
            options: this.options,
            cursor: this.cursor,
            maxItems: opts.maxItems,
            columnPadding: prefix.length,
            rowPadding: titleLineCount + footerLineCount,
            style: styleOption,
          }).join(`\n${prefix}`)}\n${footer}\n`;
        }
        default: {
          const prefix = hasGuide ? `${settings.theme.accent(S_BAR)}  ` : '';
          const titleLineCount = title.split('\n').length;
          const footerLines = showInstructions
            ? formatInstructionFooter(MULTISELECT_INSTRUCTIONS, hasGuide)
            : hasGuide
              ? [settings.theme.accent(S_BAR_END)]
              : [];
          const footerText = footerLines.join('\n');
          const footerLineCount = footerLines.length + 1;
          return `${title}${prefix}${limitOptions({
            output: opts.output,
            options: this.options,
            cursor: this.cursor,
            maxItems: opts.maxItems,
            columnPadding: prefix.length,
            rowPadding: titleLineCount + footerLineCount,
            style: styleOption,
          }).join(`\n${prefix}`)}\n${footerText}\n`;
        }
      }
    },
  }).prompt() as Promise<Value[] | symbol>;
};

import type { Option } from './select.js';

import prism from '../prism/index.js';
import { limitOptions } from '../utilities/limit-options.js';
import { MULTISELECT_INSTRUCTIONS } from './multi-select.js';
import { settings, GroupMultiSelectPrompt } from '../core/index.js';
import {
  S_BAR,
  symbol,
  S_BAR_END,
  S_CHECKBOX_ACTIVE,
  type CommonOptions,
  S_CHECKBOX_INACTIVE,
  S_CHECKBOX_SELECTED,
  formatInstructionFooter,
} from '../utilities/common.js';

export interface GroupMultiSelectOptions<Value> extends CommonOptions {
  message: string;
  options: Record<string, Option<Value>[]>;
  initialValues?: Value[];
  /**
   * The maximum number of items/options to display at once.
   */
  maxItems?: number;
  required?: boolean;
  cursorAt?: Value;
  selectableGroups?: boolean;
  groupSpacing?: number;
  /**
   * Show keyboard instructions below the option list.
   * @default true
   */
  showInstructions?: boolean;
}
export const groupMultiselect = <Value>(opts: GroupMultiSelectOptions<Value>) => {
  const { selectableGroups = true, groupSpacing = 0 } = opts;
  const opt = (
    option: Option<Value> & { group: string | boolean },
    state:
      | 'inactive'
      | 'active'
      | 'selected'
      | 'active-selected'
      | 'group-active'
      | 'group-active-selected'
      | 'submitted'
      | 'cancelled',
    options: (Option<Value> & { group: string | boolean })[] = []
  ) => {
    const label = option.label ?? String(option.value);
    const isItem = typeof option.group === 'string';
    const next = isItem && (options[options.indexOf(option) + 1] ?? { group: true });
    const isLast = isItem && next && next.group === true;
    const prefix = isItem ? (selectableGroups ? `${isLast ? S_BAR_END : S_BAR} ` : '  ') : '';
    // Blank rows between groups carry no content of their own; the guide bar
    // is supplied by the row prefix at render time so withGuide stays honoured.
    const spacingPrefix = groupSpacing > 0 && !isItem ? '\n'.repeat(groupSpacing) : '';

    if (state === 'active') {
      return `${spacingPrefix}${prism.dim(prefix)}${settings.theme.accent(S_CHECKBOX_ACTIVE)} ${label}${
        option.hint ? ` ${settings.theme.muted(`(${option.hint})`)}` : ''
      }`;
    }
    if (state === 'group-active') {
      return `${spacingPrefix}${prefix}${settings.theme.accent(S_CHECKBOX_ACTIVE)} ${prism.dim(label)}`;
    }
    if (state === 'group-active-selected') {
      return `${spacingPrefix}${prefix}${settings.theme.success(S_CHECKBOX_SELECTED)} ${prism.dim(label)}`;
    }
    if (state === 'selected') {
      const selectedCheckbox =
        isItem || selectableGroups ? settings.theme.success(S_CHECKBOX_SELECTED) : '';
      return `${spacingPrefix}${prism.dim(prefix)}${selectedCheckbox} ${prism.dim(label)}${
        option.hint ? ` ${settings.theme.muted(`(${option.hint})`)}` : ''
      }`;
    }
    if (state === 'cancelled') {
      return `${prism.strikethrough(prism.dim(label))}`;
    }
    if (state === 'active-selected') {
      return `${spacingPrefix}${prism.dim(prefix)}${settings.theme.success(S_CHECKBOX_SELECTED)} ${label}${
        option.hint ? ` ${settings.theme.muted(`(${option.hint})`)}` : ''
      }`;
    }
    if (state === 'submitted') {
      return `${prism.dim(label)}`;
    }
    const unselectedCheckbox = isItem || selectableGroups ? prism.dim(S_CHECKBOX_INACTIVE) : '';
    return `${spacingPrefix}${prism.dim(prefix)}${unselectedCheckbox} ${prism.dim(label)}`;
  };
  const required = opts.required ?? true;
  const showInstructions = opts.showInstructions ?? true;

  return new GroupMultiSelectPrompt({
    options: opts.options,
    signal: opts.signal,
    input: opts.input,
    output: opts.output,
    initialValues: opts.initialValues,
    required,
    cursorAt: opts.cursorAt,
    selectableGroups,
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
      const titlePrefix = `${hasGuide ? `${prism.gray(S_BAR)}\n` : ''}${symbol(this.state)}  `;
      const title = `${titlePrefix}${opts.message}\n`;
      const value = this.value ?? [];

      const styleOption = (option: Option<Value> & { group: string | boolean }, active: boolean) => {
        const options = this.options;
        const selected =
          value.includes(option.value) ||
          (option.group === true && this.isGroupSelected(`${option.value}`));
        const groupActive =
          !active &&
          typeof option.group === 'string' &&
          this.options[this.cursor]?.value === option.group;
        if (groupActive) {
          return opt(option, selected ? 'group-active-selected' : 'group-active', options);
        }
        if (active && selected) {
          return opt(option, 'active-selected', options);
        }
        if (selected) {
          return opt(option, 'selected', options);
        }
        return opt(option, active ? 'active' : 'inactive', options);
      };

      switch (this.state) {
        case 'submit': {
          const selectedOptions = this.options
            .filter(({ value: optionValue }) => value.includes(optionValue))
            .map((option) => opt(option, 'submitted'));
          const optionsText =
            selectedOptions.length === 0 ? '' : `  ${selectedOptions.join(prism.dim(', '))}`;
          return `${title}${hasGuide ? prism.gray(S_BAR) : ''}${optionsText}`;
        }
        case 'cancel': {
          const label = this.options
            .filter(({ value: optionValue }) => value.includes(optionValue))
            .map((option) => opt(option, 'cancelled'))
            .join(prism.dim(', '));
          return `${title}${hasGuide ? `${prism.gray(S_BAR)}  ` : ''}${
            label.trim() ? `${label}${hasGuide ? `\n${prism.gray(S_BAR)}` : ''}` : ''
          }`;
        }
        case 'error': {
          const guidePrefix = hasGuide ? `${settings.theme.warning(S_BAR)}  ` : '';
          const errorEnd = hasGuide ? `${settings.theme.warning(S_BAR_END)}  ` : '';
          const footer = this.error
            .split('\n')
            .map((ln, i) => (i === 0 ? `${errorEnd}${settings.theme.warning(ln)}` : `   ${ln}`))
            .join('\n');
          const titleLineCount = title.split('\n').length;
          const footerLineCount = footer.split('\n').length + 1;
          const optionsText = limitOptions({
            output: opts.output,
            options: this.options,
            cursor: this.cursor,
            maxItems: opts.maxItems,
            columnPadding: guidePrefix.length,
            rowPadding: titleLineCount + footerLineCount,
            style: styleOption,
          }).join(`\n${guidePrefix}`);
          return `${title}${guidePrefix}${optionsText}\n${footer}\n`;
        }
        default: {
          const guidePrefix = hasGuide ? `${settings.theme.accent(S_BAR)}  ` : '';
          const titleLineCount = title.split('\n').length;
          const footerLines = showInstructions
            ? formatInstructionFooter(MULTISELECT_INSTRUCTIONS, hasGuide)
            : hasGuide
              ? [settings.theme.accent(S_BAR_END)]
              : [];
          const footerText = footerLines.join('\n');
          const footerLineCount = footerLines.length + 1;
          const optionsText = limitOptions({
            output: opts.output,
            options: this.options,
            cursor: this.cursor,
            maxItems: opts.maxItems,
            columnPadding: guidePrefix.length,
            rowPadding: titleLineCount + footerLineCount,
            style: styleOption,
          }).join(`\n${guidePrefix}`);
          return `${title}${guidePrefix}${optionsText}\n${footerText}\n`;
        }
      }
    },
  }).prompt() as Promise<Value[] | symbol>;
};

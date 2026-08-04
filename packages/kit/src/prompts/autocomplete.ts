import type { Option } from './select.js';

import prism from '../prism/index.js';
import { limitOptions } from '../utilities/limit-options.js';
import { settings, type Validate, AutocompletePrompt } from '../core/index.js';
import {
  S_BAR,
  symbol,
  S_RADIO_ACTIVE,
  S_RADIO_INACTIVE,
  type CommonOptions,
  S_CHECKBOX_INACTIVE,
  S_CHECKBOX_SELECTED,
  formatInstructionFooter,
} from '../utilities/common.js';

function getLabel<T>(option: Option<T>) {
  return option.label ?? String(option.value ?? '');
}

function getFilteredOption<T>(searchText: string, option: Option<T>): boolean {
  if (!searchText) {
    return true;
  }
  const label = (option.label ?? String(option.value ?? '')).toLowerCase();
  const hint = (option.hint ?? '').toLowerCase();
  const value = String(option.value).toLowerCase();
  const term = searchText.toLowerCase();

  return label.includes(term) || hint.includes(term) || value.includes(term);
}

function getSelectedOptions<T>(values: T[], options: Option<T>[]): Option<T>[] {
  const results: Option<T>[] = [];

  for (const option of options) {
    if (values.includes(option.value)) {
      results.push(option);
    }
  }

  return results;
}

/**
 * A dynamic options() getter does its own searching, so it gets no default
 * filter forced on top of its results (upstream #496); array options keep the
 * label/hint/value substring default.
 */
function resolveFilter<Value>(
  opts: AutocompleteSharedOptions<Value>
): ((search: string, option: Option<Value>) => boolean) | undefined {
  if (typeof opts.options === 'function') {
    return opts.filter;
  }
  return opts.filter ?? ((search: string, opt: Option<Value>) => getFilteredOption(search, opt));
}

interface AutocompleteSharedOptions<Value> extends CommonOptions {
  /**
   * The message to display to the user.
   */
  message: string;
  /**
   * Available options for the autocomplete prompt.
   */
  options: Option<Value>[] | ((this: AutocompletePrompt<Option<Value>>) => Option<Value>[]);
  /**
   * Maximum number of items to display at once.
   */
  maxItems?: number;
  /**
   * Placeholder text displayed when the search field is empty. When set,
   * pressing Tab copies the placeholder into the input.
   */
  placeholder?: string;
  /**
   * Custom filter function. By default, filters by label, hint, and value.
   */
  filter?: (search: string, option: Option<Value>) => boolean;
  /**
   * A function or a [Standard Schema](https://github.com/standard-schema/standard-schema)
   * that validates user input. If a custom function is given, you should return a `string`
   * or `Error` to show as a validation error, or `undefined` to accept the result.
   */
  validate?: Validate<Value | Value[]>;
}

export interface AutocompleteOptions<Value> extends AutocompleteSharedOptions<Value> {
  /**
   * The initial selected value.
   */
  initialValue?: Value;
  /**
   * The initial user input
   */
  initialUserInput?: string;
}

export const autocomplete = <Value>(opts: AutocompleteOptions<Value>) => {
  const prompt = new AutocompletePrompt({
    options: opts.options,
    initialValue: opts.initialValue ? [opts.initialValue] : undefined,
    initialUserInput: opts.initialUserInput,
    placeholder: opts.placeholder,
    filter: resolveFilter(opts),
    signal: opts.signal,
    input: opts.input,
    output: opts.output,
    validate: opts.validate,
    render() {
      const hasGuide = (opts?.withGuide ?? settings.withGuide) !== false;
      // Title and message display
      const headings = hasGuide
        ? [`${prism.gray(S_BAR)}`, `${symbol(this.state)}  ${opts.message}`]
        : [`${symbol(this.state)}  ${opts.message}`];
      const userInput = this.userInput;
      const options = this.options;
      const placeholder = opts.placeholder;
      const showPlaceholder = userInput === '' && placeholder !== undefined;

      const guidePrefix = hasGuide ? `${settings.theme.accent(S_BAR)}  ` : '';
      const barGray = hasGuide ? prism.gray(S_BAR) : '';

      // Handle different states
      switch (this.state) {
        case 'submit': {
          // Show selected value
          const selected = getSelectedOptions(this.selectedValues, options);
          const label =
            selected.length > 0 ? `  ${prism.dim(selected.map(getLabel).join(', '))}` : '';
          return `${headings.join('\n')}\n${barGray}${label}`;
        }

        case 'cancel': {
          const userInputText = userInput ? `  ${prism.strikethrough(prism.dim(userInput))}` : '';
          return `${headings.join('\n')}\n${barGray}${userInputText}`;
        }

        default: {
          // Display cursor position - show plain text in navigation mode
          let searchText: string;
          if (this.isNavigating || showPlaceholder) {
            const searchTextValue = showPlaceholder ? placeholder : userInput;
            searchText = searchTextValue !== '' ? ` ${prism.dim(searchTextValue)}` : '';
          } else {
            searchText = ` ${this.userInputWithCursor}`;
          }

          // Show match count if filtered
          const matches =
            this.filteredOptions.length !== options.length
              ? prism.dim(
                ` (${this.filteredOptions.length} match${this.filteredOptions.length === 1 ? '' : 'es'})`
              )
              : '';

          // No matches message
          const noResults =
            this.filteredOptions.length === 0 && userInput
              ? [`${guidePrefix}${settings.theme.warning('No matches found')}`]
              : [];

          const errorPrefix = hasGuide ? `${settings.theme.warning(S_BAR)}  ` : '';
          const validationError =
            this.state === 'error'
              ? [`${errorPrefix}${settings.theme.warning(this.error)}`]
              : [];

          if (hasGuide) {
            headings.push(guidePrefix.trimEnd());
          }
          headings.push(
            `${guidePrefix}${prism.dim('Search:')}${searchText}${matches}`,
            ...noResults,
            ...validationError
          );

          // Show instructions
          const instructions = ['↑/↓ to select', 'Enter: confirm', 'Type: to search'];
          const footers = formatInstructionFooter(instructions, hasGuide);

          // Render options with selection
          const displayOptions =
            this.filteredOptions.length === 0
              ? []
              : limitOptions({
                cursor: this.cursor,
                options: this.filteredOptions,
                columnPadding: hasGuide ? 3 : 0, // for `|  ` when the guide is shown
                rowPadding: headings.length + footers.length,
                style: (option, active) => {
                  const label = getLabel(option);
                  const hint =
                    option.hint && option.value === this.focusedValue
                      ? settings.theme.muted(` (${option.hint})`)
                      : '';

                  if (option.disabled) {
                    return `${settings.theme.muted(S_RADIO_INACTIVE)} ${prism.strikethrough(settings.theme.muted(label))}`;
                  }
                  return active
                    ? `${settings.theme.success(S_RADIO_ACTIVE)} ${label}${hint}`
                    : `${prism.dim(S_RADIO_INACTIVE)} ${prism.dim(label)}${hint}`;
                },
                maxItems: opts.maxItems,
                output: opts.output,
              });

          // Return the formatted prompt
          return [
            ...headings,
            ...displayOptions.map((option) => `${guidePrefix}${option}`),
            ...footers,
          ].join('\n');
        }
      }
    },
  });

  // Return the result or cancel symbol
  return prompt.prompt() as Promise<Value | symbol>;
};

// Type definition for the autocompleteMultiselect component
export interface AutocompleteMultiSelectOptions<Value> extends AutocompleteSharedOptions<Value> {
  /**
   * The initial selected values
   */
  initialValues?: Value[];
  /**
   * If true, at least one option must be selected
   */
  required?: boolean;
}

/**
 * Integrated autocomplete multiselect - combines type-ahead filtering with multiselect in one UI
 */
export const autocompleteMultiselect = <Value>(opts: AutocompleteMultiSelectOptions<Value>) => {
  const formatOption = (
    option: Option<Value>,
    active: boolean,
    selectedValues: Value[],
    focusedValue: Value | undefined
  ) => {
    const isSelected = selectedValues.includes(option.value);
    const label = option.label ?? String(option.value ?? '');
    const hint =
      option.hint && focusedValue !== undefined && option.value === focusedValue
        ? settings.theme.muted(` (${option.hint})`)
        : '';
    const checkbox = isSelected
      ? settings.theme.success(S_CHECKBOX_SELECTED)
      : prism.dim(S_CHECKBOX_INACTIVE);

    if (active) {
      return `${checkbox} ${label}${hint}`;
    }
    return `${checkbox} ${prism.dim(label)}`;
  };

  // Create text prompt which we'll use as foundation
  const prompt = new AutocompletePrompt<Option<Value>>({
    options: opts.options,
    multiple: true,
    placeholder: opts.placeholder,
    filter: resolveFilter(opts),
    validate: () => {
      if (opts.required && prompt.selectedValues.length === 0) {
        return 'Please select at least one item';
      }
      return undefined;
    },
    initialValue: opts.initialValues,
    signal: opts.signal,
    input: opts.input,
    output: opts.output,
    render() {
      const hasGuide = (opts?.withGuide ?? settings.withGuide) !== false;
      // Title and symbol
      const titlePrefix = `${hasGuide ? `${prism.gray(S_BAR)}\n` : ''}${symbol(this.state)}  `;
      const title = `${titlePrefix}${opts.message}\n`;

      // Selection counter
      const userInput = this.userInput;
      const placeholder = opts.placeholder;
      const showPlaceholder = userInput === '' && placeholder !== undefined;

      // Search input display
      const searchText =
        this.isNavigating || showPlaceholder
          ? prism.dim(showPlaceholder ? placeholder : userInput) // Just show plain text when in navigation mode
          : this.userInputWithCursor;

      const options = this.options;

      const matches =
        this.filteredOptions.length !== options.length
          ? prism.dim(
            ` (${this.filteredOptions.length} match${this.filteredOptions.length === 1 ? '' : 'es'})`
          )
          : '';

      const guidePrefix = hasGuide ? `${settings.theme.accent(S_BAR)}  ` : '';
      const grayPrefix = hasGuide ? `${prism.gray(S_BAR)}  ` : '';

      // Render prompt state
      switch (this.state) {
        case 'submit': {
          return `${title}${grayPrefix}${prism.dim(`${this.selectedValues.length} items selected`)}`;
        }
        case 'cancel': {
          return `${title}${grayPrefix}${prism.strikethrough(prism.dim(userInput))}`;
        }
        default: {
          // Instructions
          const instructions = [
            '↑/↓ to navigate',
            `${this.isNavigating ? 'Space/Tab:' : 'Tab:'} select`,
            'Enter: confirm',
            'Type: to search',
          ];

          // No results message
          const noResults =
            this.filteredOptions.length === 0 && userInput
              ? [`${guidePrefix}${settings.theme.warning('No matches found')}`]
              : [];

          const errorMessage =
            this.state === 'error'
              ? [`${guidePrefix}${settings.theme.warning(this.error)}`]
              : [];

          // Get limited options for display
          const displayOptions = limitOptions({
            cursor: this.cursor,
            options: this.filteredOptions,
            style: (option, active) =>
              formatOption(option, active, this.selectedValues, this.focusedValue),
            maxItems: opts.maxItems,
            output: opts.output,
          });

          // Build the prompt display
          return [
            title,
            `${guidePrefix}${prism.dim('Search:')} ${searchText}${matches}`,
            ...noResults,
            ...errorMessage,
            ...displayOptions.map((option) => `${guidePrefix}${option}`),
            ...formatInstructionFooter(instructions, hasGuide),
          ].join('\n');
        }
      }
    },
  });

  // Return the result or cancel symbol
  return prompt.prompt() as Promise<Value[] | symbol>;
};

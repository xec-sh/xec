import { isPrintableInput } from '../utils/string.js';
import Prompt, { type PromptOptions } from './prompt.js';

interface SelectKeyOptions<T extends { value: string; disabled?: boolean }> extends PromptOptions<
  T['value'],
  SelectKeyPrompt<T>
> {
  options: readonly T[];
  caseSensitive?: boolean;
}
export default class SelectKeyPrompt<
  T extends { value: string; disabled?: boolean },
> extends Prompt<T['value']> {
  options: T[];
  cursor = 0;

  protected override _shouldSubmit() {
    return this.options.some((option) => !option.disabled && option.value === this.value);
  }

  constructor(opts: SelectKeyOptions<T>) {
    super(opts, false);

    this.options = [...opts.options];
    const caseSensitive = opts.caseSensitive === true;
    const firstEnabled = this.options.findIndex((option) => !option.disabled);
    const initialIndex = this.options.findIndex(
      (option) => !option.disabled && option.value === opts.initialValue
    );
    this.cursor = initialIndex === -1 ? firstEnabled : initialIndex;
    this.value = this.options[this.cursor]?.value;

    // The key event delivers the char with its original casing (upstream
    // #534), so caseSensitive matching compares it directly — the previous
    // keyInfo.shift reconstruction broke under Caps Lock and pasted input.
    this.on('key', (key, info) => {
      if (!isPrintableInput(key, info)) return;
      const casedKey = caseSensitive ? key : key.toLowerCase();

      const value = this.options.find(
        ({ value: [initial], disabled }) =>
          !disabled && (caseSensitive ? initial === casedKey : initial?.toLowerCase() === casedKey)
      );
      if (value) {
        this.value = value.value;
        this.state = 'submit';
      }
    });
  }
}

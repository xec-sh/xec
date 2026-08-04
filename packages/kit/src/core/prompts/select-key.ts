import Prompt, { type PromptOptions } from './prompt.js';

interface SelectKeyOptions<T extends { value: string }>
  extends PromptOptions<T['value'], SelectKeyPrompt<T>> {
  options: T[];
  caseSensitive?: boolean;
}
export default class SelectKeyPrompt<T extends { value: string }> extends Prompt<T['value']> {
  options: T[];
  cursor = 0;

  constructor(opts: SelectKeyOptions<T>) {
    super(opts, false);

    this.options = opts.options;
    const caseSensitive = opts.caseSensitive === true;
    const keys = this.options.map(({ value: [initial] }) => {
      const key = initial ?? '';
      return caseSensitive ? key : key.toLowerCase();
    });
    this.cursor = opts.initialValue !== undefined ? Math.max(keys.indexOf(opts.initialValue), 0) : 0;

    // The key event delivers the char with its original casing (upstream
    // #534), so caseSensitive matching compares it directly — the previous
    // keyInfo.shift reconstruction broke under Caps Lock and pasted input.
    this.on('key', (key) => {
      if (!key) return;
      const casedKey = caseSensitive ? key : key.toLowerCase();
      if (!keys.includes(casedKey)) return;

      const value = this.options.find(({ value: [initial] }) =>
        caseSensitive ? initial === casedKey : initial?.toLowerCase() === casedKey
      );
      if (value) {
        this.value = value.value;
        this.state = 'submit';
        this.emit('submit');
      }
    });
  }
}

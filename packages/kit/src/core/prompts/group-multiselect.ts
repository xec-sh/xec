import { findCursor } from '../utils/cursor.js';
import Prompt, { type PromptOptions } from './prompt.js';

interface GroupMultiSelectOptions<
  T extends { value: any; disabled?: boolean },
> extends PromptOptions<T['value'][], GroupMultiSelectPrompt<T>> {
  options: Readonly<Record<string, readonly T[]>>;
  initialValues?: readonly T['value'][];
  required?: boolean;
  cursorAt?: T['value'];
  selectableGroups?: boolean;
}
export default class GroupMultiSelectPrompt<
  T extends { value: any; disabled?: boolean },
> extends Prompt<T['value'][]> {
  options: (T & { group: string | boolean })[];
  cursor = 0;
  #selectableGroups: boolean;

  getGroupItems(group: string): T[] {
    return this.options.filter((o) => o.group === group && !o.disabled);
  }

  isGroupSelected(group: string) {
    const items = this.getGroupItems(group);
    const value = this.value;
    if (value === undefined) {
      return false;
    }
    return items.length > 0 && items.every((i) => value.includes(i.value));
  }

  private toggleValue() {
    const item = this.options[this.cursor];
    if (!item || item.disabled) return; // Guard against undefined

    if (this.value === undefined) {
      this.value = [];
    }
    if (item.group === true) {
      const group = item.value;
      const groupedItems = this.getGroupItems(group);
      if (this.isGroupSelected(group)) {
        this.value = this.value.filter(
          (v: string) => groupedItems.findIndex((i) => i.value === v) === -1
        );
      } else {
        this.value = [...this.value, ...groupedItems.map((i) => i.value)];
      }
      this.value = Array.from(new Set(this.value));
    } else {
      const selected = this.value.includes(item.value);
      this.value = selected
        ? this.value.filter((v: T['value']) => v !== item.value)
        : [...this.value, item.value];
    }
  }

  constructor(opts: GroupMultiSelectOptions<T>) {
    super(opts, false);
    const { options } = opts;
    this.#selectableGroups = opts.selectableGroups !== false;
    this.options = Object.entries(options).flatMap(([key, option]) => [
      {
        value: key,
        group: true,
        label: key,
        disabled: !this.#selectableGroups || option.every((item) => item.disabled),
      },
      ...option.map((opt) => ({ ...opt, group: key })),
    ]) as any;
    this.value = [...new Set(opts.initialValues ?? [])].filter((value) =>
      this.options.some(
        (option) => typeof option.group === 'string' && !option.disabled && option.value === value
      )
    );
    this.cursor = Math.max(
      this.options.findIndex(({ value }) => value === opts.cursorAt),
      this.#selectableGroups ? 0 : 1
    );

    this.cursor = findCursor(this.cursor, 0, this.options);

    this.on('cursor', (key) => {
      switch (key) {
        case 'left':
        case 'up': {
          this.cursor = findCursor(this.cursor, -1, this.options);
          break;
        }
        case 'down':
        case 'right': {
          this.cursor = findCursor(this.cursor, 1, this.options);
          break;
        }
        case 'space':
          this.toggleValue();
          break;
        // no default
      }
    });
  }
}

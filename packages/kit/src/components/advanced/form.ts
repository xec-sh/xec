// Form component with multi-field support and validation

import { Key } from '../../core/types.js';
import { Prompt } from '../../core/prompt.js';

export type FieldType = 'text' | 'number' | 'password' | 'select' | 'multiselect' | 'confirm' | 'boolean' | 'group' | 'custom' | 'keyvalue' | 'list';

export interface FieldOption<T = any> {
  value: T;
  label: string;
  hint?: string;
}

export interface BaseField<T = any> {
  name: string;
  label?: string; // Made optional
  message?: string; // Alternative to label
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  description?: string;
  defaultValue?: T;
  default?: T; // Alias for defaultValue
  validate?: (value: T, formData: any) => string | undefined | Promise<string | undefined>;
  dependsOn?: string | string[];
  show?: (formData: any) => boolean;
  when?: (formData: any) => boolean; // Alias for show
}

export interface TextField extends BaseField<string> {
  type: 'text';
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  transform?: (value: string) => string;
  multiline?: boolean;
}

export interface NumberField extends BaseField<number> {
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
}

export interface PasswordField extends BaseField<string> {
  type: 'password';
  mask?: string;
  showStrength?: boolean;
}

export interface SelectField<T = any> extends BaseField<T> {
  type: 'select';
  options: FieldOption<T>[] | T[] | ((formData: any) => FieldOption<T>[] | T[]);
}

export interface MultiSelectField<T = string> extends BaseField<T[]> {
  type: 'multiselect';
  options: FieldOption<T>[] | T[] | ((formData: any) => FieldOption<T>[] | T[]);
  min?: number;
  max?: number;
}

export interface ConfirmField extends BaseField<boolean> {
  type: 'confirm';
}

export interface BooleanField extends BaseField<boolean> {
  type: 'boolean';
}

export interface GroupField extends BaseField<any> {
  type: 'group';
  fields: FormField[];
}

export interface CustomField extends BaseField<any> {
  type: 'custom';
  component?: any; // Custom component
  render?: (value: any, formData: any) => string;
}

export interface KeyValueField extends BaseField<Record<string, any>> {
  type: 'keyvalue';
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string; // Label for add button
  validateKey?: (key: string) => string | undefined; // Validation for keys
}

export interface ListField<T = any> extends BaseField<T[]> {
  type: 'list';
  itemPlaceholder?: string;
  addLabel?: string;
  minItems?: number;
  maxItems?: number;
  // For complex object lists
  itemFields?: FormField[];
  // For simple string lists
  itemType?: 'string' | 'number' | 'object';
  // Custom validation for each item
  validateItem?: (item: T, index: number, items: T[]) => string | undefined;
  // Custom display for items in the list
  renderItem?: (item: T, index: number) => string;
  // Allow inline editing vs modal editing for complex items
  editMode?: 'inline' | 'modal';
  // Allow reordering items
  allowReorder?: boolean;
  // Custom item label for display
  itemLabel?: string | ((index: number) => string);
}

export type FormField = TextField | NumberField | PasswordField | SelectField | MultiSelectField | ConfirmField | BooleanField | GroupField | CustomField | KeyValueField | ListField<any>;

export interface FormStep {
  name: string;
  title?: string;
  fields: FormField[];
}

export interface FormSection {
  title: string;
  fields: FormField[];
}

export interface FormOptions {
  message?: string; // Made optional
  title?: string; // Alternative to message
  fields?: FormField[];
  steps?: FormStep[];
  sections?: FormSection[]; // Alternative to steps
  submitLabel?: string;
  cancelLabel?: string;
  validateOnBlur?: boolean;
  validate?: (values: any) => any | Promise<any>; // Cross-field validation
  onSubmit?: (values: any) => Promise<void>; // Submit handler
  initialValues?: Record<string, any>; // Initial form values
  theme?: any;
}

interface FormState {
  values: Record<string, any>;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  currentFieldIndex: number;
  currentStepIndex: number;
  isSubmitting: boolean;
  status: string;
}

export class FormPrompt extends Prompt<Record<string, any>, FormOptions> {
  private fields: FormField[];
  private steps?: FormStep[];
  private visibleFields: FormField[] = [];

  constructor(options: FormOptions) {
    // Ensure message is provided
    const config = {
      ...options,
      message: options.message || options.title || 'Form'
    };

    super(config);

    // Initialize fields
    if (options.steps) {
      this.steps = options.steps;
      this.fields = options.steps.flatMap(step => step.fields);
    } else if (options.fields) {
      this.fields = options.fields;
    } else {
      throw new Error('Either fields or steps must be provided');
    }

    // Initialize state
    const initialValues: Record<string, any> = {};
    const errors: Record<string, string> = {};
    const touched: Record<string, boolean> = {};

    this.fields.forEach(field => {
      // Use provided initialValues if available, otherwise use field default or type default
      initialValues[field.name] = options.initialValues?.[field.name] ??
        field.defaultValue ??
        field.default ??
        this.getDefaultValue(field);
      errors[field.name] = '';
      touched[field.name] = false;
    });

    const state: FormState = {
      values: initialValues,
      errors,
      touched,
      currentFieldIndex: 0,
      currentStepIndex: 0,
      isSubmitting: false,
      status: 'idle'
    };

    this.state.setState(state);
    this.updateVisibleFields();
  }

  render(): string {
    const state = this.state.getState() as FormState;
    const { theme } = this.getRenderContext();
    const lines: string[] = [];

    // Title
    lines.push(theme.formatters.primary(this.config.message));
    lines.push('');

    // Step indicator if using steps
    if (this.steps) {
      const stepIndicator = this.renderStepIndicator(state);
      lines.push(stepIndicator);
      lines.push('');

      const currentStep = this.steps[state.currentStepIndex];
      if (currentStep && currentStep.title) {
        lines.push(theme.formatters.bold(currentStep.title));
        lines.push('');
      }
    }

    // Render fields
    this.visibleFields.forEach((field, index) => {
      const isActive = index === state.currentFieldIndex;
      const fieldLines = this.renderField(field, isActive, state);
      lines.push(...fieldLines);
      lines.push('');
    });

    // Navigation help
    lines.push(theme.formatters.muted('Tab/↑↓: navigate • Enter: submit • Esc: cancel'));

    return lines.join('\n');
  }

  async handleInput(key: Key): Promise<void> {
    const state = this.state.getState() as FormState;
    const currentField = this.visibleFields[state.currentFieldIndex];

    if (!currentField) return;

    // Navigation between fields
    if (key.name === 'tab' || key.name === 'down') {
      if (key.shift) {
        this.navigateField(-1);
      } else {
        this.navigateField(1);
      }
      return;
    }

    if (key.name === 'up') {
      this.navigateField(-1);
      return;
    }

    // Submit form
    if (key.name === 'return' || key.name === 'enter') {
      if (state.currentFieldIndex === this.visibleFields.length - 1) {
        // On last field, submit form
        await this.submitForm();
      } else {
        // Move to next field
        this.navigateField(1);
      }
      return;
    }

    // Handle field-specific input
    await this.handleFieldInput(currentField, key, state);
  }

  private async handleFieldInput(field: FormField, key: Key, state: FormState): Promise<void> {
    switch (field.type) {
      case 'text':
      case 'password':
        await this.handleTextInput(field, key, state);
        break;

      case 'number':
        await this.handleNumberInput(field as NumberField, key, state);
        break;

      case 'select':
        await this.handleSelectInput(field as SelectField, key, state);
        break;

      case 'multiselect':
        await this.handleMultiSelectInput(field as MultiSelectField, key, state);
        break;

      case 'confirm':
        await this.handleConfirmInput(field as ConfirmField, key, state);
        break;

      case 'boolean':
        await this.handleBooleanInput(field as BooleanField, key, state);
        break;

      case 'list':
        await this.handleListInput(field as ListField, key, state);
        break;
    }
  }

  private async handleTextInput(field: TextField | PasswordField, key: Key, state: FormState): Promise<void> {
    const currentValue = state.values[field.name] || '';

    if (key.name === 'backspace') {
      const newValue = currentValue.slice(0, -1);
      await this.updateFieldValue(field.name, newValue);
    } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      const newValue = currentValue + key.sequence;
      await this.updateFieldValue(field.name, newValue);
    }
  }

  private async handleNumberInput(field: NumberField, key: Key, state: FormState): Promise<void> {
    const currentValue = state.values[field.name] ?? 0;

    if (key.name === 'up') {
      const step = field.step || 1;
      const newValue = currentValue + step;
      if (!field.max || newValue <= field.max) {
        await this.updateFieldValue(field.name, newValue);
      }
    } else if (key.name === 'down') {
      const step = field.step || 1;
      const newValue = currentValue - step;
      if (!field.min || newValue >= field.min) {
        await this.updateFieldValue(field.name, newValue);
      }
    } else if (key.name === 'backspace') {
      const strValue = currentValue.toString();
      const newStrValue = strValue.slice(0, -1) || '0';
      await this.updateFieldValue(field.name, parseFloat(newStrValue));
    } else if (key.sequence && /[0-9.-]/.test(key.sequence)) {
      const strValue = currentValue.toString();
      const newStrValue = strValue + key.sequence;
      const newValue = parseFloat(newStrValue);
      if (!isNaN(newValue)) {
        await this.updateFieldValue(field.name, newValue);
      }
    }
  }

  private async handleSelectInput(field: SelectField, key: Key, state: FormState): Promise<void> {
    const fieldOptions = typeof field.options === 'function'
      ? field.options(state.values)
      : field.options;
    const options = this.normalizeOptions(fieldOptions);
    const currentIndex = options.findIndex(opt => opt.value === state.values[field.name]);

    if (key.name === 'up' && currentIndex > 0) {
      await this.updateFieldValue(field.name, options[currentIndex - 1]!.value);
    } else if (key.name === 'down' && currentIndex < options.length - 1) {
      await this.updateFieldValue(field.name, options[currentIndex + 1]!.value);
    } else if (key.name === 'space') {
      // Cycle through options
      const nextIndex = (currentIndex + 1) % options.length;
      await this.updateFieldValue(field.name, options[nextIndex]!.value);
    }
  }

  private async handleMultiSelectInput(field: MultiSelectField, key: Key, state: FormState): Promise<void> {
    const fieldOptions = typeof field.options === 'function'
      ? field.options(state.values)
      : field.options;
    const options = this.normalizeOptions(fieldOptions);
    const currentValues = state.values[field.name] || [];

    if (key.name === 'space') {
      // Toggle current option (simplified - in real implementation would need focused option tracking)
      const firstOption = options[0];
      if (firstOption) {
        const newValues = currentValues.includes(firstOption.value)
          ? currentValues.filter((v: any) => v !== firstOption.value)
          : [...currentValues, firstOption.value];

        await this.updateFieldValue(field.name, newValues);
      }
    }
  }

  private async handleConfirmInput(field: ConfirmField, key: Key, state: FormState): Promise<void> {
    if (key.name === 'space' || key.name === 'y' || key.name === 'n') {
      const newValue = key.name === 'y' ? true : key.name === 'n' ? false : !state.values[field.name];
      await this.updateFieldValue(field.name, newValue);
    }
  }

  private async handleBooleanInput(field: BooleanField, key: Key, state: FormState): Promise<void> {
    if (key.name === 'space' || key.name === 'y' || key.name === 'n') {
      const newValue = key.name === 'y' ? true : key.name === 'n' ? false : !state.values[field.name];
      await this.updateFieldValue(field.name, newValue);
    }
  }

  private async handleListInput(field: ListField, key: Key, state: FormState): Promise<void> {
    const currentItems = state.values[field.name] || [];

    // Enter key to manage list
    if (key.name === 'return') {
      if (field.itemFields) {
        // Complex list with nested fields - open sub-form
        await this.manageComplexList(field, currentItems);
      } else {
        // Simple list - add inline
        await this.addSimpleListItem(field, currentItems);
      }
    }
    // Delete key to remove last item
    else if (key.name === 'backspace' && currentItems.length > 0 && !field.itemFields) {
      const newItems = currentItems.slice(0, -1);
      await this.updateFieldValue(field.name, newItems);
    }
    // 'd' key to delete/manage items
    else if (key.char === 'd' && currentItems.length > 0) {
      await this.deleteListItem(field, currentItems);
    }
    // 'e' key to edit item (for complex lists)
    else if (key.char === 'e' && field.itemFields && currentItems.length > 0) {
      await this.editListItem(field, currentItems);
    }
    // 'r' key to reorder items
    else if (key.char === 'r' && field.allowReorder && currentItems.length > 1) {
      await this.reorderListItems(field, currentItems);
    }
  }

  private async manageComplexList(field: ListField, currentItems: any[]): Promise<void> {
    const { theme } = this.getRenderContext();

    // Create list management menu
    const actions = [
      { value: 'add', label: '➕ Add new item' },
      ...(currentItems.length > 0 ? [
        { value: 'edit', label: '✏️  Edit item' },
        { value: 'delete', label: '🗑  Delete item' },
      ] : []),
      ...(field.allowReorder && currentItems.length > 1 ? [
        { value: 'reorder', label: '↕️  Reorder items' }
      ] : []),
      { value: 'done', label: '✓ Done' }
    ];

    // Import select prompt dynamically to avoid circular dependency
    const { SelectPrompt } = await import('../primitives/select.js');
    const selectPrompt = new SelectPrompt({
      message: `Manage ${field.label || field.name} (${currentItems.length} items)`,
      options: actions
    });

    const action = await selectPrompt.prompt();

    switch (action) {
      case 'add':
        await this.addComplexListItem(field, currentItems);
        break;
      case 'edit':
        await this.editListItem(field, currentItems);
        break;
      case 'delete':
        await this.deleteListItem(field, currentItems);
        break;
      case 'reorder':
        await this.reorderListItems(field, currentItems);
        break;
    }
  }

  private async addComplexListItem(field: ListField, currentItems: any[]): Promise<void> {
    if (!field.itemFields) return;

    // Check max items
    if (field.maxItems && currentItems.length >= field.maxItems) {
      // Show error message
      return;
    }

    // Create sub-form for item fields
    const itemForm = new FormPrompt({
      fields: field.itemFields,
      title: `Add ${field.itemLabel || 'item'}`
    });

    const itemData = await itemForm.prompt();
    if (itemData) {
      const newItems = [...currentItems, itemData];
      await this.updateFieldValue(field.name, newItems);
    }
  }

  private async addSimpleListItem(field: ListField, currentItems: any[]): Promise<void> {
    // Check max items
    if (field.maxItems && currentItems.length >= field.maxItems) {
      return;
    }

    // Import text prompt dynamically
    const { TextPrompt } = await import('../primitives/text.js');
    const textPrompt = new TextPrompt({
      message: field.itemPlaceholder || `Enter ${field.itemLabel || 'item'}`,
      validate: field.validateItem ? (v) => field.validateItem!(v, currentItems.length, currentItems) : undefined
    });

    const value = await textPrompt.prompt();
    if (value) {
      const newItems = [...currentItems, value];
      await this.updateFieldValue(field.name, newItems);
    }
  }

  private async editListItem(field: ListField, currentItems: any[]): Promise<void> {
    if (currentItems.length === 0) return;

    // Select item to edit
    const { SelectPrompt } = await import('../primitives/select.js');
    const selectPrompt = new SelectPrompt({
      message: 'Select item to edit',
      options: currentItems.map((item, index) => ({
        value: index,
        label: field.renderItem ? field.renderItem(item, index) :
          field.itemFields ? `Item ${index + 1}` : String(item)
      }))
    });

    const selectedIndex = await selectPrompt.prompt() as number;
    if (selectedIndex === undefined) return;

    if (field.itemFields) {
      // Edit complex item
      const itemForm = new FormPrompt({
        fields: field.itemFields,
        title: `Edit ${field.itemLabel || 'item'}`,
        initialValues: currentItems[selectedIndex]
      });

      const updatedItem = await itemForm.prompt();
      if (updatedItem) {
        const newItems = [...currentItems];
        newItems[selectedIndex] = updatedItem;
        await this.updateFieldValue(field.name, newItems);
      }
    } else {
      // Edit simple item
      const { TextPrompt } = await import('../primitives/text.js');
      const textPrompt = new TextPrompt({
        message: field.itemPlaceholder || `Edit ${field.itemLabel || 'item'}`,
        default: currentItems[selectedIndex],
        validate: field.validateItem ? (v) => field.validateItem!(v, selectedIndex, currentItems) : undefined
      });

      const value = await textPrompt.prompt();
      if (value !== undefined) {
        const newItems = [...currentItems];
        newItems[selectedIndex] = value;
        await this.updateFieldValue(field.name, newItems);
      }
    }
  }

  private async deleteListItem(field: ListField, currentItems: any[]): Promise<void> {
    if (currentItems.length === 0) return;

    // Check min items
    if (field.minItems && currentItems.length <= field.minItems) {
      return;
    }

    // Select item to delete
    const { SelectPrompt } = await import('../primitives/select.js');
    const selectPrompt = new SelectPrompt({
      message: 'Select item to delete',
      options: currentItems.map((item, index) => ({
        value: index,
        label: field.renderItem ? field.renderItem(item, index) :
          field.itemFields ? `Item ${index + 1}` : String(item)
      }))
    });

    const selectedIndex = await selectPrompt.prompt() as number;
    if (selectedIndex !== undefined) {
      const newItems = currentItems.filter((_, index) => index !== selectedIndex);
      await this.updateFieldValue(field.name, newItems);
    }
  }

  private async reorderListItems(field: ListField, currentItems: any[]): Promise<void> {
    if (currentItems.length < 2) return;

    // Create a copy for reordering
    const items = [...currentItems];
    const currentIndex = 0;

    // Interactive reordering interface
    const { theme } = this.getRenderContext();

    // This would ideally be a custom interactive prompt
    // For now, simplified implementation
    const { SelectPrompt } = await import('../primitives/select.js');
    const fromPrompt = new SelectPrompt({
      message: 'Select item to move',
      options: items.map((item, index) => ({
        value: index,
        label: field.renderItem ? field.renderItem(item, index) :
          field.itemFields ? `Item ${index + 1}` : String(item)
      }))
    });

    const fromIndex = await fromPrompt.prompt() as number;
    if (fromIndex === undefined) return;

    const toPrompt = new SelectPrompt({
      message: 'Move to position',
      options: items.map((_, index) => ({
        value: index,
        label: `Position ${index + 1}`
      }))
    });

    const toIndex = await toPrompt.prompt() as number;
    if (toIndex === undefined) return;

    // Reorder items
    const [movedItem] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, movedItem);

    await this.updateFieldValue(field.name, items);
  }

  private renderStepIndicator(state: FormState): string {
    if (!this.steps) return '';

    const { theme } = this.getRenderContext();
    const parts: string[] = [];

    this.steps.forEach((step, index) => {
      const isActive = index === state.currentStepIndex;
      const isCompleted = index < state.currentStepIndex;

      let indicator = '';
      if (isCompleted) {
        indicator = theme.formatters.success('✓');
      } else if (isActive) {
        indicator = theme.formatters.primary(`${index + 1}`);
      } else {
        indicator = theme.formatters.muted(`${index + 1}`);
      }

      parts.push(indicator);
    });

    return parts.join(' → ');
  }

  private renderField(field: FormField, isActive: boolean, state: FormState): string[] {
    const { theme } = this.getRenderContext();
    const lines: string[] = [];

    // Field label
    const fieldLabel = field.label || field.message || field.name;
    const required = field.required ? theme.formatters.error(' *') : '';
    const activeIndicator = isActive ? '▶ ' : '  ';
    const label = activeIndicator + (isActive ? theme.formatters.primary(fieldLabel) : fieldLabel) + required;
    lines.push(label);

    // Field value
    const value = state.values[field.name];
    const formattedValue = this.formatFieldValue(field, value, isActive, state);
    lines.push(formattedValue);

    // Field description
    if (field.description) {
      lines.push(theme.formatters.muted('  ' + field.description));
    }

    // Error message
    if (state.errors[field.name] && state.touched[field.name]) {
      lines.push(theme.formatters.error('  ' + state.errors[field.name]));
    }

    return lines;
  }

  private formatFieldValue(field: FormField, value: any, isActive: boolean, state: FormState): string {
    const { theme } = this.getRenderContext();
    const prefix = isActive ? theme.formatters.primary('▸ ') : '  ';

    switch (field.type) {
      case 'text':
        return prefix + (value || theme.formatters.muted(field.placeholder || 'Enter text...'));

      case 'password':
        {
          const mask = (field as PasswordField).mask || '•';
          return prefix + (value ? mask.repeat(value.length) : theme.formatters.muted('Enter password...'));
        }

      case 'number':
        return prefix + (value !== undefined ? value.toString() : theme.formatters.muted('0'));

      case 'select':
        {
          const selectField = field as SelectField;
          const selectOptions = typeof selectField.options === 'function'
            ? selectField.options(state.values)
            : selectField.options;
          const options = this.normalizeOptions(selectOptions);
          const selected = options.find(opt => opt.value === value);
          return prefix + (selected ? selected.label : theme.formatters.muted('Select...'));
        }

      case 'multiselect':
        {
          const selectedCount = (value || []).length;
          return prefix + (selectedCount > 0
            ? `${selectedCount} selected`
            : theme.formatters.muted('Select multiple...'));
        }

      case 'confirm':
        {
          const checkbox = value ? '[x]' : '[ ]';
          return prefix + (value ? theme.formatters.success(checkbox) : theme.formatters.muted(checkbox));
        }

      case 'boolean':
        {
          const boolCheckbox = value ? '[x]' : '[ ]';
          return prefix + (value ? theme.formatters.success(boolCheckbox) : theme.formatters.muted(boolCheckbox));
        }

      case 'list':
        {
          const listField = field as ListField;
          const items = value || [];
          if (items.length === 0) {
            return prefix + theme.formatters.muted(`No items (${listField.addLabel || 'Press Enter to add'})`);
          }
          // For complex lists with itemFields, show count
          if (listField.itemFields) {
            return prefix + `${items.length} item${items.length !== 1 ? 's' : ''} (Press Enter to manage)`;
          }
          // For simple lists, show items inline
          const displayItems = items.slice(0, 3).map((item: any) =>
            listField.renderItem ? listField.renderItem(item, 0) : String(item)
          ).join(', ');
          const more = items.length > 3 ? ` +${items.length - 3} more` : '';
          return prefix + displayItems + more;
        }

      default:
        return prefix + String(value || '');
    }
  }

  private normalizeOptions<T>(options: FieldOption<T>[] | T[]): FieldOption<T>[] {
    return options.map(opt => {
      if (typeof opt === 'object' && opt !== null && 'value' in opt) {
        return opt as FieldOption<T>;
      }
      return { value: opt as T, label: String(opt) };
    });
  }

  private navigateField(direction: number): void {
    const state = this.state.getState() as FormState;
    const newIndex = state.currentFieldIndex + direction;

    if (newIndex >= 0 && newIndex < this.visibleFields.length) {
      // Mark current field as touched when leaving
      const currentField = this.visibleFields[state.currentFieldIndex];
      if (currentField) {
        this.state.setState({
          ...state,
          touched: { ...state.touched, [currentField.name]: true },
          currentFieldIndex: newIndex
        });

        // Validate on blur if enabled
        if (this.config.validateOnBlur) {
          this.validateField(currentField.name);
        }
      }
    } else if (this.steps && newIndex >= this.visibleFields.length && state.currentStepIndex < this.steps.length - 1) {
      // Move to next step
      this.navigateStep(1);
    } else if (this.steps && newIndex < 0 && state.currentStepIndex > 0) {
      // Move to previous step
      this.navigateStep(-1);
    }
  }

  private navigateStep(direction: number): void {
    if (!this.steps) return;

    const state = this.state.getState() as FormState;
    const newStepIndex = state.currentStepIndex + direction;

    if (newStepIndex >= 0 && newStepIndex < this.steps.length) {
      this.state.setState({
        ...state,
        currentStepIndex: newStepIndex,
        currentFieldIndex: 0
      });
      this.updateVisibleFields();
    }
  }

  private async updateFieldValue(fieldName: string, value: any): Promise<void> {
    const state = this.state.getState() as FormState;

    this.state.setState({
      ...state,
      values: { ...state.values, [fieldName]: value }
    });

    // Update dependent fields visibility
    this.updateVisibleFields();

    // Validate if needed
    if (this.config.validateOnBlur) {
      await this.validateField(fieldName);
    }
  }

  private updateVisibleFields(): void {
    const state = this.state.getState() as FormState;

    let fields: FormField[];
    if (this.steps) {
      const step = this.steps[state.currentStepIndex];
      fields = step ? step.fields : [];
    } else {
      fields = this.fields;
    }

    // Filter fields based on show conditions
    this.visibleFields = fields.filter(field => {
      if (field.show) {
        return field.show(state.values);
      }
      return true;
    });
  }

  private async validateField(fieldName: string): Promise<boolean> {
    const state = this.state.getState() as FormState;
    const field = this.fields.find(f => f.name === fieldName);

    if (!field) return true;

    const value = state.values[fieldName];
    let error: string | undefined;

    // Required validation
    if (field.required && !value) {
      error = `${field.label} is required`;
    }

    // Type-specific validation
    if (!error) {
      switch (field.type) {
        case 'text':
          error = this.validateTextField(field as TextField, value);
          break;

        case 'number':
          error = this.validateNumberField(field as NumberField, value);
          break;

        case 'multiselect':
          error = this.validateMultiSelectField(field as MultiSelectField, value);
          break;
      }
    }

    // Custom validation
    if (!error && field.validate) {
      const validateFn = field.validate as (value: any, formData: any) => string | undefined | Promise<string | undefined>;
      error = await validateFn(value, state.values);
    }

    this.state.setState({
      ...state,
      errors: { ...state.errors, [fieldName]: error || '' }
    });

    return !error;
  }

  private validateTextField(field: TextField, value: string): string | undefined {
    if (field.minLength && (!value || value.length < field.minLength)) {
      return `Minimum length is ${field.minLength}`;
    }

    if (field.maxLength && value && value.length > field.maxLength) {
      return `Maximum length is ${field.maxLength}`;
    }

    if (field.pattern && value && !field.pattern.test(value)) {
      return `Invalid format`;
    }

    return undefined;
  }

  private validateNumberField(field: NumberField, value: number): string | undefined {
    if (field.min !== undefined && value < field.min) {
      return `Minimum value is ${field.min}`;
    }

    if (field.max !== undefined && value > field.max) {
      return `Maximum value is ${field.max}`;
    }

    return undefined;
  }

  private validateMultiSelectField(field: MultiSelectField, value: any[]): string | undefined {
    const count = value?.length || 0;

    if (field.min !== undefined && count < field.min) {
      return `Select at least ${field.min} items`;
    }

    if (field.max !== undefined && count > field.max) {
      return `Select at most ${field.max} items`;
    }

    return undefined;
  }

  private async validateForm(): Promise<boolean> {
    const validations = await Promise.all(
      this.fields.map(field => this.validateField(field.name))
    );

    return validations.every(valid => valid);
  }

  private async submitForm(): Promise<void> {
    const state = this.state.getState() as FormState;

    // Mark all fields as touched
    const touched: Record<string, boolean> = {};
    this.fields.forEach(field => {
      touched[field.name] = true;
    });

    this.state.setState({ ...state, touched, isSubmitting: true });

    // Validate all fields
    const isValid = await this.validateForm();

    if (isValid) {
      await this.submit(state.values);
    } else {
      this.state.setState({ ...state, isSubmitting: false });
    }
  }

  private getDefaultValue(field: FormField): any {
    switch (field.type) {
      case 'text':
      case 'password':
        return '';
      case 'number':
        return 0;
      case 'confirm':
        return false;
      case 'select':
        return undefined;
      case 'multiselect':
        return [];
      case 'list':
        return [];
      default:
        return undefined;
    }
  }

  protected override formatValue(value: Record<string, any>): string {
    return `Form submitted with ${Object.keys(value).length} fields`;
  }
}
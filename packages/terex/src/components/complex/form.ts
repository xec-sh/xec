/**
 * Form component for Terex
 * Provides comprehensive form handling with validation, field dependencies, and state management
 */

import { StyleBuilder } from '../../core/color.js';
import { Select, type SelectOptions } from '../input/select.js';
import { TextInput, type TextInputOptions } from '../input/text-input.js';
import { BaseComponent, type ComponentEventMap } from '../../core/component.js';

import type { Key, Output, Component } from '../../core/types.js';

// ============================================================================
// Type Definitions
// ============================================================================

export type FieldValue = string | number | boolean | null | undefined | unknown;
export type FormData = Record<string, FieldValue>;

export interface ValidationError {
  field: string;
  message: string;
}

export interface FieldValidator<T = FieldValue> {
  (value: T, formData: FormData): string | Promise<string> | null | undefined;
}

export interface CrossFieldValidator {
  (formData: FormData): ValidationError[] | Promise<ValidationError[]>;
}

export interface FieldDependency {
  field: string;
  condition: (value: FieldValue, formData: FormData) => boolean;
  action: 'show' | 'hide' | 'enable' | 'disable' | 'require';
}

export type FieldType = 'text' | 'number' | 'email' | 'password' | 'select' | 'multiselect' | 'checkbox' | 'radio' | 'textarea' | 'custom';

export interface BaseFieldDefinition {
  name: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  defaultValue?: FieldValue;
  required?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  hint?: string;
  validators?: FieldValidator[];
  dependencies?: FieldDependency[];
  tabIndex?: number;
}

export interface TextFieldDefinition extends BaseFieldDefinition {
  type: 'text' | 'email' | 'password' | 'textarea';
  options?: Partial<TextInputOptions>;
  multiline?: boolean;
  rows?: number;
}

export interface NumberFieldDefinition extends BaseFieldDefinition {
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
}

export interface SelectFieldDefinition extends BaseFieldDefinition {
  type: 'select' | 'multiselect';
  options?: SelectOptions;
  choices: Array<{ value: FieldValue; label: string; disabled?: boolean }>;
}

export interface CheckboxFieldDefinition extends BaseFieldDefinition {
  type: 'checkbox';
  checked?: boolean;
}

export interface RadioFieldDefinition extends BaseFieldDefinition {
  type: 'radio';
  choices: Array<{ value: FieldValue; label: string; disabled?: boolean }>;
}

export interface CustomFieldDefinition extends BaseFieldDefinition {
  type: 'custom';
  component: Component<unknown>;
  getValue: () => FieldValue;
  setValue: (value: FieldValue) => void;
  validate?: FieldValidator;
}

export type FieldDefinition = 
  | TextFieldDefinition 
  | NumberFieldDefinition 
  | SelectFieldDefinition 
  | CheckboxFieldDefinition 
  | RadioFieldDefinition 
  | CustomFieldDefinition;

export interface FormSection {
  title: string;
  description?: string;
  fields: FieldDefinition[];
  collapsible?: boolean;
  collapsed?: boolean;
}

export interface FormOptions {
  title?: string;
  description?: string;
  fields?: FieldDefinition[];
  sections?: FormSection[];
  crossFieldValidators?: CrossFieldValidator[];
  submitLabel?: string;
  cancelLabel?: string;
  resetLabel?: string;
  autoSave?: boolean;
  autoSaveDelay?: number;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  showProgress?: boolean;
  allowPartialSubmit?: boolean;
  confirmCancel?: boolean;
  confirmReset?: boolean;
  layout?: 'vertical' | 'horizontal' | 'inline';
  fieldSpacing?: number;
  sectionSpacing?: number;
}

export interface FormState {
  data: FormData;
  errors: Record<string, string>;
  crossFieldErrors: ValidationError[];
  touched: Set<string>;
  focused: string | null;
  submitting: boolean;
  submitted: boolean;
  dirty: boolean;
  valid: boolean;
  fieldVisibility: Record<string, boolean>;
  fieldDisabled: Record<string, boolean>;
  fieldRequired: Record<string, boolean>;
  currentFieldIndex: number;
  autoSaveTimer?: NodeJS.Timeout;
}

// ============================================================================
// Form Component
// ============================================================================

export class Form extends BaseComponent<FormState> {
  private options: Required<FormOptions>;
  private style: StyleBuilder;
  private fieldDefinitions: FieldDefinition[];
  private sections: FormSection[];
  private fieldComponents: Map<string, Component<unknown>>;
  private focusableFields: string[];

  constructor(options: FormOptions = {}) {
    const fieldDefinitions = options.fields || [];
    const sections = options.sections || [];
    
    // Combine fields from sections and direct fields
    const allFields = [
      ...fieldDefinitions,
      ...sections.flatMap(section => section.fields)
    ];

    const initialData: FormData = {};
    const initialVisibility: Record<string, boolean> = {};
    const initialDisabled: Record<string, boolean> = {};
    const initialRequired: Record<string, boolean> = {};

    // Initialize form data and field states
    allFields.forEach(field => {
      initialData[field.name] = field.defaultValue ?? Form.getDefaultValue(field.type);
      initialVisibility[field.name] = !field.hidden;
      initialDisabled[field.name] = field.disabled ?? false;
      initialRequired[field.name] = field.required ?? false;
    });

    const initialState: FormState = {
      data: initialData,
      errors: {},
      crossFieldErrors: [],
      touched: new Set(),
      focused: null,
      submitting: false,
      submitted: false,
      dirty: false,
      valid: true,
      fieldVisibility: initialVisibility,
      fieldDisabled: initialDisabled,
      fieldRequired: initialRequired,
      currentFieldIndex: 0,
      autoSaveTimer: undefined
    };

    super({ initialState });

    // Set default options
    this.options = {
      title: options.title ?? '',
      description: options.description ?? '',
      fields: options.fields ?? [],
      sections: options.sections ?? [],
      crossFieldValidators: options.crossFieldValidators ?? [],
      submitLabel: options.submitLabel ?? 'Submit',
      cancelLabel: options.cancelLabel ?? 'Cancel',
      resetLabel: options.resetLabel ?? 'Reset',
      autoSave: options.autoSave ?? false,
      autoSaveDelay: options.autoSaveDelay ?? 1000,
      validateOnChange: options.validateOnChange ?? true,
      validateOnBlur: options.validateOnBlur ?? true,
      showProgress: options.showProgress ?? false,
      allowPartialSubmit: options.allowPartialSubmit ?? false,
      confirmCancel: options.confirmCancel ?? false,
      confirmReset: options.confirmReset ?? false,
      layout: options.layout ?? 'vertical',
      fieldSpacing: options.fieldSpacing ?? 1,
      sectionSpacing: options.sectionSpacing ?? 2
    };

    this.style = new StyleBuilder();
    this.fieldDefinitions = allFields;
    this.sections = sections;
    this.fieldComponents = new Map();
    this.focusableFields = this.calculateFocusableFields();

    // Create field components
    this.createFieldComponents();

    // Apply initial dependencies
    this.applyDependencies();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private static getDefaultValue(type: FieldType): FieldValue {
    switch (type) {
      case 'text':
      case 'email':
      case 'password':
      case 'textarea':
        return '';
      case 'number':
        return 0;
      case 'checkbox':
        return false;
      case 'select':
      case 'radio':
        return null;
      case 'multiselect':
        return [];
      default:
        return null;
    }
  }

  private createFieldComponents(): void {
    for (const field of this.fieldDefinitions) {
      let component: Component<unknown>;

      switch (field.type) {
        case 'text':
        case 'email':
        case 'password':
        case 'textarea': {
          const textField = field as TextFieldDefinition;
          component = new TextInput({
            placeholder: textField.placeholder,
            defaultValue: String(textField.defaultValue || ''),
            multiline: textField.multiline || textField.type === 'textarea',
            mask: textField.type === 'password' ? '*' : undefined,
            ...textField.options
          });
          break;
        }

        case 'select': {
          const selectField = field as SelectFieldDefinition;
          component = new Select({
            placeholder: selectField.placeholder,
            defaultValue: selectField.defaultValue,
            options: selectField.choices.map(choice => ({
              value: choice.value,
              label: choice.label,
              disabled: choice.disabled
            })),
            ...selectField.options
          });
          break;
        }

        case 'custom': {
          const customField = field as CustomFieldDefinition;
          component = customField.component;
          break;
        }

        default:
          // For now, create a text input for unsupported types
          component = new TextInput({
            placeholder: field.placeholder,
            defaultValue: String(field.defaultValue || '')
          });
      }

      // Set up field event handlers
      this.setupFieldEventHandlers(field, component);
      this.fieldComponents.set(field.name, component);
    }
  }

  private setupFieldEventHandlers(field: FieldDefinition, component: Component<unknown>): void {
    // Handle value changes
    if ('on' in component && typeof component.on === 'function') {
      component.on('change', (value: FieldValue) => {
        this.handleFieldChange(field.name, value);
      });

      component.on('blur', () => {
        this.handleFieldBlur(field.name);
      });

      component.on('focus', () => {
        this.handleFieldFocus(field.name);
      });

      component.on('tab', (reverse: boolean) => {
        this.handleTabNavigation(field.name, reverse);
      });
    }
  }

  private calculateFocusableFields(): string[] {
    return this.fieldDefinitions
      .filter(field => !field.disabled && !field.hidden)
      .sort((a, b) => (a.tabIndex ?? 0) - (b.tabIndex ?? 0))
      .map(field => field.name);
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  render(): Output {
    const lines: string[] = [];
    const { errors, crossFieldErrors, submitting, valid, focused } = this.state;

    // Render title
    if (this.options.title) {
      lines.push(this.style.bold().text(this.options.title));
      lines.push('');
    }

    // Render description
    if (this.options.description) {
      lines.push(this.style.dim().text(this.options.description));
      lines.push('');
    }

    // Render progress if enabled
    if (this.options.showProgress) {
      const progress = this.calculateProgress();
      const progressBar = this.renderProgressBar(progress);
      lines.push(progressBar);
      lines.push('');
    }

    // Render sections or fields
    if (this.sections.length > 0) {
      this.sections.forEach((section, sectionIndex) => {
        if (sectionIndex > 0) {
          // Add spacing between sections
          for (let i = 0; i < this.options.sectionSpacing; i++) {
            lines.push('');
          }
        }

        lines.push(...this.renderSection(section));
      });
    } else {
      // Render fields directly
      this.fieldDefinitions.forEach((field, fieldIndex) => {
        if (fieldIndex > 0) {
          // Add spacing between fields
          for (let i = 0; i < this.options.fieldSpacing; i++) {
            lines.push('');
          }
        }

        lines.push(...this.renderField(field));
      });
    }

    // Render cross-field errors
    if (crossFieldErrors.length > 0) {
      lines.push('');
      crossFieldErrors.forEach(error => {
        lines.push(this.style.red().text(`⚠ ${error.message}`));
      });
    }

    // Render action buttons
    lines.push('');
    lines.push(this.renderActionButtons());

    // Render form status
    if (submitting) {
      lines.push('');
      lines.push(this.style.yellow().text('⏳ Submitting...'));
    } else if (this.state.submitted) {
      lines.push('');
      lines.push(this.style.green().text('✓ Form submitted successfully'));
    }

    return {
      lines,
      cursor: focused ? this.findCursorPosition(focused) : undefined
    };
  }

  private renderSection(section: FormSection): string[] {
    const lines: string[] = [];

    // Render section title
    lines.push(this.style.bold().underline().text(section.title));

    // Render section description
    if (section.description) {
      lines.push(this.style.dim().text(section.description));
    }

    lines.push('');

    // Render section fields
    section.fields.forEach((field, fieldIndex) => {
      if (fieldIndex > 0) {
        for (let i = 0; i < this.options.fieldSpacing; i++) {
          lines.push('');
        }
      }

      lines.push(...this.renderField(field));
    });

    return lines;
  }

  private renderField(field: FieldDefinition): string[] {
    const lines: string[] = [];
    const { fieldVisibility, fieldDisabled, fieldRequired, errors, focused } = this.state;

    // Skip hidden fields
    if (!fieldVisibility[field.name]) {
      return lines;
    }

    const isFocused = focused === field.name;
    const hasError = errors[field.name];
    const isDisabled = fieldDisabled[field.name];
    const isRequired = fieldRequired[field.name];

    // Render field label
    let label = field.label;
    if (isRequired) {
      label += ' *';
    }

    if (isFocused) {
      label = this.style.cyan().bold().text(`> ${label}`);
    } else if (hasError) {
      label = this.style.red().text(label);
    } else if (isDisabled) {
      label = this.style.dim().text(label);
    } else {
      label = this.style.text(label);
    }

    lines.push(label);

    // Render field component
    const component = this.fieldComponents.get(field.name);
    if (component) {
      const fieldOutput = component.render();
      if ('lines' in fieldOutput) {
        lines.push(...fieldOutput.lines);
      }
    }

    // Render field hint
    if (field.hint) {
      lines.push(this.style.dim().text(`  ${field.hint}`));
    }

    // Render field error
    if (hasError) {
      lines.push(this.style.red().text(`  ⚠ ${hasError}`));
    }

    return lines;
  }

  private renderActionButtons(): string {
    const buttons: string[] = [];
    const { submitting, dirty, valid } = this.state;

    // Submit button
    let submitButton = this.options.submitLabel;
    if (!valid && !this.options.allowPartialSubmit) {
      submitButton = this.style.dim().text(submitButton);
    } else if (submitting) {
      submitButton = this.style.yellow().text('⏳ ' + submitButton);
    } else {
      submitButton = this.style.green().bold().text(submitButton);
    }
    buttons.push(submitButton);

    // Cancel button
    buttons.push(this.style.red().text(this.options.cancelLabel));

    // Reset button (only show if form is dirty)
    if (dirty) {
      buttons.push(this.style.yellow().text(this.options.resetLabel));
    }

    return buttons.join('  ');
  }

  private renderProgressBar(progress: number): string {
    const width = 30;
    const filled = Math.round(width * progress);
    const empty = width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const percentage = Math.round(progress * 100);

    return this.style.cyan().text(`Progress: [${bar}] ${percentage}%`);
  }

  private calculateProgress(): number {
    const totalFields = this.fieldDefinitions.length;
    const completedFields = this.fieldDefinitions.filter(field => {
      const value = this.state.data[field.name];
      return value !== null && value !== undefined && value !== '';
    }).length;

    return totalFields > 0 ? completedFields / totalFields : 0;
  }

  private findCursorPosition(fieldName: string): { x: number; y: number } | undefined {
    // This would need to be implemented based on the actual rendered output
    // For now, return a default position
    return { x: 0, y: 0 };
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  override handleKeypress(key: Key): boolean {
    if (this.state.submitting) {
      return false;
    }

    let handled = false;

    switch (key.name) {
      case 'tab':
        this.navigateFields(key.shift ? -1 : 1);
        handled = true;
        break;

      case 'return':
      case 'enter':
        if (key.ctrl) {
          this.handleSubmit();
          handled = true;
        } else {
          // Pass to focused field
          handled = this.passTofocusedField(key);
        }
        break;

      case 'escape':
        this.handleCancel();
        handled = true;
        break;

      case 'f5':
        if (key.ctrl) {
          this.handleReset();
          handled = true;
        }
        break;

      default:
        // Pass other keys to focused field
        handled = this.passTofocusedField(key);
    }

    // Call parent handler if not handled
    if (!handled) {
      handled = super.handleKeypress(key);
    }

    return handled;
  }

  private passTofocusedField(key: Key): boolean {
    const { focused } = this.state;
    if (!focused) return false;

    const component = this.fieldComponents.get(focused);
    if (component && 'handleKeypress' in component && typeof component.handleKeypress === 'function') {
      const handler = component.handleKeypress as (key: Key) => boolean | void;
      const result = handler(key);
      return result === true;
    }
    
    return false;
  }

  private navigateFields(direction: number): void {
    const currentIndex = this.state.currentFieldIndex;
    const newIndex = Math.max(0, Math.min(this.focusableFields.length - 1, currentIndex + direction));
    
    if (newIndex !== currentIndex) {
      this.setState({ currentFieldIndex: newIndex });
      const fieldName = this.focusableFields[newIndex];
      if (fieldName) {
        this.focusField(fieldName);
      }
    }
  }

  private focusField(fieldName: string): void {
    // Blur current field
    if (this.state.focused && this.state.focused !== fieldName) {
      const currentComponent = this.fieldComponents.get(this.state.focused);
      if (currentComponent && 'blur' in currentComponent && typeof currentComponent.blur === 'function') {
        currentComponent.blur();
      }
    }

    // Focus new field
    const component = this.fieldComponents.get(fieldName);
    if (component && 'focus' in component && typeof component.focus === 'function') {
      component.focus();
    }

    this.setState({ focused: fieldName });
  }

  // ============================================================================
  // Field Event Handlers
  // ============================================================================

  private async handleFieldChange(fieldName: string, value: FieldValue): Promise<void> {
    const oldData = this.state.data;
    const newData = { ...oldData, [fieldName]: value };

    this.setState({
      data: newData,
      dirty: true,
      touched: new Set([...this.state.touched, fieldName])
    });

    // Apply dependencies
    this.applyDependencies();

    // Validate on change if enabled
    if (this.options.validateOnChange) {
      await this.validateField(fieldName, value, newData);
    }

    // Auto-save if enabled
    if (this.options.autoSave) {
      this.scheduleAutoSave();
    }

    // Emit change event
    this.events.emit('fieldChange', fieldName, value, newData);
    this.events.emit('change', newData);
  }

  private async handleFieldBlur(fieldName: string): Promise<void> {
    this.setState({
      touched: new Set([...this.state.touched, fieldName])
    });

    // Validate on blur if enabled
    if (this.options.validateOnBlur) {
      const value = this.state.data[fieldName];
      await this.validateField(fieldName, value, this.state.data);
    }

    this.events.emit('fieldBlur', fieldName);
  }

  private handleFieldFocus(fieldName: string): void {
    this.setState({ focused: fieldName });
    this.events.emit('fieldFocus', fieldName);
  }

  private handleTabNavigation(fieldName: string, reverse: boolean): void {
    const currentIndex = this.focusableFields.indexOf(fieldName);
    if (currentIndex !== -1) {
      this.setState({ currentFieldIndex: currentIndex });
      this.navigateFields(reverse ? -1 : 1);
    }
  }

  // ============================================================================
  // Validation
  // ============================================================================

  private async validateField(fieldName: string, value: FieldValue, formData: FormData): Promise<boolean> {
    const field = this.fieldDefinitions.find(f => f.name === fieldName);
    if (!field) return true;

    // Clear existing error
    const newErrors = { ...this.state.errors };
    delete newErrors[fieldName];

    // Check required validation
    if (this.state.fieldRequired[fieldName] && this.isEmpty(value)) {
      newErrors[fieldName] = `${field.label} is required`;
      this.setState({ errors: newErrors });
      return false;
    }

    // Skip validation if field is empty and not required
    if (this.isEmpty(value) && !this.state.fieldRequired[fieldName]) {
      this.setState({ errors: newErrors });
      return true;
    }

    // Type-specific validation
    const typeValidationError = await this.validateFieldType(field, value);
    if (typeValidationError) {
      newErrors[fieldName] = typeValidationError;
      this.setState({ errors: newErrors });
      return false;
    }

    // Custom validators
    if (field.validators) {
      for (const validator of field.validators) {
        try {
          const error = await validator(value, formData);
          if (error) {
            newErrors[fieldName] = error;
            this.setState({ errors: newErrors });
            return false;
          }
        } catch (err) {
          newErrors[fieldName] = err instanceof Error ? err.message : 'Validation failed';
          this.setState({ errors: newErrors });
          return false;
        }
      }
    }

    this.setState({ errors: newErrors });
    return true;
  }

  private async validateFieldType(field: FieldDefinition, value: FieldValue): Promise<string | null> {
    switch (field.type) {
      case 'email':
        if (typeof value === 'string' && !this.isValidEmail(value)) {
          return 'Please enter a valid email address';
        }
        break;

      case 'number': {
        const numField = field as NumberFieldDefinition;
        const numValue = Number(value);
        
        if (isNaN(numValue)) {
          return 'Please enter a valid number';
        }
        
        if (numField.integer && !Number.isInteger(numValue)) {
          return 'Please enter a whole number';
        }
        
        if (numField.min !== undefined && numValue < numField.min) {
          return `Value must be at least ${numField.min}`;
        }
        
        if (numField.max !== undefined && numValue > numField.max) {
          return `Value must be at most ${numField.max}`;
        }
        break;
      }

      case 'custom': {
        const customField = field as CustomFieldDefinition;
        if (customField.validate) {
          const error = await customField.validate(value, this.state.data);
          if (error) return error;
        }
        break;
      }
    }

    return null;
  }

  private async validateForm(): Promise<boolean> {
    const errors: Record<string, string> = {};
    let isValid = true;

    // Validate individual fields
    for (const field of this.fieldDefinitions) {
      const value = this.state.data[field.name];
      const fieldIsValid = await this.validateField(field.name, value, this.state.data);
      if (!fieldIsValid) {
        isValid = false;
      }
    }

    // Validate cross-field rules
    const crossFieldErrors: ValidationError[] = [];
    for (const validator of this.options.crossFieldValidators) {
      try {
        const validationErrors = await validator(this.state.data);
        crossFieldErrors.push(...validationErrors);
        if (validationErrors.length > 0) {
          isValid = false;
        }
      } catch (err) {
        crossFieldErrors.push({
          field: '',
          message: err instanceof Error ? err.message : 'Validation failed'
        });
        isValid = false;
      }
    }

    this.setState({
      valid: isValid,
      crossFieldErrors
    });

    return isValid;
  }

  // ============================================================================
  // Dependencies
  // ============================================================================

  private applyDependencies(): void {
    const newVisibility = { ...this.state.fieldVisibility };
    const newDisabled = { ...this.state.fieldDisabled };
    const newRequired = { ...this.state.fieldRequired };

    for (const field of this.fieldDefinitions) {
      if (field.dependencies) {
        for (const dependency of field.dependencies) {
          const dependentValue = this.state.data[dependency.field];
          const conditionMet = dependency.condition(dependentValue, this.state.data);

          switch (dependency.action) {
            case 'show':
              newVisibility[field.name] = conditionMet;
              break;
            case 'hide':
              newVisibility[field.name] = !conditionMet;
              break;
            case 'enable':
              newDisabled[field.name] = !conditionMet;
              break;
            case 'disable':
              newDisabled[field.name] = conditionMet;
              break;
            case 'require':
              newRequired[field.name] = conditionMet;
              break;
          }
        }
      }
    }

    this.setState({
      fieldVisibility: newVisibility,
      fieldDisabled: newDisabled,
      fieldRequired: newRequired
    });

    // Update focusable fields
    this.focusableFields = this.calculateFocusableFields();
  }

  // ============================================================================
  // Auto-save
  // ============================================================================

  private scheduleAutoSave(): void {
    if (this.state.autoSaveTimer) {
      clearTimeout(this.state.autoSaveTimer);
    }

    const timer = setTimeout(() => {
      this.autoSave();
    }, this.options.autoSaveDelay);

    this.setState({ autoSaveTimer: timer });
  }

  private async autoSave(): Promise<void> {
    const isValid = await this.validateForm();
    if (isValid) {
      this.events.emit('autoSave', this.state.data);
    }
  }

  // ============================================================================
  // Form Actions
  // ============================================================================

  private async handleSubmit(): Promise<void> {
    if (this.state.submitting) return;

    this.setState({ submitting: true });

    try {
      const isValid = await this.validateForm();

      if (!isValid && !this.options.allowPartialSubmit) {
        this.setState({ submitting: false });
        return;
      }

      // Emit submit event
      this.events.emit('submit', this.state.data);

      this.setState({
        submitted: true,
        submitting: false,
        dirty: false
      });

    } catch (error) {
      this.setState({ submitting: false });
      this.events.emit('submitError', error);
    }
  }

  private handleCancel(): void {
    if (this.options.confirmCancel && this.state.dirty) {
      this.events.emit('confirmCancel');
    } else {
      this.events.emit('cancel');
    }
  }

  private handleReset(): void {
    if (this.options.confirmReset && this.state.dirty) {
      this.events.emit('confirmReset');
    } else {
      this.resetForm();
    }
  }

  private resetForm(): void {
    const initialData: FormData = {};
    
    this.fieldDefinitions.forEach(field => {
      initialData[field.name] = field.defaultValue ?? Form.getDefaultValue(field.type);
    });

    this.setState({
      data: initialData,
      errors: {},
      crossFieldErrors: [],
      touched: new Set(),
      dirty: false,
      submitted: false
    });

    // Reset field components
    for (const [fieldName, component] of this.fieldComponents) {
      const field = this.fieldDefinitions.find(f => f.name === fieldName);
      if (field && 'setValue' in component && typeof component.setValue === 'function') {
        const defaultValue = field.defaultValue ?? Form.getDefaultValue(field.type);
        component.setValue(defaultValue);
      }
    }

    this.events.emit('reset', initialData);
  }

  // ============================================================================
  // Public API
  // ============================================================================

  getData(): FormData {
    return { ...this.state.data };
  }

  setData(data: Partial<FormData>): void {
    const newData = { ...this.state.data, ...data };
    
    this.setState({
      data: newData,
      dirty: true
    });

    this.applyDependencies();
  }

  getFieldValue(fieldName: string): FieldValue {
    return this.state.data[fieldName];
  }

  async setFieldValue(fieldName: string, value: FieldValue): Promise<void> {
    await this.handleFieldChange(fieldName, value);
  }

  getErrors(): Record<string, string> {
    return { ...this.state.errors };
  }

  getCrossFieldErrors(): ValidationError[] {
    return [...this.state.crossFieldErrors];
  }

  isFieldTouched(fieldName: string): boolean {
    return this.state.touched.has(fieldName);
  }

  isFormValid(): boolean {
    return this.state.valid;
  }

  isFormDirty(): boolean {
    return this.state.dirty;
  }

  isSubmitting(): boolean {
    return this.state.submitting;
  }

  async validateFormPublic(): Promise<boolean> {
    return await this.validateForm();
  }

  focusFieldPublic(fieldName: string): void {
    this.focusField(fieldName);
  }

  resetFormPublic(): void {
    this.resetForm();
  }

  /**
   * Get all field definitions
   */
  get fields(): FieldDefinition[] {
    return this.fieldDefinitions;
  }

  /**
   * Submit the form (alias for handleSubmit)
   */
  submit(): Promise<void> {
    return this.handleSubmit();
  }

  /**
   * Navigate to the next section
   */
  nextSection(): void {
    // For now, just move to next field
    this.navigateFields(1);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private isEmpty(value: FieldValue): boolean {
    return value === null || value === undefined || value === '' || 
           (Array.isArray(value) && value.length === 0);
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  override async unmount(): Promise<void> {
    // Clear auto-save timer
    if (this.state.autoSaveTimer) {
      clearTimeout(this.state.autoSaveTimer);
    }

    // Unmount field components
    for (const component of this.fieldComponents.values()) {
      if ('unmount' in component && typeof component.unmount === 'function') {
        await component.unmount();
      }
    }

    await super.unmount();
  }

  // Helper method for event emission
  public override emit<K extends keyof ComponentEventMap>(
    event: K, 
    ...args: ComponentEventMap[K]
  ): void {
    this.events.emit(event, ...args);
  }
}
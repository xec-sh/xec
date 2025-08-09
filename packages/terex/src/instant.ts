/**
 * Type-safe Layer 1: Instant API for Terex
 * Fully type-safe implementation without need for .d.ts files
 * Uses advanced TypeScript features for automatic type inference
 * 
 * @packageDocumentation
 */

import { BaseComponent } from './core/component.js';
import { Box } from './components/containers/box.js';
import { RenderEngine } from './core/render-engine.js';
import { Text } from './components/primitives/text.js';
import { Flex } from './components/containers/flex.js';
import { Select, type SelectOptions } from './components/input/select.js';
import { Form, type FieldDefinition } from './components/complex/form.js';
import { TextInput, type TextInputOptions } from './components/input/text-input.js';
import { NumberInput, type NumberInputOptions } from './components/input/number-input.js';

import type { Component, ColorMode } from './core/types.js';

// ============================================================================
// Core Type System with Full Type Safety
// ============================================================================

/**
 * Builder state tracking for compile-time validation
 */
interface BuilderState {
  readonly required: boolean;
  readonly validated: boolean;
}

/**
 * Fluent builder base interface with phantom types
 */
interface FluentBuilder<T, State extends BuilderState = { required: false; validated: false }> {
  readonly _phantom?: State;
  prompt(): Promise<T | null>;
}

/**
 * Text builder with compile-time state tracking
 */
interface TextBuilder<State extends BuilderState = { required: false; validated: false }>
  extends FluentBuilder<string, State> {
  placeholder<This extends this>(this: This, value: string): This;
  defaultValue<This extends this>(this: This, value: string): This;
  required<This extends this>(this: This): TextBuilder<{ required: true; validated: State['validated'] }>;
  minLength<This extends this>(this: This, length: number): This;
  maxLength<This extends this>(this: This, length: number): This;
  pattern<This extends this>(this: This, regex: RegExp): This;
  validate<This extends this>(
    this: This,
    fn: string | ((value: string) => string | undefined | Promise<string | undefined>)
  ): TextBuilder<{ required: State['required']; validated: true }>;
  transform<This extends this>(this: This, fn: (value: string) => string): This;
  format<This extends this>(this: This, fn: (value: string) => string): This;
  mask<This extends this>(this: This, char: string | ((char: string) => string)): This;
  cursorStyle<This extends this>(this: This, style: 'block' | 'underline' | 'bar'): This;
  showCursor<This extends this>(this: This, show: boolean): This;
}

/**
 * Number builder with type-safe constraints
 */
interface NumberBuilder<State extends BuilderState = { required: false; validated: false }>
  extends FluentBuilder<number, State> {
  min<This extends this>(this: This, value: number): This;
  max<This extends this>(this: This, value: number): This;
  step<This extends this>(this: This, value: number): This;
  decimals<This extends this>(this: This, places: number): This;
  defaultValue<This extends this>(this: This, value: number): This;
  required<This extends this>(this: This): NumberBuilder<{ required: true; validated: State['validated'] }>;
  validate<This extends this>(
    this: This,
    fn: (value: number) => string | undefined | Promise<string | undefined>
  ): NumberBuilder<{ required: State['required']; validated: true }>;
  format<This extends this>(this: This, fn: (value: number) => string): This;
  cursorStyle<This extends this>(this: This, style: 'block' | 'underline' | 'bar'): This;
  showCursor<This extends this>(this: This, show: boolean): This;
}

/**
 * Select builder with generic type inference
 */
interface SelectBuilder<T, State extends BuilderState = { required: false; validated: false }>
  extends FluentBuilder<T, State> {
  defaultValue<This extends this>(this: This, value: T): This;
  required<This extends this>(this: This): SelectBuilder<T, { required: true; validated: State['validated'] }>;
  searchable<This extends this>(this: This): This;
  clearable<This extends this>(this: This): This;
  placeholder<This extends this>(this: This, text: string): This;
  maxDisplay<This extends this>(this: This, count: number): This;
}

/**
 * Confirm builder with boolean result
 */
interface ConfirmBuilder extends FluentBuilder<boolean> {
  defaultValue<This extends this>(this: This, value: boolean): This;
  yesText<This extends this>(this: This, text: string): This;
  noText<This extends this>(this: This, text: string): This;
}

/**
 * Type-safe form field types
 */
type FormFieldType =
  | TextBuilder<any>
  | NumberBuilder<any>
  | SelectBuilder<any, any>
  | ConfirmBuilder;

/**
 * Form schema with proper typing
 */
type FormSchema = Record<string, FormFieldType>;

/**
 * Extract result type from form field with type guards
 */
type ExtractFieldType<T> =
  T extends TextBuilder<any> ? string :
  T extends NumberBuilder<any> ? number :
  T extends SelectBuilder<infer U, any> ? U :
  T extends ConfirmBuilder ? boolean :
  never;

/**
 * Form result type with automatic inference
 */
type FormResult<T extends FormSchema> = {
  readonly [K in keyof T]: ExtractFieldType<T[K]>;
};

// ============================================================================
// Implementation Classes with Full Type Safety
// ============================================================================

class TextBuilderImpl<State extends BuilderState = { required: false; validated: false }>
  implements TextBuilder<State> {

  private readonly options: TextInputOptions = {};
  private readonly message: string;
  readonly _phantom?: State;

  constructor(message: string, options: TextInputOptions = {}) {
    this.message = message;
    this.options = { ...options };
  }

  placeholder<This extends this>(this: This, value: string): This {
    this.options.placeholder = value;
    return this;
  }

  defaultValue<This extends this>(this: This, value: string): This {
    this.options.defaultValue = value;
    return this;
  }

  required<This extends this>(this: This): TextBuilder<{ required: true; validated: State['validated'] }> {
    const prevValidate = this.options.validate;
    this.options.validate = async (value: string) => {
      if (!value || value.trim() === '') return 'This field is required';
      if (prevValidate) return prevValidate(value);
      return undefined;
    };
    return this as any;
  }

  minLength<This extends this>(this: This, length: number): This {
    this.options.minLength = length;
    const prevValidate = this.options.validate;
    this.options.validate = async (value: string) => {
      if (value.length < length) return `Minimum length is ${length}`;
      if (prevValidate) return prevValidate(value);
      return undefined;
    };
    return this;
  }

  maxLength<This extends this>(this: This, length: number): This {
    this.options.maxLength = length;
    return this;
  }

  pattern<This extends this>(this: This, regex: RegExp): This {
    this.options.pattern = regex;
    const prevValidate = this.options.validate;
    this.options.validate = async (value: string) => {
      if (!regex.test(value)) return 'Invalid format';
      if (prevValidate) return prevValidate(value);
      return undefined;
    };
    return this;
  }

  validate<This extends this>(
    this: This,
    fn: string | ((value: string) => string | undefined | Promise<string | undefined>)
  ): TextBuilder<{ required: State['required']; validated: true }> {
    if (typeof fn === 'string') {
      const prevValidate = this.options.validate;
      this.options.validate = async (value: string) => {
        if (!value.includes(fn)) return `Must contain "${fn}"`;
        if (prevValidate) return prevValidate(value);
        return undefined;
      };
    } else {
      this.options.validate = fn;
    }
    return this as any;
  }

  transform<This extends this>(this: This, fn: (value: string) => string): This {
    this.options.transform = fn;
    return this;
  }

  format<This extends this>(this: This, fn: (value: string) => string): This {
    this.options.format = fn;
    return this;
  }

  mask<This extends this>(this: This, char: string | ((char: string) => string)): This {
    this.options.mask = char;
    return this;
  }

  cursorStyle<This extends this>(this: This, style: 'block' | 'underline' | 'bar'): This {
    this.options.cursorStyle = style;
    return this;
  }

  showCursor<This extends this>(this: This, show: boolean): This {
    this.options.showCursor = show;
    return this;
  }

  async prompt(): Promise<string | null> {
    const component = new TextInput(this.options);
    // Detect the actual color mode from environment
    let colorMode: ColorMode = 'none';
    if (process.stdout.isTTY) {
      if (process.env['COLORTERM'] === 'truecolor' || process.env['COLORTERM'] === '24bit') {
        colorMode = 'truecolor';
      } else if (process.env['TERM']?.includes('256color')) {
        colorMode = '256';
      } else if (process.env['TERM'] && !process.env['NO_COLOR']) {
        colorMode = '16';
      } else {
        colorMode = '16'; // Basic ANSI colors for TTY
      }
    }
    
    const engine = new RenderEngine({
      input: process.stdin,
      output: process.stdout,
      isTTY: process.stdout.isTTY ?? false,
      colorMode,
    }, {
      enhancedInput: true, // Enable keyboard input handling
      mode: 'inline' // Use inline mode for prompts
    });

    // Create a flex container that shrinks to content
    const wrapper = new Flex({
      direction: 'row',
      gap: 1,
      children: [
        new Text({ content: this.message }),
        component
      ] as unknown as Component[]
    });

    // Set component to use minimal height
    if (component instanceof BaseComponent) {
      component.setDimensions(process.stdout.columns ?? 80, 1);
    }

    await engine.start(wrapper);

    // Set focus on the input component so it can receive keyboard events
    if (component instanceof BaseComponent) {
      component.focus();
    }

    return new Promise<string | null>((resolve, reject) => {
      const submitHandler = (value: unknown) => {
        engine.stop();
        resolve(value as string);
      };

      const cancelHandler = () => {
        engine.stop();
        resolve(null);
        // reject(new Error('Cancelled'));
      };

      component.on('submit', submitHandler);
      component.on('cancel', cancelHandler);
    });
  }
}

class NumberBuilderImpl<State extends BuilderState = { required: false; validated: false }>
  implements NumberBuilder<State> {

  private readonly options: NumberInputOptions = {};
  private readonly message: string;
  readonly _phantom?: State;

  constructor(message: string, options: NumberInputOptions = {}) {
    this.message = message;
    this.options = { ...options };
  }

  min<This extends this>(this: This, value: number): This {
    this.options.min = value;
    return this;
  }

  max<This extends this>(this: This, value: number): This {
    this.options.max = value;
    return this;
  }

  step<This extends this>(this: This, value: number): This {
    this.options.step = value;
    return this;
  }

  decimals<This extends this>(this: This, places: number): This {
    this.options.precision = places;
    return this;
  }

  defaultValue<This extends this>(this: This, value: number): This {
    this.options.defaultValue = value;
    return this;
  }

  required<This extends this>(this: This): NumberBuilder<{ required: true; validated: State['validated'] }> {
    const prevValidate = this.options.validate;
    this.options.validate = async (value: number) => {
      if (value === null || value === undefined || isNaN(value))
        return 'This field is required';
      if (prevValidate) return prevValidate(value);
      return undefined;
    };
    return this as any;
  }

  validate<This extends this>(
    this: This,
    fn: (value: number) => string | undefined | Promise<string | undefined>
  ): NumberBuilder<{ required: State['required']; validated: true }> {
    this.options.validate = fn;
    return this as any;
  }

  format<This extends this>(this: This, fn: (value: number) => string): This {
    this.options.format = fn;
    return this;
  }

  cursorStyle<This extends this>(this: This, style: 'block' | 'underline' | 'bar'): This {
    this.options.cursorStyle = style;
    return this;
  }

  showCursor<This extends this>(this: This, show: boolean): This {
    this.options.showCursor = show;
    return this;
  }

  async prompt(): Promise<number | null> {
    const component = new NumberInput(this.options);
    // Detect the actual color mode from environment
    let colorMode: ColorMode = 'none';
    if (process.stdout.isTTY) {
      if (process.env['COLORTERM'] === 'truecolor' || process.env['COLORTERM'] === '24bit') {
        colorMode = 'truecolor';
      } else if (process.env['TERM']?.includes('256color')) {
        colorMode = '256';
      } else if (process.env['TERM'] && !process.env['NO_COLOR']) {
        colorMode = '16';
      } else {
        colorMode = '16'; // Basic ANSI colors for TTY
      }
    }
    
    const engine = new RenderEngine({
      input: process.stdin,
      output: process.stdout,
      isTTY: process.stdout.isTTY ?? false,
      colorMode
    }, {
      enhancedInput: true, // Enable keyboard input handling
      mode: 'inline' // Use inline mode for prompts
    });

    // Create a flex container that shrinks to content
    const wrapper = new Flex({
      direction: 'row',
      gap: 1,
      children: [
        new Text({ content: this.message }),
        component
      ] as unknown as Component[]
    });

    // Set component to use minimal height
    if (component instanceof BaseComponent) {
      component.setDimensions(process.stdout.columns ?? 80, 1);
    }

    await engine.start(wrapper);

    // Set focus on the input component so it can receive keyboard events
    if (component instanceof BaseComponent) {
      component.focus();
    }

    return new Promise<number | null>((resolve, reject) => {
      const submitHandler = (value: unknown) => {
        engine.stop();
        resolve(value as number);
      };

      const cancelHandler = () => {
        engine.stop();
        resolve(null);
        // reject(new Error('Cancelled'));
      };

      component.on('submit', submitHandler);
      component.on('cancel', cancelHandler);
    });
  }
}

class SelectBuilderImpl<T, State extends BuilderState = { required: false; validated: false }>
  implements SelectBuilder<T, State> {

  private readonly options: Partial<SelectOptions<T>> = {};
  private readonly message: string;
  private readonly items: T[];
  readonly _phantom?: State;

  constructor(message: string, items: T[], options: Partial<SelectOptions<T>> = {}) {
    this.message = message;
    this.items = items;
    this.options = { ...options };
  }

  defaultValue<This extends this>(this: This, value: T): This {
    this.options.defaultValue = value;
    return this;
  }

  required<This extends this>(this: This): SelectBuilder<T, { required: true; validated: State['validated'] }> {
    return this as any;
  }

  searchable<This extends this>(this: This): This {
    this.options.filter = true;
    return this;
  }

  clearable<This extends this>(this: This): This {
    this.options.clearable = true;
    return this;
  }

  placeholder<This extends this>(this: This, text: string): This {
    this.options.placeholder = text;
    return this;
  }

  maxDisplay<This extends this>(this: This, count: number): This {
    this.options.limit = count;
    return this;
  }

  async prompt(): Promise<T | null> {
    const component = new Select<T>({
      options: this.items,
      ...this.options
    });

    // Detect the actual color mode from environment
    let colorMode: ColorMode = 'none';
    if (process.stdout.isTTY) {
      if (process.env['COLORTERM'] === 'truecolor' || process.env['COLORTERM'] === '24bit') {
        colorMode = 'truecolor';
      } else if (process.env['TERM']?.includes('256color')) {
        colorMode = '256';
      } else if (process.env['TERM'] && !process.env['NO_COLOR']) {
        colorMode = '16';
      } else {
        colorMode = '16'; // Basic ANSI colors for TTY
      }
    }

    const engine = new RenderEngine({
      input: process.stdin,
      output: process.stdout,
      isTTY: process.stdout.isTTY ?? false,
      colorMode
    }, {
      enhancedInput: true, // Enable keyboard input handling
      mode: 'inline' // Use inline mode for prompts
    });

    // Create a flex container that shrinks to content
    const wrapper = new Flex({
      direction: 'column',
      gap: 0,
      children: [
        new Text({ content: this.message }),
        component
      ] as unknown as Component[]
    });

    // Set component to use minimal height (limit items shown to 10 or options length)
    if (component instanceof BaseComponent) {
      const maxHeight = Math.min(10, this.items.length) + 2; // +2 for borders/padding
      component.setDimensions(process.stdout.columns ?? 80, maxHeight);
    }

    await engine.start(wrapper);

    // Set focus on the select component so it can receive keyboard events
    if (component instanceof BaseComponent) {
      component.focus();
    }

    return new Promise<T | null>((resolve, reject) => {
      const selectHandler = (value: unknown) => {
        engine.stop();
        resolve(value as T);
      };

      const cancelHandler = () => {
        engine.stop();
        resolve(null);
        // reject(new Error('Cancelled'));
      };

      component.on('select', selectHandler);
      component.on('cancel', cancelHandler);
    });
  }
}

class ConfirmBuilderImpl implements ConfirmBuilder {
  private readonly message: string;
  private _defaultValue: boolean = false;
  private _yesText: string = 'Yes';
  private _noText: string = 'No';

  constructor(message: string) {
    this.message = message;
  }

  defaultValue<This extends this>(this: This, value: boolean): This {
    this._defaultValue = value;
    return this;
  }

  yesText<This extends this>(this: This, text: string): This {
    this._yesText = text;
    return this;
  }

  noText<This extends this>(this: This, text: string): This {
    this._noText = text;
    return this;
  }

  async prompt(): Promise<boolean | null> {
    const component = new Select<boolean>({
      options: [
        { label: this._yesText, value: true },
        { label: this._noText, value: false }
      ] as any,
      defaultValue: this._defaultValue
    });

    // Detect the actual color mode from environment
    let colorMode: ColorMode = 'none';
    if (process.stdout.isTTY) {
      if (process.env['COLORTERM'] === 'truecolor' || process.env['COLORTERM'] === '24bit') {
        colorMode = 'truecolor';
      } else if (process.env['TERM']?.includes('256color')) {
        colorMode = '256';
      } else if (process.env['TERM'] && !process.env['NO_COLOR']) {
        colorMode = '16';
      } else {
        colorMode = '16'; // Basic ANSI colors for TTY
      }
    }

    const engine = new RenderEngine({
      input: process.stdin,
      output: process.stdout,
      isTTY: process.stdout.isTTY ?? false,
      colorMode
    }, {
      enhancedInput: true, // Enable keyboard input handling
      mode: 'inline' // Use inline mode for prompts
    });

    // Create a flex container that shrinks to content
    const wrapper = new Flex({
      direction: 'row',
      gap: 1,
      children: [
        new Text({ content: this.message }),
        component
      ] as unknown as Component[]
    });

    // Set component to use minimal height (2 options + padding)
    if (component instanceof BaseComponent) {
      component.setDimensions(process.stdout.columns ?? 80, 4);
    }

    await engine.start(wrapper);

    // Set focus on the select component so it can receive keyboard events
    if (component instanceof BaseComponent) {
      component.focus();
    }

    return new Promise<boolean | null>((resolve, reject) => {
      const selectHandler = (value: unknown) => {
        engine.stop();
        resolve(value as boolean);
      };

      const cancelHandler = () => {
        engine.stop();
        resolve(null);
        // reject(new Error('Cancelled'));
      };

      component.on('select', selectHandler);
      component.on('cancel', cancelHandler);
    });
  }
}

// ============================================================================
// Type-Safe Tx Object with Interface Merging
// ============================================================================

/**
 * Main tx interface with all methods
 */
interface TxInterface {
  /**
   * Simple text prompt (callable)
   */
  (message: string): Promise<string>;

  /**
   * Text input with fluent API
   */
  text(message: string): TextBuilder;

  /**
   * Number input with fluent API
   */
  number(message: string): NumberBuilder;

  /**
   * Select with type inference
   */
  select<const T>(message: string, options: readonly T[]): SelectBuilder<T>;

  /**
   * Confirm dialog
   */
  confirm(message: string): ConfirmBuilder;

  /**
   * Form with automatic type inference
   */
  form<const T extends FormSchema>(schema: T): Promise<FormResult<T>>;

  /**
   * Create a box component
   */
  box(content: string | readonly BaseComponent[]): Box;

  /**
   * Create a flex container
   */
  flex(direction: 'row' | 'column', children: readonly BaseComponent[]): Flex;

  /**
   * Create a text component
   */
  textComponent(content: string): Text;
}

/**
 * Implementation of the tx object with full type safety
 */
class TxImpl {
  /**
   * Create the type-safe tx object
   */
  static create(): TxInterface {
    // Create the main function
    const txFunction = async (message: string): Promise<string | null> => new TextBuilderImpl(message).prompt();

    // Add methods with proper typing
    const tx = Object.assign(txFunction, {
      text(message: string): TextBuilder {
        return new TextBuilderImpl(message) as TextBuilder;
      },

      number(message: string): NumberBuilder {
        return new NumberBuilderImpl(message) as NumberBuilder;
      },

      select<const T>(message: string, options: readonly T[]): SelectBuilder<T> {
        return new SelectBuilderImpl(message, [...options]) as SelectBuilder<T>;
      },

      confirm(message: string): ConfirmBuilder {
        return new ConfirmBuilderImpl(message) as ConfirmBuilder;
      },

      async form<const T extends FormSchema>(schema: T): Promise<FormResult<T>> {
        const fields: FieldDefinition[] = [];

        // Convert schema to form fields with type safety
        for (const [key, builder] of Object.entries(schema)) {
          if (builder instanceof TextBuilderImpl) {
            const impl = builder as TextBuilderImpl<any>;
            fields.push({
              name: key,
              type: 'text',
              label: key,
              ...(impl as any).options
            });
          } else if (builder instanceof NumberBuilderImpl) {
            const impl = builder as NumberBuilderImpl<any>;
            fields.push({
              name: key,
              type: 'number',
              label: key,
              ...(impl as any).options
            });
          } else if (builder instanceof SelectBuilderImpl) {
            const impl = builder as SelectBuilderImpl<any, any>;
            fields.push({
              name: key,
              type: 'select',
              label: key,
              choices: (impl as any).items,
              ...(impl as any).options
            });
          } else if (builder instanceof ConfirmBuilderImpl) {
            const impl = builder as ConfirmBuilderImpl;
            fields.push({
              name: key,
              type: 'checkbox',
              label: key,
              defaultValue: (impl as any)._defaultValue
            });
          }
        }

        const form = new Form({ fields });
        
        // Detect the actual color mode from environment
        let colorMode: ColorMode = 'none';
        if (process.stdout.isTTY) {
          if (process.env['COLORTERM'] === 'truecolor' || process.env['COLORTERM'] === '24bit') {
            colorMode = 'truecolor';
          } else if (process.env['TERM']?.includes('256color')) {
            colorMode = '256';
          } else if (process.env['TERM'] && !process.env['NO_COLOR']) {
            colorMode = '16';
          } else {
            colorMode = '16'; // Basic ANSI colors for TTY
          }
        }
        
        const engine = new RenderEngine({
          input: process.stdin,
          output: process.stdout,
          isTTY: process.stdout.isTTY ?? false,
          colorMode
        }, {
          enhancedInput: true, // Enable keyboard input handling
          mode: 'inline' // Use inline mode for prompts
        });

        await engine.start(form);

        return new Promise<FormResult<T>>((resolve, reject) => {
          const submitHandler = (values: unknown) => {
            engine.stop();
            resolve(values as FormResult<T>);
          };

          const cancelHandler = () => {
            engine.stop();
            reject(new Error('Cancelled'));
          };

          form.on('submit', submitHandler);
          form.on('cancel', cancelHandler);
        });
      },

      box(content: string | readonly BaseComponent[]): Box {
        if (typeof content === 'string') {
          return new Box({
            children: [new Text({ content })] as unknown as Component[]
          });
        }
        return new Box({ children: [...content] as unknown as Component[] });
      },

      flex(direction: 'row' | 'column', children: readonly BaseComponent[]): Flex {
        return new Flex({
          direction,
          children: [...children] as unknown as Component[]
        });
      },

      textComponent(content: string): Text {
        return new Text({ content });
      }
    }) as TxInterface;

    return tx;
  }
}

// ============================================================================
// Export the Type-Safe tx Instance
// ============================================================================

/**
 * The main tx object with full type safety
 * No need for separate .d.ts files - all types are inferred automatically
 */
const tx: TxInterface = TxImpl.create();

// Export types for external use
export type {
  FormSchema,
  FormResult,
  TxInterface,
  TextBuilder,
  BuilderState,
  NumberBuilder,
  SelectBuilder,
  ConfirmBuilder
};

// Export the tx instance
export default tx;
export { tx };
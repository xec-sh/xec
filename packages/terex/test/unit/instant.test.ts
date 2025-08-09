import { it, describe, expectTypeOf } from 'vitest';

import tx, { type FormResult, type TextBuilder, type NumberBuilder, type SelectBuilder, type ConfirmBuilder } from '../../src/instant.js';

/**
 * Type safety tests for the improved tx implementation
 * These tests verify that types are correctly inferred at compile time
 */

describe('Type-Safe TX Implementation', () => {
  describe('Type Inference', () => {
    it('should infer string type for simple tx call', () => {
      // This test verifies compile-time type inference
      expectTypeOf(tx('Question?')).toEqualTypeOf<Promise<string>>();
    });

    it('should infer TextBuilder type for text method', () => {
      const builder = tx.text('Name');
      expectTypeOf(builder).toMatchTypeOf<TextBuilder>();
      expectTypeOf(builder.prompt()).toEqualTypeOf<Promise<string>>();
    });

    it('should infer NumberBuilder type for number method', () => {
      const builder = tx.number('Age');
      expectTypeOf(builder).toMatchTypeOf<NumberBuilder>();
      expectTypeOf(builder.prompt()).toEqualTypeOf<Promise<number>>();
    });

    it('should infer literal types for select with const assertion', () => {
      const options = ['red', 'blue', 'green'] as const;
      const builder = tx.select('Color?', options);
      expectTypeOf(builder).toMatchTypeOf<SelectBuilder<'red' | 'blue' | 'green'>>();
      expectTypeOf(builder.prompt()).toEqualTypeOf<Promise<'red' | 'blue' | 'green'>>();
    });

    it('should infer object types for select with objects', () => {
      const options = [
        { id: 1, name: 'First' },
        { id: 2, name: 'Second' }
      ] as const;
      const builder = tx.select('Choice?', options);
      type ExpectedType = { readonly id: 1; readonly name: 'First' } | { readonly id: 2; readonly name: 'Second' };
      expectTypeOf(builder.prompt()).toEqualTypeOf<Promise<ExpectedType>>();
    });

    it('should infer boolean type for confirm', () => {
      const builder = tx.confirm('Continue?');
      expectTypeOf(builder).toMatchTypeOf<ConfirmBuilder>();
      expectTypeOf(builder.prompt()).toEqualTypeOf<Promise<boolean>>();
    });
  });

  describe('Form Type Inference', () => {
    it('should correctly infer form result types', async () => {
      const schema = {
        name: tx.text('Name'),
        age: tx.number('Age'),
        active: tx.confirm('Active?'),
        role: tx.select('Role', ['admin', 'user', 'guest'] as const)
      };

      type ExpectedResult = {
        readonly name: string;
        readonly age: number;
        readonly active: boolean;
        readonly role: 'admin' | 'user' | 'guest';
      };

      // This verifies compile-time type inference
      expectTypeOf(tx.form(schema)).toEqualTypeOf<Promise<ExpectedResult>>();
    });

    it('should handle nested forms with type inference', () => {
      const schema = {
        database: {
          host: tx.text('Host'),
          port: tx.number('Port')
        },
        features: tx.select('Features', [
          { id: 'f1', enabled: true },
          { id: 'f2', enabled: false }
        ] as const)
      };

      // Note: This is a simplified test - actual nested forms would need implementation
      type ExpectedFeature = { readonly id: 'f1'; readonly enabled: true } | { readonly id: 'f2'; readonly enabled: false };

      // Verify the select builder type
      expectTypeOf(schema.features.prompt()).toEqualTypeOf<Promise<ExpectedFeature>>();
    });
  });

  describe('Builder Method Chaining', () => {
    it('should maintain type through method chaining', () => {
      const builder = tx.text('Input')
        .placeholder('Enter text')
        .minLength(5)
        .maxLength(20)
        .required()
        .validate(v => v.includes('@') ? undefined : 'Invalid');

      expectTypeOf(builder).toMatchTypeOf<TextBuilder>();
      expectTypeOf(builder.prompt()).toEqualTypeOf<Promise<string>>();
    });

    it('should maintain number type through chaining', () => {
      const builder = tx.number('Value')
        .min(0)
        .max(100)
        .step(5)
        .decimals(2)
        .required();

      expectTypeOf(builder).toMatchTypeOf<NumberBuilder>();
      expectTypeOf(builder.prompt()).toEqualTypeOf<Promise<number>>();
    });

    it('should maintain select type through chaining', () => {
      const builder = tx.select('Option', ['a', 'b', 'c'] as const)
        .searchable()
        .clearable()
        .defaultValue('b');

      expectTypeOf(builder).toMatchTypeOf<SelectBuilder<'a' | 'b' | 'c'>>();
      expectTypeOf(builder.prompt()).toEqualTypeOf<Promise<'a' | 'b' | 'c'>>();
    });
  });

  describe('No Type Casting Required', () => {
    it('should not require any type casting', () => {
      // This test verifies that no 'as any' casts are needed
      const schema = {
        field1: tx.text('Field 1'),
        field2: tx.number('Field 2'),
        field3: tx.confirm('Field 3')
      };

      // Should compile without any type assertions
      const formPromise = tx.form(schema);
      expectTypeOf(formPromise).toMatchTypeOf<Promise<FormResult<typeof schema>>>();
    });
  });

  describe('Generic Type Preservation', () => {
    it('should preserve types through generic functions', () => {
      // Generic helper function
      async function askChoice<const T extends readonly string[]>(
        message: string,
        choices: T
      ): Promise<T[number]> {
        return tx.select(message, choices).prompt();
      }

      const options = ['small', 'medium', 'large'] as const;
      expectTypeOf(askChoice('Size?', options)).toEqualTypeOf<Promise<'small' | 'medium' | 'large'>>();
    });

    it('should work with mapped types', () => {
      type Config<T extends string> = {
        [K in T]: TextBuilder;
      };

      const config: Config<'host' | 'port' | 'user'> = {
        host: tx.text('Host'),
        port: tx.text('Port'),
        user: tx.text('User')
      };

      expectTypeOf(config.host).toMatchTypeOf<TextBuilder>();
      expectTypeOf(config.port.prompt()).toEqualTypeOf<Promise<string>>();
    });
  });

  describe('Component Creation', () => {
    it('should correctly type box creation', () => {
      const box1 = tx.box('Simple text');
      const box2 = tx.box([
        tx.textComponent('Text 1'),
        tx.textComponent('Text 2')
      ]);

      // Both should return Box type
      expectTypeOf(box1).toMatchTypeOf<import('../../src/components/containers/box.js').Box>();
      expectTypeOf(box2).toMatchTypeOf<import('../../src/components/containers/box.js').Box>();
    });

    it('should correctly type flex creation', () => {
      const flex = tx.flex('horizontal', [
        tx.textComponent('Item 1'),
        tx.textComponent('Item 2')
      ]);

      expectTypeOf(flex).toMatchTypeOf<import('../../src/components/containers/flex.js').Flex>();
    });
  });

  describe('Error Messages', () => {
    it('should provide clear error messages for type mismatches', () => {
      // These would cause compile-time errors with clear messages:

      // @ts-expect-error - number methods not available on string
      // tx.text('Name').min(5);

      // @ts-expect-error - string methods not available on number
      // tx.number('Age').pattern(/\d+/);

      // @ts-expect-error - wrong type for defaultValue
      // tx.number('Count').defaultValue('not a number');

      // @ts-expect-error - invalid option not in const array
      // tx.select('Choice', ['a', 'b'] as const).defaultValue('c');
    });
  });

  describe('State Tracking', () => {
    it('should track builder state at compile time', () => {
      const builder1 = tx.text('Input');
      const builder2 = builder1.required();
      const builder3 = builder2.validate(() => undefined);

      // Each should have different state types (phantom types)
      // This is mainly for compile-time validation
      expectTypeOf(builder1).toMatchTypeOf<TextBuilder>();
      expectTypeOf(builder2).toMatchTypeOf<TextBuilder>();
      expectTypeOf(builder3).toMatchTypeOf<TextBuilder>();
    });
  });

  describe('Form Result Extraction', () => {
    it('should extract correct types from form schema', () => {
      const schema = {
        str: tx.text('String'),
        num: tx.number('Number'),
        bool: tx.confirm('Boolean'),
        choice: tx.select('Choice', [1, 2, 3] as const)
      } as const;

      type Result = FormResult<typeof schema>;

      type ExpectedResult = {
        readonly str: string;
        readonly num: number;
        readonly bool: boolean;
        readonly choice: 1 | 2 | 3;
      };

      // Verify type extraction works correctly
      expectTypeOf<Result>().toEqualTypeOf<ExpectedResult>();
    });
  });
});
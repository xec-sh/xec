/**
 * Tests for advanced TypeScript utility types
 */

import { it, expect, describe, expectTypeOf } from 'vitest';

import {
  ok,
  err,
  brand,
  isArray,
  isString,
  isNumber,
  isObject,
  isDefined,
  isBoolean,
  isFunction,
  exhaustive,
  type Tuple,
  type Result,
  type Branded,
  type Mutable,
  type RequireKeys,
  type DeepPartial,
  type OptionalKeys,
  type DeepReadonly,
  type FunctionKeys,
  type UnwrapPromise,
  type StringLiteral,
  type NonFunctionKeys,
  type InferPromptValue,
  type UnionToIntersection,
} from '../../../src/utils/types.js';

describe('Branded Types', () => {
  type UserId = Branded<string, 'UserId'>;
  type ProductId = Branded<string, 'ProductId'>;

  it('should create branded values', () => {
    const userId = brand<string, 'UserId'>('user123');
    const productId = brand<string, 'ProductId'>('prod456');

    expectTypeOf(userId).toMatchTypeOf<UserId>();
    expectTypeOf(productId).toMatchTypeOf<ProductId>();
    
    expect(userId).toBe('user123');
    expect(productId).toBe('prod456');
  });

  it('should prevent type mixing', () => {
    const userId: UserId = brand<string, 'UserId'>('user123');
    const productId: ProductId = brand<string, 'ProductId'>('prod456');

    // These should cause TypeScript errors if uncommented:
    // const wrongAssignment1: UserId = productId;
    // const wrongAssignment2: ProductId = userId;
    
    expect(userId).not.toBe(productId);
  });
});

describe('Type Inference', () => {
  it('should infer prompt value types', () => {
    type TextResult = { value: string };
    type NumberResult = { value: number };
    type DirectValue = boolean;

    expectTypeOf<InferPromptValue<TextResult>>().toEqualTypeOf<string>();
    expectTypeOf<InferPromptValue<NumberResult>>().toEqualTypeOf<number>();
    expectTypeOf<InferPromptValue<DirectValue>>().toEqualTypeOf<boolean>();
  });

  it('should handle required and optional keys', () => {
    interface User {
      id: string;
      name?: string;
      email?: string;
    }

    type UserWithRequiredName = RequireKeys<User, 'name'>;
    type UserWithOptionalId = OptionalKeys<User, 'id'>;

    const user1: UserWithRequiredName = {
      id: '1',
      name: 'John', // Now required
    };

    const user2: UserWithOptionalId = {
      // id is now optional
      name: 'Jane',
    };

    expect(user1.name).toBe('John');
    expect(user2.name).toBe('Jane');
  });
});

describe('Deep Type Utilities', () => {
  it('should handle deep partial types', () => {
    interface Config {
      server: {
        host: string;
        port: number;
        ssl: {
          enabled: boolean;
          cert: string;
        };
      };
    }

    type PartialConfig = DeepPartial<Config>;

    const config: PartialConfig = {
      server: {
        ssl: {
          enabled: true,
          // cert is optional
        },
      },
    };

    expect(config.server?.ssl?.enabled).toBe(true);
  });

  it('should handle deep readonly types', () => {
    interface State {
      user: {
        profile: {
          name: string;
          settings: string[];
        };
      };
    }

    type ReadonlyState = DeepReadonly<State>;

    const state: ReadonlyState = {
      user: {
        profile: {
          name: 'John',
          settings: ['dark-mode'],
        },
      },
    };

    // These should cause TypeScript errors if uncommented:
    // state.user.profile.name = 'Jane';
    // state.user.profile.settings.push('new-setting');

    expect(state.user.profile.name).toBe('John');
  });
});

describe('Promise Utilities', () => {
  it('should unwrap promise types', () => {
    type AsyncString = Promise<string>;
    type AsyncNumber = Promise<number>;
    type SyncBoolean = boolean;

    expectTypeOf<UnwrapPromise<AsyncString>>().toEqualTypeOf<string>();
    expectTypeOf<UnwrapPromise<AsyncNumber>>().toEqualTypeOf<number>();
    expectTypeOf<UnwrapPromise<SyncBoolean>>().toEqualTypeOf<boolean>();
  });
});

describe('Object Key Utilities', () => {
  it('should identify function and non-function keys', () => {
    interface Example {
      name: string;
      age: number;
      greet(): void;
      calculate(x: number): number;
    }

    expectTypeOf<FunctionKeys<Example>>().toEqualTypeOf<'greet' | 'calculate'>();
    expectTypeOf<NonFunctionKeys<Example>>().toEqualTypeOf<'name' | 'age'>();
  });
});

describe('Result Type', () => {
  it('should create success results', () => {
    const result = ok('success');
    
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('success');
    }
  });

  it('should create error results', () => {
    const result = err(new Error('failure'));
    
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('failure');
    }
  });

  it('should work with custom error types', () => {
    interface ValidationError {
      field: string;
      message: string;
    }

    const result: Result<string, ValidationError> = err({
      field: 'email',
      message: 'Invalid format',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe('email');
    }
  });
});

describe('Type Guards', () => {
  it('should check if value is defined', () => {
    expect(isDefined(null)).toBe(false);
    expect(isDefined(undefined)).toBe(false);
    expect(isDefined(0)).toBe(true);
    expect(isDefined('')).toBe(true);
    expect(isDefined(false)).toBe(true);
  });

  it('should check if value is string', () => {
    expect(isString('hello')).toBe(true);
    expect(isString(123)).toBe(false);
    expect(isString(null)).toBe(false);
  });

  it('should check if value is number', () => {
    expect(isNumber(123)).toBe(true);
    expect(isNumber(0)).toBe(true);
    expect(isNumber(NaN)).toBe(false);
    expect(isNumber('123')).toBe(false);
  });

  it('should check if value is boolean', () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(false)).toBe(true);
    expect(isBoolean(1)).toBe(false);
    expect(isBoolean('true')).toBe(false);
  });

  it('should check if value is object', () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ a: 1 })).toBe(true);
    expect(isObject([])).toBe(false);
    expect(isObject(null)).toBe(false);
  });

  it('should check if value is array', () => {
    expect(isArray([])).toBe(true);
    expect(isArray([1, 2, 3])).toBe(true);
    expect(isArray({})).toBe(false);
    expect(isArray('array')).toBe(false);
  });

  it('should check if value is function', () => {
    expect(isFunction(() => {})).toBe(true);
    expect(isFunction(function() {})).toBe(true);
    expect(isFunction(async () => {})).toBe(true);
    expect(isFunction('function')).toBe(false);
  });
});

describe('Exhaustive Check', () => {
  it('should handle exhaustive switch statements', () => {
    type Status = 'pending' | 'active' | 'completed';

    function getStatusMessage(status: Status): string {
      switch (status) {
        case 'pending':
          return 'Waiting...';
        case 'active':
          return 'In progress...';
        case 'completed':
          return 'Done!';
        default:
          return exhaustive(status);
      }
    }

    expect(getStatusMessage('pending')).toBe('Waiting...');
    expect(getStatusMessage('active')).toBe('In progress...');
    expect(getStatusMessage('completed')).toBe('Done!');
  });
});

describe('Advanced Type Utilities', () => {
  it('should create tuple types', () => {
    type Triple<T> = Tuple<T, 3>;
    type StringTriple = Triple<string>;

    const triple: StringTriple = ['a', 'b', 'c'];
    expect(triple).toHaveLength(3);
  });

  it('should handle string literal types', () => {
    type Literal = StringLiteral<'hello' | 'world'>;
    type NotLiteral = StringLiteral<string>;

    expectTypeOf<Literal>().toEqualTypeOf<'hello' | 'world'>();
    expectTypeOf<NotLiteral>().toEqualTypeOf<never>();
  });

  it('should create mutable types from readonly', () => {
    interface ReadonlyUser {
      readonly id: string;
      readonly name: string;
    }

    type MutableUser = Mutable<ReadonlyUser>;

    const user: MutableUser = {
      id: '1',
      name: 'John',
    };

    user.name = 'Jane'; // This is allowed
    expect(user.name).toBe('Jane');
  });

  it('should handle union to intersection conversion', () => {
    type Union = { a: string } | { b: number } | { c: boolean };
    type Intersection = UnionToIntersection<Union>;

    const value: Intersection = {
      a: 'hello',
      b: 42,
      c: true,
    };

    expect(value.a).toBe('hello');
    expect(value.b).toBe(42);
    expect(value.c).toBe(true);
  });
});
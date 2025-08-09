import { it, expect, describe, expectTypeOf } from 'vitest';
import { ok, err, brand, isArray, isString, isNumber, isObject, isDefined, isBoolean, isFunction, exhaustive, } from '../../../src/utils/types.js';
describe('Branded Types', () => {
    it('should create branded values', () => {
        const userId = brand('user123');
        const productId = brand('prod456');
        expectTypeOf(userId).toMatchTypeOf();
        expectTypeOf(productId).toMatchTypeOf();
        expect(userId).toBe('user123');
        expect(productId).toBe('prod456');
    });
    it('should prevent type mixing', () => {
        const userId = brand('user123');
        const productId = brand('prod456');
        expect(userId).not.toBe(productId);
    });
});
describe('Type Inference', () => {
    it('should infer prompt value types', () => {
        expectTypeOf().toEqualTypeOf();
        expectTypeOf().toEqualTypeOf();
        expectTypeOf().toEqualTypeOf();
    });
    it('should handle required and optional keys', () => {
        const user1 = {
            id: '1',
            name: 'John',
        };
        const user2 = {
            name: 'Jane',
        };
        expect(user1.name).toBe('John');
        expect(user2.name).toBe('Jane');
    });
});
describe('Deep Type Utilities', () => {
    it('should handle deep partial types', () => {
        const config = {
            server: {
                ssl: {
                    enabled: true,
                },
            },
        };
        expect(config.server?.ssl?.enabled).toBe(true);
    });
    it('should handle deep readonly types', () => {
        const state = {
            user: {
                profile: {
                    name: 'John',
                    settings: ['dark-mode'],
                },
            },
        };
        expect(state.user.profile.name).toBe('John');
    });
});
describe('Promise Utilities', () => {
    it('should unwrap promise types', () => {
        expectTypeOf().toEqualTypeOf();
        expectTypeOf().toEqualTypeOf();
        expectTypeOf().toEqualTypeOf();
    });
});
describe('Object Key Utilities', () => {
    it('should identify function and non-function keys', () => {
        expectTypeOf().toEqualTypeOf();
        expectTypeOf().toEqualTypeOf();
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
        const result = err({
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
        expect(isFunction(() => { })).toBe(true);
        expect(isFunction(function () { })).toBe(true);
        expect(isFunction(async () => { })).toBe(true);
        expect(isFunction('function')).toBe(false);
    });
});
describe('Exhaustive Check', () => {
    it('should handle exhaustive switch statements', () => {
        function getStatusMessage(status) {
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
        const triple = ['a', 'b', 'c'];
        expect(triple).toHaveLength(3);
    });
    it('should handle string literal types', () => {
        expectTypeOf().toEqualTypeOf();
        expectTypeOf().toEqualTypeOf();
    });
    it('should create mutable types from readonly', () => {
        const user = {
            id: '1',
            name: 'John',
        };
        user.name = 'Jane';
        expect(user.name).toBe('Jane');
    });
    it('should handle union to intersection conversion', () => {
        const value = {
            a: 'hello',
            b: 42,
            c: true,
        };
        expect(value.a).toBe('hello');
        expect(value.b).toBe(42);
        expect(value.c).toBe(true);
    });
});
//# sourceMappingURL=types.test.js.map
/**
 * Advanced TypeScript utility types for better type inference and error messages
 */

/**
 * Branded type for better type safety
 * @example
 * type UserId = Branded<string, 'UserId'>;
 * type ProductId = Branded<string, 'ProductId'>;
 */
export type Branded<T, Brand extends string> = T & { __brand: Brand };

/**
 * Create a branded type value
 */
export function brand<T, Brand extends string>(value: T): Branded<T, Brand> {
  return value as Branded<T, Brand>;
}

/**
 * Extract the value type from a prompt result
 */
export type InferPromptValue<T> = T extends { value: infer V } ? V : T;

/**
 * Make selected properties required
 */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Make selected properties optional
 */
export type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Deep partial type
 */
export type DeepPartial<T> = T extends object ? {
  [P in keyof T]?: DeepPartial<T[P]>;
} : T;

/**
 * Deep readonly type
 */
export type DeepReadonly<T> = T extends object ? {
  readonly [P in keyof T]: DeepReadonly<T[P]>;
} : T;

/**
 * Extract promise type
 */
export type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

/**
 * Union to intersection type
 */
export type UnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void ? I : never;

/**
 * Get the keys of T that are functions
 */
export type FunctionKeys<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

/**
 * Get the keys of T that are not functions
 */
export type NonFunctionKeys<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? never : K;
}[keyof T];

/**
 * Validation function that returns an error message or undefined
 */
export type ValidationFunction<T> = (value: T) => string | undefined | Promise<string | undefined>;

/**
 * Transform function for modifying input values
 */
export type TransformFunction<TInput, TOutput = TInput> = (value: TInput) => TOutput;

/**
 * Format function for display formatting
 */
export type FormatFunction<T> = (value: T) => string;

/**
 * Callback function type
 */
export type Callback<T = void> = T extends void ? () => void : (arg: T) => void;

/**
 * Async callback function type
 */
export type AsyncCallback<T = void> = T extends void ? () => Promise<void> : (arg: T) => Promise<void>;

/**
 * Key event type with better type safety
 */
export interface TypedKeyEvent {
  name: KeyName;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
  sequence: string;
}

/**
 * Supported key names
 */
export type KeyName = 
  | 'up' | 'down' | 'left' | 'right'
  | 'space' | 'enter' | 'escape' | 'tab'
  | 'backspace' | 'delete'
  | 'home' | 'end' | 'pageup' | 'pagedown'
  | 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'k' | 'l' | 'm'
  | 'n' | 'o' | 'p' | 'q' | 'r' | 's' | 't' | 'u' | 'v' | 'w' | 'x' | 'y' | 'z'
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6' | 'f7' | 'f8' | 'f9' | 'f10' | 'f11' | 'f12';

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Create a success result
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Create an error result
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Type guard for checking if a value is defined
 */
export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

/**
 * Type guard for checking if a value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard for checking if a value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Type guard for checking if a value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Type guard for checking if a value is an object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard for checking if a value is an array
 */
export function isArray<T = unknown>(value: unknown): value is T[] {
  return Array.isArray(value);
}

/**
 * Type guard for checking if a value is a function
 */
export function isFunction(value: unknown): value is (...args: any[]) => any {
  return typeof value === 'function';
}

/**
 * Exhaustive check for switch statements
 */
export function exhaustive(value: never): never {
  throw new Error(`Exhaustive check failed: ${value}`);
}

/**
 * Tuple type helper
 */
export type Tuple<T, N extends number> = N extends N ? number extends N ? T[] : _TupleOf<T, N, []> : never;
type _TupleOf<T, N extends number, R extends unknown[]> = R['length'] extends N ? R : _TupleOf<T, N, [T, ...R]>;

/**
 * String literal union type helper
 */
export type StringLiteral<T> = T extends string ? (string extends T ? never : T) : never;

/**
 * Mutable type (removes readonly)
 */
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

/**
 * NoInfer utility type
 */
export type NoInfer<T> = [T][T extends any ? 0 : never];

/**
 * Exact type matching
 */
export type Exact<T, Shape> = T extends Shape
  ? Exclude<keyof T, keyof Shape> extends never
    ? T
    : never
  : never;
/**
 * Adapted from Clack (https://github.com/bombshell-dev/clack).
 *
 * Copyright (c) Nate Moore
 * Licensed under the MIT License. See the NOTICE file at the root of this
 * package for the full attribution and license text.
 */

import type { StandardSchemaV1 } from './standard-schema.js';

/**
 * A function or [Standard Schema](https://github.com/standard-schema/standard-schema)
 * that validates user input. If a custom function is given, you should return a
 * `string` or `Error` to show as a validation error, or `undefined` to accept the result.
 *
 * @example Using zod
 * ```ts
 * import { text } from '@xec-sh/kit';
 * import { z } from 'zod';
 *
 * const name = await text({
 *   message: 'Enter your name (letters only)',
 *   validate: z.string().regex(/^[a-z]+$/i, 'Name can only contain letters'),
 * });
 * ```
 *
 * @example Custom validator
 * ```ts
 * import { text } from '@xec-sh/kit';
 *
 * const age = await text({
 *   message: 'Enter your age:',
 *   validate(value) {
 *     if (!value) return 'Please enter a value';
 *     const num = Number.parseInt(value, 10);
 *     if (Number.isNaN(num)) return 'Please enter a valid number';
 *     return undefined;
 *   },
 * });
 * ```
 */
export type Validate<TValue> =
  | ((value: TValue | undefined) => string | Error | undefined)
  | StandardSchemaV1<TValue | undefined, unknown>;

/**
 * Runs the `validate()` option and normalizes the result
 * @param validate - The validate option
 * @param value - The user input
 * @returns the validation result
 */
export function runValidation<TValue>(
  validate: Validate<TValue>,
  value: TValue | undefined
): string | Error | undefined {
  if ('~standard' in validate) {
    const result = validate['~standard'].validate(value);
    // https://standardschema.dev/schema#how-to-only-allow-synchronous-validation
    if (result instanceof Promise) {
      throw new TypeError(
        'Schema validation must be synchronous. Update `validate()` and remove any asynchronous logic.'
      );
    }
    return result.issues?.at(0)?.message;
  }
  return validate(value);
}

/**
 * Normalize a variadic positional argument.
 *
 * Commander collects a `[thing...]` positional into a single array element,
 * so `execute()` receives `['host', ['echo', 'hi'], options]` — not the
 * spread the commands originally assumed. Destructuring it with a rest
 * element produced a nested array, which `join(' ')` rendered as
 * `echo,hello,world` and sent over SSH; `watch` handed the array straight
 * to `path.resolve` and crashed.
 *
 * Reading `args[1]` with an `Array.isArray` guard fixes that, and
 * introduces a smaller version of the same fault: a caller passing one
 * command line as a string has it silently dropped, and the command
 * reports "no command specified" about a command it was given. A string
 * is an unambiguous single command line, so it is accepted as one.
 *
 * @param value - The positional as it arrived.
 * @returns The parts, empty when nothing was passed.
 */
export function variadicParts(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((part): part is string => typeof part === 'string');
  }

  if (typeof value === 'string') {
    return value === '' ? [] : [value];
  }

  return [];
}

/**
 * Read a positional that must be a string.
 *
 * When a positional is omitted, commander shifts the options object into
 * its place, and a truthiness check accepts it: `watch` took an options
 * object for its target and failed deep inside resolution with
 * "ref.includes is not a function" instead of saying that no target was
 * given.
 *
 * @param value - The positional as it arrived.
 * @returns The string, or undefined when the positional was not supplied.
 */
export function positionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

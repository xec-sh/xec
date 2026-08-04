import { platform } from 'node:os';

/**
 * The quoting dialect used to render a value into a command string.
 *
 * - `posix`  — Bourne-compatible shells (`sh`, `bash`, `zsh`, `dash`, `ksh`, …)
 * - `cmd`    — Windows `cmd.exe`
 * - `powershell` — Windows PowerShell / PowerShell Core (`pwsh`)
 */
export type ShellDialect = 'posix' | 'cmd' | 'powershell';

/**
 * Characters that are safe to emit unquoted in every supported dialect.
 *
 * The set deliberately excludes every shell metacharacter, whitespace and
 * quote. A token built exclusively from these characters cannot alter the
 * structure of a command line, so quoting it would only hurt readability.
 *
 * Note: this does not — and cannot — prevent *option* injection. A value of
 * `-rf` is a well-formed argument in any dialect; quoting it changes nothing.
 * Guard against that with an explicit `--` separator at the call site.
 */
const SAFE_TOKEN = /^[A-Za-z0-9_@%+=:,./-]+$/;

/**
 * Resolve the quoting dialect for a shell specification.
 *
 * Escaping must follow the shell that will actually parse the command, not the
 * platform we happen to be running on: an SSH session from Windows to Linux
 * needs POSIX quoting, and `$.shell('pwsh')` on Linux needs PowerShell quoting.
 *
 * @param shell - A shell path/name, `true` for the platform default, or `false`
 *   when no shell is involved (argv is passed directly).
 * @returns The dialect whose rules apply.
 *
 * @example
 * ```typescript
 * dialectFor('/bin/bash');            // 'posix'
 * dialectFor('pwsh');                 // 'powershell'
 * dialectFor('C:\\Windows\\cmd.exe'); // 'cmd'
 * ```
 */
export function dialectFor(shell?: string | boolean): ShellDialect {
  if (typeof shell === 'string' && shell.length > 0) {
    // Match on the executable name so full paths and bare names behave alike.
    const name = shell.replace(/\\/g, '/').split('/').pop()!.toLowerCase().replace(/\.exe$/, '');

    if (name === 'cmd' || name === 'command') return 'cmd';
    if (name === 'powershell' || name === 'pwsh') return 'powershell';
    return 'posix';
  }

  // `true`/undefined: fall back to the platform default shell.
  return platform() === 'win32' ? 'cmd' : 'posix';
}

/**
 * Quote a value so that a shell passes it through as exactly one argument.
 *
 * @param value - The raw value to quote.
 * @param dialect - The dialect that will parse the resulting command string.
 * @returns A token that is safe to splice into a command string.
 *
 * @example
 * ```typescript
 * quoteForShell("it's", 'posix');       // "'it'\\''s'"
 * quoteForShell('$(whoami)', 'posix');  // "'$(whoami)'"
 * quoteForShell('', 'posix');           // "''"
 * ```
 */
export function quoteForShell(value: string, dialect: ShellDialect): string {
  switch (dialect) {
    case 'posix':
      return quotePosix(value);
    case 'cmd':
      return quoteCmd(value);
    case 'powershell':
      return quotePowerShell(value);
    default: {
      // Exhaustiveness guard: a new dialect must be handled explicitly rather
      // than silently falling back to weaker quoting.
      const unreachable: never = dialect;
      throw new TypeError(`Unsupported shell dialect: ${String(unreachable)}`);
    }
  }
}

/**
 * Quote for Bourne-compatible shells using single quotes.
 *
 * Inside single quotes every character is literal, so the only case needing
 * care is the single quote itself, which is emitted as `'\''` (close, escaped
 * quote, reopen). This neutralises `$`, backticks, `$(…)`, `;`, `|`, `&`,
 * newlines and glob characters.
 */
function quotePosix(value: string): string {
  if (value === '') return "''";
  if (SAFE_TOKEN.test(value)) return value;

  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Quote for PowerShell using single-quoted strings.
 *
 * PowerShell single-quoted strings are fully literal — no `$` expansion, no
 * subexpressions — and an embedded quote is escaped by doubling it.
 */
function quotePowerShell(value: string): string {
  if (value === '') return "''";
  if (SAFE_TOKEN.test(value)) return value;

  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * `cmd.exe` metacharacters that must be neutralised with a caret.
 *
 * `%` is handled separately: caret-escaping does not reliably suppress
 * environment-variable expansion, so it needs a different technique.
 */
const CMD_METACHARACTERS = /[()<>&|^"!,;=\s]/g;

/**
 * Quote for `cmd.exe`.
 *
 * Two parsers run in sequence on Windows, so quoting happens in two layers:
 *
 * 1. The receiving program's `argv` parser (MSVCRT rules) — backslash runs
 *    before a quote are doubled, quotes are backslash-escaped, and the whole
 *    token is wrapped in double quotes.
 * 2. `cmd.exe` itself, which runs *first* and does not understand `\"` — so
 *    every metacharacter, including the quotes produced by layer 1, is
 *    caret-escaped.
 *
 * `%` cannot be fully neutralised by a caret. It is broken up with an empty
 * variable reference (`%` → `%%cd:~0,0%%`-style expansion is fragile), so we
 * instead emit `^%` and rely on the surrounding caret escaping; callers that
 * must pass literal `%` through `cmd.exe` should use argv execution
 * (`shell: false`) instead.
 */
function quoteCmd(value: string): string {
  if (value === '') return '^"^"';
  if (SAFE_TOKEN.test(value) && !value.includes('%')) return value;

  // Layer 1: MSVCRT argv quoting.
  let quoted = '"';
  let backslashes = 0;

  for (const char of value) {
    if (char === '\\') {
      backslashes += 1;
      continue;
    }

    if (char === '"') {
      // Double the pending backslashes, then escape the quote itself.
      quoted += '\\'.repeat(backslashes * 2 + 1) + '"';
      backslashes = 0;
      continue;
    }

    quoted += '\\'.repeat(backslashes) + char;
    backslashes = 0;
  }

  // Trailing backslashes precede the closing quote, so they must be doubled.
  quoted += '\\'.repeat(backslashes * 2) + '"';

  // Layer 2: neutralise everything cmd.exe would interpret.
  return quoted.replace(CMD_METACHARACTERS, char => `^${char}`).replace(/%/g, '^%');
}

/**
 * Escape a single value for the current platform's default shell.
 *
 * Prefer {@link quoteForShell} when the target shell is known — this helper
 * exists for call sites that have no shell context available.
 *
 * @param arg - The value to escape. Numbers and booleans are rendered directly.
 * @returns The escaped token.
 */
export function escapeArg(arg: string | number | boolean): string {
  if (typeof arg === 'number' || typeof arg === 'boolean') {
    return String(arg);
  }

  return quoteForShell(arg, dialectFor(undefined));
}

/**
 * Join a command with escaped arguments.
 *
 * @param cmd - The command name, emitted verbatim.
 * @param args - Arguments to escape and append.
 * @returns The assembled command string.
 */
export function escapeCommand(cmd: string, args: (string | number | boolean)[] = []): string {
  if (args.length === 0) {
    return cmd;
  }

  return `${cmd} ${args.map(arg => escapeArg(arg)).join(' ')}`;
}

/**
 * Escape arguments for a POSIX shell regardless of the host platform.
 *
 * Remote execution always targets a POSIX shell even when the client runs on
 * Windows, so SSH and container adapters must use this rather than
 * {@link escapeArg}.
 *
 * @param args - Values to escape.
 * @returns The space-joined, escaped argument list.
 */
export function escapeUnix(args: string[]): string {
  return args.map(arg => quotePosix(arg)).join(' ');
}

/**
 * Determine whether a value is a real tagged-template `strings` argument.
 *
 * A `TemplateStringsArray` is an array carrying a `raw` companion array. A
 * plain string passes none of these checks — which matters, because iterating
 * a string as if it were the template segments splices interpolated values
 * between individual characters and silently corrupts the command.
 *
 * @param value - The first argument received by a tagged-template function.
 * @returns `true` when the value came from a tagged template.
 */
export function isTemplateStringsArray(value: unknown): value is TemplateStringsArray {
  return Array.isArray(value) && Array.isArray((value as { raw?: unknown }).raw);
}

/**
 * Validate an environment variable name for interpolation into a shell.
 *
 * Only the value side is ever quoted; the *name* is interpolated raw, so a
 * key such as `X=1; rm -rf /; A` would inject arbitrary commands. Every
 * adapter that builds `export`/`env` prefixes must route names through this.
 *
 * @param name - The environment variable name.
 * @returns The same name once validated.
 * @throws {Error} If the name is not a valid POSIX identifier.
 */
export function validateEnvName(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid environment variable name: ${JSON.stringify(name)}`);
  }

  return name;
}

/**
 * Interpolate a template literal, escaping every substituted value.
 *
 * This is the safe path behind `` $`…` ``: literal segments are emitted
 * verbatim while interpolated values are quoted, so a value can never alter
 * the structure of the command.
 *
 * @param strings - The literal segments of the template.
 * @param values - The interpolated values.
 * @returns The assembled command string.
 */
export function interpolate(strings: TemplateStringsArray, ...values: unknown[]): string {
  return interpolateWithQuote(strings, undefined, ...values);
}

/**
 * Interpolate a template literal for a specific shell dialect.
 *
 * @param dialect - The dialect that will parse the result.
 * @param strings - The literal segments of the template.
 * @param values - The interpolated values.
 * @returns The assembled command string.
 */
export function interpolateForShell(
  dialect: ShellDialect,
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  return interpolateWithQuote(strings, value => quoteForShell(value, dialect), ...values);
}

/**
 * Interpolate a template literal **without** escaping.
 *
 * Every interpolated value is spliced in verbatim, so any shell metacharacter
 * it contains will be interpreted. Only use this when the values are trusted
 * or are themselves already-escaped command fragments.
 *
 * @param strings - The literal segments of the template.
 * @param values - The interpolated values, inserted unescaped.
 * @returns The assembled command string.
 *
 * @see {@link interpolate} for the escaping counterpart.
 */
export function interpolateRaw(strings: TemplateStringsArray, ...values: unknown[]): string {
  let result = '';

  for (let i = 0; i < strings.length; i++) {
    result += strings[i];

    if (i < values.length) {
      const value = values[i];

      if (value === null || value === undefined) {
        continue;
      }

      result += Array.isArray(value)
        ? value.map(item => valueToString(item)).join(' ')
        : valueToString(value);
    }
  }

  return result;
}

/**
 * Interpolate a template literal using a caller-supplied quoting function.
 *
 * @param strings - The literal segments of the template.
 * @param quoteFn - Quoting function; defaults to {@link escapeArg}.
 * @param values - The interpolated values.
 * @returns The assembled command string.
 */
export function interpolateWithQuote(
  strings: TemplateStringsArray,
  quoteFn?: ((value: string) => string) | undefined,
  ...values: unknown[]
): string {
  const applyQuote = quoteFn ?? ((value: string) => escapeArg(value));
  let result = '';

  for (let i = 0; i < strings.length; i++) {
    result += strings[i];

    if (i < values.length) {
      const value = values[i];

      // `null`/`undefined` would otherwise stringify to "null"/"undefined" and
      // silently become a real argument. Emit an empty quoted token so the
      // argument position is preserved rather than shifting the whole argv.
      if (value === null || value === undefined) {
        result += applyQuote('');
        continue;
      }

      result += Array.isArray(value)
        ? value.map(item => applyQuote(valueToString(item))).join(' ')
        : applyQuote(valueToString(value));
    }
  }

  return result;
}

/**
 * Render an interpolated value as the string the shell should receive.
 *
 * Execution results are unwrapped to their trimmed output so that
 * `` $`echo ${await $`hostname`}` `` behaves as expected; plain objects are
 * serialised as JSON.
 */
function valueToString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    // Unwrap ExecutionResult / ProcessOutput without importing them, which
    // would create a cycle between the escaping layer and the core types.
    const candidate = value as { stdout?: unknown; text?: unknown };

    if ('stdout' in candidate && typeof candidate.text === 'function') {
      return String((candidate.text as () => unknown)());
    }

    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      // Circular structures and BigInt fall back to the default rendering.
      return String(value);
    }
  }

  return String(value);
}

/**
 * Quote a value using ANSI-C (`$'…'`) syntax, matching zx's `quote()`.
 *
 * Provided for zx compatibility; {@link quoteForShell} is preferred because it
 * works across dialects.
 *
 * @param arg - The value to quote.
 * @returns The ANSI-C quoted token.
 */
export function quote(arg: string): string {
  if (arg === '') return `$''`;
  if (/^[\w/.\-@:=]+$/.test(arg)) return arg;

  return (
    `$'` +
    arg
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\f/g, '\\f')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/\v/g, '\\v')
      .replace(/\0/g, '\\0') +
    `'`
  );
}

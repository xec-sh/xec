/**
 * One grammar for task parameters, wherever a task is named.
 *
 * `xec deploy --env prod` and `xec run deploy --env prod` and
 * `xec run deploy -p env=prod` must name the same parameter. Before this
 * module each entry point parsed by hand: the root dispatcher cut values at
 * the second `=` (`--who=a=b` became `a`), dropped valueless flags on the
 * floor, and didn't know `-p`; the run command knew only `-p`.
 */

export interface ParsedTaskArgs {
  /** Named parameters, coerced. */
  params: Record<string, unknown>;
  /** Positional tokens that named no parameter. */
  rest: string[];
}

/**
 * Interpret a parameter value the way a YAML author would read it.
 *
 * `true`/`false` become booleans, numeric strings become numbers, and a
 * leading `[` or `{` is given to JSON first. Everything else stays a string.
 */
export function coerceParamValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value !== '' && !Number.isNaN(Number(value))) return Number(value);
  if (value.startsWith('[') || value.startsWith('{')) {
    try {
      return JSON.parse(value);
    } catch {
      // Not JSON after all - keep the literal text.
    }
  }
  return value;
}

/**
 * Split a `key=value` pair at its first `=`, keeping every later `=` in the
 * value, so `--conn=postgres://u@h?a=b` survives whole.
 *
 * @throws {Error} If there is no key before the `=`, or no `=` at all.
 */
function splitPair(pair: string, flag: string): [string, unknown] {
  const eq = pair.indexOf('=');
  if (eq <= 0) {
    throw new Error(`${flag} expects key=value, got '${pair}'`);
  }
  return [pair.slice(0, eq), coerceParamValue(pair.slice(eq + 1))];
}

/**
 * Parse the tokens that follow a task name into named parameters.
 *
 * Grammar: `--key=value`, `--key value`, `--key` (a true switch),
 * `-p key=value`, `--param key=value`, `--param=key=value`. A `--` ends
 * parameter parsing; everything after it lands in `rest` untouched.
 */
export function parseTaskArgs(tokens: string[]): ParsedTaskArgs {
  const params: Record<string, unknown> = {};
  const rest: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) continue;

    if (token === '--') {
      rest.push(...tokens.slice(i + 1));
      break;
    }

    if (token === '-p' || token === '--param') {
      const pair = tokens[++i];
      if (pair === undefined) {
        throw new Error(`${token} expects key=value`);
      }
      const [key, value] = splitPair(pair, token);
      params[key] = value;
      continue;
    }

    if (token.startsWith('--param=')) {
      const [key, value] = splitPair(token.slice('--param='.length), '--param');
      params[key] = value;
      continue;
    }

    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      if (eq !== -1) {
        params[token.slice(2, eq)] = coerceParamValue(token.slice(eq + 1));
        continue;
      }
      const key = token.slice(2);
      const next = tokens[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        params[key] = coerceParamValue(next);
        i++;
      } else {
        params[key] = true;
      }
      continue;
    }

    rest.push(token);
  }

  return { params, rest };
}

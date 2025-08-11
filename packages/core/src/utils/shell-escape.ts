import { platform } from 'node:os';

export function escapeArg(arg: string | number | boolean): string {
  if (typeof arg === 'number' || typeof arg === 'boolean') {
    return String(arg);
  }

  // For Windows, use different escaping
  if (platform() === 'win32') {
    return escapeWindows(arg);
  }

  // For Unix-like systems
  return escapeUnix([arg]);
}

export function escapeCommand(cmd: string, args: (string | number | boolean)[] = []): string {
  if (args.length === 0) {
    return cmd;
  }

  const escapedArgs = args.map(arg => escapeArg(arg));
  return `${cmd} ${escapedArgs.join(' ')}`;
}

export function escapeUnix(args: string[]): string {
  const ret: string[] = [];
  for (const arg of args) {
    let escaped = arg;
    if (/[^A-Za-z0-9_/:=-]/.test(escaped)) {
      escaped = "'" + escaped.replace(/'/g, "'\\''") + "'";
      escaped = escaped.replace(/^(?:'')+/g, '') // unduplicate single-quote at the beginning
        .replace(/\\'''/g, "\\'"); // remove non-escaped single-quote if there are enclosed between 2 escaped
    }
    ret.push(escaped);
  }
  return ret.join(' ');
}

function escapeWindows(arg: string): string {
  // Windows command line escaping is complex
  // Check if escaping is needed
  const needsEscaping = /[\s"\\&|<>^()@!%]/.test(arg);

  if (!needsEscaping) {
    // No special characters, no escaping needed
    return arg;
  }

  // For arguments containing special cmd.exe metacharacters,
  // we need to be careful about how we escape
  let escaped = arg;

  // Windows escaping rules for quotes and backslashes:
  // 1. Backslashes are only special when followed by a quote
  // 2. To include a literal backslash before a quote, double it
  // 3. To include a literal quote, escape it with a backslash

  // First escape existing quotes
  escaped = escaped.replace(/"/g, '\\"');

  // Then handle backslashes that precede quotes
  // We need to double backslashes that come before a quote
  escaped = escaped.replace(/(\\+)\\"/g, (match, backslashes) => backslashes + backslashes + '\\"');

  // Double all backslashes at the end of the string
  // (they would be followed by the closing quote)
  escaped = escaped.replace(/(\\+)$/, (match, backslashes) => backslashes + backslashes);

  // Wrap in quotes - this handles spaces and cmd.exe metacharacters
  return `"${escaped}"`;
}

export function interpolate(strings: TemplateStringsArray, ...values: any[]): string {
  return interpolateWithQuote(strings, undefined, ...values);
}

export function interpolateRaw(strings: TemplateStringsArray, ...values: any[]): string {
  let result = '';

  for (let i = 0; i < strings.length; i++) {
    result += strings[i];

    if (i < values.length) {
      const value = values[i];
      if (value === null || value === undefined) {
        // Skip null/undefined values
      } else if (Array.isArray(value)) {
        // Join array elements with space, no escaping
        result += value.map(v => valueToString(v)).join(' ');
      } else {
        // Convert value to string with proper serialization, no escaping
        result += valueToString(value);
      }
    }
  }

  return result;
}

export function interpolateWithQuote(strings: TemplateStringsArray, quoteFn?: typeof quote | undefined, ...values: any[]): string {
  let result = '';

  for (let i = 0; i < strings.length; i++) {
    result += strings[i];

    if (i < values.length) {
      const value = values[i];
      if (value === null || value === undefined) {
        // Пропускаем, добавляем пустую строку
        // (ничего не добавляем к result)
      } else if (Array.isArray(value)) {
        // Join array elements with space
        // If quoteFn is provided, use it for quoting, otherwise use escapeArg
        result += value.map(v => {
          const str = valueToString(v);
          return quoteFn ? quoteFn(str) : escapeArg(str);
        }).join(' ');
      } else {
        // Convert value to string with proper serialization
        const str = valueToString(value);
        result += quoteFn ? quoteFn(str) : escapeArg(str);
      }
    }
  }

  return result;
}

function valueToString(value: any): string {
  if (value === null || value === undefined) {
    return '';
  } else if (typeof value === 'string') {
    return value;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  } else if (value instanceof Date) {
    return value.toISOString();
  } else if (typeof value === 'object') {
    // Check if it's an ExecutionResult (has stdout property and text method)
    if ('stdout' in value && typeof value.text === 'function') {
      return value.text();
    }
    // JSON stringify objects
    try {
      return JSON.stringify(value);
    } catch (_) {
      // Fallback to toString for objects that can't be JSON stringified
      return String(value);
    }
  } else {
    return String(value);
  }
}

// xs/zx compatible quote function
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
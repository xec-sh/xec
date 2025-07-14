import { platform } from 'node:os';
import shellEscape from 'shell-escape';

export function escapeArg(arg: string | number | boolean): string {
  if (typeof arg === 'number' || typeof arg === 'boolean') {
    return String(arg);
  }

  // For Windows, use different escaping
  if (platform() === 'win32') {
    return escapeWindowsArg(arg);
  }

  // For Unix-like systems, use shell-escape
  return shellEscape([arg]);
}

export function escapeCommand(cmd: string, args: (string | number | boolean)[] = []): string {
  if (args.length === 0) {
    return cmd;
  }

  const escapedArgs = args.map(arg => escapeArg(arg));
  return `${cmd} ${escapedArgs.join(' ')}`;
}

function escapeWindowsArg(arg: string): string {
  // Windows command line escaping is complex
  // This is a simplified version that handles most cases
  if (!/[\s"\\]/.test(arg)) {
    // No special characters, no escaping needed
    return arg;
  }

  // Escape backslashes that precede quotes
  arg = arg.replace(/(\\*)"/, '$1$1\\"');

  // Escape trailing backslashes
  arg = arg.replace(/(\\*)$/, '$1$1');

  // Wrap in quotes
  return `"${arg}"`;
}

export function interpolate(strings: TemplateStringsArray, ...values: any[]): string {
  return interpolateWithQuote(strings, undefined, ...values);
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
          const str = String(v);
          return quoteFn ? quoteFn(str) : escapeArg(str);
        }).join(' ');
      } else {
        // Convert value to string
        const str = String(value);
        result += quoteFn ? quoteFn(str) : escapeArg(str);
      }
    }
  }

  return result;
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
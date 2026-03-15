/**
 * Core helper utilities inspired by zx but designed for xec's architecture.
 * These are standalone functions that don't depend on the execution engine.
 */

// ─── Duration Parsing ───────────────────────────────────────────────

export type Duration = number | string;

const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  sec: 1000,
  second: 1000,
  seconds: 1000,
  m: 60_000,
  min: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
};

/**
 * Parse a duration string or number into milliseconds.
 *
 * @example
 * parseDuration(1000)     // 1000
 * parseDuration('5s')     // 5000
 * parseDuration('100ms')  // 100
 * parseDuration('2m')     // 120000
 * parseDuration('1.5h')   // 5400000
 */
export function parseDuration(duration: Duration): number {
  if (typeof duration === 'number') return duration;

  const match = duration.trim().match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/);
  if (!match) {
    const num = Number(duration);
    if (!Number.isNaN(num)) return num;
    throw new Error(`Invalid duration: "${duration}". Use number (ms) or string like "5s", "100ms", "2m".`);
  }

  const value = parseFloat(match[1]!);
  const unit = match[2]!.toLowerCase();
  const multiplier = DURATION_UNITS[unit];

  if (multiplier === undefined) {
    throw new Error(`Unknown duration unit: "${unit}". Valid units: ms, s, m, h, d.`);
  }

  return Math.round(value * multiplier);
}

// ─── Sleep ──────────────────────────────────────────────────────────

/**
 * Promise-based sleep with human-readable duration support.
 *
 * @example
 * await sleep(1000)    // 1 second
 * await sleep('5s')    // 5 seconds
 * await sleep('100ms') // 100 milliseconds
 * await sleep('2m')    // 2 minutes
 */
export function sleep(duration: Duration): Promise<void> {
  const ms = parseDuration(duration);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Echo ───────────────────────────────────────────────────────────

/**
 * Print to stdout with newline. Converts any value to string.
 * Designed for script output — not for logging (use console.log for that).
 *
 * @example
 * echo('Hello, world!')
 * echo`Build complete in ${duration}ms`
 */
export function echo(first: TemplateStringsArray | string | unknown, ...rest: unknown[]): void {
  if (Array.isArray(first) && 'raw' in first) {
    // Template literal form: echo`text ${var}`
    const strings = first as TemplateStringsArray;
    let result = '';
    for (let i = 0; i < strings.length; i++) {
      result += strings[i];
      if (i < rest.length) result += String(rest[i]);
    }
    process.stdout.write(result + '\n');
  } else {
    // Function form: echo('text')
    const parts = [first, ...rest].map(String);
    process.stdout.write(parts.join(' ') + '\n');
  }
}

// ─── Glob ───────────────────────────────────────────────────────────

import { readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

/**
 * Simple, zero-dependency glob implementation.
 * For advanced use cases (gitignore, streams), use a dedicated glob library.
 *
 * Supports: *, **, ?, {a,b}, [abc], [!abc]
 *
 * @example
 * const files = await glob('src/** /*.ts')
 * const configs = await glob('*.{json,yaml}')
 * const tests = await glob('test/**\/*.test.ts', { cwd: '/project' })
 */
export async function glob(
  pattern: string | string[],
  options: { cwd?: string; absolute?: boolean; dot?: boolean } = {}
): Promise<string[]> {
  const patterns = Array.isArray(pattern) ? pattern : [pattern];
  const cwd = options.cwd ?? process.cwd();
  const results: Set<string> = new Set();

  for (const pat of patterns) {
    const isNegation = pat.startsWith('!');
    const cleanPattern = isNegation ? pat.slice(1) : pat;
    const regex = globToRegex(cleanPattern, options.dot ?? false);

    const files = await walkDir(cwd);
    for (const file of files) {
      const rel = relative(cwd, file);
      if (regex.test(rel)) {
        if (isNegation) {
          results.delete(options.absolute ? file : rel);
        } else {
          results.add(options.absolute ? file : rel);
        }
      }
    }
  }

  return [...results].sort();
}

function globToRegex(pattern: string, dot: boolean): RegExp {
  let regex = '';
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i]!;

    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          regex += '(?:.+/)?';
          i += 3;
        } else {
          regex += '.*';
          i += 2;
        }
      } else {
        regex += '[^/]*';
        i++;
      }
    } else if (ch === '?') {
      regex += '[^/]';
      i++;
    } else if (ch === '{') {
      const close = pattern.indexOf('}', i);
      if (close !== -1) {
        const alternatives = pattern.slice(i + 1, close).split(',');
        regex += '(?:' + alternatives.map(escapeRegex).join('|') + ')';
        i = close + 1;
      } else {
        regex += escapeRegex(ch);
        i++;
      }
    } else if (ch === '[') {
      const close = pattern.indexOf(']', i);
      if (close !== -1) {
        regex += pattern.slice(i, close + 1);
        i = close + 1;
      } else {
        regex += escapeRegex(ch);
        i++;
      }
    } else {
      regex += escapeRegex(ch);
      i++;
    }
  }

  const dotPrefix = dot ? '' : '(?!\\.)';
  return new RegExp(`^${dotPrefix}${regex}$`);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await walkDir(fullPath)));
      } else {
        results.push(fullPath);
      }
    }
  } catch {
    // Permission denied or other fs errors — skip
  }
  return results;
}

// ─── Exponential Backoff ────────────────────────────────────────────

/**
 * Generator for exponential backoff delays.
 *
 * @example
 * for (const delay of expBackoff()) {
 *   await sleep(delay);
 *   if (tryConnect()) break;
 * }
 */
export function* expBackoff(
  maxDelay: number = 60_000,
  initialDelay: number = 50
): Generator<number> {
  let delay = initialDelay;
  while (true) {
    yield Math.min(delay, maxDelay);
    delay *= 2;
  }
}

// ─── Process Tree Kill ──────────────────────────────────────────────

import { execSync } from 'node:child_process';

/**
 * Kill a process and all its children.
 * On Unix, uses process groups. On Windows, uses taskkill.
 *
 * @example
 * await kill(proc.pid)
 * await kill(proc.pid, 'SIGKILL')
 */
export async function kill(
  pid: number | undefined,
  signal: NodeJS.Signals = 'SIGTERM'
): Promise<void> {
  if (pid === undefined) return;

  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /t /f`, { stdio: 'ignore' });
    } else {
      // Try to kill the process group first (negative PID)
      try {
        process.kill(-pid, signal);
      } catch {
        // If process group kill fails, kill individual process
        process.kill(pid, signal);
      }
    }
  } catch {
    // Process already dead — ignore
  }
}

// ─── Fetch with Pipe Support ────────────────────────────────────────

/**
 * Fetch wrapper that returns a Response with pipe support.
 * The response body can be piped to streams or files.
 *
 * @example
 * const resp = await xfetch('https://example.com/data.json')
 * const data = await resp.json()
 *
 * // Pipe to file
 * const resp = await xfetch('https://example.com/archive.tar.gz')
 * await pipeline(resp.body, createWriteStream('archive.tar.gz'))
 */
export async function xfetch(
  url: string | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(url, init);
}

// ─── YAML ───────────────────────────────────────────────────────────

// Re-export js-yaml which is already a dependency
export { load as yamlParse, dump as yamlStringify } from 'js-yaml';

// ─── Stdin ──────────────────────────────────────────────────────────

/**
 * Read all data from stdin.
 *
 * @example
 * const input = await readStdin()
 */
export function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', reject);
  });
}

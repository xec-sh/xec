/**
 * Shared constants for @xec-sh/loader
 * @module @xec-sh/loader/constants
 */

/**
 * Node.js built-in modules list
 * This is the single source of truth for built-in module detection
 */
export const NODE_BUILTIN_MODULES = [
  // Core modules
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'timers',
  'tls',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',
] as const;

/**
 * Set for O(1) lookup of built-in modules
 */
export const NODE_BUILTIN_MODULES_SET = new Set<string>(NODE_BUILTIN_MODULES);

/**
 * Check if a specifier is a Node.js built-in module
 */
export function isNodeBuiltinModule(specifier: string): boolean {
  // Remove node: prefix if present
  const moduleName = specifier.startsWith('node:')
    ? specifier.slice(5)
    : specifier;
  return NODE_BUILTIN_MODULES_SET.has(moduleName);
}

/**
 * Reserved global variables that should not be overwritten
 */
export const RESERVED_GLOBALS = [
  'global',
  'process',
  'Buffer',
  'console',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'clearTimeout',
  'clearInterval',
  'clearImmediate',
  '__filename',
  '__dirname',
  'require',
  'module',
  'exports',
  'globalThis',
  'undefined',
  'NaN',
  'Infinity',
] as const;

/**
 * Set for O(1) lookup of reserved globals
 */
export const RESERVED_GLOBALS_SET = new Set<string>(RESERVED_GLOBALS);

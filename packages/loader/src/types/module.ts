import type { IntegrityPolicy } from '../module/module-integrity.js';
/**
 * Module loading and resolution types
 * @module @xec-sh/loader/types/module
 */

/**
 * Module type detection
 */
export type ModuleType = 'esm' | 'cjs' | 'umd' | 'unknown';

/**
 * CDN provider options
 */
export type CDNProvider = 'esm.sh' | 'jsr.io' | 'unpkg' | 'skypack' | 'jsdelivr';

/**
 * Module specifier with optional prefix
 * Examples: 'lodash', 'npm:react', 'jsr:@std/encoding'
 */
export type ModuleSpecifier = string;

/**
 * Module loader options
 */
export interface ModuleLoaderOptions {
  /** Cache directory */
  cacheDir?: string;

  /** Preferred CDN provider */
  preferredCDN?: CDNProvider;

  /** Enable verbose logging */
  verbose?: boolean;

  /** Enable caching */
  cache?: boolean;

  /** Force CDN-only loading (no node_modules) */
  cdnOnly?: boolean;

  /**
   * Integrity policy for remotely fetched modules.
   *
   * Remote modules are executed with full process privileges, so their
   * contents are pinned to a lockfile by default and only known CDN hosts are
   * contacted. Set `{ mode: 'off' }` only for throwaway local work.
   */
  integrity?: IntegrityPolicy;
}

/**
 * Module resolution result
 */
export interface ModuleResolution {
  /** Resolved module path/URL */
  resolved: string;

  /** Module type */
  type: ModuleType;

  /** Was module resolved from cache */
  fromCache: boolean;

  /** CDN provider used (if applicable) */
  cdn?: CDNProvider;
}

/**
 * Module resolver interface
 */
export interface ModuleResolver {
  /** Resolve module specifier to URL/path */
  resolve(specifier: ModuleSpecifier): Promise<ModuleResolution>;

  /** Check if resolver can handle this specifier */
  canResolve(specifier: ModuleSpecifier): boolean;
}

/**
 * Module fetcher options
 */
export interface ModuleFetchOptions {
  /** Whole-operation deadline in milliseconds, including bodies and redirects. Default 30_000. */
  timeout?: number;

  /** Retry attempts for transient failures, an integer from 0 to 5. */
  retries?: number;

  /** Headers for the original origin only; never forwarded across origins. */
  headers?: Record<string, string>;

  /** Cancel fetching and owned response streams. */
  signal?: AbortSignal;

  /** Bound fetched source bytes; defaults to 8 MiB, at most 64 MiB. */
  maxBytes?: number;
}

/**
 * Module execution options
 */
export interface ModuleExecutionOptions {
  /** Module specifier (for error messages) */
  specifier: string;

  /** Module content */
  content: string;

  /** Explicit native format. Omitted or unknown means ESM; UMD uses CommonJS. */
  type?: ModuleType;
}

/**
 * Transformed module result
 */
export interface TransformedModule {
  /** Transformed code */
  code: string;

  /** Source map (if generated) */
  map?: string;

  /** Warnings from transformation */
  warnings?: string[];
}

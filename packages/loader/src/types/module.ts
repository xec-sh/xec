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
  /** Request timeout in milliseconds */
  timeout?: number;

  /** Retry attempts */
  retries?: number;

  /** Headers to include in request */
  headers?: Record<string, string>;
}

/**
 * Module execution options
 */
export interface ModuleExecutionOptions {
  /** Module specifier (for error messages) */
  specifier: string;

  /** Module content */
  content: string;

  /** Detected module type */
  type?: ModuleType;

  /** Response headers (for type detection) */
  headers?: Record<string, string>;
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

/**
 * TypeScriptTransformer handles TypeScript to JavaScript transformation
 * @module @xec-sh/loader/transform/typescript-transformer
 */

import { type TransformOptions, transform as esbuildTransform } from 'esbuild';

import type { Cache } from '../types/index.js';

/**
 * Options for TypeScript transformation
 */
export interface TypeScriptTransformOptions {
  /**
   * Target ECMAScript version
   */
  target?: 'es2015' | 'es2016' | 'es2017' | 'es2018' | 'es2019' | 'es2020' | 'es2021' | 'es2022' | 'esnext';

  /**
   * Output format
   */
  format?: 'esm' | 'cjs' | 'iife';

  /**
   * Generate sourcemaps
   */
  sourcemap?: boolean | 'inline' | 'external';

  /**
   * Enable caching
   */
  cache?: boolean;

  /**
   * Additional esbuild options
   */
  esbuild?: Partial<TransformOptions>;
}

/**
 * TypeScriptTransformer transforms TypeScript code to JavaScript
 */
export class TypeScriptTransformer {
  private readonly cache?: Cache<string>;
  private readonly options: Required<Omit<TypeScriptTransformOptions, 'cache' | 'esbuild'>> & {
    esbuild?: Partial<TransformOptions>;
  };

  constructor(cache?: Cache<string>, options: TypeScriptTransformOptions = {}) {
    this.cache = options.cache ? cache : undefined;
    this.options = {
      target: options.target || 'esnext',
      format: options.format || 'esm',
      sourcemap: options.sourcemap ?? false,
      esbuild: options.esbuild,
    };
  }

  /**
   * Get cache key for code and filename
   */
  private getCacheKey(code: string, filename: string): string {
    const hash = this.simpleHash(code + filename + JSON.stringify(this.options));
    return `ts-transform-${hash}`;
  }

  /**
   * Simple hash function for cache keys
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Detect loader type from filename
   */
  private getLoader(filename: string): 'ts' | 'tsx' | 'js' | 'jsx' {
    if (filename.endsWith('.tsx')) return 'tsx';
    if (filename.endsWith('.ts')) return 'ts';
    if (filename.endsWith('.jsx')) return 'jsx';
    return 'js';
  }

  /**
   * Transform TypeScript code to JavaScript
   */
  async transform(code: string, filename: string): Promise<string> {
    // Check cache first
    if (this.cache) {
      const cacheKey = this.getCacheKey(code, filename);
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Perform transformation
    const result = await esbuildTransform(code, {
      format: this.options.format,
      target: this.options.target,
      loader: this.getLoader(filename),
      sourcemap: this.options.sourcemap,
      supported: {
        'top-level-await': true,
      },
      ...this.options.esbuild,
    });

    const transformedCode = result.code;

    // Cache result
    if (this.cache) {
      const cacheKey = this.getCacheKey(code, filename);
      await this.cache.set(cacheKey, transformedCode);
    }

    return transformedCode;
  }

  /**
   * Transform TypeScript code with custom options
   */
  async transformWithOptions(
    code: string,
    filename: string,
    options: Partial<TransformOptions>
  ): Promise<string> {
    const result = await esbuildTransform(code, {
      format: this.options.format,
      target: this.options.target,
      loader: this.getLoader(filename),
      sourcemap: this.options.sourcemap,
      supported: {
        'top-level-await': true,
      },
      ...this.options.esbuild,
      ...options,
    });

    return result.code;
  }

  /**
   * Check if file needs transformation
   */
  needsTransformation(filename: string): boolean {
    return filename.endsWith('.ts') ||
      filename.endsWith('.tsx') ||
      filename.endsWith('.jsx');
  }

  /**
   * Transform only if needed
   */
  async transformIfNeeded(code: string, filename: string): Promise<string> {
    if (!this.needsTransformation(filename)) {
      return code;
    }
    return this.transform(code, filename);
  }

  /**
   * Clear transformation cache
   */
  async clearCache(): Promise<void> {
    if (this.cache) {
      await this.cache.clear();
    }
  }
}

/**
 * Create a new TypeScriptTransformer instance
 */
export function createTransformer(
  cache?: Cache<string>,
  options?: TypeScriptTransformOptions
): TypeScriptTransformer {
  return new TypeScriptTransformer(cache, options);
}

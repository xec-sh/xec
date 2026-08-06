/**
 * ModuleLoader orchestrates module resolution, fetching, and execution
 * @module @xec-sh/loader/module/module-loader
 */

import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Cache, ModuleExports, ModuleSpecifier, ModuleLoaderOptions } from '../types/index.js';

import { ModuleFetcher } from './module-fetcher.js';
import { ModuleExecutor } from './module-executor.js';
import { isNodeBuiltinModule } from '../constants.js';
import { MemoryCache, HybridCache } from './module-cache.js';
import { ModuleIntegrityVerifier } from './module-integrity.js';
import { CDNModuleResolver, NodeModuleResolver, LocalModuleResolver, CompositeModuleResolver } from './module-resolver.js';

/**
 * ModuleLoader - main orchestrator for module loading
 */
export class ModuleLoader {
  private resolver: CompositeModuleResolver;
  private fetcher: ModuleFetcher;
  private executor: ModuleExecutor;
  private cache: Cache<string>;
  private integrity: ModuleIntegrityVerifier;
  private options: Required<ModuleLoaderOptions>;
  private pendingLoads = new Map<string, Promise<any>>();

  constructor(options: ModuleLoaderOptions = {}) {
    this.options = {
      cacheDir: options.cacheDir || '/tmp/xec-loader-cache',
      preferredCDN: options.preferredCDN || 'esm.sh',
      verbose: options.verbose || false,
      cache: options.cache !== false,
      cdnOnly: options.cdnOnly || false,
      integrity: options.integrity ?? {},
    };

    // Remote modules execute with full process privileges on machines that
    // hold production credentials, so their contents are pinned by default.
    this.integrity = new ModuleIntegrityVerifier(this.options.cacheDir, this.options.integrity);

    // Set up cache
    if (this.options.cache) {
      this.cache = new HybridCache(
        { maxSize: 500, ttl: 3600 },
        { cacheDir: this.options.cacheDir, ttl: 3600 }
      );
    } else {
      this.cache = new MemoryCache({ maxSize: 100 });
    }

    // Set up resolver
    const cdnResolver = new CDNModuleResolver(this.options.preferredCDN);
    const localResolver = new LocalModuleResolver();
    const nodeResolver = new NodeModuleResolver(cdnResolver);

    if (this.options.cdnOnly) {
      this.resolver = new CompositeModuleResolver([localResolver, cdnResolver]);
    } else {
      this.resolver = new CompositeModuleResolver([localResolver, nodeResolver, cdnResolver]);
    }

    // Set up fetcher and executor
    this.fetcher = new ModuleFetcher(this.cache, this.integrity);
    this.executor = new ModuleExecutor(this.options.cacheDir + '/temp');
  }

  /**
   * Import a module by specifier
   */
  async import(specifier: ModuleSpecifier): Promise<ModuleExports> {
    // Check for pending loads (prevent duplicate fetches)
    if (this.pendingLoads.has(specifier)) {
      return this.pendingLoads.get(specifier)!;
    }

    const loadPromise = this.loadModule(specifier);
    this.pendingLoads.set(specifier, loadPromise);

    try {
      return await loadPromise;
    } finally {
      this.pendingLoads.delete(specifier);
    }
  }

  private async loadModule(specifier: ModuleSpecifier): Promise<ModuleExports> {
    if (this.options.verbose) {
      console.log(`[ModuleLoader] Loading: ${specifier}`);
    }

    // Resolve module
    const resolution = await this.resolver.resolve(specifier);

    if (this.options.verbose) {
      console.log(`[ModuleLoader] Resolved to: ${resolution.resolved}`);
    }

    // Check if it's a local file or built-in Node module (but not HTTP URLs)
    if (resolution.resolved.startsWith('http://') || resolution.resolved.startsWith('https://')) {
      // HTTP(S) URLs need to be fetched, not imported directly
    } else if (resolution.resolved.startsWith('file://') ||
        resolution.resolved.startsWith('node:') ||
        isNodeBuiltinModule(resolution.resolved)) {
      // Direct import for URLs and built-in modules
      return import(resolution.resolved) as Promise<ModuleExports>;
    } else if (isAbsolute(resolution.resolved)) {
      // An absolute path is not a URL. `startsWith('/')` recognised only
      // the POSIX spelling, so a Windows path fell through to the CDN
      // fetcher; and importing it directly would fail anyway, since `D:`
      // reads as a scheme.
      return import(pathToFileURL(resolution.resolved).href) as Promise<ModuleExports>;
    }

    // Fetch from CDN or HTTP(S) URL
    const fetched = await this.fetcher.fetch(resolution.resolved);

    // Execute module
    const module = await this.executor.execute({
      specifier: resolution.resolved,
      content: fetched.content,
      type: resolution.type !== 'unknown' ? resolution.type : undefined,
      headers: fetched.headers,
    });

    return module;
  }

  /**
   * Clear all caches
   */
  async clearCache(): Promise<void> {
    await this.cache.clear();
    await this.executor.cleanup();
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    return this.cache.stats();
  }
}

/**
 * ModuleLoader orchestrates module resolution, fetching, and execution
 * @module @xec-sh/loader/module/module-loader
 */

import { ModuleFetcher } from './module-fetcher.js';
import { ModuleExecutor } from './module-executor.js';
import { MemoryCache, HybridCache } from './module-cache.js';
import { CDNModuleResolver, NodeModuleResolver, LocalModuleResolver, CompositeModuleResolver } from './module-resolver.js';

import type { Cache , ModuleSpecifier, ModuleLoaderOptions } from '../types/index.js';

/**
 * ModuleLoader - main orchestrator for module loading
 */
export class ModuleLoader {
  private resolver: CompositeModuleResolver;
  private fetcher: ModuleFetcher;
  private executor: ModuleExecutor;
  private cache: Cache<string>;
  private options: Required<ModuleLoaderOptions>;
  private pendingLoads = new Map<string, Promise<any>>();

  constructor(options: ModuleLoaderOptions = {}) {
    this.options = {
      cacheDir: options.cacheDir || '/tmp/xec-loader-cache',
      preferredCDN: options.preferredCDN || 'esm.sh',
      verbose: options.verbose || false,
      cache: options.cache !== false,
      cdnOnly: options.cdnOnly || false,
    };

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
    this.fetcher = new ModuleFetcher(this.cache);
    this.executor = new ModuleExecutor(this.options.cacheDir + '/temp');
  }

  /**
   * Import a module by specifier
   */
  async import(specifier: ModuleSpecifier): Promise<any> {
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

  private async loadModule(specifier: ModuleSpecifier): Promise<any> {
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
    } else if (resolution.resolved.startsWith('/') ||
        resolution.resolved.startsWith('file://') ||
        resolution.resolved.startsWith('node:') ||
        this.isBuiltinModule(resolution.resolved)) {
      // Direct import for local files and built-in modules
      return import(resolution.resolved);
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

  /**
   * Check if a specifier is a built-in Node.js module
   */
  private isBuiltinModule(specifier: string): boolean {
    const builtins = [
      'fs', 'path', 'url', 'crypto', 'http', 'https', 'stream', 'buffer',
      'events', 'util', 'os', 'child_process', 'zlib', 'readline', 'process',
      'assert', 'querystring', 'string_decoder', 'timers', 'tty', 'v8', 'vm',
      'worker_threads', 'cluster', 'dgram', 'dns', 'domain', 'net', 'perf_hooks',
      'punycode', 'repl', 'tls'
    ];
    return builtins.includes(specifier);
  }
}

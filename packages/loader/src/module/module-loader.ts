/**
 * ModuleLoader orchestrates module resolution, fetching, and execution
 * @module @xec-sh/loader/module/module-loader
 */

import type { Cache, ModuleExports, ModuleSpecifier, ModuleLoaderOptions, ModuleImportOptions } from '../types/index.js';

import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join, isAbsolute } from 'node:path';

import { ModuleGraph } from './module-graph.js';
import { ModuleFetcher } from './module-fetcher.js';
import { isNodeBuiltinModule } from '../constants.js';
import { MemoryCache, HybridCache } from './module-cache.js';
import { diagnosticURL, ModuleIntegrityVerifier } from './module-integrity.js';
import { CDNModuleResolver, NodeModuleResolver, LocalModuleResolver, CompositeModuleResolver } from './module-resolver.js';

/**
 * ModuleLoader - main orchestrator for module loading
 */
export class ModuleLoader {
  private resolver: CompositeModuleResolver;
  private fetcher: ModuleFetcher;
  private graph: ModuleGraph | undefined;
  private disposed = false;
  private cache: Cache<string>;
  private integrity: ModuleIntegrityVerifier;
  private options: Required<ModuleLoaderOptions>;
  private readonly pendingOperations = new Set<Promise<unknown>>();
  private clearing = false;

  constructor(options: ModuleLoaderOptions = {}) {
    this.options = {
      cacheDir: options.cacheDir ?? join(process.env['XDG_CACHE_HOME'] || join(homedir(), '.cache'), 'xec', 'modules'),
      preferredCDN: options.preferredCDN || 'esm.sh',
      verbose: options.verbose || false,
      cache: options.cache !== false,
      cdnOnly: options.cdnOnly || false,
      integrity: options.integrity ?? {},
      graph: options.graph ?? {},
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
      this.cache = new MemoryCache({ maxSize: 0 });
    }

    // Set up resolver
    const cdnResolver = new CDNModuleResolver(this.options.preferredCDN);
    const localResolver = new LocalModuleResolver();
    const nodeResolver = new NodeModuleResolver();

    if (this.options.cdnOnly) {
      this.resolver = new CompositeModuleResolver([localResolver, cdnResolver]);
    } else {
      this.resolver = new CompositeModuleResolver([localResolver, nodeResolver, cdnResolver]);
    }

    // One raw-source fetcher; graph execution is created lazily after capability validation.
    this.fetcher = new ModuleFetcher(this.cache, this.integrity);
  }

  /**
   * Import a module by specifier
   */
  async import(specifier: ModuleSpecifier, options: ModuleImportOptions = {}): Promise<ModuleExports> {
    return this.runOperation(options, () => this.loadModule(specifier, options));
  }

  /** Verify a remote closure for future computed imports without evaluating it. */
  async prepare(specifier: ModuleSpecifier, options: ModuleImportOptions = {}): Promise<string> {
    return this.runOperation(options, async () => {
      const resolved = await this.resolveModule(specifier, options);
      if (!/^https?:/u.test(resolved)) throw new TypeError('ModuleLoader.prepare requires an explicit remote module');
      return this.remoteGraph().prepare(resolved, options);
    });
  }

  private async runOperation<T>(options: ModuleImportOptions, operation: () => Promise<T>): Promise<T> {
    if (this.disposed) throw new Error('Module loader has been disposed');
    if (this.clearing) throw new Error('Module cache cleanup is active');
    options.signal?.throwIfAborted();
    const pending = operation();
    this.pendingOperations.add(pending);
    try { return await pending; }
    finally { this.pendingOperations.delete(pending); }
  }

  private remoteGraph(): ModuleGraph {
    // Validate native hooks before any request. One owner preserves identity
    // across separate imports and explicit preparations of computed targets.
    return this.graph ??= new ModuleGraph(undefined, { fetcher: this.fetcher, limits: this.options.graph });
  }

  private async resolveModule(specifier: ModuleSpecifier, options: ModuleImportOptions): Promise<string> {
    if (this.options.verbose) {
      console.log(`[ModuleLoader] Loading: ${/^https?:/iu.test(specifier) ? diagnosticURL(specifier) : specifier}`);
    }

    // Resolve module
    const resolution = await this.resolver.resolve(specifier);
    options.signal?.throwIfAborted();

    if (this.options.verbose) {
      console.log(`[ModuleLoader] Resolved to: ${/^https?:/iu.test(resolution.resolved) ? diagnosticURL(resolution.resolved) : resolution.resolved}`);
    }

    return resolution.resolved;
  }

  private async loadModule(specifier: ModuleSpecifier, options: ModuleImportOptions): Promise<ModuleExports> {
    const resolved = await this.resolveModule(specifier, options);
    // Check if it's a local file or built-in Node module (but not HTTP URLs)
    if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
      // HTTP(S) URLs need to be fetched, not imported directly
    } else if (resolved.startsWith('file://') ||
        resolved.startsWith('node:') ||
        isNodeBuiltinModule(resolved)) {
      // Direct import for URLs and built-in modules
      return import(resolved) as Promise<ModuleExports>;
    } else if (isAbsolute(resolved)) {
      // An absolute path is not a URL. `startsWith('/')` recognised only
      // the POSIX spelling, so a Windows path fell through to the CDN
      // fetcher; and importing it directly would fail anyway, since `D:`
      // reads as a scheme.
      return import(pathToFileURL(resolved).href) as Promise<ModuleExports>;
    }

    return this.remoteGraph().load(resolved, options);
  }

  /** Release graph hooks after script actions and their deferred callbacks settle. */
  dispose(): void {
    if (this.pendingOperations.size || this.clearing) throw new Error('Cannot dispose the module loader while an operation is active');
    this.graph?.dispose();
    this.graph = undefined;
    this.disposed = true;
  }

  /**
   * Clear fetched responses without changing live module identities or trust pins
   */
  async clearCache(): Promise<void> {
    if (this.clearing || this.pendingOperations.size) throw new Error('Cannot clear the module cache while an operation is active');
    this.clearing = true;
    try {
      await this.cache.clear();
    } finally { this.clearing = false; }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    return this.cache.stats();
  }
}

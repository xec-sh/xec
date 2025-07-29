/**
 * Unified Module Loader for Xec
 * Handles ESM imports with transparent CDN fallback and caching
 */

import os from 'os';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { transform } from 'esbuild';
import { pathToFileURL } from 'url';
import * as clack from '@clack/prompts';

export interface ModuleLoaderOptions {
  cacheDir?: string;
  preferredCDN?: 'esm.sh' | 'jsr.io' | 'unpkg' | 'skypack' | 'jsdelivr';
  verbose?: boolean;
  cache?: boolean;
  nodeModulesPath?: string;
}

interface CacheEntry {
  content: string;
  timestamp: number;
  headers?: Record<string, string>;
}

const CDN_URLS = {
  'esm.sh': 'https://esm.sh',
  'jsr.io': 'https://jsr.io',
  'unpkg': 'https://unpkg.com',
  'skypack': 'https://cdn.skypack.dev',
  'jsdelivr': 'https://cdn.jsdelivr.net/npm'
} as const;

export class UnifiedModuleLoader {
  private options: ModuleLoaderOptions;
  private cacheDir: string;
  private memoryCache = new Map<string, CacheEntry>();
  private pendingLoads = new Map<string, Promise<any>>();
  private isInitialized = false;
  private nodeModulesPath: string | null = null;

  constructor(options: ModuleLoaderOptions = {}) {
    this.options = {
      cache: true,
      preferredCDN: 'esm.sh',
      verbose: false,
      ...options
    };
    this.cacheDir = this.options.cacheDir || path.join(os.homedir(), '.xec', 'module-cache');
    this.nodeModulesPath = options.nodeModulesPath || null;
  }

  /**
   * Initialize the loader and global context
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    if (this.options.cache) {
      await fs.mkdir(this.cacheDir, { recursive: true });
    }

    // Find node_modules path if not provided
    if (!this.nodeModulesPath) {
      this.nodeModulesPath = await this.findNodeModulesPath();
    }

    // Set up global module context
    (globalThis as any).__xecModuleContext = {
      import: (spec: string) => this.importModule(spec),
      importNPM: (pkg: string) => this.importFromCDN(pkg, 'npm'),
      importJSR: (pkg: string) => this.importFromCDN(pkg, 'jsr'),
      importCDN: (spec: string) => this.importFromCDN(spec, 'auto')
    };

    this.isInitialized = true;
  }

  /**
   * Find node_modules path by searching upwards
   */
  private async findNodeModulesPath(): Promise<string | null> {
    // First, check if we're running from a global installation
    // When installed globally, the CLI binary is in /usr/local/bin or similar
    // and the actual code is in the global node_modules
    const scriptPath = import.meta.url.replace('file://', '');
    const scriptDir = path.dirname(scriptPath);
    
    // Check for node_modules relative to the script location (for global installs)
    let checkDir = scriptDir;
    for (let i = 0; i < 5; i++) {
      const nodeModulesDir = path.join(checkDir, 'node_modules');
      if (existsSync(nodeModulesDir)) {
        return nodeModulesDir;
      }
      const parentDir = path.dirname(checkDir);
      if (parentDir === checkDir) break;
      checkDir = parentDir;
    }
    
    // Then check from current working directory (for local project usage)
    let currentDir = process.cwd();
    for (let i = 0; i < 10; i++) {
      const nodeModulesDir = path.join(currentDir, 'node_modules');
      if (existsSync(nodeModulesDir)) {
        return nodeModulesDir;
      }
      
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break; // Reached root
      currentDir = parentDir;
    }
    
    return null;
  }

  /**
   * Import a module with CDN fallback
   */
  async importModule(specifier: string): Promise<any> {
    // Parse special syntax: npm:package, jsr:@scope/package, esm:package, etc.
    const prefixMatch = specifier.match(/^(npm|jsr|esm|unpkg|skypack|jsdelivr):(.*)/);
    if (prefixMatch) {
      const [, source, pkg] = prefixMatch;
      if (source && pkg) {
        return this.importFromCDN(pkg, source as any);
      }
    }

    // Handle local modules
    if (this.isLocalModule(specifier)) {
      return import(specifier);
    }

    // Check if already loading
    if (this.pendingLoads.has(specifier)) {
      return this.pendingLoads.get(specifier)!;
    }

    const loadPromise = this._importModule(specifier);
    this.pendingLoads.set(specifier, loadPromise);

    try {
      return await loadPromise;
    } finally {
      this.pendingLoads.delete(specifier);
    }
  }

  private async _importModule(specifier: string): Promise<any> {
    // Try local node_modules first if available
    if (this.nodeModulesPath && !specifier.startsWith('node:')) {
      try {
        const modulePath = path.join(this.nodeModulesPath, specifier);
        if (existsSync(modulePath)) {
          const packageJsonPath = path.join(modulePath, 'package.json');
          if (existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
            const mainFile = packageJson.module || packageJson.main || 'index.js';
            const fullPath = path.join(modulePath, mainFile);
            return await import(pathToFileURL(fullPath).href);
          }
        }
      } catch (error) {
        if (this.options.verbose) {
          console.log(`[ModuleLoader] Failed to load ${specifier} from local node_modules:`, error);
        }
      }
    }

    // Try direct import for built-in modules
    try {
      return await import(specifier);
    } catch (error) {
      if (this.options.verbose) {
        console.log(`[ModuleLoader] Failed direct import of ${specifier}, trying CDN fallback`);
      }
    }

    // Fallback to CDN
    return this.importFromCDN(specifier, 'auto');
  }

  /**
   * Import from CDN with proper source selection
   */
  private async importFromCDN(pkg: string, source: 'npm' | 'jsr' | 'esm' | 'unpkg' | 'skypack' | 'jsdelivr' | 'auto'): Promise<any> {
    const cacheKey = `${source}:${pkg}`;
    
    // Check if already loading
    if (this.pendingLoads.has(cacheKey)) {
      return this.pendingLoads.get(cacheKey)!;
    }

    const loadPromise = this._importFromCDN(pkg, source);
    this.pendingLoads.set(cacheKey, loadPromise);

    try {
      return await loadPromise;
    } finally {
      this.pendingLoads.delete(cacheKey);
    }
  }

  private async _importFromCDN(pkg: string, source: 'npm' | 'jsr' | 'esm' | 'unpkg' | 'skypack' | 'jsdelivr' | 'auto'): Promise<any> {
    const cdnUrl = this.getCDNUrl(pkg, source);
    
    if (this.options.verbose) {
      console.log(`[ModuleLoader] Loading ${pkg} from CDN: ${cdnUrl}`);
    }

    try {
      // Check cache first
      const cached = await this.loadFromCache(cdnUrl);
      if (cached) {
        return await this.executeModule(cached, cdnUrl);
      }

      // Fetch from CDN
      const content = await this.fetchFromCDN(cdnUrl);
      
      // Save to cache
      if (this.options.cache) {
        await this.saveToCache(cdnUrl, content);
      }

      // Execute the module
      return await this.executeModule(content, cdnUrl);
    } catch (error) {
      if (this.options.verbose) {
        console.error(`[ModuleLoader] Failed to import ${pkg} from CDN:`, error);
      }
      throw new Error(`Failed to import module '${pkg}' from CDN: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if specifier is a local module
   */
  private isLocalModule(specifier: string): boolean {
    return specifier.startsWith('@xec-sh/') ||
      specifier.startsWith('./') ||
      specifier.startsWith('../') ||
      specifier.startsWith('file://') ||
      specifier.startsWith('node:') ||
      path.isAbsolute(specifier);
  }

  /**
   * Get CDN URL for a package
   */
  private getCDNUrl(pkg: string, source: 'npm' | 'jsr' | 'esm' | 'unpkg' | 'skypack' | 'jsdelivr' | 'auto'): string {
    if (pkg.startsWith('http://') || pkg.startsWith('https://')) {
      return pkg;
    }

    // Handle JSR packages
    if (source === 'jsr' || (source === 'auto' && pkg.startsWith('@'))) {
      // Use esm.sh as proxy for JSR packages
      return `https://esm.sh/jsr/${pkg}`;
    }

    // Determine CDN based on source
    let cdnKey: keyof typeof CDN_URLS;
    switch (source) {
      case 'npm':
      case 'esm':
        cdnKey = 'esm.sh';
        break;
      case 'unpkg':
        cdnKey = 'unpkg';
        break;
      case 'skypack':
        cdnKey = 'skypack';
        break;
      case 'jsdelivr':
        cdnKey = 'jsdelivr';
        break;
      case 'auto':
      default:
        cdnKey = this.options.preferredCDN || 'esm.sh';
    }

    const baseUrl = CDN_URLS[cdnKey];
    
    // Add appropriate query params for esm.sh
    if (cdnKey === 'esm.sh') {
      // Use ?bundle for self-contained modules
      return `${baseUrl}/${pkg}?bundle`;
    }
    
    return `${baseUrl}/${pkg}`;
  }

  /**
   * Fetch module from CDN
   */
  private async fetchFromCDN(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: { 
        'User-Agent': 'xec-cli/1.0',
        'Accept': 'application/javascript, text/javascript, */*'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await response.text();

    // Handle esm.sh redirects
    if (url.includes('esm.sh') && (content.includes('export * from "/') || content.includes('export { default } from "/'))) {
      const matches = content.match(/from\s+["'](\/.+?)["']/);
      if (matches && matches[1]) {
        const redirectUrl = `https://esm.sh${matches[1]}`;
        if (this.options.verbose) {
          console.log(`[ModuleLoader] Following redirect to ${redirectUrl}`);
        }
        return this.fetchFromCDN(redirectUrl);
      }
    }

    return content;
  }

  /**
   * Execute module content
   */
  private async executeModule(content: string, specifier: string): Promise<any> {
    try {
      // For modules from CDN, we need to handle them specially
      // First, try to detect if this is a bundled ESM module
      const isBundled = content.includes('?bundle') || specifier.includes('?bundle');
      
      if (isBundled || content.includes('import ') || content.includes('export ')) {
        // This is an ESM module, we need to save it to a temp file to import it
        const tempDir = path.join(this.cacheDir, 'temp');
        await fs.mkdir(tempDir, { recursive: true });
        
        // Generate unique filename
        const hash = crypto.createHash('sha256').update(specifier).digest('hex').substring(0, 8);
        const tempFile = path.join(tempDir, `module-${hash}-${Date.now()}.mjs`);
        
        // Transform imports in the content to use esm.sh directly
        let transformedContent = content;
        if (specifier.includes('esm.sh')) {
          // Replace relative imports with absolute esm.sh URLs
          transformedContent = transformedContent.replace(
            /from\s+["'](\/.+?)["']/g,
            (match, importPath) => `from "https://esm.sh${importPath}"`
          );
          
          // Also handle dynamic imports
          transformedContent = transformedContent.replace(
            /import\s*\(\s*["'](\/.+?)["']\s*\)/g,
            (match, importPath) => `import("https://esm.sh${importPath}")`
          );
        }
        
        // Write the module to temp file
        await fs.writeFile(tempFile, transformedContent);
        
        try {
          // Import the module
          const module = await import(pathToFileURL(tempFile).href);
          
          // Clean up temp file
          await fs.unlink(tempFile).catch(() => {});
          
          return module;
        } catch (importError) {
          // Clean up temp file
          await fs.unlink(tempFile).catch(() => {});
          
          if (this.options.verbose) {
            console.error(`[ModuleLoader] Failed to import temp module:`, importError);
          }
          
          // Try fallback method
          throw importError;
        }
      }
      
      // For non-ESM modules, use Function constructor
      const wrapperCode = `
        'use strict';
        const exports = {};
        const module = { exports };
        
        ${content}
        
        // Return the exports
        if (typeof module.exports === 'function' || (typeof module.exports === 'object' && module.exports !== exports)) {
          return module.exports;
        } else if (Object.keys(exports).length > 0) {
          return exports;
        } else {
          return {};
        }
      `;
      
      const func = new Function(wrapperCode);
      const result = func();
      
      // Ensure we always return an object
      if (typeof result === 'function') {
        return { default: result };
      }
      
      return result || {};
    } catch (error) {
      if (this.options.verbose) {
        console.error(`[ModuleLoader] Failed to execute module ${specifier}:`, error);
      }
      
      // Last resort - return a mock object
      console.warn(`[ModuleLoader] Using fallback for ${specifier}`);
      return {
        default: function(...args: any[]) {
          console.log(`[ModuleLoader] Mock call to ${specifier}`, args);
          return {};
        }
      };
    }
  }

  /**
   * Load from cache
   */
  private async loadFromCache(url: string): Promise<string | null> {
    if (!this.options.cache) return null;

    // Check memory cache
    const memCached = this.memoryCache.get(url);
    if (memCached && Date.now() - memCached.timestamp < 3600000) { // 1 hour
      if (this.options.verbose) {
        console.log(`[ModuleLoader] Loading ${url} from memory cache`);
      }
      return memCached.content;
    }

    // Check file cache
    const cacheKey = this.getCacheKey(url);
    const cachePath = path.join(this.cacheDir, `${cacheKey}.js`);

    if (!existsSync(cachePath)) return null;

    try {
      const stat = await fs.stat(cachePath);
      // Cache valid for 7 days
      if (Date.now() - stat.mtimeMs > 7 * 24 * 3600000) {
        return null;
      }

      const content = await fs.readFile(cachePath, 'utf-8');
      
      // Update memory cache
      this.memoryCache.set(url, { content, timestamp: Date.now() });
      
      if (this.options.verbose) {
        console.log(`[ModuleLoader] Loading ${url} from file cache`);
      }
      
      return content;
    } catch {
      return null;
    }
  }

  /**
   * Save to cache
   */
  private async saveToCache(url: string, content: string): Promise<void> {
    if (!this.options.cache) return;

    // Update memory cache
    this.memoryCache.set(url, { content, timestamp: Date.now() });

    // Save to file cache
    const cacheKey = this.getCacheKey(url);
    const cachePath = path.join(this.cacheDir, `${cacheKey}.js`);

    try {
      await fs.writeFile(cachePath, content);
    } catch (error) {
      if (this.options.verbose) {
        console.warn(`[ModuleLoader] Failed to cache ${url}:`, error);
      }
    }
  }

  /**
   * Get cache key for a URL
   */
  private getCacheKey(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex');
  }

  /**
   * Transform TypeScript to JavaScript
   */
  async transformTypeScript(code: string, filename: string): Promise<string> {
    const result = await transform(code, {
      format: 'esm',
      target: 'esnext',
      loader: filename.endsWith('.tsx') ? 'tsx' : 'ts',
      sourcemap: false,
      supported: {
        'top-level-await': true
      }
    });
    return result.code;
  }

  /**
   * Load and execute a script
   */
  async loadScript(scriptPath: string, args: string[] = []): Promise<any> {
    await this.init();

    const ext = path.extname(scriptPath);
    let content = await fs.readFile(scriptPath, 'utf-8');

    // Transform TypeScript if needed
    if (ext === '.ts' || ext === '.tsx') {
      content = await this.transformTypeScript(content, scriptPath);
    }

    // Set up script context
    (globalThis as any).__xecScriptContext = {
      args,
      argv: [process.argv[0], scriptPath, ...args],
      __filename: scriptPath,
      __dirname: path.dirname(scriptPath),
    };

    try {
      // Create data URL and import
      const dataUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(content)}`;
      return await import(dataUrl);
    } finally {
      delete (globalThis as any).__xecScriptContext;
    }
  }

  /**
   * Clear cache
   */
  async clearCache(): Promise<void> {
    this.memoryCache.clear();

    if (existsSync(this.cacheDir)) {
      const files = await fs.readdir(this.cacheDir);
      await Promise.all(
        files.map(file => fs.unlink(path.join(this.cacheDir, file)))
      );
    }

    if (this.options.verbose) {
      clack.log.success('Module cache cleared');
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    memoryEntries: number;
    fileEntries: number;
    totalSize: number;
  }> {
    let fileEntries = 0;
    let totalSize = 0;

    if (existsSync(this.cacheDir)) {
      const files = await fs.readdir(this.cacheDir);
      fileEntries = files.length;

      for (const file of files) {
        const stat = await fs.stat(path.join(this.cacheDir, file));
        totalSize += stat.size;
      }
    }

    return {
      memoryEntries: this.memoryCache.size,
      fileEntries,
      totalSize
    };
  }
}

// Singleton instance
let loader: UnifiedModuleLoader | null = null;

/**
 * Get or create the global module loader
 */
export function getModuleLoader(options?: ModuleLoaderOptions): UnifiedModuleLoader {
  if (!loader) {
    loader = new UnifiedModuleLoader(options);
  }
  return loader;
}

/**
 * Initialize the global module context
 */
export async function initializeGlobalModuleContext(options?: ModuleLoaderOptions): Promise<void> {
  const instance = getModuleLoader(options);
  await instance.init();
}

/**
 * Import with special syntax support
 * Examples:
 *   importModule('npm:chalk')
 *   importModule('jsr:@std/encoding')
 *   importModule('esm:lodash')
 */
export async function importModule(specifier: string): Promise<any> {
  const instance = getModuleLoader();
  await instance.init();
  return instance.importModule(specifier);
}
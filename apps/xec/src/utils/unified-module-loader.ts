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
  moduleType?: 'esm' | 'cjs' | 'umd' | 'unknown';
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

    // We cannot override the native import keyword, but we can provide a global function
    // Set up global import function that supports prefixes
    (globalThis as any).Import = (spec: string) => this.importModule(spec);
    
    // Set up module context with the new import function
    (globalThis as any).__xecModuleContext = {
      import: (spec: string) => this.importModule(spec)
    };
    
    // Store reference for scripts
    (globalThis as any).__xecImport = (spec: string) => this.importModule(spec);

    // Load script utilities and make them globally available
    try {
      const scriptUtils = await import('./script-utils.js');
      
      // Make all utilities globally available
      Object.assign(globalThis, scriptUtils.default);
      
      // Ensure individual utilities are also available
      Object.assign(globalThis, {
        $: scriptUtils.$,
        log: scriptUtils.log,
        question: scriptUtils.question,
        confirm: scriptUtils.confirm,
        select: scriptUtils.select,
        multiselect: scriptUtils.multiselect,
        password: scriptUtils.password,
        spinner: scriptUtils.spinner,
        echo: scriptUtils.echo,
        cd: scriptUtils.cd,
        pwd: scriptUtils.pwd,
        fs: scriptUtils.fs,
        glob: scriptUtils.glob,
        path: scriptUtils.path,
        os: scriptUtils.os,
        fetch: scriptUtils.fetch,
        chalk: scriptUtils.chalk,
        which: scriptUtils.which,
        sleep: scriptUtils.sleep,
        retry: scriptUtils.retry,
        within: scriptUtils.within,
        env: scriptUtils.env,
        setEnv: scriptUtils.setEnv,
        exit: scriptUtils.exit,
        kill: scriptUtils.kill,
        ps: scriptUtils.ps,
        tmpdir: scriptUtils.tmpdir,
        tmpfile: scriptUtils.tmpfile,
        yaml: scriptUtils.yaml,
        csv: scriptUtils.csv,
        diff: scriptUtils.diff,
        parseArgs: scriptUtils.parseArgs,
        loadEnv: scriptUtils.loadEnv,
        quote: scriptUtils.quote,
        template: scriptUtils.template,
      });
    } catch (error) {
      // Log error but don't fail initialization
      if (this.options.verbose) {
        console.warn('[ModuleLoader] Failed to load script utilities:', error);
      }
    }

    this.isInitialized = true;
  }

  /**
   * Find node_modules path by searching upwards
   */
  private async findNodeModulesPath(): Promise<string | null> {
    const checkPaths = [
      path.dirname(import.meta.url.replace('file://', '')),
      process.cwd()
    ];

    for (const startPath of checkPaths) {
      let dir = startPath;
      for (let i = 0; i < 10 && dir !== path.dirname(dir); i++) {
        const nodeModulesDir = path.join(dir, 'node_modules');
        if (existsSync(nodeModulesDir)) return nodeModulesDir;
        dir = path.dirname(dir);
      }
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
      const originalImport = (globalThis as any).__originalImport || (async (spec: string) => import(spec));
      return originalImport(specifier);
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
    // Try local resolution first
    const localModule = await this.tryLocalImport(specifier);
    if (localModule) return localModule;

    // Try direct import for built-in modules
    try {
      const originalImport = (globalThis as any).__originalImport || (async (spec: string) => import(spec));
      return await originalImport(specifier);
    } catch {
      // Fallback to CDN
      return this.importFromCDN(specifier, 'auto');
    }
  }

  private async tryLocalImport(specifier: string): Promise<any> {
    if (!this.nodeModulesPath || specifier.startsWith('node:')) return null;

    try {
      const modulePath = path.join(this.nodeModulesPath, specifier, 'package.json');
      if (existsSync(modulePath)) {
        const pkg = JSON.parse(await fs.readFile(modulePath, 'utf-8'));
        const mainFile = pkg.module || pkg.main || 'index.js';
        const originalImport = (globalThis as any).__originalImport || (async (spec: string) => import(spec));
        return await originalImport(pathToFileURL(path.join(this.nodeModulesPath, specifier, mainFile)).href);
      }
    } catch {}
    return null;
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
      console.debug(`[ModuleLoader] Loading ${pkg} from CDN: ${cdnUrl}`);
    }

    try {
      // Check cache first
      const cached = await this.loadFromCache(cdnUrl);
      if (cached) {
        const cacheEntry = this.memoryCache.get(cdnUrl);
        return await this.executeModule(cached, cdnUrl, cacheEntry?.headers);
      }

      // Fetch from CDN
      const content = await this.fetchFromCDN(cdnUrl);

      // Transform the content if needed before caching
      const transformedContent = this.transformESMContent(content, cdnUrl);

      // Save transformed content to cache
      if (this.options.cache) {
        await this.saveToCache(cdnUrl, transformedContent);
      }

      // Execute the module
      return await this.executeModule(transformedContent, cdnUrl);
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
    if (pkg.startsWith('http')) return pkg;

    const cdnKey = source === 'auto' ? this.options.preferredCDN || 'esm.sh' : 
                   source === 'npm' || source === 'esm' ? 'esm.sh' : source;

    const baseUrl = CDN_URLS[cdnKey as keyof typeof CDN_URLS] || CDN_URLS['esm.sh'];

    if (source === 'jsr' || (source === 'auto' && pkg.startsWith('@'))) {
      return `${baseUrl}/jsr/${pkg}${cdnKey === 'esm.sh' ? '?bundle' : ''}`;
    }

    return `${baseUrl}/${pkg}${cdnKey === 'esm.sh' ? '?bundle' : ''}`;
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
    
    // Store headers for module type detection
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    
    // Store headers in a temporary variable to pass to saveToCache
    (this as any)._tempHeaders = headers;

    // Handle esm.sh redirects
    const redirectMatch = content.match(/export (?:\* from|\{ default \} from) ["'](\/.+?)["']/);
    if (url.includes('esm.sh') && redirectMatch?.[1]) {
      return this.fetchFromCDN(`https://esm.sh${redirectMatch[1]}`);
    }

    return content;
  }

  /**
   * Detect module type from content and metadata
   */
  private detectModuleType(content: string, headers?: Record<string, string>): 'esm' | 'cjs' | 'umd' | 'unknown' {
    // Check headers first for hints
    const contentType = headers?.['content-type'] || '';
    const xModuleType = headers?.['x-module-type'];
    
    if (xModuleType) return xModuleType as any;
    
    // Remove comments for analysis
    const cleanContent = content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '')
      .replace(/["'][^"']*["']/g, ''); // Remove string literals
    
    // ESM detection patterns
    const esmPatterns = [
      /^\s*import\s+[\w{},\s*]+\s+from\s+["']/m,
      /^\s*import\s+["']/m,
      /^\s*export\s+(?:default|const|let|var|function|class|async|{)/m,
      /^\s*export\s*\{[^}]+\}\s*from\s*["']/m,
      /^\s*export\s*\*\s*from\s*["']/m
    ];
    
    // CJS detection patterns
    const cjsPatterns = [
      /^\s*module\.exports\s*=/m,
      /^\s*exports\.[\w$]+\s*=/m,
      /^\s*Object\.defineProperty\s*\(\s*exports/m,
      /\brequire\s*\(["'][^"']+["']\)/
    ];
    
    // UMD detection patterns
    const umdPatterns = [
      /typeof\s+exports\s*===\s*["']object["']\s*&&\s*typeof\s+module\s*!==\s*["']undefined["']/,
      /typeof\s+define\s*===\s*["']function["']\s*&&\s*define\.amd/,
      /\(function\s*\(.*?\)\s*{[\s\S]*?}\s*\(.*?typeof\s+exports.*?\)\)/
    ];
    
    // Check for UMD first (as it can contain both ESM and CJS patterns)
    if (umdPatterns.some(pattern => pattern.test(cleanContent))) {
      return 'umd';
    }
    
    const hasEsmSyntax = esmPatterns.some(pattern => pattern.test(cleanContent));
    const hasCjsSyntax = cjsPatterns.some(pattern => pattern.test(cleanContent));
    
    // If it has both, it's likely transpiled ESM or a complex module
    if (hasEsmSyntax && hasCjsSyntax) {
      // Check if it's transpiled ESM (common pattern from bundlers)
      if (cleanContent.includes('__esModule')) {
        return 'esm';
      }
      return 'umd';
    }
    
    if (hasEsmSyntax) return 'esm';
    if (hasCjsSyntax) return 'cjs';
    
    // Check for simple function exports (common in older modules)
    if (/^\s*\(\s*function\s*\([^)]*\)\s*{/.test(cleanContent)) {
      return 'cjs';
    }
    
    return 'unknown';
  }

  /**
   * Execute module content
   */
  private async executeModule(content: string, specifier: string, headers?: Record<string, string>): Promise<any> {
    try {
      const moduleType = this.detectModuleType(content, headers);
      
      if (this.options.verbose) {
        console.debug(`[ModuleLoader] Detected module type for ${specifier}: ${moduleType}`);
      }
      
      switch (moduleType) {
        case 'esm':
          return await this.executeESMModule(content, specifier);
        
        case 'cjs':
          return this.executeCJSModule(content);
        
        case 'umd':
          return this.executeUMDModule(content, specifier);
        
        case 'unknown':
        default:
          // Try ESM first, fallback to CJS
          try {
            return await this.executeESMModule(content, specifier);
          } catch (esmError) {
            if (this.options.verbose) {
              console.debug(`[ModuleLoader] ESM execution failed, trying CJS:`, esmError);
            }
            return this.executeCJSModule(content);
          }
      }
    } catch (error) {
      if (this.options.verbose) {
        console.error(`[ModuleLoader] Failed to execute module ${specifier}:`, error);
      }
      throw error;
    }
  }

  /**
   * Load from cache
   */
  private async loadFromCache(url: string): Promise<string | null> {
    if (!this.options.cache) return null;

    // Check memory cache first
    const memCached = this.memoryCache.get(url);
    if (memCached && Date.now() - memCached.timestamp < 3600000) {
      return memCached.content;
    }

    // Check file cache
    try {
      const cacheKey = this.getCacheKey(url);
      const cachePath = path.join(this.cacheDir, `${cacheKey}.js`);
      const metaPath = path.join(this.cacheDir, `${cacheKey}.meta.json`);
      
      const stat = await fs.stat(cachePath);
      
      if (Date.now() - stat.mtimeMs > 7 * 24 * 3600000) return null;
      
      const content = await fs.readFile(cachePath, 'utf-8');
      
      // Try to load metadata
      let headers: Record<string, string> = {};
      try {
        const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
        headers = meta.headers || {};
      } catch {
        // Metadata file might not exist for old cache entries
      }
      
      this.memoryCache.set(url, { content, timestamp: Date.now(), headers });
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

    const headers = (this as any)._tempHeaders || {};
    delete (this as any)._tempHeaders;
    
    this.memoryCache.set(url, { content, timestamp: Date.now(), headers });
    
    const cachePath = path.join(this.cacheDir, `${this.getCacheKey(url)}.js`);
    await fs.writeFile(cachePath, content).catch(() => {});
    
    // Save metadata
    const metaPath = path.join(this.cacheDir, `${this.getCacheKey(url)}.meta.json`);
    await fs.writeFile(metaPath, JSON.stringify({ headers, timestamp: Date.now() })).catch(() => {});
  }

  /**
   * Get cache key for a URL
   */
  private getCacheKey(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex');
  }

  /**
   * Transform ESM.sh content
   */
  private transformESMContent(content: string, cdnUrl: string): string {
    if (!cdnUrl.includes('esm.sh')) return content;

    return content
      // Transform from statements
      .replace(/from\s+["'](\/.+?)["']/g, (match, importPath) => {
        if (importPath.startsWith('/node/')) {
          const moduleName = importPath.replace('/node/', '').replace(/\.m?js$/, '');
          // Handle special cases
          switch (moduleName) {
            case 'process':
            case 'buffer':
            case 'stream':
            case 'events':
            case 'util':
            case 'path':
            case 'fs':
            case 'crypto':
            case 'os':
            case 'url':
            case 'querystring':
            case 'string_decoder':
              return `from "node:${moduleName}"`;
            default:
              return `from "node:${moduleName}"`;
          }
        }
        return `from "https://esm.sh${importPath}"`;
      })
      // Transform dynamic imports
      .replace(/import\s*\(\s*["'](\/.+?)["']\s*\)/g, (match, importPath) => {
        if (importPath.startsWith('/node/')) {
          const moduleName = importPath.replace('/node/', '').replace(/\.m?js$/, '');
          return `import("node:${moduleName}")`;
        }
        return `import("https://esm.sh${importPath}")`;
      })
      // Transform static imports
      .replace(/import\s+["'](\/.+?)["'];/g, (match, importPath) => {
        if (importPath.startsWith('/node/')) {
          const moduleName = importPath.replace('/node/', '').replace(/\.m?js$/, '');
          return `import "node:${moduleName}";`;
        }
        return `import "https://esm.sh${importPath}";`;
      })
      // Transform export statements with paths
      .replace(/export\s+(?:\*|\{[^}]+\})\s+from\s+["'](\/.+?)["']/g, (match, importPath) => {
        if (importPath.startsWith('/node/')) {
          const moduleName = importPath.replace('/node/', '').replace(/\.m?js$/, '');
          return match.replace(importPath, `node:${moduleName}`);
        }
        return match.replace(importPath, `https://esm.sh${importPath}`);
      });
  }

  /**
   * Execute ESM module
   */
  private async executeESMModule(content: string, specifier: string): Promise<any> {
    const tempDir = path.join(this.cacheDir, 'temp');
    await fs.mkdir(tempDir, { recursive: true });

    const hash = crypto.createHash('sha256').update(specifier).digest('hex').substring(0, 8);
    const tempFile = path.join(tempDir, `module-${hash}-${Date.now()}.mjs`);

    try {
      await fs.writeFile(tempFile, content);
      const originalImport = (globalThis as any).__originalImport || (async (spec: string) => import(spec));
      const module = await originalImport(pathToFileURL(tempFile).href);
      await fs.unlink(tempFile).catch(() => {});
      return module;
    } catch (error) {
      await fs.unlink(tempFile).catch(() => {});
      throw error;
    }
  }

  /**
   * Execute CommonJS module
   */
  private executeCJSModule(content: string): any {
    const moduleExports = {};
    const moduleObj = { exports: moduleExports };
    const requireStub = (id: string) => {
      // Basic require stub for common Node.js modules
      if (id === 'util' || id === 'path' || id === 'fs') {
        throw new Error(`Cannot require '${id}' in browser environment`);
      }
      throw new Error(`require('${id}') not supported in CDN modules`);
    };
    
    try {
      const func = new Function('exports', 'module', 'require', '__dirname', '__filename', content);
      func(moduleExports, moduleObj, requireStub, '/', '/module.js');
    } catch (error) {
      // Try without __dirname/__filename for simpler modules
      const func = new Function('exports', 'module', 'require', content);
      func(moduleExports, moduleObj, requireStub);
    }
    
    const result = moduleObj.exports;
    
    // Handle different export patterns
    if (result && typeof result === 'object' && Object.keys(result).length === 0) {
      // Empty exports, might be a function module
      return { default: {} };
    }
    
    // If it's a single function export, wrap it
    if (typeof result === 'function') {
      const wrapped: any = { default: result };
      // Copy function properties
      Object.assign(wrapped, result);
      return wrapped;
    }
    
    // If it has a default property already, return as is
    if (result && typeof result === 'object' && 'default' in result) {
      return result;
    }
    
    // Otherwise wrap in default
    const wrapped: any = { default: result };
    if (result && typeof result === 'object') {
      Object.assign(wrapped, result);
    }
    return wrapped;
  }

  /**
   * Execute UMD module
   */
  private executeUMDModule(content: string, specifier: string): any {
    // UMD modules are designed to work in multiple environments
    // We'll execute them in a CommonJS-like environment
    const moduleExports = {};
    const moduleObj = { exports: moduleExports };
    
    // Create a fake AMD define if needed
    const define = (deps: any, factory: any) => {
      if (typeof deps === 'function') {
        factory = deps;
        deps = [];
      }
      if (factory) {
        const result = factory();
        if (result !== undefined) {
          moduleObj.exports = result;
        }
      }
    };
    define.amd = true;
    
    try {
      // Create a more complete global context for UMD
      const func = new Function(
        'exports', 
        'module', 
        'define', 
        'global',
        'globalThis',
        'window',
        'self',
        content
      );
      
      const globalObj = globalThis;
      func(
        moduleExports, 
        moduleObj, 
        define,
        globalObj,
        globalObj,
        globalObj,
        globalObj
      );
      
      const result = moduleObj.exports;
      
      // Handle UMD export patterns
      if (typeof result === 'function') {
        const wrapped: any = { default: result };
        // Copy function properties
        Object.assign(wrapped, result);
        return wrapped;
      }
      
      if (result && typeof result === 'object' && 'default' in result) {
        return result;
      }
      
      const wrapped: any = { default: result };
      if (result && typeof result === 'object') {
        Object.assign(wrapped, result);
      }
      return wrapped;
    } catch (error) {
      // Fallback to simple CJS execution
      return this.executeCJSModule(content);
    }
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

    let content = await fs.readFile(scriptPath, 'utf-8');
    const ext = path.extname(scriptPath);

    if (ext === '.ts' || ext === '.tsx') {
      content = await this.transformTypeScript(content, scriptPath);
    }

    (globalThis as any).__xecScriptContext = {
      args,
      argv: [process.argv[0], scriptPath, ...args],
      __filename: scriptPath,
      __dirname: path.dirname(scriptPath),
    };

    try {
      return await this.executeESMModule(content, scriptPath);
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
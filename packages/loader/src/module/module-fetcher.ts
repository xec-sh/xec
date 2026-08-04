/**
 * Module fetching with retry logic
 * @module @xec-sh/loader/module/module-fetcher
 */

import type { Cache } from '../types/index.js';
import type { ModuleIntegrityVerifier } from './module-integrity.js';

import { IntegrityError } from './module-integrity.js';

/** Redirect hops to follow before treating the chain as a loop. */
const MAX_REDIRECTS = 5;

export interface FetchOptions {
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export interface FetchedModule {
  content: string;
  headers: Record<string, string>;
  url: string;
}

/**
 * ModuleFetcher handles HTTP fetching of modules
 */
export class ModuleFetcher {
  /**
   * @param cache - Cache for fetched module text.
   * @param integrity - Verifier applied to every remote fetch. When omitted,
   *   content is executed unverified — only acceptable for local file loading.
   */
  constructor(
    private cache: Cache<string>,
    private integrity?: ModuleIntegrityVerifier
  ) {}

  /**
   * Fetch module from URL with caching and retry logic
   */
  async fetch(url: string, options: FetchOptions = {}): Promise<FetchedModule> {
    const {
      timeout = 30000,
      retries = 3,
      headers = {},
    } = options;

    // Reject a disallowed host before contacting it at all.
    this.integrity?.assertHostAllowed(url);

    // Check cache first
    const cached = await this.cache.get(url);
    if (cached) {
      // The cache lives on disk and is writable by anything running as this
      // user, so cached content is verified exactly like a fresh fetch.
      await this.integrity?.verify(url, cached);

      return {
        content: cached,
        headers: {},
        url,
      };
    }

    // Fetch with retry
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, timeout, headers);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const content = await response.text();
        const responseHeaders = this.extractHeaders(response);

        // Check if this is a redirect module (common with esm.sh)
        // Transform content first to handle polyfills like /node/process.mjs
        const transformedContent = this.transformContent(content, url);

        // Check for redirect after transformation
        const redirectInfo = this.detectRedirectWithImports(transformedContent, url);

        if (redirectInfo && redirectInfo.target) {
          // Recursively fetch the actual module
          const targetModule = await this.fetch(redirectInfo.target, options);

          // If there were polyfill imports, prepend them to the target module content
          if (redirectInfo.imports.length > 0) {
            targetModule.content = redirectInfo.imports.join('\n') + '\n' + targetModule.content;
          }

          return targetModule;
        }

        // Verify before caching, so content that fails the check never
        // reaches disk and cannot be served to a later run.
        await this.integrity?.verify(url, transformedContent);
        await this.integrity?.save();

        // Cache the transformed result
        await this.cache.set(url, transformedContent);

        return {
          content: transformedContent,
          headers: responseHeaders,
          url,
        };
      } catch (error) {
        // An integrity failure is a verdict, not a transient fault. Retrying
        // would re-fetch the same rejected bytes and could mask the mismatch.
        if (error instanceof IntegrityError) {
          throw error;
        }

        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on 404 or other client errors
        if (error instanceof Error && error.message.includes('HTTP 4')) {
          break;
        }

        // Wait before retry with exponential backoff
        if (attempt < retries) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw new Error(`Failed to fetch module after ${retries + 1} attempts: ${lastError?.message}`);
  }

  private async fetchWithTimeout(
    url: string,
    timeout: number,
    headers: Record<string, string>
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Follow redirects by hand so every hop is checked against the host
      // allowlist. With the default `redirect: 'follow'` only the first URL
      // was checked, so an allowlisted CDN redirecting elsewhere — an open
      // redirect, or a compromised one — delivered code from a host the
      // policy forbids, and the lockfile pinned it under the allowed URL.
      let current = url;

      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        this.integrity?.assertHostAllowed(current);

        const response = await fetch(current, {
          headers: {
            'User-Agent': 'xec-loader/0.1.0',
            ...headers,
          },
          redirect: 'manual',
          signal: controller.signal,
        });

        if (response.status < 300 || response.status >= 400) {
          return response;
        }

        const location = response.headers.get('location');

        if (!location) {
          return response;
        }

        current = new URL(location, current).toString();
      }

      throw new Error(`Too many redirects (>${MAX_REDIRECTS}) fetching ${url}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private extractHeaders(response: Response): Record<string, string> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return headers;
  }

  /**
   * Detect if content is just a redirect module (re-export)
   * Common patterns with esm.sh:
   * - export * from "/path/to/actual/module.mjs";
   * - export * from "/path"; export { default } from "/path";
   * - import "/node/process.mjs"; export * from "/path"; (with polyfills)
   * - export * from "https://..."; export { default } from "https://..."; (after transformation)
   */
  private detectRedirect(content: string, baseURL: string): string | null {
    // Remove comments (but not // in URLs)
    // First remove block comments
    let cleaned = content.replace(/\/\*[\s\S]*?\*\//g, '');
    // Then remove line comments (but not // in URLs)
    // Match // only if it's not preceded by : (as in https://)
    cleaned = cleaned.replace(/(?<!:)\/\/.*/g, '').trim();

    // Remove import statements (esm.sh polyfills like /node/process.mjs or node:process)
    const withoutImports = cleaned.replace(/import\s+["'][^"']+["'];?\s*/g, '');

    // Pattern 1: export * from "path"; export { default } from "path"; (same path)
    const pattern1 = /export\s+\*\s+from\s+["']([^"']+)["'];?\s*export\s+{\s*default\s*}\s+from\s+["']\1["']/;
    let match = withoutImports.match(pattern1);

    // Pattern 2: Just export * from "path";
    if (!match) {
      const pattern2 = /^export\s+\*\s+from\s+["']([^"']+)["'];?\s*$/;
      match = withoutImports.match(pattern2);
    }

    // Pattern 3: export * from "path1"; export { default } from "path2"; (different but related paths)
    if (!match) {
      const pattern3 = /export\s+\*\s+from\s+["']([^"']+)["'];?\s*export\s+{\s*default\s*}\s+from\s+["']([^"']+)["']/;
      const match3 = withoutImports.match(pattern3);
      if (match3 && match3[1] && match3[1] === match3[2]) {
        match = [match3[0], match3[1]];
      }
    }

    if (match && match[1]) {
      const targetPath = match[1];
      // If it's already a full URL (after transformation), return as-is
      if (targetPath.startsWith('http://') || targetPath.startsWith('https://')) {
        return targetPath;
      }
      // If it's a relative path, resolve it against the base URL
      if (targetPath.startsWith('/')) {
        const base = new URL(baseURL);
        return `${base.protocol}//${base.host}${targetPath}`;
      }
      // Otherwise return as-is
      return targetPath;
    }

    return null;
  }

  /**
   * Detect redirect and preserve polyfill imports
   */
  private detectRedirectWithImports(content: string, baseURL: string): { target: string | null; imports: string[] } {
    // Remove comments
    const cleaned = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '').trim();

    // Extract import statements
    const importRegex = /import\s+["'][^"']+["'];?/g;
    const imports = cleaned.match(importRegex) || [];

    // Detect redirect target
    const target = this.detectRedirect(content, baseURL);

    return { target, imports };
  }

  /**
   * Transform ESM content to rewrite import paths
   */
  private transformContent(content: string, baseURL: string): string {
    // Transform /node/module@version paths to node:module (from statements)
    content = content.replace(
      /from\s+["']\/node\/([^@"']+?)(?:\.mjs)?(?:@[^"']+)?["']/g,
      (match, moduleName) => {
        const quote = match.includes('"') ? '"' : "'";
        // Remove .mjs extension if present in module name
        const cleanModuleName = moduleName.replace(/\.mjs$/, '');
        return `from ${quote}node:${cleanModuleName}${quote}`;
      }
    );

    // Transform /node/module@version paths to node:module (import statements without from)
    content = content.replace(
      /import\s+["']\/node\/([^@"']+?)(?:\.mjs)?(?:@[^"']+)?["']/g,
      (match, moduleName) => {
        const quote = match.includes('"') ? '"' : "'";
        // Remove .mjs extension if present in module name
        const cleanModuleName = moduleName.replace(/\.mjs$/, '');
        return `import ${quote}node:${cleanModuleName}${quote}`;
      }
    );

    // Transform relative esm.sh paths
    if (baseURL.includes('esm.sh')) {
      content = content
        .replace(/from\s+["'](\/.+?)["']/g, (match, importPath) => {
          if (!importPath.startsWith('/node/')) {
            return `from "https://esm.sh${importPath}"`;
          }
          return match;
        })
        .replace(/import\s+["'](\/.+?)["']/g, (match, importPath) => {
          // Skip /node/ imports as they're already transformed above
          if (importPath.startsWith('/node/')) {
            return match;
          }
          return `import "https://esm.sh${importPath}"`;
        })
        .replace(/import\s*\(\s*["'](\/.+?)["']\s*\)/g, (match, importPath) => {
          if (!importPath.startsWith('/node/')) {
            return `import("https://esm.sh${importPath}")`;
          }
          return match;
        });
    }

    return content;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

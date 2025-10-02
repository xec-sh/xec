/**
 * Module fetching with retry logic
 * @module @xec-sh/loader/module/module-fetcher
 */

import type { Cache } from '../types/index.js';

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
  constructor(private cache: Cache<string>) {}

  /**
   * Fetch module from URL with caching and retry logic
   */
  async fetch(url: string, options: FetchOptions = {}): Promise<FetchedModule> {
    const {
      timeout = 30000,
      retries = 3,
      headers = {},
    } = options;

    // Check cache first
    const cached = await this.cache.get(url);
    if (cached) {
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
        // IMPORTANT: Check BEFORE transforming, as transform changes paths
        const redirectTarget = this.detectRedirect(content, url);
        if (redirectTarget) {
          // Recursively fetch the actual module (don't cache redirects)
          return this.fetch(redirectTarget, options);
        }

        // Transform content if needed
        const transformedContent = this.transformContent(content, url);

        // Cache the transformed result
        await this.cache.set(url, transformedContent);

        return {
          content: transformedContent,
          headers: responseHeaders,
          url,
        };
      } catch (error) {
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
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'xec-loader/0.1.0',
          ...headers,
        },
        signal: controller.signal,
      });
      return response;
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
   */
  private detectRedirect(content: string, baseURL: string): string | null {
    // Remove comments and whitespace
    const cleaned = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '').trim();

    // Remove import statements (esm.sh polyfills like /node/process.mjs)
    const withoutImports = cleaned.replace(/import\s+["'][^"']+["'];?\s*/g, '');

    // Pattern 1: export * from "/path"; export { default } from "/path";
    const pattern1 = /export\s+\*\s+from\s+["']([^"']+)["'];?\s*export\s+{\s*default\s*}\s+from\s+["']\1["']/;
    let match = withoutImports.match(pattern1);

    // Pattern 2: Just export * from "/path";
    if (!match) {
      const pattern2 = /^export\s+\*\s+from\s+["']([^"']+)["'];?\s*$/;
      match = withoutImports.match(pattern2);
    }

    if (match && match[1]) {
      const targetPath = match[1];
      // If it's a relative path, resolve it against the base URL
      if (targetPath.startsWith('/')) {
        const base = new URL(baseURL);
        return `${base.protocol}//${base.host}${targetPath}`;
      }
      // Otherwise return as-is (shouldn't happen with esm.sh)
      return targetPath;
    }

    return null;
  }

  /**
   * Transform ESM content to rewrite import paths
   */
  private transformContent(content: string, baseURL: string): string {
    // Transform /node/module@version paths to node:module (from statements)
    content = content.replace(
      /from\s+["']\/node\/([^@"']+)(?:@[^"']+)?(?:\.mjs)?["']/g,
      (match, moduleName) => {
        const quote = match.includes('"') ? '"' : "'";
        return `from ${quote}node:${moduleName}${quote}`;
      }
    );

    // Transform /node/module@version paths to node:module (import statements without from)
    content = content.replace(
      /import\s+["']\/node\/([^@"']+)(?:@[^"']+)?(?:\.mjs)?["']/g,
      (match, moduleName) => {
        const quote = match.includes('"') ? '"' : "'";
        return `import ${quote}node:${moduleName}${quote}`;
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

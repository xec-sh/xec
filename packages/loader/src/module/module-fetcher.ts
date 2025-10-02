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

        // Transform content if needed
        const transformedContent = this.transformContent(content, url);

        // Cache the result
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
   * Transform ESM content to rewrite import paths
   */
  private transformContent(content: string, baseURL: string): string {
    // Transform /node/module@version paths to node:module
    content = content.replace(
      /from\s+["']\/node\/([^@"']+)(?:@[^"']+)?["']/g,
      (match, moduleName) => {
        const quote = match.includes('"') ? '"' : "'";
        return `from ${quote}node:${moduleName}${quote}`;
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
          if (!importPath.startsWith('/node/')) {
            return `import "https://esm.sh${importPath}"`;
          }
          return match;
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

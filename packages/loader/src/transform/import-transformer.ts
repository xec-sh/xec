/**
 * ImportTransformer handles ESM import path transformations
 * @module @xec-sh/loader/transform/import-transformer
 */

/**
 * Options for import transformation
 */
export interface ImportTransformOptions {
  /**
   * Base URL for relative imports (e.g., 'https://esm.sh')
   */
  baseUrl?: string;

  /**
   * Whether to transform node: imports
   */
  transformNodeImports?: boolean;

  /**
   * Whether to transform relative imports to absolute
   */
  transformRelativeImports?: boolean;

  /**
   * Custom transformation rules
   */
  customRules?: Array<{
    pattern: RegExp;
    replacement: string | ((match: string, ...groups: string[]) => string);
  }>;
}

/**
 * ImportTransformer transforms ESM import statements
 */
export class ImportTransformer {
  private readonly options: Required<Omit<ImportTransformOptions, 'customRules'>> & {
    customRules: ImportTransformOptions['customRules'];
  };

  constructor(options: ImportTransformOptions = {}) {
    this.options = {
      baseUrl: options.baseUrl || '',
      transformNodeImports: options.transformNodeImports ?? true,
      transformRelativeImports: options.transformRelativeImports ?? true,
      customRules: options.customRules,
    };
  }

  /**
   * Transform /node/module@version to node:module
   */
  private transformNodePaths(content: string): string {
    if (!this.options.transformNodeImports) {
      return content;
    }

    // Transform /node/module@version or /node/module.js to node:module
    return content.replace(
      /from\s+["']\/node\/([^@"'/.]+)(?:\.m?js)?(?:@[^"']+)?["']/g,
      (match, moduleName) => {
        const quote = match.includes('"') ? '"' : "'";
        return `from ${quote}node:${moduleName}${quote}`;
      }
    );
  }

  /**
   * Transform relative paths to absolute URLs
   */
  private transformRelativePaths(content: string, baseUrl: string): string {
    if (!this.options.transformRelativeImports || !baseUrl) {
      return content;
    }

    // Only transform if base URL is provided and content contains relative imports
    if (!baseUrl.startsWith('http')) {
      return content;
    }

    // Transform from statements with relative paths
    content = content.replace(
      /from\s+["'](\/.+?)["']/g,
      (match, importPath) => {
        if (!importPath.startsWith('/node/')) {
          return `from "${baseUrl}${importPath}"`;
        }
        return match;
      }
    );

    // Transform static import statements
    content = content.replace(
      /import\s+["'](\/.+?)["']/g,
      (match, importPath) => {
        if (!importPath.startsWith('/node/')) {
          return `import "${baseUrl}${importPath}"`;
        }
        return match;
      }
    );

    // Transform dynamic imports
    content = content.replace(
      /import\s*\(\s*["'](\/.+?)["']\s*\)/g,
      (match, importPath) => {
        if (!importPath.startsWith('/node/')) {
          return `import("${baseUrl}${importPath}")`;
        }
        return match;
      }
    );

    // Transform export from statements
    content = content.replace(
      /export\s+(?:\*|\{[^}]+\})\s+from\s+["'](\/.+?)["']/g,
      (match, importPath) => {
        if (!importPath.startsWith('/node/')) {
          const exportPart = match.substring(0, match.indexOf('from'));
          return `${exportPart}from "${baseUrl}${importPath}"`;
        }
        return match;
      }
    );

    return content;
  }

  /**
   * Apply custom transformation rules
   */
  private applyCustomRules(content: string): string {
    if (!this.options.customRules) {
      return content;
    }

    for (const rule of this.options.customRules) {
      content = content.replace(rule.pattern, rule.replacement as any);
    }

    return content;
  }

  /**
   * Transform ESM content
   */
  transform(content: string, sourceUrl?: string): string {
    // Apply transformations in order
    let transformed = content;

    // 1. Transform node: imports first
    transformed = this.transformNodePaths(transformed);

    // 2. Transform relative imports to absolute (if base URL provided)
    const baseUrl = sourceUrl || this.options.baseUrl;
    if (baseUrl) {
      transformed = this.transformRelativePaths(transformed, baseUrl);
    }

    // 3. Apply custom rules
    transformed = this.applyCustomRules(transformed);

    return transformed;
  }

  /**
   * Transform ESM content for esm.sh specifically
   */
  transformESMsh(content: string, cdnUrl: string): string {
    if (!cdnUrl.includes('esm.sh')) {
      return content;
    }

    return this.transform(content, 'https://esm.sh');
  }

  /**
   * Transform ESM content for any CDN
   */
  transformCDN(content: string, cdnUrl: string): string {
    // Extract base URL from CDN URL
    const match = cdnUrl.match(/^(https?:\/\/[^/]+)/);
    if (!match) {
      return content;
    }

    const baseUrl = match[1];
    return this.transform(content, baseUrl);
  }

  /**
   * Add custom transformation rule
   */
  addRule(pattern: RegExp, replacement: string | ((match: string, ...groups: string[]) => string)): void {
    if (!this.options.customRules) {
      this.options.customRules = [];
    }
    this.options.customRules.push({ pattern, replacement });
  }

  /**
   * Clear custom rules
   */
  clearRules(): void {
    this.options.customRules = [];
  }

  /**
   * Get current options
   */
  getOptions(): ImportTransformOptions {
    return { ...this.options };
  }
}

/**
 * Create a new ImportTransformer instance
 */
export function createImportTransformer(options?: ImportTransformOptions): ImportTransformer {
  return new ImportTransformer(options);
}

/**
 * Transform ESM content (convenience function)
 */
export function transformImports(content: string, options?: ImportTransformOptions): string {
  const transformer = new ImportTransformer(options);
  return transformer.transform(content);
}

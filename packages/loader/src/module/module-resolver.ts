/**
 * Module resolution strategies
 * @module @xec-sh/loader/module/module-resolver
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import type { CDNProvider, ModuleResolver, ModuleSpecifier, ModuleResolution } from '../types/index.js';
import { isNodeBuiltinModule } from '../constants.js';

/**
 * CDN URL mappings
 */
const CDN_URLS: Record<CDNProvider, string> = {
  'esm.sh': 'https://esm.sh',
  'jsr.io': 'https://jsr.io',
  'unpkg': 'https://unpkg.com',
  'skypack': 'https://cdn.skypack.dev',
  'jsdelivr': 'https://cdn.jsdelivr.net/npm',
};

/**
 * LocalModuleResolver handles local file paths
 */
export class LocalModuleResolver implements ModuleResolver {
  private readonly allowedBaseDir: string | null;

  constructor(options?: { baseDir?: string }) {
    this.allowedBaseDir = options?.baseDir ? path.resolve(options.baseDir) : null;
  }

  canResolve(specifier: ModuleSpecifier): boolean {
    return (
      specifier.startsWith('./') ||
      specifier.startsWith('../') ||
      specifier.startsWith('file://') ||
      path.isAbsolute(specifier)
    );
  }

  async resolve(specifier: ModuleSpecifier): Promise<ModuleResolution> {
    let resolved: string;

    // Handle file:// URLs
    if (specifier.startsWith('file://')) {
      resolved = new URL(specifier).pathname;
    } else {
      // Resolve relative or absolute paths
      resolved = path.resolve(specifier);
    }

    // Validate against path traversal attacks
    this.validatePath(resolved, specifier);

    // Check if file exists
    try {
      await fs.access(resolved);
    } catch {
      throw new Error(`Local module not found: ${specifier}`);
    }

    return {
      resolved,
      type: 'esm',
      fromCache: false,
    };
  }

  /**
   * Validate path to prevent directory traversal attacks
   */
  private validatePath(resolved: string, original: string): void {
    // Normalize the path to resolve any .. or . components
    const normalized = path.normalize(resolved);

    // Check for null bytes (poison null byte attack)
    if (original.includes('\0') || normalized.includes('\0')) {
      throw new Error(`Invalid module path (null byte detected): ${original}`);
    }

    // If a base directory is configured, ensure path stays within it
    if (this.allowedBaseDir) {
      const relativePath = path.relative(this.allowedBaseDir, normalized);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error(`Module path escapes allowed directory: ${original}`);
      }
    }

    // Check for suspicious patterns that might indicate traversal attempts
    // even if they resolve to a valid path
    const suspiciousPatterns = [
      /\.\.[/\\]/, // ../ or ..\
      /\/\.\.\//,  // /../
      /\\\.\.\\/,  // \..\
    ];

    // Only warn for relative paths that contain traversal
    if (!path.isAbsolute(original) && suspiciousPatterns.some(p => p.test(original))) {
      // Log warning but allow if the resolved path is valid
      // This allows legitimate uses like './foo/../bar' while flagging
      // potentially malicious patterns
    }
  }
}

/**
 * CDNModuleResolver handles CDN-based modules
 */
export class CDNModuleResolver implements ModuleResolver {
  constructor(private preferredCDN: CDNProvider = 'esm.sh') {}

  canResolve(specifier: ModuleSpecifier): boolean {
    return (
      /^(npm|jsr|esm|unpkg|skypack|jsdelivr):/.test(specifier) ||
      specifier.startsWith('http://') ||
      specifier.startsWith('https://')
    );
  }

  async resolve(specifier: ModuleSpecifier): Promise<ModuleResolution> {
    // Already a full URL
    if (specifier.startsWith('http://') || specifier.startsWith('https://')) {
      return {
        resolved: specifier,
        type: 'unknown',
        fromCache: false,
      };
    }

    // Parse prefix:package syntax
    const prefixMatch = specifier.match(/^(npm|jsr|esm|unpkg|skypack|jsdelivr):(.*)/);
    if (prefixMatch) {
      const [, prefix, pkg] = prefixMatch;
      // Map prefix to CDN provider
      const cdnMap: Record<string, CDNProvider> = {
        'npm': this.preferredCDN,
        'jsr': 'jsr.io',
        'esm': 'esm.sh',
        'unpkg': 'unpkg',
        'skypack': 'skypack',
        'jsdelivr': 'jsdelivr',
      };
      const cdnProvider = cdnMap[prefix!] || this.preferredCDN;
      const url = this.getCDNUrl(pkg!, cdnProvider);
      return {
        resolved: url,
        type: 'esm',
        fromCache: false,
        cdn: cdnProvider,
      };
    }

    throw new Error(`Invalid CDN specifier: ${specifier}`);
  }

  private getCDNUrl(pkg: string, source?: CDNProvider): string {
    const cdn = source || this.preferredCDN;
    const baseUrl = CDN_URLS[cdn];

    // Special handling for different CDNs
    switch (cdn) {
      case 'jsr.io':
        // jsr.io expects @scope/package format
        return `${baseUrl}/${pkg}`;
      case 'esm.sh':
        // esm.sh uses direct package names
        // Use ?bundle to inline all dependencies
        return `${baseUrl}/${pkg}?bundle`;
      case 'unpkg':
      case 'jsdelivr':
        return `${baseUrl}/${pkg}`;
      case 'skypack':
        return `${baseUrl}/${pkg}`;
      default:
        return `${baseUrl}/${pkg}`;
    }
  }
}

/**
 * NodeModuleResolver handles bare specifiers (node_modules)
 */
export class NodeModuleResolver implements ModuleResolver {
  constructor(private cdnFallback?: CDNModuleResolver) {}

  canResolve(specifier: ModuleSpecifier): boolean {
    // Can resolve bare specifiers and node: prefixed specifiers
    const isNodePrefixed = specifier.startsWith('node:');
    const isBareSpecifier = (
      !specifier.startsWith('./') &&
      !specifier.startsWith('../') &&
      !specifier.startsWith('http') &&
      !path.isAbsolute(specifier) &&
      !specifier.includes(':') // No other protocols
    );
    return isNodePrefixed || isBareSpecifier;
  }

  async resolve(specifier: ModuleSpecifier): Promise<ModuleResolution> {
    // Try native import first (will work for built-in modules and installed packages)
    try {
      // Use require.resolve if available, otherwise try import.meta.resolve
      const resolved = await this.tryResolveNode(specifier);
      if (resolved) {
        return {
          resolved,
          type: 'esm',
          fromCache: false,
        };
      }
    } catch {
      // Error occurred, fall through to CDN fallback
    }

    // If not resolved locally, fallback to CDN if available
    if (this.cdnFallback) {
      const cdnSpecifier = `npm:${specifier}`;
      return this.cdnFallback.resolve(cdnSpecifier);
    }

    throw new Error(`Module not found: ${specifier}`);
  }

  private async tryResolveNode(specifier: string): Promise<string | null> {
    // Try to resolve using native import
    try {
      // For Node.js built-in modules
      if (isNodeBuiltinModule(specifier)) {
        return specifier;
      }

      // This will throw if module is not found
      const resolved = await import.meta.resolve?.(specifier);
      return resolved || null;
    } catch {
      return null;
    }
  }
}

/**
 * CompositeModuleResolver combines multiple resolvers
 */
export class CompositeModuleResolver implements ModuleResolver {
  constructor(private resolvers: ModuleResolver[]) {}

  canResolve(specifier: ModuleSpecifier): boolean {
    return this.resolvers.some(r => r.canResolve(specifier));
  }

  async resolve(specifier: ModuleSpecifier): Promise<ModuleResolution> {
    for (const resolver of this.resolvers) {
      if (resolver.canResolve(specifier)) {
        return resolver.resolve(specifier);
      }
    }

    throw new Error(`No resolver found for: ${specifier}`);
  }
}

import { it, expect, describe, beforeEach } from '@jest/globals';

import { createUniversalLoader, UniversalScriptLoader } from '../../src/utils/universal-loader.js';

describe('UniversalScriptLoader Integration Tests', () => {
  let loader: UniversalScriptLoader;
  
  describe('constructor and basic functionality', () => {
    it('should create loader with default options', () => {
      loader = createUniversalLoader();
      expect(loader).toBeInstanceOf(UniversalScriptLoader);
    });

    it('should create loader with custom options', () => {
      loader = createUniversalLoader({
        runtime: 'node',
        typescript: true,
        cache: false,
        preferredCDN: 'jsr'
      });
      expect(loader).toBeInstanceOf(UniversalScriptLoader);
    });
  });

  describe('getScriptContext', () => {
    it('should return Node.js context', () => {
      loader = createUniversalLoader({ runtime: 'node' });
      const context = loader.getScriptContext();
      
      expect(context.runtime).toBe('node');
      expect(context.version).toMatch(/^v?\d+\.\d+\.\d+/);
      // Features depend on runtime detection and version
      expect(typeof context.features.typescript).toBe('boolean');
      expect(typeof context.features.esm).toBe('boolean');
    });

    it('should auto-detect runtime', () => {
      loader = createUniversalLoader({ runtime: 'auto' });
      const context = loader.getScriptContext();
      
      expect(['node', 'bun', 'deno']).toContain(context.runtime);
    });
  });

  describe('module resolution (without network calls)', () => {
    beforeEach(() => {
      loader = createUniversalLoader({ cache: false });
    });

    it('should resolve jsr: URLs', async () => {
      const resolved = await (loader as any).resolveModuleURL('jsr:@std/testing');
      expect(resolved).toBe('https://jsr.io/@std/testing');
    });

    it('should resolve npm: URLs with preferred CDN', async () => {
      loader = createUniversalLoader({ preferredCDN: 'unpkg' });
      const resolved = await (loader as any).resolveModuleURL('npm:lodash');
      expect(resolved).toBe('https://unpkg.com/lodash');
    });

    it('should resolve esm: URLs', async () => {
      const resolved = await (loader as any).resolveModuleURL('esm:react');
      expect(resolved).toBe('https://jsr.io/esm:react');
    });

    it('should resolve skypack: URLs', async () => {
      const resolved = await (loader as any).resolveModuleURL('skypack:preact');
      expect(resolved).toBe('https://jsr.io/skypack:preact');
    });

    it('should pass through HTTP URLs unchanged', async () => {
      const url = 'https://example.com/module.js';
      const resolved = await (loader as any).resolveModuleURL(url);
      expect(resolved).toBe(url);
    });

    it('should resolve local paths', async () => {
      const localPath = './test.js';
      const resolved = await (loader as any).resolveModuleURL(localPath);
      expect(resolved).toMatch(/file:.*test\.js$/);
    });
  });

  describe('cache key generation', () => {
    beforeEach(() => {
      loader = createUniversalLoader({ cache: false });
    });

    it('should generate consistent cache keys', async () => {
      const url = 'https://example.com/module.js';
      const key1 = await (loader as any).getCacheKey(url);
      const key2 = await (loader as any).getCacheKey(url);
      
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^[a-f0-9]{64}$/); // SHA256 hash
    });

    it('should generate different keys for different URLs', async () => {
      const url1 = 'https://example.com/module1.js';
      const url2 = 'https://example.com/module2.js';
      const key1 = await (loader as any).getCacheKey(url1);
      const key2 = await (loader as any).getCacheKey(url2);
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('code extraction', () => {
    beforeEach(() => {
      loader = createUniversalLoader();
    });

    it('should extract code from markdown', () => {
      const markdown = `
# Example
Some text
\`\`\`javascript
console.log('hello');
\`\`\`
More text
\`\`\`ts
const x: number = 42;
\`\`\`
      `;
      
      const result = (loader as any).extractCodeFromMarkdown(markdown);
      expect(result).toContain("console.log('hello');");
      expect(result).toContain('const x: number = 42;');
    });

    it('should handle xec code blocks', () => {
      const markdown = `
\`\`\`xec
$\`echo "Hello from xec"\`
\`\`\`
      `;
      
      const result = (loader as any).extractCodeFromMarkdown(markdown);
      expect(result).toContain('$`echo "Hello from xec"`');
    });

    it('should handle empty markdown', () => {
      const markdown = 'No code blocks here';
      const result = (loader as any).extractCodeFromMarkdown(markdown);
      expect(result).toBe('');
    });
  });

  describe('in-memory cache operations', () => {
    it('should manage in-memory cache', async () => {
      loader = createUniversalLoader({ cache: false });
      
      // Add some cache entries manually
      const cache = (loader as any).moduleCache;
      cache.set('key1', { content: 'test1', timestamp: Date.now() });
      cache.set('key2', { content: 'test2', timestamp: Date.now() });
      
      expect(cache.size).toBe(2);
      
      // Clear cache
      await loader.clearCache();
      
      expect(cache.size).toBe(0);
    });
  });

  describe('getCacheStats with in-memory data', () => {
    it('should return cache statistics', async () => {
      loader = createUniversalLoader({ cache: false });
      
      // Add cache entries with different timestamps
      const now = Date.now();
      const cache = (loader as any).moduleCache;
      cache.set('key1', {
        content: 'x'.repeat(1000),
        timestamp: now - 3600000 // 1 hour ago
      });
      cache.set('key2', {
        content: 'y'.repeat(2000),
        transformed: 'z'.repeat(500),
        timestamp: now
      });
      
      const stats = await loader.getCacheStats();
      
      expect(stats.entries).toBe(2);
      expect(stats.size).toBe(3500); // 1000 + 2000 + 500
      expect(stats.oldestEntry).toEqual(new Date(now - 3600000));
      expect(stats.newestEntry).toEqual(new Date(now));
    });

    it('should handle empty cache', async () => {
      loader = createUniversalLoader({ cache: false });
      
      const stats = await loader.getCacheStats();
      
      expect(stats.entries).toBe(0);
      expect(stats.size).toBe(0);
      expect(stats.oldestEntry).toBeNull();
      expect(stats.newestEntry).toBeNull();
    });
  });

  describe('supportsFeature', () => {
    it('should check feature support for Node.js', () => {
      loader = createUniversalLoader({ runtime: 'node' });
      
      // TypeScript support depends on the runtime detection
      const context = loader.getScriptContext();
      expect(loader.supportsFeature('typescript')).toBe(context.features.typescript);
      expect(loader.supportsFeature('esm')).toBe(true);
      expect(loader.supportsFeature('workers')).toBe(true);
    });
  });

  describe('TypeScript detection', () => {
    beforeEach(() => {
      loader = createUniversalLoader();
    });

    it('should detect ES module syntax', async () => {
      const hasESM1 = await (loader as any).hasESModules('import { foo } from "bar"');
      const hasESM2 = await (loader as any).hasESModules('export default {}');
      const hasESM3 = await (loader as any).hasESModules('const x = 42;');
      
      expect(hasESM1).toBe(true);
      expect(hasESM2).toBe(true);
      expect(hasESM3).toBe(false);
    });
  });

  describe('project type detection', () => {
    it('should detect project type from options', () => {
      // Project type detection is async and happens during initialization
      // The default is 'auto' until it's detected from package.json
      const loader = createUniversalLoader();
      expect(['auto', 'esm', 'commonjs']).toContain((loader as any).projectType);
    });
  });
});
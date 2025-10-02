import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { MemoryCache } from '../../../src/module/module-cache.js';
import { createTransformer, TypeScriptTransformer } from '../../../src/transform/typescript-transformer.js';

describe('TypeScriptTransformer', () => {
  let transformer: TypeScriptTransformer;
  let cache: MemoryCache<string>;

  beforeEach(() => {
    cache = new MemoryCache({ maxSize: 100 });
    transformer = new TypeScriptTransformer(cache, { cache: true });
  });

  afterEach(async () => {
    await cache.clear();
  });

  describe('createTransformer', () => {
    it('should create a new TypeScriptTransformer instance', () => {
      const t = createTransformer();
      expect(t).toBeInstanceOf(TypeScriptTransformer);
    });

    it('should accept cache and options', () => {
      const t = createTransformer(cache, { target: 'es2020' });
      expect(t).toBeInstanceOf(TypeScriptTransformer);
    });
  });

  describe('transform', () => {
    it('should transform TypeScript to JavaScript', async () => {
      const tsCode = `
        const greet = (name: string): string => {
          return \`Hello, \${name}!\`;
        };
        export { greet };
      `;

      const result = await transformer.transform(tsCode, 'test.ts');

      expect(result).toContain('greet');
      expect(result).toContain('export');
      expect(result).not.toContain(': string');
    });

    it('should handle TSX files', async () => {
      const tsxCode = `
        import React from 'react';
        const Component = () => <div>Hello</div>;
        export default Component;
      `;

      const result = await transformer.transform(tsxCode, 'component.tsx');

      expect(result).toContain('React');
      expect(result).toContain('Component');
    });

    it('should support top-level await', async () => {
      const tsCode = `
        const data = await fetch('https://example.com');
        export { data };
      `;

      const result = await transformer.transform(tsCode, 'test.ts');

      expect(result).toContain('await');
      expect(result).toContain('export');
    });

    it('should handle interfaces and types', async () => {
      const tsCode = `
        interface User {
          name: string;
          age: number;
        }
        type ID = string | number;
        const user: User = { name: 'John', age: 30 };
        export { user };
      `;

      const result = await transformer.transform(tsCode, 'types.ts');

      expect(result).not.toContain('interface');
      expect(result).not.toContain('type ID');
      expect(result).toContain('user');
    });

    it('should handle enums', async () => {
      const tsCode = `
        enum Status {
          Active = 'ACTIVE',
          Inactive = 'INACTIVE'
        }
        export { Status };
      `;

      const result = await transformer.transform(tsCode, 'enum.ts');

      expect(result).toContain('Status');
      expect(result).toContain('ACTIVE');
    });

    it('should cache transformed code', async () => {
      const tsCode = 'const x: number = 42; export { x };';

      // First transform
      await transformer.transform(tsCode, 'test.ts');

      // Check cache
      const stats = await cache.stats();
      expect(stats.memoryEntries).toBe(1);

      // Second transform should use cache
      const result = await transformer.transform(tsCode, 'test.ts');
      expect(result).toContain('x');
    });
  });

  describe('transformWithOptions', () => {
    it('should use custom options', async () => {
      const code = 'const x = 42; export { x };';

      const result = await transformer.transformWithOptions(code, 'test.js', {
        minify: true,
      });

      // Minified code should be shorter
      expect(result.length).toBeLessThan(code.length + 50);
    });
  });

  describe('needsTransformation', () => {
    it('should detect TypeScript files', () => {
      expect(transformer.needsTransformation('file.ts')).toBe(true);
      expect(transformer.needsTransformation('component.tsx')).toBe(true);
      expect(transformer.needsTransformation('component.jsx')).toBe(true);
    });

    it('should not detect JavaScript files', () => {
      expect(transformer.needsTransformation('file.js')).toBe(false);
      expect(transformer.needsTransformation('module.mjs')).toBe(false);
    });
  });

  describe('transformIfNeeded', () => {
    it('should transform TypeScript files', async () => {
      const tsCode = 'const x: number = 42;';
      const result = await transformer.transformIfNeeded(tsCode, 'test.ts');
      expect(result).not.toContain(': number');
    });

    it('should not transform JavaScript files', async () => {
      const jsCode = 'const x = 42;';
      const result = await transformer.transformIfNeeded(jsCode, 'test.js');
      expect(result).toBe(jsCode);
    });
  });

  describe('clearCache', () => {
    it('should clear transformation cache', async () => {
      const code = 'const x: number = 42; export { x };';
      await transformer.transform(code, 'test.ts');

      const statsBefore = await cache.stats();
      expect(statsBefore.memoryEntries).toBe(1);

      await transformer.clearCache();

      const statsAfter = await cache.stats();
      expect(statsAfter.memoryEntries).toBe(0);
    });
  });

  describe('different targets', () => {
    it('should transform to ES2020', async () => {
      const t = new TypeScriptTransformer(undefined, { target: 'es2020' });
      const code = 'const x: number = 42?.toString();';
      const result = await t.transform(code, 'test.ts');
      expect(result).toContain('?.');
    });

    it('should transform to ES2015', async () => {
      const t = new TypeScriptTransformer(undefined, { target: 'es2015' });
      const code = 'const x: number = 42;';
      const result = await t.transform(code, 'test.ts');
      expect(result).toBeTruthy();
    });
  });

  describe('format options', () => {
    it('should transform to ESM format', async () => {
      const t = new TypeScriptTransformer(undefined, { format: 'esm' });
      const code = 'export const x: number = 42;';
      const result = await t.transform(code, 'test.ts');
      expect(result).toContain('export');
    });

    it('should transform to CJS format', async () => {
      const t = new TypeScriptTransformer(undefined, { format: 'cjs' });
      const code = 'export const x: number = 42;';
      const result = await t.transform(code, 'test.ts');
      expect(result).toContain('exports');
    });
  });

  describe('sourcemap options', () => {
    it('should generate inline sourcemap', async () => {
      const t = new TypeScriptTransformer(undefined, { sourcemap: 'inline' });
      const code = 'const x: number = 42;';
      const result = await t.transform(code, 'test.ts');
      expect(result).toContain('sourceMappingURL');
    });

    it('should not generate sourcemap by default', async () => {
      const code = 'const x: number = 42;';
      const result = await transformer.transform(code, 'test.ts');
      expect(result).not.toContain('sourceMappingURL');
    });
  });

  describe('error handling', () => {
    it('should throw on syntax errors', async () => {
      const invalidCode = 'const x: = 42;'; // Invalid syntax
      await expect(
        transformer.transform(invalidCode, 'test.ts')
      ).rejects.toThrow();
    });

    it('should handle complex TypeScript features', async () => {
      const complexCode = `
        class GenericClass<T> {
          constructor(private value: T) {}
          getValue(): T {
            return this.value;
          }
        }
        export { GenericClass };
      `;

      const result = await transformer.transform(complexCode, 'test.ts');
      expect(result).toContain('GenericClass');
      expect(result).toContain('getValue');
      expect(result).not.toContain('<T>');
    });
  });
});

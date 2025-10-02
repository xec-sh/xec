import { it, expect, describe } from 'vitest';

import { transformImports, ImportTransformer, createImportTransformer } from '../../../src/transform/import-transformer.js';

describe('ImportTransformer', () => {
  describe('createImportTransformer', () => {
    it('should create a new ImportTransformer instance', () => {
      const t = createImportTransformer();
      expect(t).toBeInstanceOf(ImportTransformer);
    });

    it('should accept options', () => {
      const t = createImportTransformer({ baseUrl: 'https://example.com' });
      expect(t).toBeInstanceOf(ImportTransformer);
      expect(t.getOptions().baseUrl).toBe('https://example.com');
    });
  });

  describe('transformImports function', () => {
    it('should transform imports using convenience function', () => {
      const content = 'import fs from "/node/fs@latest";';
      const result = transformImports(content, { transformNodeImports: true });
      expect(result).toContain('node:fs');
    });
  });

  describe('transform node: imports', () => {
    let transformer: ImportTransformer;

    beforeEach(() => {
      transformer = new ImportTransformer({ transformNodeImports: true });
    });

    it('should transform /node/module@version to node:module', () => {
      const content = 'import fs from "/node/fs@latest";';
      const result = transformer.transform(content);
      expect(result).toBe('import fs from "node:fs";');
    });

    it('should transform /node/module.js to node:module', () => {
      const content = 'import path from "/node/path.js";';
      const result = transformer.transform(content);
      expect(result).toBe('import path from "node:path";');
    });

    it('should preserve quote style', () => {
      const doubleQuotes = "import fs from \"/node/fs@latest\";";
      const singleQuotes = "import fs from '/node/fs@latest';";

      expect(transformer.transform(doubleQuotes)).toContain('"node:fs"');
      expect(transformer.transform(singleQuotes)).toContain("'node:fs'");
    });

    it('should handle multiple node imports', () => {
      const content = `
        import fs from "/node/fs@latest";
        import path from "/node/path.js";
      `;
      const result = transformer.transform(content);
      expect(result).toContain('from "node:fs"');
      expect(result).toContain('from "node:path"');
    });

    it('should not transform when option is disabled', () => {
      const t = new ImportTransformer({ transformNodeImports: false });
      const content = 'import fs from "/node/fs@latest";';
      const result = t.transform(content);
      expect(result).toBe(content);
    });
  });

  describe('transform relative imports', () => {
    let transformer: ImportTransformer;

    beforeEach(() => {
      transformer = new ImportTransformer({
        transformRelativeImports: true,
        baseUrl: 'https://esm.sh',
      });
    });

    it('should transform relative from imports', () => {
      const content = 'import React from "/v135/react.js";';
      const result = transformer.transform(content);
      expect(result).toBe('import React from "https://esm.sh/v135/react.js";');
    });

    it('should transform static import statements', () => {
      const content = 'import "/styles.css";';
      const result = transformer.transform(content);
      expect(result).toBe('import "https://esm.sh/styles.css";');
    });

    it('should transform dynamic imports', () => {
      const content = 'const mod = await import("/module.js");';
      const result = transformer.transform(content);
      expect(result).toBe('const mod = await import("https://esm.sh/module.js");');
    });

    it('should transform export from statements', () => {
      const content = 'export { foo } from "/lib/foo.js";';
      const result = transformer.transform(content);
      expect(result).toBe('export { foo } from "https://esm.sh/lib/foo.js";');
    });

    it('should transform export * from statements', () => {
      const content = 'export * from "/lib/utils.js";';
      const result = transformer.transform(content);
      expect(result).toBe('export * from "https://esm.sh/lib/utils.js";');
    });

    it('should not transform /node/ paths', () => {
      const content = 'import fs from "/node/fs@latest";';
      const result = transformer.transform(content);
      expect(result).toContain('node:fs');
      expect(result).not.toContain('https://esm.sh/node');
    });

    it('should not transform when no baseUrl', () => {
      const t = new ImportTransformer({ transformRelativeImports: true });
      const content = 'import mod from "/module.js";';
      const result = t.transform(content);
      expect(result).toBe(content);
    });

    it('should not transform when option is disabled', () => {
      const t = new ImportTransformer({
        transformRelativeImports: false,
        baseUrl: 'https://esm.sh',
      });
      const content = 'import mod from "/module.js";';
      const result = t.transform(content);
      expect(result).toBe(content);
    });
  });

  describe('transformESMsh', () => {
    let transformer: ImportTransformer;

    beforeEach(() => {
      transformer = new ImportTransformer();
    });

    it('should transform esm.sh content', () => {
      const content = 'import React from "/v135/react.js";';
      const result = transformer.transformESMsh(content, 'https://esm.sh/react');
      expect(result).toContain('https://esm.sh/v135/react.js');
    });

    it('should not transform non-esm.sh URLs', () => {
      const content = 'import mod from "/module.js";';
      const result = transformer.transformESMsh(content, 'https://unpkg.com/package');
      expect(result).toBe(content);
    });

    it('should handle node: transformations for esm.sh', () => {
      const content = 'import fs from "/node/fs@latest";';
      const result = transformer.transformESMsh(content, 'https://esm.sh/package');
      expect(result).toContain('node:fs');
    });
  });

  describe('transformCDN', () => {
    let transformer: ImportTransformer;

    beforeEach(() => {
      transformer = new ImportTransformer();
    });

    it('should transform for any CDN URL', () => {
      const content = 'import mod from "/module.js";';
      const result = transformer.transformCDN(content, 'https://unpkg.com/package');
      expect(result).toContain('https://unpkg.com/module.js');
    });

    it('should handle different CDN providers', () => {
      const content = 'import mod from "/lib/mod.js";';

      const esmsh = transformer.transformCDN(content, 'https://esm.sh/pkg');
      expect(esmsh).toContain('https://esm.sh/lib/mod.js');

      const unpkg = transformer.transformCDN(content, 'https://unpkg.com/pkg');
      expect(unpkg).toContain('https://unpkg.com/lib/mod.js');

      const jsdelivr = transformer.transformCDN(content, 'https://cdn.jsdelivr.net/npm/pkg');
      expect(jsdelivr).toContain('https://cdn.jsdelivr.net/lib/mod.js');
    });
  });

  describe('custom rules', () => {
    it('should apply custom transformation rules', () => {
      const transformer = new ImportTransformer({
        customRules: [
          {
            pattern: /old-package/g,
            replacement: 'new-package',
          },
        ],
      });

      const content = 'import { foo } from "old-package";';
      const result = transformer.transform(content);
      expect(result).toContain('new-package');
      expect(result).not.toContain('old-package');
    });

    it('should apply multiple custom rules', () => {
      const transformer = new ImportTransformer({
        customRules: [
          { pattern: /pkg-a/g, replacement: 'package-a' },
          { pattern: /pkg-b/g, replacement: 'package-b' },
        ],
      });

      const content = `
        import a from "pkg-a";
        import b from "pkg-b";
      `;
      const result = transformer.transform(content);
      expect(result).toContain('package-a');
      expect(result).toContain('package-b');
    });

    it('should support function replacements', () => {
      const transformer = new ImportTransformer({
        customRules: [
          {
            pattern: /import (.+) from "(.+)"/g,
            replacement: (match, name, path) => `const ${name} = require("${path}")`,
          },
        ],
      });

      const content = 'import foo from "bar"';
      const result = transformer.transform(content);
      expect(result).toContain('const foo = require("bar")');
    });
  });

  describe('addRule and clearRules', () => {
    it('should add custom rules dynamically', () => {
      const transformer = new ImportTransformer();
      transformer.addRule(/test-pkg/g, 'production-pkg');

      const content = 'import x from "test-pkg";';
      const result = transformer.transform(content);
      expect(result).toContain('production-pkg');
    });

    it('should clear custom rules', () => {
      const transformer = new ImportTransformer({
        customRules: [
          { pattern: /old/g, replacement: 'new' },
        ],
      });

      transformer.clearRules();

      const content = 'import x from "old";';
      const result = transformer.transform(content);
      expect(result).toContain('old');
    });
  });

  describe('complex transformations', () => {
    it('should handle mixed transformations', () => {
      const transformer = new ImportTransformer({
        transformNodeImports: true,
        transformRelativeImports: true,
        baseUrl: 'https://esm.sh',
      });

      const content = `
        import fs from "/node/fs@latest";
        import React from "/v135/react.js";
        import { Component } from "/v135/react-dom.js";
      `;

      const result = transformer.transform(content);

      expect(result).toContain('from "node:fs"');
      expect(result).toContain('from "https://esm.sh/v135/react.js"');
      expect(result).toContain('from "https://esm.sh/v135/react-dom.js"');
    });

    it('should handle real-world esm.sh content', () => {
      const transformer = new ImportTransformer();

      const content = `
        import React from "/v135/react@18.2.0/es2022/react.mjs";
        import "/v135/react@18.2.0/es2022/react.css";
        import { createElement } from "/node/react";
      `;

      const result = transformer.transformESMsh(content, 'https://esm.sh/react');

      expect(result).toContain('https://esm.sh/v135/react@18.2.0/es2022/react.mjs');
      expect(result).toContain('https://esm.sh/v135/react@18.2.0/es2022/react.css');
      expect(result).toContain('node:react');
    });
  });

  describe('getOptions', () => {
    it('should return current options', () => {
      const transformer = new ImportTransformer({
        baseUrl: 'https://example.com',
        transformNodeImports: false,
      });

      const options = transformer.getOptions();
      expect(options.baseUrl).toBe('https://example.com');
      expect(options.transformNodeImports).toBe(false);
    });
  });
});

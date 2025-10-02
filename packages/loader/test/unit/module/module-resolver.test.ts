import { it, expect, describe, beforeEach } from 'vitest';

import {
  CDNModuleResolver,
  NodeModuleResolver,
  LocalModuleResolver,
  CompositeModuleResolver,
} from '../../../src/module/module-resolver.js';

describe('LocalModuleResolver', () => {
  let resolver: LocalModuleResolver;

  beforeEach(() => {
    resolver = new LocalModuleResolver();
  });

  it('should resolve relative paths', async () => {
    expect(resolver.canResolve('./test.js')).toBe(true);
    expect(resolver.canResolve('../test.js')).toBe(true);
  });

  it('should resolve absolute paths', async () => {
    expect(resolver.canResolve('/usr/local/test.js')).toBe(true);
  });

  it('should resolve file:// URLs', async () => {
    expect(resolver.canResolve('file:///usr/local/test.js')).toBe(true);
    const result = await resolver.resolve('file:///usr/local/test.js');
    expect(result.resolved).toBe('/usr/local/test.js');
    expect(result.type).toBe('esm');
  });

  it('should not resolve bare specifiers', () => {
    expect(resolver.canResolve('lodash')).toBe(false);
  });

  it('should not resolve http URLs', () => {
    expect(resolver.canResolve('https://example.com/test.js')).toBe(false);
  });
});

describe('CDNModuleResolver', () => {
  let resolver: CDNModuleResolver;

  beforeEach(() => {
    resolver = new CDNModuleResolver('esm.sh');
  });

  it('should resolve npm: prefix', async () => {
    expect(resolver.canResolve('npm:lodash')).toBe(true);
    const result = await resolver.resolve('npm:lodash');
    expect(result.resolved).toBe('https://esm.sh/lodash?bundle');
    expect(result.type).toBe('esm');
    expect(result.cdn).toBe('esm.sh'); // Maps to preferred CDN
  });

  it('should resolve jsr: prefix', async () => {
    expect(resolver.canResolve('jsr:@std/path')).toBe(true);
    const result = await resolver.resolve('jsr:@std/path');
    expect(result.resolved).toBe('https://jsr.io/@std/path');
  });

  it('should resolve esm: prefix', async () => {
    const result = await resolver.resolve('esm:react@18.2.0');
    expect(result.resolved).toBe('https://esm.sh/react@18.2.0?bundle');
  });

  it('should resolve unpkg: prefix', async () => {
    const result = await resolver.resolve('unpkg:jquery@3.6.0');
    expect(result.resolved).toBe('https://unpkg.com/jquery@3.6.0');
  });

  it('should resolve skypack: prefix', async () => {
    const result = await resolver.resolve('skypack:vue');
    expect(result.resolved).toBe('https://cdn.skypack.dev/vue');
  });

  it('should resolve jsdelivr: prefix', async () => {
    const result = await resolver.resolve('jsdelivr:axios');
    expect(result.resolved).toBe('https://cdn.jsdelivr.net/npm/axios');
  });

  it('should resolve http URLs directly', async () => {
    expect(resolver.canResolve('https://example.com/test.js')).toBe(true);
    const result = await resolver.resolve('https://example.com/test.js');
    expect(result.resolved).toBe('https://example.com/test.js');
    expect(result.type).toBe('unknown');
  });

  it('should not resolve relative paths', () => {
    expect(resolver.canResolve('./test.js')).toBe(false);
  });

  it('should throw for invalid CDN specifiers', async () => {
    await expect(resolver.resolve('invalid:package')).rejects.toThrow('Invalid CDN specifier');
  });
});

describe('NodeModuleResolver', () => {
  let resolver: NodeModuleResolver;
  let cdnFallback: CDNModuleResolver;

  beforeEach(() => {
    cdnFallback = new CDNModuleResolver('esm.sh');
    resolver = new NodeModuleResolver(cdnFallback);
  });

  it('should resolve bare specifiers', () => {
    expect(resolver.canResolve('lodash')).toBe(true);
    expect(resolver.canResolve('@scope/package')).toBe(true);
  });

  it('should not resolve relative paths', () => {
    expect(resolver.canResolve('./test.js')).toBe(false);
    expect(resolver.canResolve('../test.js')).toBe(false);
  });

  it('should not resolve http URLs', () => {
    expect(resolver.canResolve('https://example.com/test.js')).toBe(false);
  });

  it('should not resolve prefixed specifiers', () => {
    expect(resolver.canResolve('npm:lodash')).toBe(false);
  });

  it('should resolve built-in node modules', async () => {
    const result = await resolver.resolve('fs');
    expect(result.resolved).toBe('fs');
    expect(result.type).toBe('esm');
  });

  it('should resolve node: prefixed modules', async () => {
    const result = await resolver.resolve('node:fs');
    expect(result.resolved).toBe('node:fs');
  });

  it('should fallback to CDN for non-existent packages', async () => {
    const result = await resolver.resolve('non-existent-package-12345');
    expect(result.resolved).toBe('https://esm.sh/non-existent-package-12345?bundle');
  });

  it('should throw if no CDN fallback is provided', async () => {
    const resolverNoCdn = new NodeModuleResolver();
    await expect(resolverNoCdn.resolve('non-existent-package-12345')).rejects.toThrow('Module not found');
  });
});

describe('CompositeModuleResolver', () => {
  let resolver: CompositeModuleResolver;

  beforeEach(() => {
    const local = new LocalModuleResolver();
    const cdn = new CDNModuleResolver('esm.sh');
    const node = new NodeModuleResolver(cdn);
    resolver = new CompositeModuleResolver([local, node, cdn]);
  });

  it('should resolve local paths with local resolver', async () => {
    expect(resolver.canResolve('./test.js')).toBe(true);
  });

  it('should resolve bare specifiers with node resolver', async () => {
    expect(resolver.canResolve('lodash')).toBe(true);
  });

  it('should resolve CDN specifiers with CDN resolver', async () => {
    expect(resolver.canResolve('npm:react')).toBe(true);
  });

  it('should use first matching resolver', async () => {
    const result = await resolver.resolve('npm:lodash');
    expect(result.resolved).toBe('https://esm.sh/lodash?bundle');
  });

  it('should throw if no resolver can handle specifier', async () => {
    const emptyResolver = new CompositeModuleResolver([]);
    await expect(emptyResolver.resolve('anything')).rejects.toThrow('No resolver found for');
  });
});

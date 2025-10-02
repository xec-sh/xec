/**
 * CDN module loading examples for @xec-sh/loader
 *
 * This example demonstrates:
 * - Loading modules from CDNs (esm.sh, jsr.io, unpkg, etc.)
 * - Module caching strategies
 * - Module resolution
 * - Module execution
 */

import * as os from 'node:os';
import * as path from 'node:path';

import {
  MemoryCache,
  HybridCache,
  ModuleLoader,
  ModuleFetcher,
  CDNModuleResolver,
  ImportTransformer,
} from '../src/index.js';

async function main() {
  console.log('=== @xec-sh/loader CDN Module Examples ===\n');

  // Setup
  const cacheDir = path.join(os.tmpdir(), 'loader-cdn-cache');

  // Example 1: Basic CDN module resolution
  console.log('1. CDN module resolution:');
  const resolver = new CDNModuleResolver('esm.sh');

  const lodashRes = await resolver.resolve('esm:lodash@4.17.21');
  console.log(`   lodash URL: ${lodashRes.resolved}`);

  const reactRes = await resolver.resolve('npm:react@18.0.0');
  console.log(`   react URL: ${reactRes.resolved}`);
  console.log('');

  // Example 2: Module fetching with caching
  console.log('2. Module fetching with caching:');
  const cache = new MemoryCache<string>({ ttl: 3600000 });
  const fetcher = new ModuleFetcher(cache);

  console.log('   Fetching module from CDN...');
  const startFetch1 = Date.now();
  const result1 = await fetcher.fetch('https://esm.sh/nanoid@5.0.0');
  const timeFetch1 = Date.now() - startFetch1;
  console.log(`   First fetch: ${timeFetch1}ms (from CDN)`);
  console.log(`   Content length: ${result1.content.length} bytes`);

  console.log('   Fetching same module again...');
  const startFetch2 = Date.now();
  const result2 = await fetcher.fetch('https://esm.sh/nanoid@5.0.0');
  const timeFetch2 = Date.now() - startFetch2;
  console.log(`   Second fetch: ${timeFetch2}ms (from cache)`);
  console.log(`   Speed improvement: ${Math.round((timeFetch1 / timeFetch2) * 10) / 10}x faster`);
  console.log('');

  // Example 3: Module loader setup
  console.log('3. Module loader configuration:');
  const loader = new ModuleLoader({
    resolver,
    fetcher,
    cacheDir,
  });

  console.log('   Module loader configured with:');
  console.log('   - CDN resolver (esm.sh)');
  console.log('   - HTTP fetcher with caching');
  console.log('   - Cache directory:', cacheDir);
  console.log('');

  // Example 4: Different CDN providers
  console.log('4. Different CDN providers:');
  const cdns = [
    { name: 'esm.sh', resolver: new CDNModuleResolver('esm.sh') },
    { name: 'unpkg', resolver: new CDNModuleResolver('unpkg') },
    { name: 'jsdelivr', resolver: new CDNModuleResolver('jsdelivr') },
    { name: 'skypack', resolver: new CDNModuleResolver('skypack') },
  ];

  for (const { name, resolver: cdnResolver } of cdns) {
    const result = await cdnResolver.resolve('npm:chalk@5.0.0');
    console.log(`   ${name}: ${result.resolved}`);
  }
  console.log('');

  // Example 5: Import path transformation
  console.log('5. Import path transformation:');
  const transformer = new ImportTransformer();

  const originalCode = `
    import fs from '/node/fs';
    import path from '/node/path.js';
    import { nanoid } from 'https://esm.sh/nanoid@5.0.0';
  `;

  const transformedCode = transformer.transform(originalCode);
  console.log('   Original imports:');
  console.log('     import fs from "/node/fs";');
  console.log('     import path from "/node/path.js";');
  console.log('');
  console.log('   Transformed imports:');
  const importLines = transformedCode.split('\n').filter(line => line.includes('import'));
  importLines.forEach(line => console.log(`     ${line.trim()}`));
  console.log('');

  // Example 6: Hybrid caching (memory + filesystem)
  console.log('6. Hybrid caching strategy:');
  const hybridCache = new HybridCache<string>(
    { ttl: 300000, maxSize: 100 }, // Memory: 5 minutes, max 100 items
    { cacheDir, ttl: 86400000 }     // Disk: 24 hours
  );

  const hybridFetcher = new ModuleFetcher(hybridCache);

  console.log('   Fetching with hybrid cache...');
  const startHybrid1 = Date.now();
  await hybridFetcher.fetch('https://esm.sh/chalk@5.0.0');
  const timeHybrid1 = Date.now() - startHybrid1;
  console.log(`   First fetch: ${timeHybrid1}ms (from CDN, cached to memory + disk)`);

  const startHybrid2 = Date.now();
  await hybridFetcher.fetch('https://esm.sh/chalk@5.0.0');
  const timeHybrid2 = Date.now() - startHybrid2;
  console.log(`   Second fetch: ${timeHybrid2}ms (from memory cache)`);
  console.log('');

  // Example 7: JSR (JavaScript Registry) modules
  console.log('7. Loading from JSR (jsr.io):');
  const jsrResolver = new CDNModuleResolver('jsr.io');

  const jsrResult = await jsrResolver.resolve('jsr:@std/path@1.0.0');
  console.log(`   JSR module URL: ${jsrResult.resolved}`);
  console.log('');

  // Example 8: Module specifier resolution
  console.log('8. Module specifier resolution:');
  const specifiers = [
    'esm:lodash',
    'npm:lodash@4.17.21',
    'jsr:@std/path',
    'jsr:@std/path@1.0.0',
    'https://esm.sh/react@18.0.0',
  ];

  for (const specifier of specifiers) {
    try {
      const result = await resolver.resolve(specifier);
      console.log(`   ${specifier} → ${result.resolved}`);
    } catch (error) {
      console.log(`   ${specifier} → Error: ${(error as Error).message}`);
    }
  }
  console.log('');

  // Example 9: Custom transformation rules
  console.log('9. Custom import transformation rules:');
  const customTransformer = new ImportTransformer();

  // Add custom rule for local CDN
  customTransformer.addRule({
    name: 'local-cdn',
    pattern: /from\s+["']@local\/([^"']+)["']/g,
    replacement: 'from "https://cdn.local.dev/$1"',
  });

  const codeWithCustom = `import { foo } from '@local/bar';`;
  const transformed = customTransformer.transform(codeWithCustom);
  console.log(`   Original: ${codeWithCustom}`);
  console.log(`   Transformed: ${transformed.trim()}`);
  console.log('');

  // Example 10: Cache usage demonstration
  console.log('10. Cache usage demonstration:');
  const demoCache = new MemoryCache<string>({ maxSize: 10, ttl: 60000 });

  await demoCache.set('key1', 'value1');
  await demoCache.set('key2', 'value2');

  const hit = await demoCache.get('key1');
  const miss = await demoCache.get('key3');

  console.log(`   Cache operations:`);
  console.log(`   - Set key1: ✓`);
  console.log(`   - Set key2: ✓`);
  console.log(`   - Get key1 (hit): ${hit !== null ? '✓' : '✗'}`);
  console.log(`   - Get key3 (miss): ${miss === null ? '✓' : '✗'}`);
  console.log(`   - Cache configured with max 10 items, 60s TTL`);
  console.log('');

  console.log('=== All CDN module examples completed! ===');
}

// Run examples
main().catch(console.error);

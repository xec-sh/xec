/** Verified remote ESM loading; requires native module.registerHooks. */
import { ModuleLoader } from '../src/index.js';

// Run with an explicitly reviewed ESM URL. No module is fetched by default.
const url = process.argv[2];
if (!url) throw new Error('Pass an HTTPS ESM module URL as the first argument');
const host = new URL(url).hostname;
const loader = new ModuleLoader({
  cacheDir: '.xec/module-cache',
  integrity: { mode: 'strict', allowedHosts: [host] },
  graph: { timeoutMs: 30_000, maxNodes: 128, maxBytes: 32 * 1024 * 1024, concurrency: 4 },
});
try {
  const module = await loader.import(url);
  console.log('Exports:', Object.keys(module));
  console.log('Repeated import shares the namespace:', await loader.import(url) === module);
  console.log('Response cache:', await loader.getCacheStats());
} finally { loader.dispose(); }

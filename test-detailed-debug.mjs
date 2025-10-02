/**
 * Detailed debugging of the module loading process
 */
import { ModuleLoader } from './packages/loader/dist/index.js';
import { ModuleFetcher } from './packages/loader/dist/module/module-fetcher.js';
import { MemoryCache } from './packages/loader/dist/module/module-cache.js';

// Create a test fetcher to see what's being fetched
const cache = new MemoryCache({ maxSize: 100 });
const fetcher = new ModuleFetcher(cache);

console.log('Step 1: Fetching initial URL...');
const url1 = 'https://esm.sh/camelcase@8.0.0?bundle';
const result1 = await fetcher.fetch(url1);

console.log('Fetched URL:', result1.url);
console.log('Content length:', result1.content.length);
console.log('First 500 chars:', result1.content.substring(0, 500));
console.log('');

// Check for any import statements
const importMatches = result1.content.match(/import\s+.*from\s+["'][^"']+["']/g);
const fromMatches = result1.content.match(/from\s+["'][^"']+["']/g);

console.log('Import statements found:', importMatches?.length || 0);
console.log('From clauses found:', fromMatches?.length || 0);

if (importMatches) {
  console.log('Import statements:', importMatches);
}
if (fromMatches) {
  console.log('From clauses:', fromMatches);
}

console.log('\n--- Now testing full module load ---\n');

const loader = new ModuleLoader({ verbose: true });
try {
  const module = await loader.import('npm:camelcase@8.0.0');
  console.log('\n✅ SUCCESS!');
  console.log('Module:', typeof module);
} catch (error) {
  console.log('\n❌ FAILED:');
  console.log('Error message:', error.message);
  console.log('Error stack:', error.stack);

  // Try to extract the problematic URL from the error
  const urlMatch = error.message.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    console.log('\nProblematic URL:', urlMatch[0]);
  }
}

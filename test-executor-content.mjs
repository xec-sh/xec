/**
 * Test what content the executor actually receives
 */
import { ModuleLoader } from './packages/loader/dist/index.js';
import { ModuleExecutor } from './packages/loader/dist/module/module-executor.js';
import * as fs from 'fs/promises';

// Patch the executor to log what it receives
const originalExecuteESM = ModuleExecutor.prototype.executeESM;
ModuleExecutor.prototype.executeESM = async function(content, specifier) {
  console.log('\n=== EXECUTOR RECEIVED ===');
  console.log('Specifier:', specifier);
  console.log('Content length:', content.length);
  console.log('First 500 chars:');
  console.log(content.substring(0, 500));
  console.log('\nLast 200 chars:');
  console.log(content.substring(content.length - 200));

  // Check for imports
  const importMatches = content.match(/import\s+.*from\s+["'][^"']+["']/g);
  const fromMatches = content.match(/from\s+["'][^"']+["']/g);
  console.log('\nImport statements:', importMatches?.length || 0);
  console.log('From clauses:', fromMatches?.length || 0);
  if (fromMatches) {
    console.log('From clauses found:');
    fromMatches.forEach(m => console.log('  -', m));
  }
  console.log('========================\n');

  // Write to a debug file
  await fs.writeFile('/tmp/executor-content-debug.mjs', content);
  console.log('Written to /tmp/executor-content-debug.mjs for inspection\n');

  return originalExecuteESM.call(this, content, specifier);
};

// Now test
const loader = new ModuleLoader({ verbose: true });
try {
  const module = await loader.import('npm:camelcase@8.0.0');
  console.log('\n✅ SUCCESS!');
  console.log('Module type:', typeof module.default);
} catch (error) {
  console.log('\n❌ FAILED:');
  console.log('Error:', error.message);
}

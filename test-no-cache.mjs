/**
 * Test with cache disabled
 */
import { ModuleLoader } from './packages/loader/dist/index.js';

console.log('Creating ModuleLoader with cache disabled...');
const loader = new ModuleLoader({
  preferredCDN: 'esm.sh',
  verbose: true,
  cache: false, // Disable caching
});

console.log('\nAttempting to load camelcase...');
try {
  const camelcase = await loader.import('npm:camelcase@8.0.0');
  console.log('\n✅ SUCCESS!');
  console.log('Module type:', typeof camelcase.default);
  if (camelcase.default) {
    console.log('Test:', camelcase.default('hello world'));
  }
} catch (error) {
  console.error('\n❌ FAILED:');
  console.error('Error:', error.message);
}

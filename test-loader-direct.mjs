/**
 * Direct test of @xec-sh/loader without CLI
 */
import { ModuleLoader } from './packages/loader/dist/index.js';

console.log('Creating ModuleLoader...');
const loader = new ModuleLoader({
  preferredCDN: 'esm.sh',
  verbose: true,
});

console.log('\nAttempting to load camelcase from npm...');
try {
  const camelcase = await loader.import('npm:camelcase@8.0.0');
  console.log('\n✅ SUCCESS!');
  console.log('Module loaded:', typeof camelcase);
  console.log('Keys:', Object.keys(camelcase));
  if (camelcase.default) {
    console.log('Result:', camelcase.default('hello world'));
  }
} catch (error) {
  console.error('\n❌ FAILED:');
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

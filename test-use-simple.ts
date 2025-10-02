#!/usr/bin/env node
/**
 * Simple test to verify use() is available
 */

console.log('Testing if use() is defined...');
console.log('typeof use:', typeof use);
console.log('typeof x:', typeof x);
console.log('typeof Import:', typeof Import);

if (typeof use === 'undefined') {
  console.error('❌ ERROR: use() is not defined!');
  console.error('This means globals were not injected properly.');
  process.exit(1);
}

console.log('✓ use() is defined');
console.log('Attempting to load a simple module...');

try {
  const result = await use('npm:camelcase@8.0.0');
  console.log('✓ Module loaded successfully!');
  console.log('Module type:', typeof result);
  console.log('Module keys:', Object.keys(result));
} catch (error) {
  console.error('❌ ERROR loading module:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

console.log('\n✅ All tests passed!');

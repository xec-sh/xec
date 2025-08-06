/**
 * 06. Result Status - Using ok and cause Properties
 * 
 * This example demonstrates the simplified way to check command execution status
 * using the new `ok` and `cause` properties of ExecutionResult.
 */

import { $ } from '@xec-sh/core';

// 1. Basic success checking with ok property
const successResult = await $`echo "Operation completed"`;
if (successResult.ok) {
  console.log('✅ Command succeeded:', successResult.stdout.trim());
} else {
  console.log('❌ Command failed:', successResult.cause);
}

// 2. Handling failures with cause property
const failResult = await $`false`.nothrow();
if (!failResult.ok) {
  console.log('Command failed with cause:', failResult.cause); // "exitCode: 1"
}

// 3. Different error causes
// Exit code failure
const exitCodeError = await $`exit 42`.nothrow();
console.log('Exit code error:', {
  ok: exitCodeError.ok,          // false
  cause: exitCodeError.cause      // "exitCode: 42"
});

// Signal failure (simulated)
const signalError = await $`sleep 10`.timeout(100).nothrow();
console.log('Signal error:', {
  ok: signalError.ok,             // false
  cause: signalError.cause        // Depends on how process was terminated
});

// 4. Conditional logic based on ok
const testResult = await $`test -f /etc/hosts`.nothrow();
if (testResult.ok) {
  console.log('/etc/hosts file exists');
} else {
  console.log('/etc/hosts file does not exist');
}

// 5. Using ok in a loop to retry on failure
let attempts = 0;
let result;
do {
  attempts++;
  result = await $`curl -s https://api.github.com/rate_limit`.nothrow();
  if (!result.ok) {
    console.log(`Attempt ${attempts} failed: ${result.cause}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
} while (!result.ok && attempts < 3);

if (result.ok) {
  console.log('API call succeeded after', attempts, 'attempts');
} else {
  console.log('API call failed after', attempts, 'attempts:', result.cause);
}

// 6. Pattern: Early return on failure
async function deployApp() {
  const buildResult = await $`npm run build`.nothrow();
  if (!buildResult.ok) {
    return { success: false, error: `Build failed: ${buildResult.cause}` };
  }

  const testResult = await $`npm test`.nothrow();
  if (!testResult.ok) {
    return { success: false, error: `Tests failed: ${testResult.cause}` };
  }

  const deployResult = await $`npm run deploy`.nothrow();
  if (!deployResult.ok) {
    return { success: false, error: `Deploy failed: ${deployResult.cause}` };
  }

  return { success: true };
}

// 7. Migration from `ok` to ok
// Old way (deprecated):
// if (result.ok) { ... }

// New way:
// if (result.ok) { ... }

// The ok property provides the same functionality but with cleaner syntax
const migrationExample = await $`echo "test"`;
console.log('Old way (deprecated):', migrationExample.ok);
console.log('New way:', migrationExample.ok);
console.log('Both return the same value:', migrationExample.ok === migrationExample.ok);
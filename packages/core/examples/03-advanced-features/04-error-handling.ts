/**
 * 04. Error Handling - Error Handling
 * 
 * Demonstrates various ways to handle errors
 */

import { $, CommandError, TimeoutError } from '@xec-sh/core';

// 1. Simple error handling
try {
  await $`exit 1`;
} catch (error) {
  if (error instanceof CommandError) {
    console.log('Execution error:', error.message);
    console.log('Exit code:', error.exitCode);
    console.log('Command:', error.command);
    console.log('Stderr:', error.stderr);
  }
}

// 2. Using nothrow
// nothrow() doesn't throw exception on error
const result = await $`false`.nothrow();
if (!result.ok) {
  console.log('Command failed');
  console.log('Cause:', result.cause);
  console.log('Exit code:', result.exitCode);
  console.log('Stderr:', result.stderr);
}

// 3. Timeout handling
// Use timeout() on ProcessPromise
try {
  await $`sleep 10`.timeout(1000);
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log('Command exceeded timeout');
    console.log('Timeout:', error.timeout, 'ms');
  }
}

// 4. Command error handling
try {
  await $`nonexistent_command`;
} catch (error) {
  if (error instanceof CommandError) {
    console.log('Command execution error');
    console.log('Command:', error.command);
    console.log('Exit code:', error.exitCode);
    console.log('Stderr:', error.stderr);
  }
}

// 5. Errors in pipe
// Use shell pipe for command chaining
try {
  await $`echo "test" | grep "missing" || exit 1 | wc -l`;
} catch (error) {
  console.log('Pipe finished with error');
  if (error instanceof CommandError) {
    console.log('Exit code:', error.exitCode);
    console.log('Stderr:', error.stderr);
  }
}

// 6. Multiple error handling
const commands = [
  $`echo "Success 1"`,
  $`exit 1`,
  $`echo "Success 2"`,
  $`false`,
  $`echo "Success 3"`
];

const commandResults = await Promise.allSettled(commands);
commandResults.forEach((result, i) => {
  if (result.status === 'fulfilled') {
    console.log(`Command ${i + 1}: Success`);
  } else {
    console.log(`Command ${i + 1}: Error - ${result.reason.message}`);
  }
});

// 7. Custom errors
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

async function validateAndRun(filename: string) {
  // Check file existence
  const exists = await $`test -f ${filename}`.nothrow();
  if (!exists.ok) {
    throw new ValidationError(`File ${filename} doesn't exist`);
  }

  // Check size
  const size = await $`stat -f%z ${filename} 2>/dev/null || stat -c%s ${filename}`;
  const sizeBytes = parseInt(size.stdout.trim());
  if (sizeBytes > 1024 * 1024) {
    throw new ValidationError(`File ${filename} is too large`);
  }

  return await $`cat ${filename}`;
}

// Create test file
const testFile = '/tmp/test-validation.txt';
await $`echo "Test content" > ${testFile}`;

try {
  const content = await validateAndRun(testFile);
  console.log('File content:', content.stdout);
} catch (error) {
  if (error instanceof ValidationError) {
    console.log('Validation error:', error.message);
  } else {
    console.log('Unexpected error:', error.message);
  }
}

// Remove test file
await $`rm -f ${testFile}`;

// 8. Error handling in different adapters
// Example with local adapter
const adapters = [
  { name: 'local', adapter: $.local() },
  // Docker and SSH require setup
  // { name: 'docker', adapter: $.docker({ container: 'my-container' }) },
  // { name: 'ssh', adapter: $.ssh({ host: 'example.com', username: 'user', privateKey: '/path/to/key' }) }
];

for (const { name, adapter } of adapters) {
  try {
    const adapterResult = await adapter`echo "Test on ${name}"`;
    console.log(`${name}: Success`);
    console.log(`  Output: ${adapterResult.stdout.trim()}`);
  } catch (error: unknown) {
    console.log(`${name}: Error - ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 9. Graceful shutdown
// Example of handling long-running operations
const longRunning = $`sleep 5`; // Short sleep for demonstration

// Signal handling
let isShuttingDown = false;
process.once('SIGINT', async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('\nReceived SIGINT, shutting down...');
  longRunning.kill('SIGTERM');

  try {
    await longRunning;
  } catch (error: unknown) {
    console.log('Process terminated');
  }

  process.exit(0);
});

// Wait for completion or interruption
try {
  console.log('Executing long operation (5 seconds)...');
  await longRunning;
  console.log('Operation completed successfully');
} catch (error: unknown) {
  if (error instanceof CommandError) {
    console.log('Operation was interrupted');
  }
}

// 10. Error logging
const errorLog: any[] = [];

async function runWithLogging(command: string) {
  const startTime = Date.now();

  try {
    const result = await $`${command}`;
    return result;
  } catch (error: any) {
    const errorInfo = {
      command,
      error: error.message,
      exitCode: error.exitCode || null,
      stderr: error.stderr || '',
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };

    errorLog.push(errorInfo);
    throw error;
  }
}

// Testing
try {
  await runWithLogging('false');
} catch (e: unknown) {
  // Expected error
}

try {
  await runWithLogging('exit 42');
} catch (e: unknown) {
  // Expected error
}

console.log('Error log:', JSON.stringify(errorLog, null, 2));

// 11. Partial error handling
const partialResults: any[] = [];

for (let i = 0; i < 5; i++) {
  const partialResult = await $`echo "Processing item ${i}" && test ${i} -ne 2`.nothrow();

  if (partialResult.ok) {
    partialResults.push({ index: i, success: true, output: partialResult.stdout.trim() });
  } else {
    partialResults.push({ index: i, success: false, cause: partialResult.cause });
    console.log(`Warning: Error processing item ${i} - ${partialResult.cause}`);
  }
}

console.log('Processing results:', partialResults);

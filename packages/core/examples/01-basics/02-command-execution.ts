/**
 * 02. Command Execution - Various Ways to Execute Commands
 * 
 * Shows various methods for launching commands and processing results
 * in @xec-sh/core. Each command returns a ProcessPromise, which
 * can be used for further configuration.
 */

import { $, CommandError, ExecutionEngine } from '@xec-sh/core';

// 1. Normal execution with automatic escaping
// Command is executed through shell, allowing use of shell constructs
const files = await $`ls -la`;
console.log('File list:', files.stdout);

// 2. Using raw mode (without escaping)
// To create a new ExecutionEngine instance with raw method
const engine = new ExecutionEngine();
const rawResult = await engine.raw`echo "$HOME"`;
console.log('Home directory:', rawResult.stdout);

// Or you can use shell variables directly
const homeDir = await $`echo $HOME`;
console.log('Home directory (via shell):', homeDir.stdout);

// 3. Getting only stdout as string
// You can directly access result properties
const currentDir = (await $`pwd`).stdout.trim();
console.log('Current directory:', currentDir);

// Or use text() method to get cleaned stdout
const currentDirClean = await $`pwd`.text();
console.log('Current directory (via text()):', currentDirClean);

// 4. Checking return code
// By default, commands with non-zero return codes generate CommandError
try {
  await $`exit 1`;
} catch (error) {
  if (error instanceof CommandError) {
    console.log('Command finished with error');
    console.log('Exit code:', error.exitCode);
    console.log('Command:', error.command);
  }
}

// 5. Execution without generating exception on error
// nothrow() method allows getting result even on error
const nothrowResult = await $`false`.nothrow();
console.log('Exit code:', nothrowResult.exitCode); // 1
console.log('Success:', nothrowResult.ok);        // false
console.log('Cause:', nothrowResult.cause);       // "exitCode: 1"

// 6. Getting full result information
// ExecutionResult contains all information about command execution
const fullResult = await $`echo "test" && echo "error" >&2`;
console.log({
  stdout: fullResult.stdout,       // Standard output
  stderr: fullResult.stderr,       // Error output
  exitCode: fullResult.exitCode,   // Return code
  success: fullResult.ok,          // true if exitCode === 0
  cause: fullResult.cause,         // Error cause when not ok
  command: fullResult.command      // Executed command
});

// 7. Multi-line commands
// You can use multi-line template literals
await $`
  echo "Line 1"
  echo "Line 2"
  echo "Line 3"
`;

// 8. Commands with pipe
// Since commands are executed through shell, you can use pipes
const piped = await $`echo "hello world" | tr '[:lower:]' '[:upper:]'`;
console.log('In uppercase:', piped.stdout); // HELLO WORLD

// 9. Additional ProcessPromise methods
// ProcessPromise provides a chain of methods for configuration

// Get JSON from output
const packageInfo = await $`cat package.json`.json();
console.log('Package name:', packageInfo.name);

// Get array of strings
const fileLines = await $`ls -1`.lines();
console.log('File count:', fileLines.length);

// Get Buffer
const binaryData = await $`cat /dev/urandom | head -c 10`.buffer();
console.log('Data size:', binaryData.length);

// 10. Timeout configuration
const timedResult = await $`sleep 0.1 && echo "done"`.timeout(1000);
console.log('Result with timeout:', timedResult.stdout);

// Note: All ProcessPromise methods can be combined in chains:
const complexResult = await $`echo "test"`
  .timeout(5000)      // Set timeout
  .env({ DEBUG: '1' }) // Add environment variable
  .cwd('/tmp')        // Change working directory
  .nothrow()          // Don't generate exception on error
  .quiet();           // Don't output logs

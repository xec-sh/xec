/**
 * 01. Hello World - Simplest example of using @xec-sh/core
 * 
 * This example demonstrates basic command execution using $
 * 
 * @xec-sh/core provides an elegant API for executing shell commands
 * in Node.js/TypeScript, inspired by google/zx, but with extended capabilities.
 */

import { $, CommandError } from '../../src/index.js';

// 1. Simple command execution
// $ is a global function for executing commands
// Use template literals to define commands
await $`echo "Hello, World!"`;

// 2. Getting execution result
// Each command returns ExecutionResult with complete information
const result = await $`echo "Hello from xec!"`;
console.log('Output:', result.stdout);       // Command standard output
console.log('Exit code:', result.exitCode);  // Return code (0 = success)
console.log('Success:', result.ok);          // true if exitCode === 0
console.log('Cause:', result.cause);         // undefined when ok is true

// 3. Variable interpolation in commands
// Variables are automatically escaped for security
const name = 'TypeScript';
await $`echo "Hello, ${name}!"`;

// Even if variable contains special characters, it will be safely escaped
const userInput = 'World; rm -rf /';
await $`echo "Hello, ${userInput}!"`;  // Safe! Will output: Hello, World; rm -rf /!

// 4. Working with standard streams
// Redirecting to stderr
await $`echo "This is an error" >&2`;

// 5. Error handling
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

// Note: By default, commands are executed through shell,
// which allows using all shell capabilities, including pipes,
// redirections and other constructs.

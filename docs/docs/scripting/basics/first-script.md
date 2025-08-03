# Writing Your First Xec Script

Xec scripts combine the power of TypeScript with seamless command execution across multiple environments. This guide walks you through creating your first script using the Xec execution engine.

## Basic Script Structure

A minimal Xec script is just a JavaScript or TypeScript file that uses the `$` template literal for command execution:

```javascript
// hello.js
import { $ } from '@xec-sh/core';

// Execute a simple command
await $`echo "Hello from Xec!"`;

// Get the current directory
const pwd = await $`pwd`;
console.log(`Current directory: ${pwd.stdout}`);
```

## Running Your Script

Execute your script using the `xec run` command:

```bash
xec run hello.js
```

## Script Arguments

Scripts can accept command-line arguments through the global `args` array:

```javascript
// greet.js
import { $ } from '@xec-sh/core';

// Access script arguments
const name = args[0] || 'World';
await $`echo "Hello, ${name}!"`;

// Access all arguments
console.log('All arguments:', args);
console.log('Script path:', __filename);
console.log('Script directory:', __dirname);
```

Run with arguments:
```bash
xec run greet.js Alice
# Output: Hello, Alice!
```

## TypeScript Support

Xec natively supports TypeScript without any configuration:

```typescript
// deploy.ts
import { $ } from '@xec-sh/core';
import type { ProcessPromise } from '@xec-sh/core';

interface DeployOptions {
  environment: 'dev' | 'staging' | 'prod';
  version: string;
}

async function deploy(options: DeployOptions): Promise<void> {
  const { environment, version } = options;
  
  // Type-safe command execution
  const result: ProcessPromise = $`git tag v${version}`;
  await result;
  
  console.log(`Deployed version ${version} to ${environment}`);
}

// Parse arguments
const options: DeployOptions = {
  environment: (args[0] as DeployOptions['environment']) || 'dev',
  version: args[1] || '1.0.0'
};

await deploy(options);
```

## Async/Await Patterns

All command executions are asynchronous and return promises:

```javascript
// async-example.js
import { $ } from '@xec-sh/core';

// Sequential execution
async function sequentialCommands() {
  await $`echo "Step 1"`;
  await $`echo "Step 2"`;
  await $`echo "Step 3"`;
}

// Parallel execution
async function parallelCommands() {
  const results = await Promise.all([
    $`echo "Task 1"`,
    $`echo "Task 2"`,
    $`echo "Task 3"`
  ]);
  
  results.forEach((result, i) => {
    console.log(`Task ${i + 1}: ${result.stdout}`);
  });
}

// Error handling
async function safeExecution() {
  try {
    await $`ls /nonexistent`;
  } catch (error) {
    console.error('Command failed:', error.message);
  }
}

await sequentialCommands();
await parallelCommands();
await safeExecution();
```

## Working with Output

Commands return objects with stdout, stderr, and exit code:

```javascript
// output.js
import { $ } from '@xec-sh/core';

// Capture output
const result = await $`ls -la`;
console.log('Files:', result.stdout);
console.log('Exit code:', result.exitCode);

// Check if command succeeded
if (result.exitCode === 0) {
  console.log('Command succeeded');
}

// Stream output in real-time
await $`echo "Line 1"; sleep 1; echo "Line 2"`.pipe(process.stdout);

// Quiet execution (suppress output)
await $`echo "This won't be displayed"`.quiet();

// Verbose mode (show command being executed)
await $`echo "Verbose output"`.verbose();
```

## Script Context Variables

Xec provides several global variables in the script context:

```javascript
// context.js
import { $ } from '@xec-sh/core';

// Built-in globals
console.log('Script arguments:', args);
console.log('Full argv:', argv);
console.log('Script path:', __filename);
console.log('Script directory:', __dirname);

// When running with a target
if (typeof $target !== 'undefined') {
  console.log('Target info:', $targetInfo);
  
  // Execute on target
  await $target`ls -la`;
  
  // Execute locally (always available)
  await $`ls -la`;
}
```

## Interactive Scripts

Scripts can use prompts for user interaction:

```javascript
// interactive.js
import { $ } from '@xec-sh/core';
import * as clack from '@clack/prompts';

// Ask for user input
const name = await clack.text({
  message: 'What is your name?',
  placeholder: 'John Doe'
});

const shouldContinue = await clack.confirm({
  message: 'Do you want to continue?'
});

if (shouldContinue) {
  await $`echo "Hello, ${name}!"`;
}

// Select from options
const environment = await clack.select({
  message: 'Choose environment:',
  options: [
    { value: 'dev', label: 'Development' },
    { value: 'staging', label: 'Staging' },
    { value: 'prod', label: 'Production' }
  ]
});

console.log(`Deploying to ${environment}`);
```

## Watch Mode

Run scripts in watch mode to automatically re-execute on file changes:

```bash
xec run script.js --watch
```

Your script will re-run whenever you save changes, making development iteration faster.

## Next Steps

- Learn about the [execution context](./execution-context.md) and working with targets
- Explore [command execution patterns](./command-execution.md) for advanced usage
- Set up [TypeScript configuration](./typescript-setup.md) for better type safety
- Discover [error handling patterns](../patterns/error-handling.md) for robust scripts

## Complete Example

Here's a complete example combining multiple concepts:

```javascript
// build-and-deploy.js
import { $ } from '@xec-sh/core';
import * as clack from '@clack/prompts';
import chalk from 'chalk';

async function main() {
  // Show intro
  clack.intro(chalk.cyan('Build and Deploy Script'));
  
  // Get deployment target
  const target = await clack.select({
    message: 'Select deployment target:',
    options: [
      { value: 'local', label: 'Local Development' },
      { value: 'staging', label: 'Staging Server' },
      { value: 'production', label: 'Production Server' }
    ]
  });
  
  // Build the project
  const buildSpinner = clack.spinner();
  buildSpinner.start('Building project...');
  
  try {
    await $`npm run build`;
    buildSpinner.stop('Build complete');
    
    // Run tests
    buildSpinner.start('Running tests...');
    await $`npm test`;
    buildSpinner.stop('Tests passed');
    
    // Deploy based on target
    if (target === 'production') {
      const confirm = await clack.confirm({
        message: 'Are you sure you want to deploy to production?'
      });
      
      if (!confirm) {
        clack.cancel('Deployment cancelled');
        process.exit(0);
      }
    }
    
    buildSpinner.start(`Deploying to ${target}...`);
    await $`npm run deploy:${target}`;
    buildSpinner.stop(`Deployed to ${target}`);
    
    // Show success
    clack.outro(chalk.green('✨ Deployment complete!'));
    
  } catch (error) {
    buildSpinner.stop('Failed');
    clack.log.error(error.message);
    process.exit(1);
  }
}

await main();
```

This example demonstrates:
- Interactive prompts for user input
- Progress indicators with spinners
- Conditional logic based on user choices
- Error handling with proper exit codes
- Colored output for better readability
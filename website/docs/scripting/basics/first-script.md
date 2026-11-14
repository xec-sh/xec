---
title: First Script
description: Writing and running your first Xec script
---

# Writing Your First Xec Script {#writing-your-first-xec-script}

An Xec script is a JavaScript or TypeScript file that executes commands across local and remote environments. This guide walks you through creating your first one.

## Basic Script Structure {#basic-script-structure}

A minimal Xec script is just a JavaScript or TypeScript file that uses the `$` template literal for command execution:

```javascript
// hello.js
import { $ } from '@xec-sh/core';

// Execute a simple command
await $`echo "Hello from Xec!"`;

// Get the current directory
const pwd = await $`pwd`.text();
console.log(`Current directory: ${pwd}`);
```

## Running Your Script {#running-your-script}

Execute your script using the `xec run` command:

```bash
xec run hello.js
```

## Script Arguments {#script-arguments}

Scripts receive their command-line arguments as the `args` global:

```javascript
// greet.js
import { $ } from '@xec-sh/core';

// `args` holds exactly what the script was invoked with.
const name = args[0] || 'World';
await $`echo "Hello, ${name}!"`;

// Access all arguments
console.log('All arguments:', args);
console.log('Script path:', import.meta.url);
```

Run with arguments:
```bash
xec greet.js Alice
# Output: Hello, Alice!
```

## TypeScript Support {#typescript-support}

Xec loads TypeScript scripts without a separate compilation step. Runtime transpilation does not replace `tsc --noEmit` validation:

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
  const result: ProcessPromise = $`npm run ${`deploy:${environment}`} -- ${version}`;
  await result;
  
  console.log(`Deployed version ${version} to ${environment}`);
}

// The project must define deploy:dev, deploy:staging and deploy:prod scripts.
const environment = args[0] || 'dev';
if (environment !== 'dev' && environment !== 'staging' && environment !== 'prod') {
  throw new Error('Expected dev, staging or prod');
}
const options: DeployOptions = { environment, version: args[1] || '1.0.0' };

await deploy(options);
```

## Async/Await Patterns {#asyncawait-patterns}

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
  const outputs = await Promise.all([
    $`echo "Task 1"`.text(),
    $`echo "Task 2"`.text(),
    $`echo "Task 3"`.text()
  ]);
  
  outputs.forEach((output, i) => {
    console.log(`Task ${i + 1}: ${output}`);
  });
}

// Error handling
async function safeExecution() {
  try {
    await $`ls /nonexistent`;
  } catch (error) {
    console.error('Command failed:', error instanceof Error ? error.message : String(error));
  }
}

await sequentialCommands();
await parallelCommands();
await safeExecution();
```

## Working with Output {#working-with-output}

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
const previousVerbose = $.verbose;
try {
  $.verbose = true;
  await $`echo "Verbose output"`;
} finally {
  $.verbose = previousVerbose;
}
```

## Script Context Variables {#script-context-variables}

Beyond `$` and the utility globals, target-bound scripts get `$target` and
`$targetInfo` (see
[Script Execution Context](./execution-context.md)):

```javascript
// context.js
import { $ } from '@xec-sh/core';

// Standard module facilities work as usual
console.log('Script arguments:', args);
console.log('Script URL:', import.meta.url);

// When running via xec run / xec on / xec in
if (typeof $target !== 'undefined') {
  console.log('Target info:', $targetInfo);
  
  // Execute on target
  await $target`ls -la`;
  
  // Execute locally (always available)
  await $`ls -la`;
}
```

## Interactive Scripts {#interactive-scripts}

Scripts can use prompts for user interaction:

```javascript
// interactive.js
import { $ } from '@xec-sh/core';
import * as kit from '@xec-sh/kit';

// Ask for user input
const name = await kit.text({
  message: 'What is your name?',
  placeholder: 'John Doe'
});

const shouldContinue = await kit.confirm({
  message: 'Do you want to continue?'
});

if (kit.isCancel(name) || kit.isCancel(shouldContinue)) throw new Error('Cancelled');

if (shouldContinue) {
  await $`echo "Hello, ${name}!"`;
}

// Select from options
const environment = await kit.select({
  message: 'Choose environment:',
  options: [
    { value: 'dev', label: 'Development' },
    { value: 'staging', label: 'Staging' },
    { value: 'prod', label: 'Production' }
  ]
});

if (kit.isCancel(environment)) throw new Error('Cancelled');
console.log(`Selected ${environment}`);
```

## Watch Mode {#watch-mode}

Run scripts in watch mode to automatically re-execute on file changes:

```bash
xec run script.js --watch
```

Your script will re-run whenever you save changes, making development iteration faster.

## Spinner Styles {#spinner-styles}

Xec provides several built-in spinner styles with automatic fallback for different terminal environments:

```javascript
import * as kit from '@xec-sh/kit';

// Available spinner styles
const styles = [
  'braille', // Default: smooth Braille pattern (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏)
  'circle',  // Traditional circle (◐◓◑◒)
  'dots',    // Pulsing dots (⠄⠆⠇⠋⠙⠸⠰⠠⠰⠸⠙⠋⠇⠆)
  'line',    // Minimal line (-\\|/)
  'arrow',   // Arrow rotation (←↖↑↗→↘↓↙)
  'binary',  // Binary style (01)
  'moon'     // Moon phases (🌑🌒🌓🌔🌕🌖🌗🌘)
];

// Use different styles
const spinner1 = kit.spinner({ style: 'braille' });
const spinner2 = kit.spinner({ style: 'arrow' });
const spinner3 = kit.spinner({ style: 'moon' });

// Custom frames
const customSpinner = kit.spinner({
  frames: ['🌟', '⭐', '✨', '💫'],
  delay: 150
});
```

Each style automatically degrades gracefully in non-Unicode terminals:

- **Unicode terminals**: Full animated frames with optimal timing
- **ASCII terminals**: Simplified fallback frames with adjusted delays
- **CI environments**: Optimized for log readability

## Next Steps {#next-steps}

- Learn about the [execution context](./execution-context.md) and working with targets
- Explore [command execution patterns](./command-execution.md) for advanced usage
- Set up [TypeScript configuration](./typescript-setup.md) for better type safety
- Discover [error handling patterns](../patterns/error-handling.md) for robust scripts

## Complete Example {#complete-example}

Here's a complete example combining multiple concepts:

```javascript
// build-and-deploy.js
import { $ } from '@xec-sh/core';
import * as kit from '@xec-sh/kit';

async function main() {
  // Show intro
  kit.intro(kit.prism.cyan('Build and Deploy Script'));
  
  // Get deployment target
  const target = await kit.select({
    message: 'Select deployment target:',
    options: [
      { value: 'local', label: 'Local Development' },
      { value: 'staging', label: 'Staging Server' },
      { value: 'production', label: 'Production Server' }
    ]
  });
  
  if (kit.isCancel(target)) { kit.cancel('Cancelled'); return; }

  // Build the project with different spinner styles
  const buildSpinner = kit.spinner({ style: 'braille' });
  const testSpinner = kit.spinner({ style: 'arrow' });
  buildSpinner.start('Building project...');

  try {
    await $`npm run build`;
    buildSpinner.stop('Build complete');

    // Run tests with arrow style
    testSpinner.start('Running tests...');
    await $`npm test`;
    testSpinner.stop('Tests passed');
    
    // Deploy based on target
    if (target === 'production') {
      const confirm = await kit.confirm({
        message: 'Are you sure you want to deploy to production?'
      });
      
      if (kit.isCancel(confirm) || !confirm) {
        kit.cancel('Deployment cancelled');
        return;
      }
    }
    
    buildSpinner.start(`Deploying to ${target}...`);
    await $`npm run deploy:${target}`;
    buildSpinner.stop(`Deployed to ${target}`);
    
    // Show success
    kit.outro(kit.prism.green('✨ Deployment complete!'));
    
  } catch (error) {
    buildSpinner.stop('Failed');
    testSpinner.stop('Failed');
    kit.log.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
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
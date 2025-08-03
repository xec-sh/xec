# Command Execution with Template Literals

The heart of Xec is its powerful template literal syntax for command execution. This guide covers everything you need to know about executing commands using the `$` template literal.

## Basic Syntax

The `$` function uses JavaScript template literals to execute shell commands:

```javascript
import { $ } from '@xec-sh/core';

// Simple command
await $`echo "Hello, World!"`;

// With variables
const name = 'Alice';
await $`echo "Hello, ${name}!"`;

// Multi-line commands
await $`
  echo "Line 1"
  echo "Line 2"
  echo "Line 3"
`;
```

## ProcessPromise API

Every command returns a `ProcessPromise` with rich functionality:

```javascript
const promise = $`ls -la`;

// ProcessPromise methods (chainable)
promise
  .quiet()        // Suppress stdout/stderr
  .verbose()      // Show command being executed
  .nothrow()      // Don't throw on non-zero exit
  .timeout(5000)  // Set timeout in milliseconds
  .cwd('/tmp')    // Set working directory
  .env({KEY: 'value'}) // Set environment variables
  .stdin('input') // Provide stdin
  .pipe(stream)   // Pipe output to stream

// Await for result
const result = await promise;
```

## Working with Output

### Capturing Output

```javascript
// Get stdout as string
const files = await $`ls`;
console.log(files.stdout);

// Access all properties
const result = await $`echo "test"`;
console.log(result.stdout);    // 'test\n'
console.log(result.stderr);    // ''
console.log(result.exitCode);  // 0
console.log(result.signal);    // null
console.log(result.duration);  // execution time in ms
```

### Streaming Output

```javascript
// Stream to stdout in real-time
await $`npm install`.pipe(process.stdout);

// Stream to file
import { createWriteStream } from 'fs';
const logFile = createWriteStream('output.log');
await $`npm test`.pipe(logFile);

// Stream stderr separately
await $`npm build`
  .pipe(process.stdout)
  .stderr(process.stderr);
```

### Quiet and Verbose Modes

```javascript
// Quiet mode - suppress all output
await $`npm install`.quiet();

// Verbose mode - show command being executed
await $`rm -rf node_modules`.verbose();
// Output: $ rm -rf node_modules

// Combine modes
await $`npm test`.quiet().verbose();
// Shows command but not output
```

## Error Handling

### Default Behavior

By default, commands throw on non-zero exit codes:

```javascript
try {
  await $`exit 1`;
} catch (error) {
  console.error('Command failed:', error.message);
  console.error('Exit code:', error.exitCode);
  console.error('Stderr:', error.stderr);
}
```

### Non-Throwing Mode

Use `.nothrow()` to handle errors manually:

```javascript
const result = await $`exit 1`.nothrow();

if (result.exitCode !== 0) {
  console.log('Command failed with exit code:', result.exitCode);
} else {
  console.log('Command succeeded');
}

// Or use the ok property
if (!result.ok) {
  console.error('Failed:', result.error);
}
```

### Retry Logic

```javascript
async function retryCommand(cmd, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const result = await cmd.nothrow();
    if (result.exitCode === 0) {
      return result;
    }
    console.log(`Attempt ${i + 1} failed, retrying...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Command failed after ${maxRetries} attempts`);
}

// Usage
const result = await retryCommand($`curl https://api.example.com`);
```

## Environment and Working Directory

### Setting Environment Variables

```javascript
// Set single variable
await $`echo $MY_VAR`.env({ MY_VAR: 'test' });

// Merge with existing environment
await $`node script.js`.env({
  ...process.env,
  NODE_ENV: 'production',
  API_KEY: 'secret'
});

// Using environment in template
const apiKey = 'secret123';
await $`curl -H "Authorization: ${apiKey}" https://api.example.com`;
```

### Working Directory

```javascript
// Change working directory
await $`npm install`.cwd('/path/to/project');

// Chain multiple operations
await $`pwd`.cwd('/tmp');  // Outputs: /tmp

// Use with relative paths
const projectDir = './my-project';
await $`npm test`.cwd(projectDir);
```

## Input/Output Redirection

### Providing Input

```javascript
// Provide stdin as string
await $`cat`.stdin('Hello from stdin\n');

// Pipe from file
import { createReadStream } from 'fs';
const input = createReadStream('input.txt');
await $`sort`.stdin(input);

// Interactive input
await $`npm init`.stdin(process.stdin);
```

### Output Redirection

```javascript
// Redirect to file (shell style)
await $`echo "test" > output.txt`;

// Programmatic redirection
import { createWriteStream } from 'fs';
const outFile = createWriteStream('output.txt');
await $`ls -la`.pipe(outFile);

// Append to file
await $`echo "append" >> output.txt`;
```

## Pipes and Chains

### Shell Pipes

```javascript
// Using shell pipe operator
await $`cat file.txt | grep "pattern" | wc -l`;

// Multiple pipes
await $`ps aux | grep node | awk '{print $2}'`;
```

### Programmatic Pipes

```javascript
// Pipe between commands
const files = await $`ls`;
await $`echo "${files.stdout}" | grep ".js"`;

// Process output before piping
const result = await $`cat data.json`;
const processed = JSON.parse(result.stdout);
await $`echo ${JSON.stringify(processed)} | jq '.'`;
```

## Timeout Handling

```javascript
// Set timeout in milliseconds
try {
  await $`sleep 10`.timeout(5000);
} catch (error) {
  console.error('Command timed out after 5 seconds');
}

// With custom timeout error handling
const result = await $`long-running-command`
  .timeout(30000)
  .nothrow();

if (result.signal === 'SIGTERM') {
  console.log('Command was terminated due to timeout');
}
```

## Shell Features

### Variable Expansion

```javascript
// Shell variable expansion
await $`echo $HOME`;
await $`echo ${HOME}/Documents`;

// JavaScript variable in command
const dir = '/tmp';
await $`cd ${dir} && ls`;
```

### Globbing

```javascript
// Shell globbing
await $`rm *.tmp`;
await $`ls **/*.js`;

// Escape globbing when needed
const filename = 'file[1].txt';
await $`cat ${filename}`;  // May not work as expected
await $`cat "${filename}"`; // Properly escaped
```

### Command Substitution

```javascript
// Using command substitution
await $`echo "Current date: $(date)"`;

// JavaScript alternative
const date = await $`date`;
await $`echo "Current date: ${date.stdout.trim()}"`;
```

## Advanced Patterns

### Conditional Execution

```javascript
// Shell conditional operators
await $`test -f file.txt && echo "File exists"`;
await $`test -d dir || mkdir dir`;

// JavaScript conditionals
const fileExists = await $`test -f file.txt`.nothrow();
if (fileExists.exitCode === 0) {
  await $`cat file.txt`;
} else {
  await $`touch file.txt`;
}
```

### Background Processes

```javascript
// Start background process (returns immediately)
const server = $`npm run server`;

// Do other work
await $`npm test`;

// Wait for background process
await server;

// Or kill it
server.kill('SIGTERM');
```

### Process Groups

```javascript
// Execute multiple commands in sequence
async function buildProject() {
  const steps = [
    $`npm install`,
    $`npm run lint`,
    $`npm run test`,
    $`npm run build`
  ];
  
  for (const step of steps) {
    await step.verbose();
  }
}

// Execute in parallel
async function parallelTasks() {
  const results = await Promise.all([
    $`npm run test:unit`,
    $`npm run test:integration`,
    $`npm run test:e2e`
  ]);
  
  results.forEach((result, i) => {
    console.log(`Task ${i}: Exit code ${result.exitCode}`);
  });
}
```

## Platform Differences

### Cross-Platform Commands

```javascript
import { platform } from 'os';

// Platform-specific commands
if (platform() === 'win32') {
  await $`dir`;
} else {
  await $`ls`;
}

// Use cross-platform alternatives
await $`node -e "console.log(process.cwd())"`;  // Instead of pwd
await $`node -e "console.log(os.homedir())"`; // Instead of echo $HOME
```

### Shell Selection

```javascript
// Xec automatically detects the shell
// On Unix: /bin/sh
// On Windows: cmd.exe or PowerShell

// Force specific shell (advanced)
process.env.SHELL = '/bin/bash';
await $`echo $BASH_VERSION`;
```

## Performance Optimization

### Command Batching

```javascript
// Inefficient - multiple shell invocations
await $`mkdir -p dir1`;
await $`mkdir -p dir2`;
await $`mkdir -p dir3`;

// Efficient - single shell invocation
await $`mkdir -p dir1 dir2 dir3`;

// Or use shell features
await $`
  mkdir -p dir1
  mkdir -p dir2
  mkdir -p dir3
`;
```

### Output Buffering

```javascript
// For large outputs, stream instead of buffering
// Bad for large files
const hugeFile = await $`cat very-large-file.txt`;

// Good - stream processing
await $`cat very-large-file.txt`.pipe(process.stdout);

// Or process line by line
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

const rl = createInterface({
  input: createReadStream('large-file.txt')
});

for await (const line of rl) {
  // Process each line
}
```

## Security Considerations

### Command Injection Prevention

```javascript
// DANGEROUS - command injection vulnerability
const userInput = '; rm -rf /';
await $`echo ${userInput}`;  // DON'T DO THIS

// SAFE - proper escaping
import { quote } from 'shell-quote';
const safeInput = quote([userInput]);
await $`echo ${safeInput}`;

// Or use arrays (safest)
await $(['echo', userInput]);
```

### Sensitive Data

```javascript
// Don't log sensitive commands
const password = 'secret123';
await $`mysql -u root -p${password}`.quiet();  // Hide output

// Use environment variables for secrets
await $`mysql -u root`.env({ MYSQL_PWD: password });
```

## Complete Example

Here's a comprehensive example showcasing various command execution patterns:

```javascript
// deploy.js - Complete deployment script
import { $ } from '@xec-sh/core';
import chalk from 'chalk';

async function deploy() {
  console.log(chalk.blue('Starting deployment...'));
  
  // Check prerequisites
  const gitStatus = await $`git status --porcelain`.nothrow();
  if (gitStatus.stdout.trim()) {
    throw new Error('Working directory not clean');
  }
  
  // Build the project
  console.log(chalk.yellow('Building project...'));
  await $`npm run build`
    .timeout(60000)
    .pipe(process.stdout);
  
  // Run tests
  console.log(chalk.yellow('Running tests...'));
  const testResult = await $`npm test`.nothrow();
  if (testResult.exitCode !== 0) {
    console.error(chalk.red('Tests failed!'));
    console.error(testResult.stderr);
    process.exit(1);
  }
  
  // Create deployment directory
  const deployDir = '/var/www/app';
  await $`sudo mkdir -p ${deployDir}`.quiet();
  
  // Copy files
  console.log(chalk.yellow('Copying files...'));
  await $`sudo rsync -av --delete dist/ ${deployDir}/`
    .verbose();
  
  // Restart service
  console.log(chalk.yellow('Restarting service...'));
  await $`sudo systemctl restart app.service`;
  
  // Verify deployment
  const healthCheck = await $`curl -f http://localhost:3000/health`
    .timeout(5000)
    .nothrow();
  
  if (healthCheck.exitCode === 0) {
    console.log(chalk.green('✅ Deployment successful!'));
  } else {
    console.error(chalk.red('❌ Health check failed'));
    await $`sudo systemctl status app.service`;
    process.exit(1);
  }
}

// Execute with error handling
deploy().catch(error => {
  console.error(chalk.red('Deployment failed:'), error.message);
  process.exit(1);
});
```

This example demonstrates:
- Error checking with `.nothrow()`
- Timeout handling
- Output streaming
- Conditional execution
- Service management
- Health checks
- Proper error handling and exit codes
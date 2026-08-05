---
title: Command Execution
description: Template literal command execution in Xec scripts
---

# Command Execution with Template Literals

The heart of Xec is its template literal syntax for command execution. This guide covers executing commands using the `$` template literal.

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
  .nothrow()      // Don't throw on non-zero exit
  .timeout(5000)  // Set timeout in milliseconds
  .cwd('/tmp')    // Set working directory
  .env({KEY: 'value'}) // Set environment variables
  .pipe(stream)   // Pipe output to stream

// stdin is a property, not a method — write to it directly
promise.stdin.end('input');

// Await for result
const result = await promise;
```

## Working with Output

### Capturing Output

```javascript
// Get stdout as a trimmed string
const files = await $`ls`.text();
console.log(files);

// Access all properties
const result = await $`echo "test"`;
console.log(result.stdout);    // 'test\n'
console.log(result.stderr);    // ''
console.log(result.exitCode);  // 0
console.log(result.signal);    // undefined
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

// Verbose mode - show each command before it runs. Unlike `.quiet()`, this
// is a setting on the engine, not something chained onto one command.
$.verbose = true;
await $`rm -rf node_modules`;
// Output: $ rm -rf node_modules

// Combine with quiet to see the command but not its output
await $`npm test`.quiet();
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

// Or use the ok property (true only when exitCode is 0 and no signal fired)
if (!result.ok) {
  console.error('Failed:', result.cause);
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

`stdin` is a property — a writable stream — not a method. It can be written
to before the command has started: writes are buffered and forwarded once
the process spawns.

```javascript
// Provide stdin as a string
const cat = $`cat`;
cat.stdin.end('Hello from stdin\n');
await cat;

// Pipe from a file
import { createReadStream } from 'fs';
const sort = $`sort`;
createReadStream('input.txt').pipe(sort.stdin);
await sort;

// Interactive input — inherit the parent's stdio wholesale
await $`npm init`.interactive();
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
await $`ls`.pipe($`grep ".js"`);

// Process output before piping
const processed = await $`cat data.json`.json();
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

if (!result.ok) {
  console.log(`Command did not finish: ${result.cause}`);
}
```

A signalled process is never `ok`, and its `exitCode` is 128+n for signal
number n. `result.signal` is set when the signal lands on the direct child
process (for example after `.kill('SIGTERM')`); when a wrapper shell absorbs
the signal instead, `signal` can be absent and only the exit code and `cause`
tell you what happened — so branch on `.ok`/`.cause`, not on `signal`.

## Shell Features

### Variable Expansion

```javascript
// Shell variable expansion — $HOME passes through to the shell untouched.
// ${...} inside the template is JavaScript interpolation, not shell syntax,
// so `echo ${HOME}` would be a ReferenceError unless HOME is a JS variable.
await $`echo $HOME`;
await $`echo $HOME/Documents`;

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
const date = await $`date`.text();
await $`echo "Current date: ${date}"`;
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
// Execute multiple commands in sequence, echoing each one first
$.verbose = true;

async function buildProject() {
  const steps = [
    $`npm install`,
    $`npm run lint`,
    $`npm run test`,
    $`npm run build`
  ];
  
  for (const step of steps) {
    await step;
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
// Xec defaults to /bin/sh on Unix and cmd.exe on Windows — the same default
// Node's child_process.spawn({ shell: true }) uses. Setting process.env.SHELL
// has no effect on which shell actually runs the command.

// Force a specific shell (advanced)
await $`echo $BASH_VERSION`.shell('/bin/bash');
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

// Or process line by line as the command runs
for await (const line of $`cat very-large-file.txt`) {
  // Process each line
}
```

## Security Considerations

### Command Injection Prevention

Template interpolation escapes every value it's given, so it's the safe
default — no extra escaping library is needed:

```javascript
// SAFE - interpolated values are quoted as a single argument, not parsed
// by the shell. This prints the literal string "; rm -rf /"; it does not
// run it.
const userInput = '; rm -rf /';
await $`echo ${userInput}`;
```

An array passed to `` $`...` `` or `$.run(...)` is a way to supply a whole
command as pre-built segments, not an escaping mechanism — its elements are
spliced into the command line unescaped. Interpolating untrusted input into
one is exactly as dangerous as building the string by hand:

```javascript
// DANGEROUS - array elements are not escaped; this actually runs `echo`
// AND the injected `rm -rf /`
await $(['echo', userInput]);  // DON'T DO THIS
```

For argv assembled entirely from untrusted parts, bypass the shell instead
of relying on quoting at all:

```javascript
// SAFE - no shell is involved, so there is nothing to inject into
await $.execute({ command: 'echo', args: [userInput], shell: false });
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
  const gitStatus = await $`git status --porcelain`.nothrow().text();
  if (gitStatus) {
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
  $.verbose = true;
  await $`sudo rsync -av --delete dist/ ${deployDir}/`;
  
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
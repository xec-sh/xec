---
title: Template Literals API
sidebar_label: Template Literals
description: Safe command building through template literals with automatic escaping
---

# Template Literals API

Template literals are the primary way to build commands in Xec. This API provides safe variable injection into commands with automatic escaping, preventing injections and errors.

## Basic Usage

### Simple Command Execution

```typescript
import { $ } from '@xec-sh/core';

// Simple command
await $`ls -la`;

// With variables
const dir = '/home/user';
await $`ls -la ${dir}`;

// Multi-line commands
await $`
  echo "Starting process..."
  npm install
  npm build
  echo "Process completed"
`;
```

### Automatic Escaping

All values substituted through `${}` are automatically escaped:

```typescript
// Files with spaces
const file = "my document.txt";
await $`cat ${file}`;
// Executes: cat "my document.txt"

// Special characters
const dangerous = "'; rm -rf /; echo '";
await $`echo ${dangerous}`;
// Executes: echo "'; rm -rf /; echo '"
// Output: '; rm -rf /; echo '

// Command injection attempt
const userInput = "$(malicious command)";
await $`echo ${userInput}`;
// Safe! Outputs: $(malicious command)
```

## Data Types and Their Handling

### Strings

Strings are escaped with context awareness:

```typescript
const text = "Hello, World!";
await $`echo ${text}`;  // echo "Hello, World!"

const path = "/path/with spaces/file.txt";
await $`cat ${path}`;  // cat "/path/with spaces/file.txt"

const quote = 'He said "Hello"';
await $`echo ${quote}`;  // echo "He said \"Hello\""
```

### Numbers and Boolean Values

```typescript
const port = 3000;
const count = 42;
const enabled = true;

await $`node server.js --port ${port}`;  // --port 3000
await $`head -n ${count} file.txt`;       // head -n 42
await $`./script.sh --verbose ${enabled}`; // --verbose true
```

### Arrays

Arrays are expanded into separate arguments:

```typescript
const files = ['file1.txt', 'file2.txt', 'file3.txt'];
await $`rm ${files}`;
// Executes: rm file1.txt file2.txt file3.txt

const flags = ['-v', '--recursive', '--force'];
await $`command ${flags} target`;
// Executes: command -v --recursive --force target

// Empty array is ignored
const empty: string[] = [];
await $`ls ${empty} -la`;  // ls -la
```

### Objects

Objects are converted to JSON:

```typescript
const config = { 
  name: 'app',
  version: '1.0.0',
  port: 3000 
};

await $`echo ${config}`;
// Executes: echo '{"name":"app","version":"1.0.0","port":3000}'

// Use in configuration files
await $`echo ${config} > config.json`;
```

### null and undefined

```typescript
const nullValue = null;
const undefinedValue = undefined;

await $`echo "Value: ${nullValue}"`;      // echo "Value: "
await $`echo "Value: ${undefinedValue}"`; // echo "Value: "

// Useful for optional parameters
const optionalFlag = condition ? '--verbose' : undefined;
await $`command ${optionalFlag} file.txt`;
// If condition false: command file.txt
// If condition true: command --verbose file.txt
```

### Promises and Async Values

Template literals automatically await promise resolution:

```typescript
// Function returns Promise
async function getVersion() {
  return '1.2.3';
}

// Promise is automatically resolved
await $`npm publish --tag ${getVersion()}`;
// Executes: npm publish --tag 1.2.3

// Promise chaining
const data = fetch('/api/config').then(r => r.json());
await $`deploy --config ${data}`;

// Parallel resolution
const [user, host] = [
  Promise.resolve('admin'),
  Promise.resolve('server.com')
];
await $`ssh ${user}@${host}`;
```

## Raw Mode - Without Escaping

For cases when you need to disable escaping:

```typescript
import { ExecutionEngine } from '@xec-sh/core';

const $ = new ExecutionEngine();

// Normal mode - with escaping
const pattern = '*.txt';
await $`ls ${pattern}`;  // ls "*.txt" (looks for file named *.txt)

// Raw mode - without escaping
await $.raw`ls ${pattern}`;  // ls *.txt (works as glob)

// Useful for:
// - Glob patterns
const files = '*.{js,ts}';
await $.raw`rm ${files}`;

// - Redirections
const output = '> output.txt';
await $.raw`echo "test" ${output}`;

// - Pipes
const pipe = '| grep error';
await $.raw`cat log.txt ${pipe}`;
```

⚠️ **Warning**: Use raw mode only with trusted data!

## Complex Examples

### Dynamic Command Building

```typescript
// Conditional flags
const verbose = process.env.DEBUG === 'true';
const dryRun = process.env.DRY_RUN === 'true';

const flags = [
  verbose && '--verbose',
  dryRun && '--dry-run',
  '--color'
].filter(Boolean);

await $`npm publish ${flags}`;
```

### Command Templating

```typescript
// Creating a reusable template
function gitCommit(message: string, files: string[] = []) {
  return $`git add ${files.length ? files : '.'} && git commit -m ${message}`;
}

await gitCommit('Initial commit');
await gitCommit('Add features', ['src/feature.ts', 'tests/feature.test.ts']);
```

### Working with Paths

```typescript
import * as path from 'path';

const baseDir = '/projects';
const projectName = 'my-app';
const fileName = 'config.json';

// Safe path construction
const fullPath = path.join(baseDir, projectName, fileName);
await $`cat ${fullPath}`;

// Multiple paths
const dirs = ['src', 'tests', 'docs'].map(d => path.join(baseDir, d));
await $`ls -la ${dirs}`;
```

### Working with Environment

```typescript
// Environment variables in commands
const env = {
  NODE_ENV: 'production',
  PORT: '3000',
  API_KEY: 'secret-key'
};

// Pass through env
await $`node app.js`.env(env);

// Or inline
const port = 3000;
const host = 'localhost';
await $`NODE_ENV=production npm start -- --port ${port} --host ${host}`;
```

## Special Characters and Their Handling

### Quotes

```typescript
// Single quotes
const single = "It's a test";
await $`echo ${single}`;  // echo "It's a test"

// Double quotes
const double = 'Say "Hello"';
await $`echo ${double}`;  // echo "Say \"Hello\""

// Mixed
const mixed = `It's "complex"`;
await $`echo ${mixed}`;  // echo "It's \"complex\""
```

### Shell Characters

```typescript
// Special characters are escaped
const special = '$HOME && ls || rm -rf /';
await $`echo ${special}`;
// Output: $HOME && ls || rm -rf /

// Backticks
const backticks = '`command`';
await $`echo ${backticks}`;  // echo "\`command\`"

// Shell variables
const shellVar = '${PATH}';
await $`echo ${shellVar}`;  // echo "\${PATH}"
```

### Unicode and Emoji

```typescript
// Unicode is supported
const unicode = 'Hello, world! 你好世界';
await $`echo ${unicode}`;

// Emoji work
const emoji = '🚀 Deploying...';
await $`echo ${emoji}`;

// Special characters
const special = '→ ← ↑ ↓ • × ÷';
await $`echo ${special}`;
```

## Function Interpolation

```typescript
// Functions are called automatically
function getTimestamp() {
  return new Date().toISOString();
}

await $`echo "Deployed at: ${getTimestamp()}"`;

// Async functions
async function getGitHash() {
  const result = await $`git rev-parse HEAD`;
  return result.stdout.trim();
}

await $`docker build -t app:${getGitHash()} .`;

// Object methods
const config = {
  getConnectionString() {
    return 'postgresql://localhost/db';
  }
};

await $`psql ${config.getConnectionString()}`;
```

## Nested Template Literals

```typescript
// Commands can be nested
const branch = await $`git branch --show-current`.text();
await $`git push origin ${branch}`;

// Or in one line
await $`git push origin ${await $`git branch --show-current`.text()}`;

// Complex compositions
const files = await $`find . -name "*.js"`.lines();
await $`eslint ${files}`;
```

## Multi-line Commands

```typescript
// Shell scripts
await $`
  set -e
  echo "Starting deployment..."
  
  # Update code
  git pull origin main
  
  # Install dependencies
  npm ci
  
  # Build
  npm run build
  
  # Restart
  pm2 restart app
  
  echo "Deployment completed!"
`;

// With variables
const appName = 'my-app';
const environment = 'production';

await $`
  echo "Deploying ${appName} to ${environment}"
  cd /apps/${appName}
  git checkout ${environment}
  npm run deploy:${environment}
`;
```

## Error Handling in Template Literals

```typescript
// Incorrect usage
try {
  const result = $`command`;  // Forgot await!
  // result is ProcessPromise, not result
} catch (e) {
  // This block won't execute
}

// Correct usage
try {
  const result = await $`command`;
  console.log(result.stdout);
} catch (error) {
  console.error('Command failed:', error.stderr);
}

// With nothrow
const result = await $`may-fail`.nothrow();
if (result.exitCode !== 0) {
  console.log('Failed but continued');
}
```

## Performance and Optimizations

### String Reuse

```typescript
// Inefficient - creates new string each time
for (const file of files) {
  await $`process ${file}`;
}

// More efficient - batch processing
await $`process ${files}`;

// Or in parallel
await $.parallel.map(files, file => $`process ${file}`);
```

### Result Caching

```typescript
// Caching expensive operations
const getData = () => $`expensive-operation`.cache({ ttl: 60000 });

// First call executes the command
const data1 = await getData();

// Second call returns cache
const data2 = await getData();
```

## Debugging Template Literals

```typescript
// View the final command
const file = "test file.txt";
const cmd = $`cat ${file}`;

// Without executing, you can see the command
console.log(cmd.toString());  // ProcessPromise doesn't have toString

// For debugging use dry-run
const $ = new ExecutionEngine();
$.on('command:start', ({ command }) => {
  console.log('Executing:', command);
});

await $`cat ${file}`;
// Outputs: Executing: cat "test file.txt"
```

## Best Practices

### ✅ Good Practices

```typescript
// Use variables for readability
const sourceDir = '/source';
const destDir = '/dest';
await $`rsync -av ${sourceDir}/ ${destDir}/`;

// Break down complex commands
const files = await $`find . -type f -name "*.ts"`.lines();
const filtered = files.filter(f => !f.includes('node_modules'));
await $`prettier --write ${filtered}`;

// Use destructuring
const { stdout: version } = await $`node --version`;
```

### ❌ Avoid

```typescript
// Don't use string concatenation
const bad = 'ls ' + userInput;  // Dangerous!
await $`${bad}`;

// Don't forget await
const result = $`command`;  // This is Promise, not result!

// Don't use raw without necessity
await $.raw`rm ${userInput}`;  // Dangerous!

// Don't pass unchecked data
await $`mysql -p${userPassword}`;  // Password in logs!
```

## Conclusion

The Template Literals API in Xec provides:

- **Security**: automatic escaping prevents injections
- **Convenience**: natural JavaScript syntax
- **Flexibility**: support for all JavaScript data types
- **Asynchronicity**: automatic promise handling
- **Readability**: code looks like regular shell commands

This API is the foundation for safe and convenient command execution across all environments supported by Xec.
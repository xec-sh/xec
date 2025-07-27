---
sidebar_position: 3
---

# First Steps

Learn the basics of @xec-sh/core through hands-on examples.

## Your First Command

Let's start with the simplest example:

```typescript
import { $ } from '@xec-sh/core';

// Execute a simple command
await $`echo "Hello, World!"`;
```

That's it! The `$` function uses template literals to execute commands safely.

## Working with Command Output

Every command returns an `ExecutionResult` with useful information:

```typescript
const result = await $`echo "Hello, World!"`;

console.log('Output:', result.stdout);      // "Hello, World!\n"
console.log('Errors:', result.stderr);      // ""
console.log('Exit code:', result.exitCode); // 0
console.log('Success?', result.isSuccess()); // true
```

## Template Literal Interpolation

Variables are automatically escaped for safety:

```typescript
const name = "Alice";
const filename = "my file.txt"; // Note the space!

// Variables are safely escaped
await $`echo "Hello, ${name}!"`;
await $`touch ${filename}`; // Creates "my file.txt", not "my" and "file.txt"

// Even dangerous inputs are safe
const userInput = "'; rm -rf /; echo '";
await $`echo ${userInput}`; // Just prints the string, doesn't execute
```

## Working with Results

### Getting Clean Output

```typescript
// .text() removes trailing newline
const version = await $`node --version`.text();
console.log(`Node version: ${version}`); // "Node version: v18.16.0"

// .lines() splits output into array
const files = await $`ls`.lines();
console.log('Files:', files); // ['file1.txt', 'file2.txt', ...]

// .json() parses JSON output
const pkg = await $`cat package.json`.json();
console.log('Package name:', pkg.name);

// .buffer() gets raw bytes
const data = await $`cat binary.dat`.buffer();
```

## Error Handling

### Default Behavior

By default, non-zero exit codes throw errors:

```typescript
try {
  await $`exit 1`;
} catch (error) {
  console.error('Command failed:', error.message);
  console.error('Exit code:', error.exitCode);
  console.error('Stderr:', error.stderr);
}
```

### Suppress Errors

Use `.nothrow()` to handle errors manually:

```typescript
const result = await $`exit 1`.nothrow();

if (result.isSuccess()) {
  console.log('Success!');
} else {
  console.log('Failed with code:', result.exitCode);
}
```

## Environment Variables

### Set for One Command

```typescript
// Set environment variable for single command
await $.env({ NODE_ENV: 'production' })`node app.js`;

// Multiple variables
await $.env({ 
  NODE_ENV: 'test',
  DEBUG: 'app:*'
})`npm test`;
```

### Access Current Environment

```typescript
// Current environment is inherited
await $`echo $HOME`;
await $`echo $USER`;

// Override specific variables
await $.env({ USER: 'different' })`echo $USER`;
```

## Working Directory

### Change Directory

```typescript
// Change directory for one command
await $.cd('/tmp')`pwd`; // Outputs: /tmp

// Chain multiple directory changes
await $.cd('/tmp').cd('subfolder')`pwd`; // Outputs: /tmp/subfolder

// Original directory is preserved
await $`pwd`; // Back to original directory
```

## Command Chaining

### Sequential Commands

```typescript
// Using && for sequential execution
await $`mkdir -p /tmp/test && cd /tmp/test && echo "in test dir"`;

// Or use separate commands
await $`mkdir -p /tmp/test`;
await $.cd('/tmp/test')`echo "in test dir"`;
```

### Command Options

```typescript
// Set timeout
await $.timeout(5000)`sleep 2`; // OK
await $.timeout(1000)`sleep 2`; // Throws TimeoutError

// Combine options
await $.timeout(10000)
      .env({ NODE_ENV: 'production' })
      .cd('/app')`npm start`;
```

## Streaming Output

### Real-time Output

```typescript
// Stream to console
await $`npm install`.stream();

// Custom stream handling
await $`tail -f /var/log/app.log`.stream({
  stdout: (chunk) => console.log('LOG:', chunk),
  stderr: (chunk) => console.error('ERROR:', chunk)
});
```

## Quiet Mode

Suppress command logging:

```typescript
// Normal mode - commands are logged
await $`echo "This will be logged"`;

// Quiet mode - no logging
await $`echo "This won't be logged"`.quiet();
```

## Working with Files

### Read Files

```typescript
// Read file content
const content = await $`cat config.json`.text();

// Parse JSON directly
const config = await $`cat config.json`.json();

// Read lines
const lines = await $`cat file.txt`.lines();
```

### Write Files

```typescript
const data = "Hello, World!";
await $`echo ${data} > output.txt`;

// Append to file
await $`echo "More data" >> output.txt`;
```

## Common Patterns

### Check if Command Exists

```typescript
async function commandExists(cmd: string): Promise<boolean> {
  const result = await $`which ${cmd}`.nothrow();
  return result.isSuccess();
}

if (await commandExists('docker')) {
  console.log('Docker is available');
}
```

### Get Command Output or Default

```typescript
async function getGitBranch(): Promise<string> {
  const result = await $`git branch --show-current`.nothrow();
  return result.isSuccess() ? result.text() : 'main';
}
```

### Conditional Execution

```typescript
const isDev = process.env.NODE_ENV === 'development';

if (isDev) {
  await $`npm run dev`;
} else {
  await $`npm run build && npm start`;
}
```

## Practice Exercises

### Exercise 1: System Information

Create a script that gathers system information:

```typescript
async function getSystemInfo() {
  const info = {
    hostname: await $`hostname`.text(),
    user: await $`whoami`.text(),
    os: await $`uname -s`.text(),
    uptime: await $`uptime`.text(),
    memory: await $`free -h | grep Mem`.text()
  };
  
  console.log('System Information:');
  console.log(JSON.stringify(info, null, 2));
}

getSystemInfo().catch(console.error);
```

### Exercise 2: File Backup

Create a simple backup script:

```typescript
async function backup(source: string, destination: string) {
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const backupName = `backup-${timestamp}.tar.gz`;
  
  console.log(`Creating backup of ${source}...`);
  
  await $`tar -czf ${backupName} ${source}`;
  await $`mv ${backupName} ${destination}`;
  
  console.log(`Backup saved to ${destination}/${backupName}`);
}

backup('./myproject', '/backups').catch(console.error);
```

### Exercise 3: Git Status Check

Check git repository status across multiple directories:

```typescript
async function checkGitRepos(dirs: string[]) {
  for (const dir of dirs) {
    console.log(`\nChecking ${dir}:`);
    
    const result = await $.cd(dir)`git status --porcelain`.nothrow();
    
    if (!result.isSuccess()) {
      console.log('  Not a git repository');
      continue;
    }
    
    if (result.stdout.trim() === '') {
      console.log('  ✓ Clean');
    } else {
      console.log('  ✗ Has changes:');
      console.log(result.stdout);
    }
  }
}

checkGitRepos(['./project1', './project2']).catch(console.error);
```

## Next Steps

Now that you understand the basics:

1. Learn about [Command Execution](../core-features/command-execution) in detail
2. Explore [Template Literals](../core-features/template-literals) safety features
3. Try different [Execution Adapters](../adapters/local) (SSH, Docker, Kubernetes)
4. Dive into [Advanced Features](../advanced/parallel-execution)

## Tips and Best Practices

1. **Always handle errors** - Use try-catch or `.nothrow()`
2. **Use template literals** - Let Xec handle escaping
3. **Check command existence** - Use `which` before relying on commands
4. **Stream large outputs** - Don't buffer gigabytes in memory
5. **Use `.text()` for clean output** - Removes trailing newlines
6. **Chain options fluently** - `.timeout().env().cd()`

## Common Gotchas

1. **Forgetting await** - Commands are asynchronous
2. **Shell expansion** - Use `$.raw` for complex shell features
3. **Exit codes** - Non-zero means error by default
4. **Working directory** - Changes are temporary per command
5. **Environment variables** - Changes are temporary per command
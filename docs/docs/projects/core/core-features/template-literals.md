---
sidebar_position: 2
---

# Template Literals and Safety

Learn how @xec-sh/core uses template literals to provide a safe and intuitive command execution API.

## Why Template Literals?

Template literals provide a natural syntax for building commands while automatically handling escaping:

```typescript
import { $ } from '@xec-sh/core';

// Natural syntax
const filename = "user's file.txt";
await $`cat ${filename}`;

// Without Xec, you'd need manual escaping
// execSync(`cat '${filename.replace(/'/g, "'\\''")}'`); // Ugh!
```

## Automatic Escaping

### The Security Problem

Command injection is a serious security risk:

```javascript
// DANGEROUS - Traditional approach
const userInput = "'; rm -rf /; echo '";
execSync(`echo '${userInput}'`); // Executes rm -rf / 😱
```

### The Xec Solution

Xec automatically escapes all interpolated values:

```typescript
// SAFE - With Xec
const userInput = "'; rm -rf /; echo '";
await $`echo ${userInput}`; // Just prints: '; rm -rf /; echo '

// More dangerous examples that are safely handled
const danger1 = "$(cat /etc/passwd)";
const danger2 = "`rm -rf /`";
const danger3 = "; shutdown -h now";

await $`echo ${danger1}`; // Prints: $(cat /etc/passwd)
await $`echo ${danger2}`; // Prints: `rm -rf /`
await $`echo ${danger3}`; // Prints: ; shutdown -h now
```

## Interpolation Types

### String Interpolation

Strings are escaped and quoted appropriately:

```typescript
// Simple strings
const name = "Alice";
await $`echo "Hello, ${name}"`;

// Strings with spaces
const file = "my document.txt";
await $`cat ${file}`; // Properly handles the space

// Strings with quotes
const message = 'He said "Hello"';
await $`echo ${message}`; // Escapes quotes properly

// Special characters
const special = "$HOME/files/*.txt";
await $`echo ${special}`; // $ and * are escaped
```

### Number Interpolation

Numbers are converted to strings:

```typescript
const port = 3000;
const timeout = 30;
const pi = 3.14159;

await $`nc -w ${timeout} localhost ${port}`;
await $`echo "Pi is approximately ${pi}"`;

// Numeric calculations
const count = 42;
await $`head -n ${count} file.txt`;
```

### Boolean Interpolation

Booleans become "true" or "false":

```typescript
const verbose = true;
const debug = false;

await $`echo "Verbose: ${verbose}, Debug: ${debug}"`;
// Output: Verbose: true, Debug: false
```

### Array Interpolation

Arrays are expanded as separate arguments:

```typescript
// File lists
const files = ['file1.txt', 'file2.txt', 'file3.txt'];
await $`rm ${files}`; 
// Executes: rm file1.txt file2.txt file3.txt

// Command flags
const flags = ['-l', '-a', '-h'];
await $`ls ${flags}`;
// Executes: ls -l -a -h

// Mixed arguments
const args = ['-n', 10, 'file.txt'];
await $`head ${args}`;
// Executes: head -n 10 file.txt

// Empty arrays are handled
const empty: string[] = [];
await $`echo "Files: ${empty}"`;
// Executes: echo "Files: "
```

### Object Interpolation

Objects are JSON stringified:

```typescript
// Simple object
const config = { port: 3000, host: 'localhost' };
await $`echo ${config}`;
// Output: {"port":3000,"host":"localhost"}

// Nested object
const complex = {
  name: 'app',
  settings: {
    debug: true,
    level: 'info'
  }
};
await $`node app.js --config '${complex}'`;

// Write config to file
const dbConfig = {
  host: 'localhost',
  port: 5432,
  database: 'myapp'
};
await $`echo ${dbConfig} > config.json`;
```

### Null and Undefined

Special handling for null/undefined:

```typescript
const nothing = null;
const notDefined = undefined;

await $`echo "Null: ${nothing}"`;      // Output: Null: null
await $`echo "Undefined: ${notDefined}"`; // Output: Undefined: undefined

// Conditional interpolation
const optional = process.env.OPTIONAL_VAR;
if (optional) {
  await $`command --option ${optional}`;
}
```

## Advanced Escaping

### File Paths

Handle paths with spaces and special characters:

```typescript
// Spaces in paths
const dir = "My Documents";
await $`cd ${dir} && pwd`;

// Complex paths
const path = "/home/user/Project (2023)/src/*.js";
await $`ls ${path}`; // Special chars are escaped

// Windows paths (with WSL)
const winPath = "C:\\Users\\Alice\\Documents";
await $`ls ${winPath}`;
```

### Shell Metacharacters

All shell metacharacters are escaped:

```typescript
// Wildcards
const pattern = "*.txt";
await $`echo ${pattern}`; // Prints: *.txt (doesn't expand)

// Variables
const var_ = "$HOME";
await $`echo ${var_}`; // Prints: $HOME (doesn't expand)

// Command substitution
const cmd = "$(date)";
await $`echo ${cmd}`; // Prints: $(date) (doesn't execute)

// Pipes and redirects
const pipe = "| grep error";
await $`echo ${pipe}`; // Prints: | grep error
```

### Newlines and Whitespace

Multi-line strings and whitespace:

```typescript
// Multi-line string
const multiline = `Line 1
Line 2
Line 3`;
await $`echo ${multiline}`;

// Tabs and special whitespace
const tabbed = "Column1\tColumn2\tColumn3";
await $`echo ${tabbed}`;

// Leading/trailing spaces
const spaced = "  text with spaces  ";
await $`echo '${spaced}'`; // Preserves spaces
```

## Raw Mode (No Escaping)

Sometimes you need shell features without escaping:

```typescript
// Use $.raw for shell expansion
await $.raw`echo $HOME`;           // Expands $HOME
await $.raw`ls *.js`;              // Glob expansion
await $.raw`echo {1..5}`;          // Brace expansion
await $.raw`date && echo "Done"`; // Command chaining

// DANGER: Raw mode with user input
const userInput = "'; rm -rf /";
// await $.raw`echo ${userInput}`; // DON'T DO THIS!
```

### When to Use Raw Mode

```typescript
// Shell loops
await $.raw`for i in {1..10}; do echo $i; done`;

// Complex redirections
await $.raw`command 2>&1 | tee output.log`;

// Shell functions
await $.raw`
  function greet() {
    echo "Hello, $1!"
  }
  greet "World"
`;

// Process substitution
await $.raw`diff <(ls dir1) <(ls dir2)`;
```

## Building Safe Commands

### Dynamic Command Building

Build commands safely with user input:

```typescript
function safeGrep(pattern: string, files: string[]) {
  // Pattern and files are safely escaped
  return $`grep ${pattern} ${files}`;
}

// Safe even with dangerous input
await safeGrep("'; rm -rf", ["file1.txt", "file2.txt"]);
```

### Optional Arguments

Handle optional arguments:

```typescript
function gitCommit(message: string, options?: {
  author?: string;
  date?: string;
}) {
  const args = ['commit', '-m', message];
  
  if (options?.author) {
    args.push('--author', options.author);
  }
  
  if (options?.date) {
    args.push('--date', options.date);
  }
  
  return $`git ${args}`;
}

await gitCommit("Fix: security issue", {
  author: "Alice <alice@example.com>"
});
```

### Complex Command Templates

Create reusable command templates:

```typescript
class DockerCommands {
  static run(image: string, options: {
    name?: string;
    ports?: Record<string, string>;
    env?: Record<string, string>;
    volumes?: string[];
  }) {
    const args = ['run', '-d'];
    
    if (options.name) {
      args.push('--name', options.name);
    }
    
    if (options.ports) {
      for (const [host, container] of Object.entries(options.ports)) {
        args.push('-p', `${host}:${container}`);
      }
    }
    
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }
    
    if (options.volumes) {
      for (const volume of options.volumes) {
        args.push('-v', volume);
      }
    }
    
    args.push(image);
    
    return $`docker ${args}`;
  }
}

await DockerCommands.run('nginx:latest', {
  name: 'web-server',
  ports: { '8080': '80' },
  env: { NODE_ENV: 'production' }
});
```

## Security Best Practices

### 1. Never Use Raw Mode with User Input

```typescript
// ❌ NEVER DO THIS
const userInput = getUntrustedInput();
await $.raw`command ${userInput}`;

// ✅ Always use normal mode for user input
await $`command ${userInput}`;
```

### 2. Validate Before Execution

```typescript
// Validate command names
function runAllowedCommand(cmd: string) {
  const allowed = ['ls', 'cat', 'grep', 'echo'];
  
  if (!allowed.includes(cmd)) {
    throw new Error(`Command '${cmd}' not allowed`);
  }
  
  return $`${cmd} --help`;
}
```

### 3. Sanitize File Paths

```typescript
// Prevent directory traversal
function readUserFile(filename: string) {
  // Remove any directory components
  const basename = filename.split('/').pop() || '';
  
  // Validate filename
  if (basename.includes('..')) {
    throw new Error('Invalid filename');
  }
  
  return $`cat ./user-files/${basename}`;
}
```

### 4. Use Typed Inputs

```typescript
// Type-safe command options
interface CompileOptions {
  input: string;
  output: string;
  optimization: 'O0' | 'O1' | 'O2' | 'O3';
  warnings: boolean;
}

function compile(options: CompileOptions) {
  const args = [
    options.input,
    '-o', options.output,
    `-${options.optimization}`
  ];
  
  if (options.warnings) {
    args.push('-Wall');
  }
  
  return $`gcc ${args}`;
}
```

## Common Patterns

### Environment Variables

```typescript
// Safe environment variable usage
const home = process.env.HOME || '/tmp';
await $`cd ${home}`;

// Setting variables
const apiKey = "secret-key-123";
await $.env({ API_KEY: apiKey })`node app.js`;
```

### Path Joining

```typescript
import path from 'path';

// Safe path construction
const dir = "/home/user";
const file = "document.txt";
const fullPath = path.join(dir, file);

await $`cat ${fullPath}`;
```

### Conditional Arguments

```typescript
// Build arguments conditionally
function dockerBuild(dockerfile: string, tag: string, noCache = false) {
  const args = ['build', '-f', dockerfile, '-t', tag];
  
  if (noCache) {
    args.push('--no-cache');
  }
  
  args.push('.');
  
  return $`docker ${args}`;
}
```

### Lists and Loops

```typescript
// Process list of files
const files = await $`find . -name "*.log"`.lines();

for (const file of files) {
  // Each file is safely escaped
  const size = await $`du -h ${file}`.text();
  console.log(`${file}: ${size}`);
}
```

### Promise and Thenable Interpolation

Xec automatically awaits promises and thenables in template literals:

```typescript
// Simple promise interpolation
const namePromise = Promise.resolve('world');
await $`echo hello ${namePromise}`; // Output: hello world

// Array promises
const filesPromise = Promise.resolve(['file1.txt', 'file2.txt']);
await $`cat ${filesPromise}`; // Executes: cat file1.txt file2.txt

// Nested command execution
const cmd1 = $`echo foo`;
const cmd2 = Promise.resolve(['bar', 'baz']);
await $`echo ${cmd1} ${cmd2}`; // Output: foo bar baz

// Custom thenables
const customThenable = {
  then(resolve: (value: string) => void) {
    resolve('resolved-value');
  }
};
await $`echo ${customThenable}`; // Output: resolved-value

// Multiple promises
const p1 = Promise.resolve('one');
const p2 = Promise.resolve('two');
const p3 = Promise.resolve('three');
await $`echo ${p1} ${p2} ${p3}`; // Output: one two three

// Promise rejection handling
try {
  const failingPromise = Promise.reject(new Error('Failed'));
  await $`echo ${failingPromise}`; // Throws error
} catch (error) {
  console.error('Promise rejected:', error.message);
}
```

## Debugging Template Literals

### Inspect Generated Commands

```typescript
// See what command will be executed
const name = "test's file.txt";
const cmd = $`cat ${name}`;

// Log the command (for debugging only)
console.log('Will execute:', cmd.toString());
// Output might show: cat 'test'\''s file.txt'

await cmd;
```

### Test Escaping

```typescript
// Test how values are escaped
async function testEscaping(value: any) {
  const result = await $`echo ${value}`.text();
  console.log(`Input: ${JSON.stringify(value)}`);
  console.log(`Output: ${result}`);
  console.log('---');
}

await testEscaping("normal text");
await testEscaping("text with 'quotes'");
await testEscaping("$VARIABLE");
await testEscaping(["array", "of", "values"]);
```

## Summary

Template literals in @xec-sh/core provide:

1. **Natural Syntax** - Write commands as you think them
2. **Automatic Safety** - All interpolations are escaped
3. **Type Safety** - Full TypeScript support
4. **Flexibility** - Handle any data type, including promises
5. **Promise Support** - Automatically awaits promises and thenables
6. **Raw Mode** - When you need shell features

Remember: Always use normal mode with user input, and only use raw mode when you explicitly need shell features and trust all inputs.
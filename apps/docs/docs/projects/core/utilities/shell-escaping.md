---
sidebar_position: 3
---

# Shell Escaping

Safe shell command construction with proper argument escaping and template literal interpolation.

## Overview

Shell escaping utilities provide:
- Automatic escaping of shell arguments
- Cross-platform support (Unix/Windows)
- Template literal interpolation with escaping
- Raw interpolation (no escaping)
- Special handling for arrays and objects
- Protection against shell injection attacks

## Basic Usage

### Template Literal Interpolation

```typescript
import { $ } from '@xec-sh/core';

// Automatic escaping with template literals
const filename = "file with spaces.txt";
await $`cat ${filename}`;  // Executes: cat 'file with spaces.txt'

// Multiple arguments
const src = "source dir/";
const dest = "backup dir/";
await $`cp -r ${src} ${dest}`;  // Properly escapes both paths

// Arrays are automatically joined
const files = ["file1.txt", "file 2.txt", "file-3.txt"];
await $`rm ${files}`;  // Executes: rm file1.txt 'file 2.txt' file-3.txt
```

### Manual Escaping

```typescript
import { escapeArg, escapeCommand } from '@xec-sh/core';

// Escape single argument
const escaped = escapeArg("file with spaces & symbols");
console.log(escaped);  // 'file with spaces & symbols'

// Build command with escaped arguments
const cmd = escapeCommand("echo", ["Hello", "World!", "$USER"]);
console.log(cmd);  // echo Hello 'World!' '$USER'

// Safe command construction
const userInput = "'; rm -rf /";  // Malicious input
const safe = escapeArg(userInput);
await $`echo ${userInput}`;  // Safe: echo ''\''; rm -rf /'
```

## API Reference

### escapeArg

```typescript
function escapeArg(arg: string | number | boolean): string
```

Escapes a single shell argument for safe execution.

**Parameters:**
- `arg` - Value to escape

**Returns:** Escaped string safe for shell execution

**Examples:**
```typescript
escapeArg("hello world")    // 'hello world'
escapeArg("it's")          // 'it'\''s'
escapeArg(123)             // "123"
escapeArg(true)            // "true"
```

### escapeCommand

```typescript
function escapeCommand(
  cmd: string, 
  args: (string | number | boolean)[] = []
): string
```

Builds a complete command with escaped arguments.

**Parameters:**
- `cmd` - Command name
- `args` - Array of arguments to escape

**Returns:** Complete escaped command string

**Example:**
```typescript
escapeCommand("git", ["commit", "-m", "feat: add new feature"]);
// "git commit -m 'feat: add new feature'"
```

### interpolate

```typescript
function interpolate(
  strings: TemplateStringsArray, 
  ...values: any[]
): string
```

Interpolates template literals with automatic escaping (used internally by `$`).

**Example:**
```typescript
const file = "test file.txt";
const result = interpolate`cat ${file}`;
// "cat 'test file.txt'"
```

### interpolateRaw

```typescript
function interpolateRaw(
  strings: TemplateStringsArray, 
  ...values: any[]
): string
```

Interpolates template literals without escaping (for pre-escaped or trusted input).

**Example:**
```typescript
const preEscaped = "'already escaped'";
const result = interpolateRaw`echo ${preEscaped}`;
// "echo 'already escaped'"
```

### quote

```typescript
function quote(arg: string): string
```

ANSI-C quotes a string (compatible with zx/xs).

**Example:**
```typescript
quote("hello\nworld")  // "$'hello\\nworld'"
quote("simple")        // "simple" (no quoting needed)
```

## Advanced Usage

### Array Handling

```typescript
// Arrays are automatically joined with spaces
const flags = ["-a", "-l", "-h"];
await $`ls ${flags}`;  // ls -a -l -h

// Mixed array with values needing escaping
const items = ["file1.txt", "file with spaces.txt", "file's.txt"];
await $`touch ${items}`;  
// touch file1.txt 'file with spaces.txt' 'file'\''s.txt'

// Empty arrays are handled gracefully
const empty: string[] = [];
await $`echo start ${empty} end`;  // echo start end
```

### Object Handling

```typescript
// Objects are JSON stringified
const config = { name: "app", port: 3000 };
await $`echo ${config}`;  // echo '{"name":"app","port":3000}'

// Dates are ISO formatted
const date = new Date('2024-01-01');
await $`echo ${date}`;  // echo '2024-01-01T00:00:00.000Z'

// ExecutionResult objects use stdout
const result = await $`echo hello`;
await $`echo "Previous output: ${result}"`;  
// echo "Previous output: hello"
```

### Raw Interpolation

```typescript
// When you need to control escaping
const complexCmd = "find . -name '*.txt' -o -name '*.md'";
await $.raw`${complexCmd}`;  // No additional escaping

// Mixing escaped and raw
const search = "*.js";
await $.raw`find . -name ${search}`;  // Only ${search} is escaped
```

## Platform-Specific Behavior

### Unix/Linux/macOS

Uses POSIX shell escaping:
```typescript
escapeArg("test & echo")     // 'test & echo'
escapeArg("$HOME")           // '$HOME'
escapeArg("a'b'c")           // 'a'\''b'\''c'
```

### Windows

Uses CMD/PowerShell compatible escaping:
```typescript
escapeArg("test & echo")     // "test & echo"
escapeArg("%USERPROFILE%")   // "%USERPROFILE%"
escapeArg('a"b"c')           // "a\"b\"c"
```

## Security Considerations

### Preventing Injection

```typescript
// UNSAFE - Never do this!
const userInput = "'; rm -rf /";
await $`echo ${userInput}`;  // This is SAFE - input is escaped

// The actual command executed:
// echo ''\''; rm -rf /'

// Multiple user inputs
const username = "user'; DROP TABLE users;--";
const message = "Hello $(whoami)";
await $`log-message --user ${username} --msg ${message}`;
// All inputs are safely escaped
```

### Validating Input

```typescript
// Additional validation before escaping
function safeFilename(input: string): string {
  // Remove directory traversal attempts
  const cleaned = input.replace(/\.\./g, '').replace(/[\/\\]/g, '');
  
  // Escape for shell
  return escapeArg(cleaned);
}

const userFile = "../../../etc/passwd";
const safe = safeFilename(userFile);
await $`cat ${safe}`;  // cat etcpasswd
```

### Command Injection Patterns

```typescript
// Common injection attempts that are handled safely

// Attempt 1: Command substitution
const input1 = "$(malicious-command)";
await $`echo ${input1}`;  // echo '$(malicious-command)'

// Attempt 2: Backticks
const input2 = "`malicious-command`";
await $`echo ${input2}`;  // echo '`malicious-command`'

// Attempt 3: Semicolon injection
const input3 = "data; malicious-command";
await $`process ${input3}`;  // process 'data; malicious-command'

// Attempt 4: Pipe injection
const input4 = "data | malicious-command";
await $`process ${input4}`;  // process 'data | malicious-command'
```

## Common Patterns

### Building Complex Commands

```typescript
// Use arrays for multiple arguments
const gitArgs = ["commit", "-m", "feat: add new feature"];
await $`git ${gitArgs}`;

// Conditional arguments
const args = ["ls", "-la"];
if (showHidden) args.push("-a");
if (sortByTime) args.push("-t");
await $`${args}`;

// Dynamic command construction
function buildFind(dir: string, pattern: string, type?: string) {
  const args = [dir, "-name", pattern];
  if (type) args.push("-type", type);
  return args;
}

await $`find ${buildFind("/home", "*.log", "f")}`;
```

### Environment Variables

```typescript
// Environment variables in values are escaped
const path = "$HOME/documents";
await $`cd ${path}`;  // cd '$HOME/documents' (literal string)

// To use environment variables, access them directly
const home = process.env.HOME;
await $`cd ${home}/documents`;  // cd /home/user/documents

// Or use shell expansion
await $`cd $HOME/documents`;  // Shell expands $HOME
```

### Special Characters

```typescript
// All special characters are handled
const special = `!@#$%^&*(){}[]|\\:";'<>?,./~\``;
await $`echo ${special}`;  // All safely escaped

// Newlines and tabs
const multiline = "line1\nline2\ttabbed";
await $`echo ${multiline}`;  // Properly quoted with ANSI-C quoting

// Null bytes (trimmed)
const withNull = "before\0after";
await $`echo ${withNull}`;  // Null byte is handled
```

## Best Practices

### 1. Always Use Template Literals

```typescript
// ✅ Good - automatic escaping
const file = getUserInput();
await $`rm ${file}`;

// ❌ Bad - no escaping
await $`rm ${file}`.raw();  // Dangerous!
```

### 2. Validate Before Escaping

```typescript
// Validate format/content first
function processPath(input: string) {
  // Validate path format
  if (!isValidPath(input)) {
    throw new Error("Invalid path format");
  }
  
  // Then safely use it
  return $`process-file ${input}`;
}
```

### 3. Use Arrays for Multiple Arguments

```typescript
// ✅ Good - clear and safe
const files = getFileList();
await $`rm ${files}`;

// ❌ Avoid - manual joining
await $`rm ${files.join(' ')}`;  // Loses individual escaping
```

### 4. Handle Empty Values

```typescript
// Check for empty values
const value = getValue();
if (value) {
  await $`process ${value}`;
} else {
  // Handle empty case
  await $`process --default`;
}

// Or use default values
const safeValue = value || "default";
await $`process ${safeValue}`;
```

## Troubleshooting

### Debugging Escaped Commands

```typescript
// See the actual command that will be executed
const filename = "test file.txt";
const cmd = interpolate`cat ${filename}`;
console.log("Executing:", cmd);  // "cat 'test file.txt'"

// For complex debugging
const args = ["arg1", "arg with spaces", "$SPECIAL"];
console.log("Args:", args.map(escapeArg));
// ["arg1", "'arg with spaces'", "'$SPECIAL'"]
```

### Common Issues

1. **Double Escaping**: Avoid escaping already escaped values
   ```typescript
   const escaped = escapeArg("test");
   // ❌ Don't escape again
   await $`echo ${escaped}`;  // May double-escape
   ```

2. **Missing Quotes**: Some commands require quotes in specific places
   ```typescript
   // If a command needs quotes in its syntax
   await $`jq ${".field.subfield"} data.json`;
   ```

3. **Shell Expansion**: Remember that escaping prevents expansion
   ```typescript
   // This won't expand the glob
   await $`ls ${"*.txt"}`;  // ls '*.txt'
   
   // Use this instead
   await $`ls *.txt`;  // ls expands the glob
   ```
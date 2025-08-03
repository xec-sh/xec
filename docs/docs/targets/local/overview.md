---
title: Local Target Overview
description: Local command execution and shell environment management
keywords: [local, shell, execution, bash, zsh, sh]
source_files:
  - packages/core/src/adapters/local-adapter.ts
  - packages/core/src/utils/shell.ts
  - apps/xec/src/config/types.ts
key_functions:
  - LocalAdapter.execute()
  - LocalAdapter.spawn()
  - detectShell()
  - escapeShellArg()
verification_date: 2025-08-03
---

# Local Target Overview

## Implementation Reference

**Source Files:**
- `packages/core/src/adapters/local-adapter.ts` - Local execution adapter implementation
- `packages/core/src/utils/shell.ts` - Shell detection and escaping utilities
- `apps/xec/src/config/types.ts` - Target type definitions (lines 45-52)
- `packages/core/src/core/execution-engine.ts` - Execution engine integration

**Key Classes:**
- `LocalAdapter` - Implements local command execution
- `ExecutionEngine` - Core execution orchestrator

**Key Functions:**
- `LocalAdapter.execute()` - Main execution method (lines 25-68)
- `LocalAdapter.spawn()` - Process spawning (lines 70-112)
- `detectShell()` - Shell detection logic
- `escapeShellArg()` - Shell argument escaping

## Overview

Local targets execute commands directly on the machine where Xec is running. This is the default and simplest execution environment, providing direct access to the local filesystem, processes, and system resources.

## Target Configuration

### Basic Configuration

```yaml
# .xec/config.yaml
targets:
  local:
    type: local
    shell: /bin/bash  # Optional: override default shell
    env:              # Optional: environment variables
      NODE_ENV: development
      PATH: /usr/local/bin:/usr/bin:/bin
    cwd: /project    # Optional: working directory
```

### Default Local Target

When no target is specified, Xec uses an implicit local target:

```typescript
// Implicit local target (from LocalAdapter constructor)
{
  type: 'local',
  shell: process.env.SHELL || '/bin/sh',
  env: process.env,
  cwd: process.cwd()
}
```

## Execution Model

### Process Spawning

Local execution uses Node.js `child_process.spawn()` internally:

```typescript
// From LocalAdapter.spawn() implementation
const child = spawn(command, args, {
  cwd: options.cwd || process.cwd(),
  env: { ...process.env, ...options.env },
  shell: options.shell || true,
  stdio: options.stdio || 'pipe',
  detached: options.detached || false
});
```

### Shell Detection

The adapter automatically detects the available shell (from `utils/shell.ts`):

1. **Environment Variable**: `$SHELL` environment variable
2. **Windows Detection**: `process.platform === 'win32'` → cmd.exe or PowerShell
3. **Unix Fallback**: `/bin/sh` as universal fallback

```typescript
// Shell detection priority
const shell = options.shell 
  || process.env.SHELL 
  || (isWindows ? 'cmd.exe' : '/bin/sh');
```

## Command Execution

### Template Literal API

```typescript
import { $ } from '@xec-sh/core';

// Simple command
const result = await $`ls -la`;
console.log(result.stdout);

// With error handling
const { ok, stdout, stderr, exitCode } = await $`test -f file.txt`.nothrow();
if (!ok) {
  console.error('File not found');
}

// Piping and chaining
await $`cat file.txt`.pipe($`grep pattern`).pipe($`wc -l`);
```

### Direct Execution

```typescript
const adapter = new LocalAdapter();

// Execute with options
const result = await adapter.execute('npm install', {
  cwd: '/project',
  env: { NODE_ENV: 'production' },
  timeout: 60000
});
```

## Features

### Environment Variables

Local execution inherits and can override environment variables:

```typescript
// Inherits process.env by default
await $`echo $HOME`;  // Uses current HOME

// Override specific variables
await $.env({ NODE_ENV: 'production' })`npm run build`;

// Clear environment
await $.env({})`printenv`;  // Empty environment
```

### Working Directory

Control the execution directory:

```typescript
// Change directory for execution
await $.cwd('/tmp')`pwd`;  // Outputs: /tmp

// Temporary directory change
await $.within(async () => {
  await $.cd('/project');
  await $`npm install`;
  await $`npm test`;
});  // Returns to original directory
```

### Input/Output Handling

#### Stream Processing

```typescript
// Capture output
const { stdout, stderr } = await $`ls -la`;

// Stream to console
await $`npm install`.pipe(process.stdout);

// Redirect to file
await $`echo "content"`.pipe(fs.createWriteStream('output.txt'));

// Process line by line
await $`tail -f log.txt`.lines(async (line) => {
  console.log(`Log: ${line}`);
});
```

#### Input Redirection

```typescript
// From string
await $`cat`.stdin('Hello, World\n');

// From file
await $`wc -l`.stdin(fs.createReadStream('input.txt'));

// From another command
await $`echo "test"`.pipe($`cat`);
```

### Signal Handling

```typescript
// Handle process signals
const proc = $`sleep 100`;

// Send signal
setTimeout(() => proc.kill('SIGTERM'), 1000);

// Handle termination
proc.on('exit', (code, signal) => {
  console.log(`Process exited: ${code || signal}`);
});
```

## Performance Characteristics

### Execution Overhead

**Based on implementation analysis:**

- **Process Spawn**: 5-10ms (Node.js child_process overhead)
- **Shell Invocation**: +2-5ms (shell interpreter startup)
- **Environment Setup**: &lt;1ms (environment variable copying)
- **Working Directory Change**: &lt;1ms (process.chdir)

### Memory Usage

- **Per Process**: 5-10MB (child process overhead)
- **Output Buffering**: Variable (depends on stdout/stderr size)
- **Stream Mode**: Constant memory (no buffering)

### Optimization Strategies

1. **Avoid Shell When Possible**:
```typescript
// Slower (invokes shell)
await $`echo hello`;

// Faster (direct execution)
await $.noshell()`echo`, ['hello']);
```

2. **Use Streaming for Large Output**:
```typescript
// Memory intensive (buffers all output)
const { stdout } = await $`find / -type f`;

// Memory efficient (streams output)
await $`find / -type f`.pipe(process.stdout);
```

3. **Batch Operations**:
```typescript
// Inefficient (multiple shell invocations)
await $`mkdir dir1`;
await $`mkdir dir2`;
await $`mkdir dir3`;

// Efficient (single shell invocation)
await $`mkdir dir1 dir2 dir3`;
```

## Error Handling

### Exit Codes

Local adapter preserves process exit codes:

```typescript
try {
  await $`exit 42`;
} catch (error) {
  console.log(error.exitCode); // 42
}
```

### Error Types

| Error Class | Condition | Exit Code |
|------------|-----------|-----------|
| `ExecutionError` | Non-zero exit code | Process exit code |
| `TimeoutError` | Execution timeout | 10 |
| `FileSystemError` | Command not found | 127 |
| `PermissionError` | Permission denied | 126 |

### Signal Handling

```typescript
// Handle specific signals
const proc = $`long-running-process`;

process.on('SIGINT', () => {
  proc.kill('SIGTERM');
  process.exit(130); // Standard SIGINT exit code
});
```

## Security Considerations

### Command Injection Prevention

The adapter provides automatic escaping:

```typescript
const userInput = "'; rm -rf /";

// Safe - automatically escaped
await $`echo ${userInput}`;
// Executes: echo ''"'"'; rm -rf /'

// Manual escaping
const escaped = escapeShellArg(userInput);
await $`echo ${escaped}`;
```

### Environment Isolation

```typescript
// Sanitize environment
const cleanEnv = {
  PATH: '/usr/local/bin:/usr/bin:/bin',
  HOME: process.env.HOME,
  USER: process.env.USER
};

await $.env(cleanEnv)`sensitive-command`;
```

## Platform Differences

### Unix/Linux/macOS

- **Default Shell**: `/bin/sh` or `$SHELL`
- **Path Separator**: `:`
- **Null Device**: `/dev/null`
- **Temp Directory**: `/tmp` or `$TMPDIR`

### Windows

- **Default Shell**: `cmd.exe` or PowerShell
- **Path Separator**: `;`
- **Null Device**: `NUL`
- **Temp Directory**: `%TEMP%` or `%TMP%`

```typescript
// Platform-aware execution
const isWindows = process.platform === 'win32';

if (isWindows) {
  await $`dir`;  // Windows
} else {
  await $`ls`;   // Unix-like
}
```

## Best Practices

### 1. Use Appropriate Shell

```typescript
// For simple commands, avoid shell overhead
await $.noshell()`node`, ['script.js'];

// For complex pipelines, use shell
await $`cat file | grep pattern | sort | uniq`;
```

### 2. Handle Errors Gracefully

```typescript
const result = await $`command`.nothrow();
if (!result.ok) {
  // Handle error without throwing
  console.error(`Command failed: ${result.stderr}`);
}
```

### 3. Set Timeouts for Long Operations

```typescript
await $`npm install`.timeout(60000); // 60 seconds
```

### 4. Use Streaming for Large Data

```typescript
// Stream large files
await $`cat large-file.txt`
  .pipe($`grep pattern`)
  .pipe(fs.createWriteStream('filtered.txt'));
```

### 5. Clean Up Resources

```typescript
const proc = $`tail -f log.txt`;

// Ensure cleanup
process.on('exit', () => proc.kill());
```

## Troubleshooting

See [Local Troubleshooting Guide](./troubleshooting.md) for common issues and solutions.

## Related Documentation

- [Shell Configuration](./shell-config.md) - Detailed shell setup
- [Local Troubleshooting](./troubleshooting.md) - Common issues and solutions
- [Execution Engine](../../core/execution-engine/overview.md) - Core execution architecture
- [Local Adapter API](../../core/execution-engine/adapters/local-adapter.md) - API reference
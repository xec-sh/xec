---
title: Local Target Troubleshooting
description: Common issues and solutions for local command execution
keywords: [troubleshooting, local, debugging, errors, solutions]
source_files:
  - packages/core/src/adapters/local-adapter.ts
  - packages/core/src/utils/error-handler.ts
  - packages/core/src/utils/shell.ts
key_functions:
  - LocalAdapter.execute()
  - handleProcessError()
  - detectShell()
verification_date: 2025-08-03
---

# Local Target Troubleshooting

## Implementation Reference

**Source Files:**
- `packages/core/src/adapters/local-adapter.ts` - Local execution implementation
- `packages/core/src/utils/error-handler.ts` - Error handling utilities
- `packages/core/src/utils/shell.ts` - Shell detection and utilities
- `packages/core/src/utils/debug.ts` - Debug logging

**Key Functions:**
- `LocalAdapter.execute()` - Main execution logic (lines 25-68)
- `handleProcessError()` - Process error handling
- `detectShell()` - Shell detection
- `debugLog()` - Debug output

## Common Issues

### Command Not Found

**Symptoms:**
```bash
Error: Command failed: command_name
/bin/sh: command_name: command not found
Exit code: 127
```

**Causes:**
1. Command not installed
2. Command not in PATH
3. Wrong shell being used

**Solutions:**

```typescript
// 1. Check if command exists
import { which } from '@xec-sh/core';

const commandPath = await which('command_name');
if (!commandPath) {
  console.error('Command not found. Please install it first.');
}

// 2. Use full path
await $`/usr/local/bin/command_name`;

// 3. Update PATH
await $.env({ 
  PATH: '/usr/local/bin:/usr/bin:/bin:' + process.env.PATH 
})`command_name`;

// 4. Specify correct shell
await $.shell('/bin/bash')`command_name`;
```

**Configuration Fix:**
```yaml
targets:
  local:
    type: local
    env:
      PATH: /usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin
```

### Permission Denied

**Symptoms:**
```bash
Error: Command failed: ./script.sh
/bin/sh: ./script.sh: Permission denied
Exit code: 126
```

**Causes:**
1. File not executable
2. Insufficient user permissions
3. Directory permissions

**Solutions:**

```typescript
// 1. Make file executable
await $`chmod +x script.sh`;
await $`./script.sh`;

// 2. Use interpreter directly
await $`bash script.sh`;
await $`python script.py`;

// 3. Check permissions
import { accessSync, constants } from 'fs';

try {
  accessSync('./script.sh', constants.X_OK);
  await $`./script.sh`;
} catch {
  // Fall back to interpreter
  await $`bash script.sh`;
}
```

### Shell Syntax Errors

**Symptoms:**
```bash
Error: Command failed: [[ -f file ]]
/bin/sh: 1: [[: not found
Exit code: 127
```

**Causes:**
1. Using bash-specific syntax with sh
2. Shell feature not available
3. Incorrect escaping

**Solutions:**

```typescript
// 1. Use correct shell for advanced features
// Wrong - sh doesn't support [[
await $.shell('/bin/sh')`[[ -f file ]] && echo exists`;

// Correct - use bash
await $.shell('/bin/bash')`[[ -f file ]] && echo exists`;

// Or use POSIX syntax
await $`[ -f file ] && echo exists`;

// 2. Check shell capabilities
const shell = detectShell();
if (shell.includes('bash') || shell.includes('zsh')) {
  await $`[[ -f file ]] && echo exists`;
} else {
  await $`test -f file && echo exists`;
}
```

### Environment Variable Issues

**Symptoms:**
```bash
Error: HOME is not defined
Error: Command failed with undefined variable
```

**Causes:**
1. Environment variables not inherited
2. Variable not exported
3. Shell initialization skipped

**Solutions:**

```typescript
// 1. Ensure environment inheritance
await $`echo $HOME`;  // Inherits process.env by default

// 2. Explicitly set variables
await $.env({ HOME: process.env.HOME })`echo $HOME`;

// 3. Export variables in shell
await $`
  export MY_VAR="value"
  echo $MY_VAR
`;

// 4. Source shell profile
await $.shell('/bin/bash')`
  source ~/.bashrc
  command_needing_env
`;
```

**Configuration Fix:**
```yaml
targets:
  local:
    type: local
    env:
      HOME: ${HOME}
      USER: ${USER}
      PATH: ${PATH}
```

### Working Directory Issues

**Symptoms:**
```bash
Error: ENOENT: no such file or directory
Error: Cannot find module './relative/path'
```

**Causes:**
1. Wrong working directory
2. Relative path issues
3. Directory doesn't exist

**Solutions:**

```typescript
// 1. Set explicit working directory
await $.cwd('/project')`npm install`;

// 2. Use absolute paths
import { resolve } from 'path';
const absolutePath = resolve('./relative/path');
await $`cat ${absolutePath}`;

// 3. Verify directory exists
import { existsSync } from 'fs';

const dir = '/project';
if (!existsSync(dir)) {
  await $`mkdir -p ${dir}`;
}
await $.cwd(dir)`command`;

// 4. Save and restore directory
const originalCwd = process.cwd();
try {
  process.chdir('/project');
  await $`command`;
} finally {
  process.chdir(originalCwd);
}
```

### Output Encoding Issues

**Symptoms:**
```bash
Error: Invalid UTF-8 sequence
Garbled output with special characters
�� instead of proper characters
```

**Causes:**
1. Incorrect locale settings
2. Binary output treated as text
3. Character encoding mismatch

**Solutions:**

```typescript
// 1. Set proper locale
await $.env({
  LANG: 'en_US.UTF-8',
  LC_ALL: 'en_US.UTF-8'
})`command`;

// 2. Handle binary output
const result = await $`cat binary_file`.buffer();
// result.stdout is Buffer, not string

// 3. Specify encoding
const result = await $`command`.encoding('latin1');

// 4. Force UTF-8
await $`iconv -f ISO-8859-1 -t UTF-8 input.txt`;
```

### Process Timeout

**Symptoms:**
```bash
Error: Command timeout after 30000ms
TimeoutError: Process exceeded timeout
```

**Causes:**
1. Long-running command
2. Command waiting for input
3. Deadlock or infinite loop

**Solutions:**

```typescript
// 1. Increase timeout
await $`long-running-command`.timeout(300000); // 5 minutes

// 2. Disable timeout
await $`very-long-command`.timeout(0); // No timeout

// 3. Handle timeout gracefully
try {
  await $`potentially-slow-command`.timeout(5000);
} catch (error) {
  if (error.name === 'TimeoutError') {
    console.log('Command timed out, continuing...');
  }
}

// 4. Provide input for interactive commands
await $`interactive-command`.stdin('yes\n');
```

### Signal Handling Issues

**Symptoms:**
```bash
Error: Process terminated by signal SIGTERM
Error: Process killed with signal 9
```

**Causes:**
1. Process killed by system
2. Out of memory
3. Manual termination

**Solutions:**

```typescript
// 1. Handle signals gracefully
const proc = $`long-running-process`;

process.on('SIGINT', () => {
  proc.kill('SIGTERM'); // Graceful shutdown
  setTimeout(() => proc.kill('SIGKILL'), 5000); // Force kill after 5s
});

// 2. Catch signal termination
try {
  await $`command`;
} catch (error) {
  if (error.signal === 'SIGTERM') {
    console.log('Process was terminated');
  }
}

// 3. Ignore certain signals
await $`trap '' SIGINT; long-running-command`;
```

### Resource Limits

**Symptoms:**
```bash
Error: spawn EAGAIN
Error: too many open files
Error: cannot allocate memory
```

**Causes:**
1. Too many child processes
2. File descriptor limits
3. Memory limits

**Solutions:**

```typescript
// 1. Limit concurrent processes
import pLimit from 'p-limit';

const limit = pLimit(5); // Max 5 concurrent

const promises = files.map(file => 
  limit(() => $`process ${file}`)
);
await Promise.all(promises);

// 2. Increase ulimits
await $`ulimit -n 4096; command`; // Increase file descriptor limit

// 3. Clean up resources
const procs = [];
for (const item of items) {
  const proc = await $`process ${item}`;
  procs.push(proc);
  
  // Clean up old processes
  if (procs.length > 10) {
    await procs.shift();
  }
}
```

## Debugging Techniques

### Enable Debug Output

```typescript
// 1. Environment variable
process.env.DEBUG = 'xec:*';
await $`command`;

// 2. Verbose mode
await $.verbose()`command`;

// 3. Trace execution
await $.trace()`complex-command`;
```

### Log Command Execution

```typescript
// Custom logging
const originalExec = $.exec;
$.exec = async (cmd, ...args) => {
  console.log(`Executing: ${cmd}`);
  const start = Date.now();
  try {
    const result = await originalExec(cmd, ...args);
    console.log(`Success in ${Date.now() - start}ms`);
    return result;
  } catch (error) {
    console.log(`Failed in ${Date.now() - start}ms:`, error.message);
    throw error;
  }
};
```

### Inspect Process State

```typescript
// Monitor process
const proc = $`long-command`;

proc.on('spawn', () => console.log('Process started'));
proc.on('exit', (code, signal) => 
  console.log(`Process exited: ${code || signal}`)
);

// Check process info
console.log('PID:', proc.pid);
console.log('Killed:', proc.killed);
console.log('Exit Code:', proc.exitCode);
```

### Test Shell Compatibility

```typescript
async function testShellFeature(feature: string): Promise<boolean> {
  const tests = {
    arrays: `arr=(1 2 3); echo "\${arr[0]}"`,
    associative: `declare -A map; map[key]=value; echo "\${map[key]}"`,
    globstar: `shopt -s globstar; echo **/*.txt`,
    process_substitution: `cat <(echo test)`
  };
  
  try {
    await $`${tests[feature]}`;
    console.log(`✓ ${feature} supported`);
    return true;
  } catch {
    console.log(`✗ ${feature} not supported`);
    return false;
  }
}

// Test current shell
for (const feature of ['arrays', 'globstar']) {
  await testShellFeature(feature);
}
```

## Platform-Specific Issues

### macOS

**Issue: Commands installed via Homebrew not found**

```typescript
// Add Homebrew paths
await $.env({
  PATH: '/opt/homebrew/bin:/usr/local/bin:' + process.env.PATH
})`brew-installed-command`;
```

**Issue: Quarantine attributes on downloaded scripts**

```typescript
// Remove quarantine
await $`xattr -d com.apple.quarantine script.sh`;
await $`./script.sh`;
```

### Linux

**Issue: Different shells on different distributions**

```typescript
// Detect distribution and use appropriate shell
const distro = await $`lsb_release -si`.text();

const shellMap = {
  'Ubuntu': '/bin/bash',
  'Debian': '/bin/dash',
  'Alpine': '/bin/ash'
};

await $.shell(shellMap[distro] || '/bin/sh')`command`;
```

### Windows

**Issue: Path separator differences**

```typescript
// Handle path separators
const pathSep = process.platform === 'win32' ? ';' : ':';
const paths = ['/usr/local/bin', '/usr/bin'];
await $.env({
  PATH: paths.join(pathSep)
})`command`;
```

**Issue: Line ending differences**

```typescript
// Normalize line endings
const result = await $`command`;
const normalized = result.stdout.replace(/\r\n/g, '\n');
```

## Error Recovery Strategies

### Retry with Backoff

```typescript
async function retryCommand(cmd: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await $`${cmd}`;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const delay = Math.pow(2, i) * 1000; // Exponential backoff
      console.log(`Retry ${i + 1} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### Fallback Commands

```typescript
// Try multiple commands until one succeeds
async function tryCommands(...commands: string[]) {
  for (const cmd of commands) {
    try {
      return await $`${cmd}`;
    } catch {
      continue;
    }
  }
  throw new Error('All commands failed');
}

// Usage
const result = await tryCommands(
  'python3 script.py',
  'python script.py',
  'py script.py'
);
```

### Graceful Degradation

```typescript
// Degrade functionality based on available features
async function executeWithFallback(preferred: string, fallback: string) {
  try {
    // Try advanced feature
    return await $.shell('/bin/bash')`${preferred}`;
  } catch {
    // Fall back to POSIX
    return await $.shell('/bin/sh')`${fallback}`;
  }
}

await executeWithFallback(
  '[[ -f file ]] && echo exists',  // Bash
  '[ -f file ] && echo exists'      // POSIX
);
```

## Best Practices

1. **Always handle errors explicitly**
2. **Use `.nothrow()` for non-critical commands**
3. **Set appropriate timeouts**
4. **Log command execution in development**
5. **Test with different shells**
6. **Validate environment before execution**
7. **Clean up resources on error**

## Related Documentation

- [Local Overview](./overview.md) - Local execution fundamentals
- [Shell Configuration](./shell-config.md) - Shell setup and customization
- [Error Handling](../../scripting/patterns/error-handling.md) - Error handling patterns
- [Debugging Guide](../../guides/development/debugging.md) - Advanced debugging
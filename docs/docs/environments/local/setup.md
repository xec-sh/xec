# Local Environment Setup

The local adapter enables command execution on your local machine with native shell integration, runtime optimization, and comprehensive process management.

## Installation

The local adapter is included in the core package:

```bash
npm install @xec-sh/core
# or
yarn add @xec-sh/core
```

## Basic Configuration

### Default Setup
The local adapter works out of the box with zero configuration:

```javascript
import { $ } from '@xec-sh/core';

// Executes using your system's default shell
const result = await $`echo "Hello, World!"`;
console.log(result.stdout); // "Hello, World!"
```

### Custom Configuration
Configure the local adapter for specific requirements:

```javascript
import { createExecutionEngine } from '@xec-sh/core';

const engine = createExecutionEngine({
  adapters: {
    local: {
      // Prefer Bun runtime if available
      preferBun: true,
      
      // Force specific implementation
      forceImplementation: 'node', // or 'bun'
      
      // Set user/group IDs (Unix only)
      uid: 1000,
      gid: 1000,
      
      // Custom kill signal
      killSignal: 'SIGTERM',
      
      // Default timeout
      defaultTimeout: 30000,
      
      // Output encoding
      encoding: 'utf8',
      
      // Maximum buffer size (10MB)
      maxBuffer: 10 * 1024 * 1024
    }
  }
});

const result = await engine.execute({ adapter: 'local' }, 'ls -la');
```

## Shell Configuration

### Shell Detection
The local adapter automatically detects your system shell:

```javascript
// Auto-detection based on platform
const result = await $`echo $0`;
// Output: /bin/bash (Linux/Mac) or cmd.exe (Windows)
```

### Explicit Shell Selection
Specify which shell to use:

```javascript
// Use specific shell binary
await $.with({ shell: '/bin/bash' })`echo $BASH_VERSION`;
await $.with({ shell: '/bin/zsh' })`echo $ZSH_VERSION`;
await $.with({ shell: '/usr/bin/fish' })`echo $FISH_VERSION`;

// Use boolean for system default
await $.with({ shell: true })`echo "Using system shell"`;

// Disable shell (direct execution)
await $.with({ shell: false })`/usr/bin/node --version`;
```

### Shell Options
Configure shell-specific behavior:

```javascript
// Bash with specific options
await $.with({ 
  shell: '/bin/bash',
  env: {
    BASH_ENV: '~/.bashrc',
    SHELLOPTS: 'errexit:nounset'
  }
})`source ~/.bash_profile && run-command`;

// PowerShell on Windows
await $.with({ 
  shell: 'powershell.exe' 
})`Get-Process | Where-Object {$_.CPU -gt 100}`;

// Command prompt on Windows
await $.with({ 
  shell: 'cmd.exe' 
})`dir /b *.txt`;
```

## Runtime Selection

### Automatic Runtime Detection
The adapter automatically detects and uses the best available runtime:

```javascript
import { RuntimeDetector } from '@xec-sh/core';

if (RuntimeDetector.isBun()) {
  console.log('Running with Bun - optimized performance');
} else {
  console.log('Running with Node.js');
}

// Execution automatically uses detected runtime
await $`node --version || bun --version`;
```

### Bun Optimization
When Bun is available, the adapter uses optimized APIs:

```javascript
// Configure to prefer Bun
const engine = createExecutionEngine({
  adapters: {
    local: {
      preferBun: true  // Use Bun.spawn when available
    }
  }
});

// Force Bun implementation (fails if Bun not available)
const bunEngine = createExecutionEngine({
  adapters: {
    local: {
      forceImplementation: 'bun'
    }
  }
});
```

## Process Management

### Working Directory
Set the working directory for command execution:

```javascript
// Relative path (from current working directory)
await $.with({ cwd: './src' })`ls -la`;

// Absolute path
await $.with({ cwd: '/tmp' })`pwd`; // Output: /tmp

// Chain directory changes
const projectDir = '/home/user/project';
await $.with({ cwd: projectDir })`npm install`;
await $.with({ cwd: `${projectDir}/src` })`npm test`;
```

### Environment Variables
Manage environment variables for processes:

```javascript
// Add specific variables
await $.with({ 
  env: {
    NODE_ENV: 'production',
    DEBUG: 'app:*'
  }
})`node app.js`;

// Merge with existing environment
await $.with({ 
  env: {
    ...process.env,
    CUSTOM_VAR: 'value'
  }
})`./script.sh`;

// Clear environment (Unix only)
await $.with({ 
  env: {} 
})`env`; // Shows empty environment
```

### Process Signals
Handle process signals and termination:

```javascript
// Custom timeout with specific signal
const proc = $.with({ 
  timeout: 5000,
  killSignal: 'SIGKILL' 
})`sleep 10`;

try {
  await proc;
} catch (error) {
  console.log('Process killed after timeout');
}

// Manual signal handling
const longRunning = $`tail -f /var/log/system.log`;

// Kill after 10 seconds
setTimeout(() => longRunning.kill('SIGTERM'), 10000);

// Handle graceful shutdown
process.on('SIGINT', async () => {
  longRunning.kill();
  await longRunning.catch(() => {}); // Ignore kill error
  process.exit(0);
});
```

## Input/Output Streams

### Standard Input
Provide input to processes:

```javascript
// String input
await $.with({ stdin: 'Hello, World!' })`cat`;

// Buffer input
const buffer = Buffer.from('Binary data', 'utf8');
await $.with({ stdin: buffer })`wc -c`;

// Stream input
import { createReadStream } from 'fs';
const stream = createReadStream('input.txt');
await $.with({ stdin: stream })`grep "pattern"`;

// Pipe from another command
const output = await $`echo "test"`;
await $.with({ stdin: output.stdout })`tr '[:lower:]' '[:upper:]'`;
```

### Output Handling
Control how output is captured:

```javascript
// Default - capture stdout and stderr
const result = await $`ls -la`;
console.log(result.stdout);
console.log(result.stderr);

// Inherit parent's stdio
await $.with({ 
  stdout: 'inherit',
  stderr: 'inherit' 
})`npm install`; // Output goes directly to console

// Ignore output
await $.with({ 
  stdout: 'ignore',
  stderr: 'ignore' 
})`silent-command`;

// Pipe to custom streams
import { createWriteStream } from 'fs';
const logFile = createWriteStream('output.log');
await $.with({ 
  stdout: logFile,
  stderr: logFile 
})`verbose-command`;
```

## Error Handling

### Exit Code Handling
Configure how non-zero exit codes are handled:

```javascript
// Default - throw on non-zero exit
try {
  await $`exit 1`;
} catch (error) {
  console.log('Exit code:', error.exitCode); // 1
  console.log('Command:', error.command);    // "exit 1"
}

// Don't throw on non-zero exit
const result = await $.with({ throwOnNonZeroExit: false })`exit 42`;
console.log(result.exitCode); // 42
console.log(result.failed);   // true

// Check specific exit codes
const { exitCode } = await $.with({ throwOnNonZeroExit: false })`grep "pattern" file.txt`;
if (exitCode === 0) {
  console.log('Pattern found');
} else if (exitCode === 1) {
  console.log('Pattern not found');
} else {
  console.log('Error occurred');
}
```

### Timeout Handling
Set execution timeouts:

```javascript
// Timeout with error
try {
  await $.with({ timeout: 1000 })`sleep 5`;
} catch (error) {
  if (error.name === 'TimeoutError') {
    console.log('Command timed out after', error.timeout, 'ms');
  }
}

// Timeout with custom signal
await $.with({ 
  timeout: 5000,
  killSignal: 'SIGKILL' // Force kill on timeout
})`potentially-hanging-command`;

// No timeout (default)
await $.with({ timeout: 0 })`long-running-process`;
```

### Error Context
Access detailed error information:

```javascript
try {
  await $.with({ cwd: '/nonexistent' })`ls`;
} catch (error) {
  console.log('Error code:', error.code);        // 'ENOENT'
  console.log('Exit code:', error.exitCode);     // null (spawn failed)
  console.log('Signal:', error.signal);          // null
  console.log('Command:', error.command);        // 'ls'
  console.log('Working dir:', error.cwd);        // '/nonexistent'
  console.log('Stack trace:', error.stack);
}
```

## Performance Optimization

### Buffer Management
Control memory usage for large outputs:

```javascript
// Increase buffer for large outputs
const result = await $.with({ 
  maxBuffer: 100 * 1024 * 1024 // 100MB
})`cat large-file.txt`;

// Stream processing for unlimited output
const proc = $`find / -type f`;
proc.stdout.pipe(process.stdout);
await proc;
```

### Parallel Execution
Run multiple commands efficiently:

```javascript
// Parallel execution
const [result1, result2, result3] = await Promise.all([
  $`command1`,
  $`command2`,
  $`command3`
]);

// Sequential with shared state
const tempDir = await $`mktemp -d`;
await $.with({ cwd: tempDir.stdout.trim() })`touch file1.txt`;
await $.with({ cwd: tempDir.stdout.trim() })`touch file2.txt`;
```

### Process Reuse
Optimize repeated executions:

```javascript
// Create reusable configuration
const nodeExec = (script) => $.with({ 
  shell: false,
  timeout: 10000 
})`node -e ${script}`;

// Reuse configuration
await nodeExec('console.log("Test 1")');
await nodeExec('console.log("Test 2")');
await nodeExec('console.log("Test 3")');
```

## Platform-Specific Features

### Unix/Linux/macOS
Unix-specific features and configurations:

```javascript
// Set user and group IDs
await $.with({ 
  uid: 1000,
  gid: 1000 
})`whoami`;

// Use shell features
await $.with({ shell: '/bin/bash' })`
  set -euo pipefail
  source ~/.bashrc
  alias ll='ls -la'
  ll /tmp
`;

// Signal handling
const proc = $`sleep 100`;
proc.kill('SIGUSR1'); // Send custom signal
```

### Windows
Windows-specific features and configurations:

```javascript
// PowerShell execution
await $.with({ shell: 'powershell.exe' })`
  Get-Service | 
  Where-Object {$_.Status -eq "Running"} | 
  Select-Object -First 10
`;

// Command prompt
await $.with({ shell: 'cmd.exe' })`
  echo off
  set MY_VAR=value
  echo %MY_VAR%
`;

// Windows-specific paths
await $.with({ 
  cwd: 'C:\\Program Files' 
})`dir /b`;
```

## Security Considerations

### Command Injection Prevention
Safely handle user input:

```javascript
// DON'T do this - vulnerable to injection
const userInput = '; rm -rf /';
// await $`echo ${userInput}`; // DANGEROUS!

// DO this - use arguments array
await $.with({ shell: false })`echo ${userInput}`; // Safe - treated as single argument

// Or escape arguments
import { escapeArg } from '@xec-sh/core';
await $`echo ${escapeArg(userInput)}`; // Safe - properly escaped
```

### Privilege Management
Control process privileges:

```javascript
// Drop privileges (Unix only)
await $.with({ 
  uid: 65534,  // nobody user
  gid: 65534   // nogroup
})`whoami`; // Output: nobody

// Avoid running as root when possible
if (process.getuid() === 0) {
  console.warn('Running as root - consider using lower privileges');
}
```

### Resource Limits
Prevent resource exhaustion:

```javascript
// Limit execution time
await $.with({ timeout: 5000 })`potentially-infinite-loop`;

// Limit output buffer
await $.with({ maxBuffer: 1024 * 1024 })`cat /dev/random`;

// Limit concurrent processes
const semaphore = new Semaphore(5); // Max 5 concurrent
await Promise.all(
  commands.map(cmd => 
    semaphore.acquire().then(() => $`${cmd}`)
  )
);
```

## Troubleshooting

### Common Issues

#### Command Not Found
```javascript
// Problem: Command not in PATH
try {
  await $`custom-command`;
} catch (error) {
  if (error.code === 'ENOENT') {
    // Solution 1: Use full path
    await $`/usr/local/bin/custom-command`;
    
    // Solution 2: Update PATH
    await $.with({ 
      env: { 
        PATH: `${process.env.PATH}:/usr/local/bin` 
      }
    })`custom-command`;
  }
}
```

#### Working Directory Issues
```javascript
// Problem: Directory doesn't exist
try {
  await $.with({ cwd: '/nonexistent' })`ls`;
} catch (error) {
  // Solution: Create directory first
  await $`mkdir -p /nonexistent`;
  await $.with({ cwd: '/nonexistent' })`ls`;
}
```

#### Permission Denied
```javascript
// Problem: Insufficient permissions
try {
  await $`cat /etc/shadow`;
} catch (error) {
  if (error.stderr.includes('Permission denied')) {
    // Solution: Use appropriate privileges
    console.log('Requires elevated privileges');
  }
}
```

## Next Steps

- [Shell Configuration](./shell-config.md) - Advanced shell setup and customization
- [Debugging Techniques](./debugging.md) - Debug local command execution
- [SSH Environment](../ssh/setup.md) - Execute commands on remote servers
- [Performance Guide](../../core/execution-engine/performance/optimization.md) - Optimize execution performance
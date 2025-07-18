# Troubleshooting Guide

## Common Issues and Solutions

### Command Not Found

**Problem:**
```javascript
await $`node script.js`;  // Error: command not found: node
```

**Solutions:**

1. **Use full path:**
```javascript
await $`/usr/local/bin/node script.js`;
```

2. **Set PATH environment variable:**
```javascript
const $withPath = $.env({ 
  PATH: `/usr/local/bin:${process.env.PATH}` 
});
await $withPath`node script.js`;
```

3. **Check if command exists:**
```javascript
if (await $.commandExists('node')) {
  await $`node script.js`;
} else {
  console.error('Node.js is not installed');
}
```

4. **Find command location:**
```javascript
const nodePath = await $.which('node');
if (nodePath) {
  await $`${nodePath} script.js`;
}
```

### SSH Connection Failures

**Problem: Connection timeout**
```javascript
const $remote = $.ssh('server.com'); // Hangs
```

**Solutions:**

1. **Add timeout and retry:**
```javascript
const $remote = $.ssh({
  host: 'server.com',
  username: 'user',
  connectTimeout: 10000,  // 10 seconds
  readyTimeout: 5000,     // 5 seconds
  retries: 3
});
```

2. **Debug SSH issues:**
```javascript
const $debug = $.ssh({
  host: 'server.com',
  debug: true  // Prints detailed SSH logs
});
```

3. **Test connection before use:**
```javascript
try {
  const $remote = $.ssh('server.com');
  await $remote`echo "Connected"`;
} catch (error) {
  console.error('SSH connection failed:', error.message);
}
```

### Large Output Handling

**Problem: Out of memory with large outputs**
```javascript
const result = await $`cat huge-file.log`; // Crash!
```

**Solutions:**

1. **Stream processing:**
```javascript
await $.stream`cat huge-file.log`
  .onLine((line) => {
    // Process line by line
    if (line.includes('ERROR')) {
      console.log(line);
    }
  });
```

2. **Pipe to file:**
```javascript
await $`cat huge-file.log > output.txt`;
// Process file separately
```

3. **Limit output:**
```javascript
await $`cat huge-file.log | head -n 1000`;
```

4. **Use pagination:**
```javascript
const pageSize = 1000;
let offset = 0;
while (true) {
  const result = await $`sed -n '${offset + 1},${offset + pageSize}p' huge-file.log`;
  if (!result.stdout) break;
  // Process page
  offset += pageSize;
}
```

### Shell Escaping Problems

**Problem: Special characters break commands**
```javascript
const filename = "my file (copy).txt";
await $.raw`rm ${filename}`;  // Error!
```

**Solutions:**

1. **Always use template literals:**
```javascript
await $`rm ${filename}`;      // Correctly escaped
```

2. **For complex cases, use arrays:**
```javascript
const args = ['--option=value with spaces', 'file.txt'];
await $`mycommand ${args}`;
```

3. **Handle user input safely:**
```javascript
const userInput = "'; rm -rf /";  // Malicious input
await $`echo ${userInput}`;        // Safe - properly escaped
```

### Unexpected Exceptions

**Problem: Command throws exception when you expect it to fail**
```javascript
try {
  await $`grep "pattern" file.txt`;  // Throws when pattern not found
} catch (error) {
  // This catches both "pattern not found" and actual errors
}
```

**Solution: Use nothrow() for expected failures**
```javascript
const result = await $`grep "pattern" file.txt`.nothrow();
if (result.exitCode === 0) {
  console.log('Pattern found');
} else if (result.exitCode === 1) {
  console.log('Pattern not found (normal)');
} else {
  console.log('Actual error occurred');
}
```

### Docker Container Issues

**Problem: Container not found or not running**
```javascript
await $.docker('my-container')`ps`;  // Error: container not found
```

**Solutions:**

1. **Check container status first:**
```javascript
const isRunning = await $`docker ps -q -f name=my-container`.nothrow();
if (isRunning.stdout) {
  await $.docker('my-container')`ps`;
} else {
  console.log('Container not running');
}
```

2. **Start container if needed:**
```javascript
const $container = $.docker({
  image: 'nginx:latest',
  rm: true,
  detach: false
});
await $container`nginx -v`;
```

### Kubernetes Pod Issues

**Problem: Pod not ready**
```javascript
await $.k8s('my-pod', 'default')`ls`;  // Error: pod not ready
```

**Solution: Wait for pod to be ready**
```javascript
// Wait for pod to be ready
await $.retry({
  maxRetries: 30,
  initialDelay: 1000,
  isRetryable: (result) => !result.stdout.includes('Running')
})`kubectl get pod my-pod -o jsonpath='{.status.phase}'`;

// Now execute command
await $.k8s('my-pod', 'default')`ls`;
```

### Environment Variable Issues

**Problem: Environment variables not available**
```javascript
await $`echo $MY_VAR`;  // Empty output
```

**Solutions:**

1. **Pass environment explicitly:**
```javascript
await $`echo $MY_VAR`.env({ MY_VAR: 'value' });
```

2. **Inherit from process:**
```javascript
const $withEnv = $.env(process.env);
await $withEnv`echo $MY_VAR`;
```

3. **Load from .env file:**
```javascript
const dotenv = require('dotenv');
const envVars = dotenv.config().parsed;
const $env = $.env(envVars);
await $env`echo $MY_VAR`;
```

### Timeout Issues

**Problem: Long-running commands hang**
```javascript
await $`sleep 3600`;  // Hangs for 1 hour
```

**Solution: Set appropriate timeouts**
```javascript
// With timeout
await $`long-running-command`.timeout(30000);  // 30 seconds

// Handle timeout gracefully
const result = await $`might-timeout`.timeout(5000).nothrow();
if (result.exitCode === 124) {  // Timeout exit code
  console.log('Command timed out');
}
```

## Debugging Tips

### Enable Verbose Mode

```javascript
// Global verbose mode
$.configure({ verbose: true });

// Per-command verbose
await $`complex-command`.verbose();

// Custom logging
const $logged = $.pipe(
  $`some-command`,
  {
    onStdout: (data) => console.log('OUT:', data),
    onStderr: (data) => console.error('ERR:', data)
  }
);
```

### Test with Mock Adapter

```javascript
// Create test double
const $mock = $.mock({
  'ls': { stdout: 'file1.txt\nfile2.txt', exitCode: 0 },
  'cat file1.txt': { stdout: 'content', exitCode: 0 },
  'rm *': { exitCode: 1, stderr: 'Permission denied' }
});

// Test your code
async function cleanupFiles() {
  const files = await $mock`ls`;
  for (const file of files.stdout.split('\n')) {
    await $mock`rm ${file}`;
  }
}

// Verify calls
const calls = $mock.getCalls();
assert(calls[0].command === 'ls');
assert(calls[1].command === 'rm file1.txt');
```

### Inspect Command Construction

```javascript
// See exact command being executed
const cmd = $`echo ${someVar}`;
console.log('Command:', cmd.toString());

// Debug command options
const debugCmd = $`test-command`
  .cwd('/tmp')
  .env({ DEBUG: 'true' })
  .timeout(5000);

console.log('Options:', debugCmd.options);
```

### Capture All Output

```javascript
// Capture everything for debugging
const debug = {
  stdout: [],
  stderr: [],
  commands: []
};

const $debug = $.on('stdout', (data) => debug.stdout.push(data))
                .on('stderr', (data) => debug.stderr.push(data))
                .on('command', (cmd) => debug.commands.push(cmd));

await $debug`complex-script.sh`;
console.log('Debug info:', debug);
```

## Performance Troubleshooting

### Slow SSH Commands

**Problem: SSH commands are slow**

**Solutions:**

1. **Use connection pooling:**
```javascript
const $remote = $.ssh('server.com');
// Multiple commands reuse the same connection
await $remote`command1`;
await $remote`command2`;
await $remote`command3`;
```

2. **Enable SSH ControlMaster:**
```javascript
const $fast = $.ssh({
  host: 'server.com',
  controlMaster: 'auto',
  controlPath: '~/.ssh/master-%r@%h:%p'
});
```

### Memory Leaks

**Problem: Memory usage grows over time**

**Solutions:**

1. **Clean up connections:**
```javascript
const $remote = $.ssh('server.com');
try {
  await $remote`command`;
} finally {
  await $remote.disconnect();
}
```

2. **Use streaming for large outputs:**
```javascript
// Instead of buffering
const result = await $`cat large-file`;

// Stream it
await $.stream`cat large-file`
  .pipe(fs.createWriteStream('output.txt'));
```

## Platform-Specific Issues

### Windows

**Problem: Commands fail on Windows**

**Solutions:**

1. **Use PowerShell:**
```javascript
const $ps = $.shell('powershell.exe');
await $ps`Get-Process | Where-Object {$_.CPU -gt 100}`;
```

2. **Handle path separators:**
```javascript
const path = require('path');
const file = path.join('dir', 'file.txt');
await $`type ${file}`;  // Windows
```

### macOS

**Problem: Different command options**

**Solutions:**

```javascript
const isMac = process.platform === 'darwin';
const sedInPlace = isMac ? "sed -i ''" : "sed -i";
await $.raw`${sedInPlace} 's/old/new/g' file.txt`;
```

## Getting Help

### Enable Debug Logging

```javascript
// Set environment variable
process.env.DEBUG = '@xec/ush:*';

// Or configure programmatically
$.configure({ debug: true });
```

### Collect Diagnostic Information

```javascript
async function collectDiagnostics() {
  const info = {
    platform: process.platform,
    nodeVersion: process.version,
    shellVersion: await $`${process.env.SHELL} --version`.nothrow(),
    path: process.env.PATH,
    sshVersion: await $`ssh -V`.nothrow(),
    dockerVersion: await $`docker --version`.nothrow()
  };
  
  console.log('Diagnostic info:', JSON.stringify(info, null, 2));
}
```

### Report Issues

When reporting issues, include:
1. Minimal reproducible example
2. Error messages and stack traces
3. Platform and version information
4. Diagnostic information from above

## Next Steps

- Review [Best Practices](./best-practices.md)
- See [Examples](./examples.md) for working code
- Check [API Reference](./api-reference.md) for detailed options
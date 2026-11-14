---
title: LocalAdapter
sidebar_label: Local Adapter
description: Command execution in local system through child_process
---

# LocalAdapter - Local Execution {#localadapter---local-execution}

LocalAdapter provides command execution in the local system through Node.js child_process API. This is the basic and most performant adapter.

## Core Features {#core-features}

- ✅ Direct execution through spawn/spawnSync
- ✅ Bun runtime support
- ✅ Synchronous and asynchronous execution
- ✅ Stream output processing
- ✅ Full process control
- ✅ Minimal overhead

## Usage {#usage}

### Basic Execution {#basic-execution}

```typescript
import { $ } from '@xec-sh/core';

// LocalAdapter is used by default
await $`ls -la`;

// Explicit specification
const local = $.local();
await local`pwd`;
```

### Configuration {#configuration}

```typescript
import { ExecutionEngine } from '@xec-sh/core';
const $ = new ExecutionEngine({
  adapters: {
    local: {
      uid: 1000,                // Unix user ID
      gid: 1000,                // Unix group ID
      killSignal: 'SIGTERM',    // Signal for termination
      defaultShell: '/bin/bash' // Default shell
    }
  }
});
```

## Execution Modes {#execution-modes}

### Shell Mode {#shell-mode}

```typescript
// Automatic shell (true)
await $`echo $HOME && ls *.txt`;

// Specific shell
await $`echo $0`.shell('/bin/zsh');

// Without shell (false) - safer
await $`ls`.shell(false);
```

### Synchronous Execution {#synchronous-execution}

```typescript
import { LocalAdapter } from '@xec-sh/core';

const adapter = new LocalAdapter();
const result = adapter.executeSync({ command: 'node', args: ['--version'], shell: false });
console.log(result.stdout);
```

## Process Management {#process-management}

### Signals and Termination {#signals-and-termination}

```typescript
// Graceful shutdown with timeout
const server = $`node server.js`;

setTimeout(() => {
  server.kill('SIGTERM');  // Graceful termination
  
  setTimeout(() => {
    server.kill('SIGKILL'); // Force termination
  }, 5000);
}, 30000);

await server;
```

### AbortController {#abortcontroller}

```typescript
const controller = new AbortController();

const longTask = $`sleep 100`.signal(controller.signal);

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
  await longTask;
} catch (error) {
  console.log('Task aborted');
}
```

On the Node-backed local adapter, cancellation is scoped to the command lifetime.
An already-aborted signal prevents process creation; completion, failure, and timeout
remove the abort listener. Reusing or aborting the controller after the command
settles does not signal the former process. A timeout or cancellation still uses
the configured local termination signal.

## Stream Handling {#stream-handling}

### Stdin {#stdin}

```typescript
import { $ } from '@xec-sh/core';
import { createReadStream } from 'node:fs';

await $.with({ stdin: 'Hello, World!' })`cat`;
await $.with({ stdin: Buffer.from('binary data') })`cat`;
const input = createReadStream('input.txt');
try {
  await $.with({ stdin: input })`sort`;
} finally {
  input.destroy();
}
```

### Stdout/Stderr {#stdoutstderr}

```typescript
// Redirect to file
import { createWriteStream } from 'fs';
const output = createWriteStream('output.txt');
await $`ls -la`.stdout(output);

// Inherit - output to console
await $`npm install`.stdout('inherit').stderr('inherit');

// Ignore - ignore output
await $`noisy-command`.stdout('ignore');

// Pipe - default, collects output
const result = await $`echo test`.stdout('pipe');
console.log(result.stdout); // 'test\n'
```

## Environment and Context {#environment-and-context}

### Working Directory {#working-directory}

```typescript
// Change directory
await $`pwd`.cwd('/tmp');  // Output: /tmp

// Chain with cd
const project = $.cd('/projects/my-app');
await project`npm install`;
await project`npm test`;
```

### Environment Variables {#environment-variables}

```typescript
// Add variables
await $`node app.js`.env({
  NODE_ENV: 'production',
  PORT: '3000'
});

// Merge with existing
const withEnv = $.env({ API_KEY: 'secret' });
await withEnv`curl $API_URL`;

// Clear environment
await $`printenv`.env({});  // Empty environment
```

## Error Handling {#error-handling}

### Exit Codes {#exit-codes}

```typescript
import { $, CommandError } from '@xec-sh/core';

try {
  await $`exit 1`;
} catch (error) {
  if (!(error instanceof CommandError)) throw error;
  console.error({ exitCode: error.exitCode, stderr: error.stderr });
}
const result = await $`exit 1`.nothrow();
console.log(result.ok);
```

### Timeouts {#timeouts}

```typescript
// Execution timeout
try {
  await $`sleep 100`.timeout(1000);  // 1 second
} catch (error) {
  console.log('Command timed out');
}

// With custom signal
await $`server`.timeout(5000, 'SIGINT');
```

## Interactive Mode {#interactive-mode}

```typescript
import { $ } from '@xec-sh/core';

await $`npm init`.interactive();
await $.with({ stdin: process.stdin })`cat`.stdout('inherit').stderr('inherit');
```

## Runtime selection {#runtime-selection}

Start the script with Node, Bun, or Deno. The local adapter uses their shared `node:child_process` API, so cancellation, output delivery, and cleanup follow one implementation. `preferBun` and `forceImplementation` were removed in Xec 0.12; remove them from adapter configuration.

## Performance {#performance}

### Mode Comparison {#mode-comparison}

| Mode | Speed | Security | Usage |
|------|-------|----------|-------|
| shell: false | Fast | High | Simple commands |
| shell: true | Medium | Medium | Complex pipelines |
| shell: '/bin/sh' | Fast | Medium | POSIX compatibility |
| sync | Very fast | High | Scripts, CLI |

### Optimizations {#optimizations}

```typescript
import { $ } from '@xec-sh/core';

const files = ['README.md', 'package.json'];
await $`wc -c ${files}`;
```

## Platform-Specific Commands {#platform-specific-commands}

```typescript
import { platform } from 'os';

// Cross-platform commands
const isWindows = platform() === 'win32';
const listCmd = isWindows ? 'dir' : 'ls -la';
await $`${listCmd}`;

// Or through shell
if (isWindows) {
  await $`dir`.shell('cmd.exe');
} else {
  await $`ls -la`.shell('/bin/bash');
}
```

## Debugging {#debugging}

### Command Logging {#command-logging}

```typescript
import { ExecutionEngine } from '@xec-sh/core';
const $ = new ExecutionEngine();

$.on('command:start', ({ command, cwd }) => {
  console.log(`[LOCAL] Executing: ${command} in ${cwd}`);
});

$.on('command:complete', ({ exitCode, duration }) => {
  console.log(`[LOCAL] Completed: exit=${exitCode}, time=${duration}ms`);
});
```

### Detailed Output {#detailed-output}

```typescript
// Verbose mode
const verbose = $.with({
  stdout: 'inherit',
  stderr: 'inherit'
});

await verbose`npm install`;  // Real-time output
```

## Security {#security}

### Injection Prevention {#injection-prevention}

```typescript
// Dangerous - shell injection
const userInput = "'; rm -rf /";
await $.raw`echo ${userInput}`;  // DON'T DO THIS!

// Safe - automatic escaping
await $`echo ${userInput}`;  // Output: '; rm -rf /

// Even safer - without shell
await $.local().execute({
  command: 'echo',
  args: [userInput],
  shell: false
});
```

### Resource Limitation {#resource-limitation}

```typescript
import { $ } from '@xec-sh/core';

const result = await $.with({ maxBuffer: 1024 * 1024 })`generate-report`.timeout('5s');
console.log(result.stdout);
```

## Usage Examples {#usage-examples}

### Git Operations {#git-operations}

```typescript
async function gitStatus() {
  const status = await $`git status --porcelain`.text();
  if (status) {
    const files = status.split('\n').filter(Boolean);
    console.log(`Changed files: ${files.length}`);
    
    for (const file of files) {
      const [status, path] = file.split(/\s+/);
      console.log(`  ${status}: ${path}`);
    }
  }
}
```

### System Monitoring {#system-monitoring}

```typescript
async function systemInfo() {
  const [cpu, memory, disk] = await Promise.all([
    $`top -bn1 | head -5`.text(),
    $`free -h`.text(),
    $`df -h`.text()
  ]);
  
  return { cpu, memory, disk };
}
```

### Build Pipeline {#build-pipeline}

```typescript
async function build() {
  // Clean
  await $`rm -rf dist`;
  
  // Install dependencies
  await $`npm ci`.stdout('inherit');
  
  // Linting
  const lintResult = await $`npm run lint`.nothrow();
  if (lintResult.exitCode !== 0) {
    console.warn('Lint warnings:', lintResult.stderr);
  }
  
  // Build
  await $`npm run build`;
  
  // Tests
  await $`npm test`;
}
```

## Troubleshooting {#troubleshooting}

### PATH Issues {#path-issues}

```typescript
// Explicit path specification
await $`/usr/local/bin/node script.js`;

// Or through env
await $`node script.js`.env({
  PATH: '/usr/local/bin:/usr/bin:/bin'
});
```

### Encoding Issues {#encoding-issues}

```typescript
import { ExecutionEngine, createCallableEngine } from '@xec-sh/core';

const run = createCallableEngine(new ExecutionEngine({ encoding: 'latin1' }));
try {
  const result = await run`cat file.txt`;
  console.log(result.stdout);
} finally {
  await run.dispose();
}
```

### Zombie Processes {#zombie-processes}

```typescript
import { ExecutionEngine } from '@xec-sh/core';

const engine = new ExecutionEngine();
try {
  await engine.run`long-running-task`;
} finally {
  await engine.dispose();
}
```

## Conclusion {#conclusion}

LocalAdapter is the foundation for fast and secure command execution in the local system. Its advantages:

- **Performance**: minimal overhead
- **Flexibility**: full process control
- **Security**: automatic escaping
- **Compatibility**: works everywhere Node.js is available
- **Simplicity**: intuitive API
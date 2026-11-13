---
sidebar_position: 4
title: Debugging Techniques
description: Advanced debugging techniques for Xec scripts and automation
---

# Debugging Techniques

## Problem

Debugging distributed scripts across multiple environments (local, SSH, Docker, Kubernetes) is challenging. Traditional debuggers don't work well with remote execution, and understanding what went wrong requires visibility into command execution, environment state, and error propagation.

## Prerequisites

- Xec CLI installed with development dependencies
- Node.js debugging tools (`node --inspect`)
- Understanding of Xec execution model
- Chrome DevTools or VS Code for debugging

## Solution

### Step 1: Enable Debug Mode

Enable the CLI's verbose diagnostics for the script you are investigating.

```bash
xec --verbose run scripts/check.ts
```

For command-level output inside a script, set `$.verbose = true`. To debug the
Node process running Xec, use Node's inspector on the installed CLI entry.

```bash
node --inspect-brk=127.0.0.1:9229 "$(command -v xec)" run scripts/check.ts
```

Attach the debugger to the loopback inspector endpoint and set breakpoints in
the script. Use an SSH tunnel when accessing a remote inspector.

### Step 2: Command-Level Debugging

Debug individual commands with verbose output:

```javascript
#!/usr/bin/env xec

import { $, quoteForShell, dialectFor } from '@xec-sh/core';

// Enable verbose mode for specific commands
$.verbose = true;

// The result already carries the command, timing and output — no separate
// trace call needed
const result = await $`ls -la`;
console.log('Command:', result.command);
console.log('Exit code:', result.exitCode);
console.log('Duration:', result.duration, 'ms');
console.log('Output:', result.stdout);

// stdout and stderr interleaved in the order they actually arrived
console.log('Interleaved:', result.stdall);

// The exact bytes written, for output that isn't text
const raw = result.buffer();

// Debug command construction
const cmd = 'git';
const args = ['status', '--short'];
const dialect = dialectFor(true);
console.log('Executing:', [cmd, ...args].map(part => quoteForShell(part, dialect)).join(' '));
await $.exec(cmd, { args, shell: false });

// Build a command pipeline
const pipeline = $`cat file.txt`
  .pipe('grep pattern')
  .pipe('wc -l');

const lineCount = await pipeline.text();
console.log('Line count:', lineCount);
```

### Step 3: Remote Debugging

Debug scripts running on remote targets:

```javascript
#!/usr/bin/env xec

import { $ } from '@xec-sh/core';

// Debug SSH execution
$.verbose = true; // echo each command as it runs, on this host or any other

const ssh = $.ssh({
  host: 'server.example.com',
  username: 'deploy'
});

// Add debugging commands
await ssh`echo "Current directory: $(pwd)"`;
await ssh`node --version`;
await ssh`echo "User: $(whoami)"`;

// Debug with breakpoints
debugger;  // Breakpoint for Node inspector
const result = await ssh`./deploy.sh`;

// Preserve the original error and report its standard message.
try {
  await ssh`./might-fail.sh`;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  throw error;
}

// Debug Docker execution
const docker = $.docker({
  container: 'myapp'
});

// Inspect container state
await docker`ps aux`;
await docker`df -h`;
await docker`cat /proc/meminfo`;
```

### Step 4: Interactive Debugging

For a project with `tsx` installed as a development dependency, VS Code can
launch a standalone script that imports the public Xec packages. Use the CLI
inspector command above for scripts that also need injected CLI globals.

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Xec Script",
      "program": "${workspaceFolder}/.xec/scripts/debug-me.js",
      "runtimeExecutable": "node",
      "runtimeArgs": ["--import", "tsx"],
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

Debug script with breakpoints:

```javascript
#!/usr/bin/env xec
// .xec/scripts/debug-me.js

import { $ } from '@xec-sh/core';

/** @param {string} env */
async function deployStep(env) {
  debugger;  // VS Code will break here
  
  const config = await loadConfig(env);
  console.log('Configuration loaded for', env);
  
  debugger;  // Another breakpoint
  
  await $`npm run build`;
  await $`npm test`;
  
  return config;
}

/** @param {string} env */
async function loadConfig(env) {
  // Set conditional breakpoints
  if (env === 'production') {
    debugger;
  }
  
  return JSON.parse(
    await $.readFile(`.xec/config.${env}.json`)
  );
}

// Main execution
const env = process.argv[2] || 'development';
await deployStep(env);
```

### Step 5: Logging and Tracing

Subscribe to the engine's structured events. This preserves the callable and
chainable API and uses its existing diagnostic redaction.

```typescript
import { $, dispose } from '@xec-sh/core';

$.on('command:start', event => {
  console.log(JSON.stringify({ type: 'start', command: event.command, adapter: event.adapter }));
});
$.on('command:complete', event => {
  console.log(JSON.stringify({ type: 'complete', exitCode: event.exitCode, duration: event.duration }));
});
$.on('command:error', event => {
  console.error(JSON.stringify({ type: 'error', error: event.error, duration: event.duration }));
});

try {
  await $`node --version`;
} finally {
  await dispose();
}
```

### Step 6: Error Analysis

Preserve a classified error and a small operation context. The top-level caller
can forward this record to its existing logger and set the exit status.

```typescript
import { $, CommandError, ExecutionError, dispose } from '@xec-sh/core';

try {
  await $`npm run build`;
} catch (error) {
  console.error(JSON.stringify({
    operation: 'build',
    target: 'local',
    kind: error instanceof ExecutionError ? error.kind : 'application-error',
    exitCode: error instanceof CommandError ? error.exitCode : undefined,
    message: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
} finally {
  await dispose();
}
```

## Best Practices

1. **Use Structured Logging**
   - JSON format for machine parsing
   - Consistent log levels
   - Contextual information

2. **Debug Incrementally**
   - Start with verbose output
   - Add targeted debugging
   - Use interactive debugger last

3. **Preserve Debug Information**
   - Save command outputs
   - Capture environment state
   - Log timing information

4. **Test Debug Scripts**
   - Have debug-specific test cases
   - Verify error handling
   - Check log output format

5. **Document Debug Flags**
   - List all debug options
   - Provide examples
   - Explain output format

## Common Pitfalls

1. **Debugging in Production**
   - ❌ Leaving debug mode enabled
   - ✅ Use environment-specific debug settings

2. **Sensitive Data in Logs**
   - ❌ Logging passwords or tokens
   - ✅ Sanitize sensitive information

3. **Performance Impact**
   - ❌ Excessive logging in loops
   - ✅ Use conditional logging

4. **Lost Debug Output**
   - ❌ Not capturing stderr
   - ✅ Redirect all streams appropriately

## Troubleshooting

### Issue: Debugger Not Attaching
```bash
# Check if port is available
lsof -i :9229

# Use different port
node --inspect=127.0.0.1:9230 "$(command -v xec)" run script.js

# For remote debugging
ssh -L 9229:localhost:9229 user@server
```

### Issue: Missing Stack Traces
```javascript
// Enable long stack traces
Error.stackTraceLimit = Infinity;

// Or use
process.env.NODE_OPTIONS = '--stack-trace-limit=1000';
```

### Issue: Async Errors Not Caught
Await the script's entry point so its failures reach one final handler.

```typescript
import { $, dispose } from '@xec-sh/core';

async function check(): Promise<void> {
  await $`npm test`;
}
try {
  await check();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await dispose();
}
```

### Issue: Hung or Runaway Commands

Set a deadline on the command and inspect the classified failure. A non-zero
exit and a timeout are distinct outcomes.

```typescript
import { $, ExecutionError } from '@xec-sh/core';

try {
  await $`npm test`.timeout('2m');
} catch (error) {
  if (error instanceof ExecutionError) console.error(error.kind, error.message);
  throw error;
}
```

### Issue: Remote Debug Connection Failed
```yaml
# Configure SSH for debugging
Host debug-server
  HostName server.example.com
  User deploy
  LocalForward 9229 localhost:9229
  ServerAliveInterval 60
```

## Related Guides

- [Dev Environments](./dev-environments.md) - Setting up development
- [Error Handling](../advanced/error-handling.md) - Robust error handling
- [Testing](../automation/testing.md) - Testing Xec scripts
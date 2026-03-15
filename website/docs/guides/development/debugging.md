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

Configure Xec for debugging:

```bash
# Set debug environment variables
export XEC_DEBUG=true
export XEC_LOG_LEVEL=debug
export NODE_OPTIONS="--trace-warnings"

# Or use config
xec config set debug true
xec config set logLevel debug
```

Add debug configuration to `.xec/config.yaml`:

```yaml
debug:
  enabled: true
  logLevel: debug
  traceCommands: true
  captureOutput: true
  dumpOnError: true
  breakpoints:
    - file: scripts/deploy.js
      line: 42
```

### Step 2: Command-Level Debugging

Debug individual commands with verbose output:

```javascript
#!/usr/bin/env xec

import { $ } from '@xec-sh/core';

// Enable verbose mode for specific commands
$.verbose = true;

// Trace command execution
const result = await $`ls -la`.trace();
console.log('Command:', result.command);
console.log('Exit code:', result.exitCode);
console.log('Duration:', result.duration, 'ms');
console.log('Output:', result.stdout);

// Debug command construction
const cmd = 'git';
const args = ['status', '--short'];
console.log('Executing:', $.quote([cmd, ...args]));
await $`${cmd} ${args}`;

// Inspect command pipeline
const pipeline = $`cat file.txt`
  .pipe($`grep pattern`)
  .pipe($`wc -l`);

console.log('Pipeline steps:', pipeline.inspect());
await pipeline;
```

### Step 3: Remote Debugging

Debug scripts running on remote targets:

```javascript
#!/usr/bin/env xec --inspect

import { $ } from '@xec-sh/core';

// Debug SSH execution
const ssh = $.ssh({
  host: 'server.example.com',
  username: 'deploy',
  debug: true  // Enable SSH debug output
});

// Add debugging commands
await ssh`echo "Current directory: $(pwd)"`;
await ssh`echo "Environment: $(env | grep NODE)"`;
await ssh`echo "User: $(whoami)"`;

// Debug with breakpoints
debugger;  // Breakpoint for Node inspector
const result = await ssh`./deploy.sh`;

// Capture detailed error information
try {
  await ssh`./might-fail.sh`;
} catch (error) {
  console.log('Error details:', {
    command: error.command,
    exitCode: error.exitCode,
    stdout: error.stdout,
    stderr: error.stderr,
    duration: error.duration,
    target: error.target
  });
}

// Debug Docker execution
const docker = $.docker({
  container: 'myapp',
  debug: true
});

// Inspect container state
await docker`ps aux`;
await docker`df -h`;
await docker`cat /proc/meminfo`;
```

### Step 4: Interactive Debugging

Use the Node.js inspector for interactive debugging:

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
      "runtimeExecutable": "xec",
      "runtimeArgs": ["--inspect-brk"],
      "console": "integratedTerminal",
      "env": {
        "XEC_DEBUG": "true"
      }
    }
  ]
}
```

Debug script with breakpoints:

```javascript
// .xec/scripts/debug-me.js
#!/usr/bin/env xec

import { $ } from '@xec-sh/core';

async function deployStep(env) {
  debugger;  // VS Code will break here
  
  const config = await loadConfig(env);
  console.log('Config loaded:', config);
  
  debugger;  // Another breakpoint
  
  await $`npm run build`;
  await $`npm test`;
  
  return config;
}

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

Implement comprehensive logging:

```javascript
// .xec/lib/logger.js
import { $ } from '@xec-sh/core';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.XEC_LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: '.xec/logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: '.xec/logs/combined.log' 
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Wrap Xec commands with logging
export function logged($) {
  return new Proxy($, {
    get(target, prop) {
      if (typeof target[prop] === 'function') {
        return async (...args) => {
          const start = Date.now();
          logger.debug(`Executing: ${prop}`, { args });
          
          try {
            const result = await target[prop](...args);
            logger.info(`Success: ${prop}`, {
              duration: Date.now() - start,
              args
            });
            return result;
          } catch (error) {
            logger.error(`Failed: ${prop}`, {
              duration: Date.now() - start,
              args,
              error: error.message,
              stack: error.stack
            });
            throw error;
          }
        };
      }
      return target[prop];
    }
  });
}

// Usage
const $$ = logged($);
await $$`ls -la`;  // Automatically logged
```

### Step 6: Error Analysis

Create detailed error reports:

```javascript
// .xec/lib/error-reporter.js
#!/usr/bin/env xec

import { $ } from '@xec-sh/core';
import fs from 'fs/promises';

class ErrorReporter {
  constructor() {
    this.errors = [];
  }

  async capture(error, context = {}) {
    const report = {
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
        ...error
      },
      context: {
        cwd: process.cwd(),
        env: process.env.NODE_ENV,
        target: context.target,
        ...context
      },
      system: await this.getSystemInfo()
    };

    this.errors.push(report);
    await this.save(report);
    
    return report;
  }

  async getSystemInfo() {
    const info = {};
    
    try {
      info.platform = process.platform;
      info.arch = process.arch;
      info.node = process.version;
      info.memory = process.memoryUsage();
      info.uptime = process.uptime();
      
      if ($.which('docker')) {
        info.docker = (await $`docker version --format json`).stdout;
      }
      
      if ($.which('kubectl')) {
        info.kubectl = (await $`kubectl version --output json`).stdout;
      }
    } catch (e) {
      // Ignore errors collecting system info
    }
    
    return info;
  }

  async save(report) {
    const filename = `.xec/errors/${Date.now()}-error.json`;
    await fs.mkdir('.xec/errors', { recursive: true });
    await fs.writeFile(filename, JSON.stringify(report, null, 2));
    console.error(`Error report saved: ${filename}`);
  }

  async analyze() {
    const files = await fs.readdir('.xec/errors');
    const reports = await Promise.all(
      files.map(f => fs.readFile(`.xec/errors/${f}`, 'utf8').then(JSON.parse))
    );

    // Group errors by type
    const byType = {};
    reports.forEach(r => {
      const key = r.error.code || r.error.message;
      if (!byType[key]) byType[key] = [];
      byType[key].push(r);
    });

    // Find patterns
    console.log('Error Analysis:');
    console.log('===============');
    Object.entries(byType).forEach(([type, errors]) => {
      console.log(`\n${type}: ${errors.length} occurrences`);
      if (errors.length > 1) {
        console.log('  First seen:', errors[0].timestamp);
        console.log('  Last seen:', errors[errors.length - 1].timestamp);
      }
    });
  }
}

// Usage in scripts
const reporter = new ErrorReporter();

try {
  await $`risky-command`;
} catch (error) {
  await reporter.capture(error, {
    script: 'deploy.js',
    step: 'build',
    target: 'production'
  });
  throw error;  // Re-throw after reporting
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
xec --inspect=0.0.0.0:9230 script.js

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
```javascript
// Handle unhandled rejections
process.on('unhandledRejection', (error, promise) => {
  console.error('Unhandled rejection:', error);
  reporter.capture(error, { type: 'unhandledRejection' });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  reporter.capture(error, { type: 'uncaughtException' });
  process.exit(1);
});
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
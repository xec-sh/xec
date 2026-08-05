---
title: Script Execution Context
description: The globals and context available inside Xec scripts
---

# Script Execution Context

Every Xec script runs within a rich execution context that provides access to targets, configuration, and utility functions. This guide explains the execution context and how to leverage it effectively.

## Understanding $target and $

Xec provides two primary execution engines in your scripts:

```javascript
// $target - Executes on the configured target (local, SSH, Docker, or Kubernetes)
await $target`ls -la`;

// $ - Always executes locally, regardless of target
await $`pwd`;
```

`$target` and `$targetInfo` exist when the CLI binds the script to a target:
`xec on <host> script.js` and `xec in <container> script.js` bind them to
that host or container, and `xec run script.js` binds them to the local
machine (`$targetInfo.type === 'local'`). Running a file directly —
`xec script.js` — declares neither variable at all (not even as `undefined`),
so portable scripts check with `typeof` rather than referencing them
directly, or fall back to `$`.

## Global Context Variables

When a script executes, Xec injects these globals:

```javascript
// Primary execution engines
$target     // CallableExecutionEngine - bound to the current target (see above)
$targetInfo // TargetInfo - metadata about that target, present alongside $target
$           // CallableExecutionEngine - local command execution, always present
```

Script arguments and location are globals too: `args` is exactly what the
script was invoked with, `argv` follows the shell convention (interpreter,
script path, then the arguments), and `__filename`/`__dirname` name the
script's own location. `xec run deploy.js staging --force` gives
`args = ['staging', '--force']` — flags the `run` command owns itself go
after `--`.

### Target Information

The `$targetInfo` object provides details about the execution target:

```typescript
interface TargetInfo {
  type: 'local' | 'ssh' | 'docker' | 'kubernetes';
  name?: string;
  host?: string;       // SSH targets
  container?: string;  // Docker targets
  pod?: string;        // Kubernetes targets
  namespace?: string;  // Kubernetes targets
  config: any;         // Full target configuration
}
```

Example usage:

```javascript
if (typeof $targetInfo !== 'undefined') {
  console.log(`Executing on ${$targetInfo.type} target: ${$targetInfo.name}`);
  
  switch ($targetInfo.type) {
    case 'ssh':
      console.log(`Connected to: ${$targetInfo.host}`);
      break;
    case 'docker':
      console.log(`Container: ${$targetInfo.container}`);
      break;
    case 'kubernetes':
      console.log(`Pod: ${$targetInfo.pod} in namespace ${$targetInfo.namespace}`);
      break;
  }
}
```

## Utility Functions

The CLI also makes a set of scripting utilities from `@xec-sh/ops`
available as globals in every execution path (`xec run`, `xec script.js`,
`-e`, the REPL), without an import — among them `glob`, `which`, `fs`,
`os`, `path`, `sleep`, `retry`, `within`, `template`, `parseArgs`, `yaml`,
`csv`, `diff`, and terminal helpers `log`/`echo`/`prism`/`kit`/`spinner`. See
[TypeScript Configuration](./typescript-setup.md#type-definitions-for-global-context)
for the full list and how to get IntelliSense for it. `chalk` is not one of
them — import it normally if you use it (`import chalk from 'chalk'`).

```javascript
// File globbing
const files = await glob('**/*.js');
const configs = await glob('config/*.yaml');
```

## Working with Multiple Targets

Scripts can be executed against different targets:

```bash
# Execute on SSH target
xec on production script.js

# Execute on Docker container
xec in my-container script.js

# Execute on Kubernetes pod
xec in pods.my-pod script.js
```

In the script:

```javascript
// script.js
if ($targetInfo?.type === 'ssh') {
  // SSH-specific logic
  await $target`sudo systemctl restart nginx`;
} else if ($targetInfo?.type === 'docker') {
  // Docker-specific logic
  await $target`apt-get update && apt-get install -y curl`;
} else if ($targetInfo?.type === 'kubernetes') {
  // Kubernetes-specific logic — runs inside the pod
  await $target`cat /etc/resolv.conf`;
} else {
  // Local execution
  await $`echo "Running locally"`;
}

// Always execute locally regardless of target
await $`echo "This always runs on the host"`;
```

## Parameter Parsing

Command-line parameters aren't parsed automatically — a script gets its raw
arguments as the `args` global and parses them itself. `parseArgs`, one of
the globals from `@xec-sh/ops` (see [Utility Functions](#utility-functions)
above), covers the common `--key=value` and `--flag` cases:

```javascript
// Script called with: xec deploy.js --env=prod --version=1.2.3 --force
const params = parseArgs(args);
console.log(params.env);     // 'prod'
console.log(params.version); // '1.2.3'
console.log(params.force);   // true
console.log(params._);       // [] — positional arguments land here

// Values are always strings or booleans — parseArgs does not coerce
// numbers, JSON, or anything else. Parse those yourself if you need them.
```

Note the invocation: arguments are passed by running the file directly
(`xec deploy.js ...`). The `run` subcommand form (`xec run deploy.js`)
currently accepts no script arguments.

## Context Isolation

Each CLI invocation is its own process, and the globals Xec injects
(`$target`, `$targetInfo`, the utility functions) are restored to their
previous values after the script finishes. Variables your script assigns to
`globalThis` itself are not tracked — in `--watch` mode, where the file is
re-run inside the same process, they survive between runs.

## REPL Context

When running in REPL mode, additional helpers are available:

```javascript
// Start REPL
xec run --repl

// In REPL:
> .help           // Show available commands
> .clear          // Clear the console
> await $`ls`     // Execute commands
```

`.help` and `.clear` are Node REPL dot-commands (`replServer.defineCommand`),
not callable functions — they're typed without parentheses.

## Custom Context Extension

Scripts can extend their context programmatically:

```javascript
// extend-context.js
import { $ } from '@xec-sh/core';

// Add custom utilities to the context
global.utils = {
  async deployToAll(targetNames) {
    for (const name of targetNames) {
      console.log(`Deploying to ${name}...`);
      await $`xec on ${name} "npm run deploy"`;
    }
  },
  
  formatBytes(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
};

// Use the extended context
await utils.deployToAll(['staging', 'production']);
```

## Environment Variables

Scripts inherit the process environment. Xec itself reads a few variables
rather than setting them:

```javascript
// Variables Xec reads
process.env.XEC_DEBUG    // 'true' enables verbose/debug output
process.env.XEC_CONFIG   // path to a config file to load
process.env.XEC_PROFILE  // configuration profile to activate
// Any other XEC_* variable overrides configuration by path:
// XEC_VARS_APP_NAME=web  ->  vars.app_name = 'web'

// Pass environment variables to commands
process.env.API_KEY = 'secret';
await $`echo $API_KEY`;

// Or use env option
await $`node script.js`.env({ API_KEY: 'secret' });
```

## Best Practices

1. **Check for target availability**:
   ```javascript
   if (typeof $target !== 'undefined') {
     // Target-specific code
   }
   ```

2. **Use type guards for target types**:
   ```javascript
   if ($targetInfo?.type === 'ssh') {
     // SSH-specific operations
   }
   ```

3. **Provide fallbacks for local execution**:
   ```javascript
   const engine = $target || $;
   await engine`ls -la`;
   ```

4. **Clean up resources**:
   ```javascript
   try {
     // Your script logic
   } finally {
     // Cleanup code runs even on error
   }
   ```

5. **Document expected parameters**:
   ```javascript
   // deploy.js
   // Usage: xec deploy.js --env=<environment> --version=<version>
   
   const params = parseArgs(args);
   if (!params.env || !params.version) {
     console.error('Required parameters: --env and --version');
     process.exit(1);
   }
   ```

## Complete Example

Here's a comprehensive example using the execution context:

```javascript
// multi-target-deploy.js
import { $ } from '@xec-sh/core';
import chalk from 'chalk';

async function main() {
  // Check if running against a target (typeof guard: the variable is not
  // declared at all when the file is run directly as `xec script.js`)
  if (typeof $targetInfo !== 'undefined' && $targetInfo.type !== 'local') {
    console.log(chalk.blue(`Deploying to ${$targetInfo.type} target: ${$targetInfo.name}`));
    
    // Target-specific deployment
    switch ($targetInfo.type) {
      case 'ssh':
        await deployToSSH();
        break;
      case 'docker':
        await deployToDocker();
        break;
      case 'kubernetes':
        await deployToKubernetes();
        break;
      default:
        await deployLocal();
    }
  } else {
    // Local target (xec run) or direct invocation — deploy locally
    await deployLocal();
  }
  
  // Always run post-deployment tasks locally
  await $`echo "Deployment complete" >> deployment.log`;
  await $`date >> deployment.log`;
}

async function deployToSSH() {
  console.log(`Connecting to ${$targetInfo.host}...`);
  await $target`cd /app && git pull`;
  await $target`npm install`;
  await $target`npm run build`;
  await $target`sudo systemctl restart app`;
}

async function deployToDocker() {
  console.log(`Deploying to container ${$targetInfo.container}...`);
  await $target`apt-get update`;
  await $target`cd /app && npm install`;
  await $target`npm run build`;
}

async function deployToKubernetes() {
  console.log(`Deploying to pod ${$targetInfo.pod}...`);
  await $target`cd /app && npm ci`;
  await $target`npm run build`;
  
  // Restart the pod
  await $`kubectl rollout restart deployment/${$targetInfo.pod}`;
}

async function deployLocal() {
  console.log('Deploying locally...');
  await $`npm install`;
  await $`npm run build`;
  await $`npm run start`;
}

// Execute with error handling
try {
  await main();
  console.log(chalk.green('✅ Deployment successful!'));
} catch (error) {
  console.error(chalk.red('❌ Deployment failed:'), error.message);
  process.exit(1);
}
```

Run this script with different targets:

```bash
# Deploy locally
xec run multi-target-deploy.js

# Deploy to SSH server
xec on hosts.production multi-target-deploy.js

# Deploy to Docker container
xec in containers.app multi-target-deploy.js

# Deploy to Kubernetes pod
xec in pods.app multi-target-deploy.js
```
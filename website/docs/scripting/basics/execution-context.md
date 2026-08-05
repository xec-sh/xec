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

`$target` only exists when the script was run with `--target`; a plain
`xec run script.js` never defines it at all (not even as `undefined` — the
variable itself isn't declared), so check for it with `typeof` rather than
referencing it directly, or fall back to `$`.

## Global Context Variables

When a script executes, Xec injects several global variables:

### Core Execution Variables

```javascript
// Primary execution engines
$target     // CallableExecutionEngine - present only when run with --target
$targetInfo // TargetInfo - present only alongside $target
$           // CallableExecutionEngine - local command execution

// Script metadata
__filename  // string - Absolute path to the script file
__dirname   // string - Directory containing the script

// Script arguments
args        // string[] - Arguments passed to the script
argv        // string[] - [interpreter, scriptPath, ...args]
```

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
if ($targetInfo) {
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

`xec run` also makes a set of scripting utilities from `@xec-sh/ops`
available as globals, without an import — among them `glob`, `which`, `fs`,
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
xec run script.js --target production

# Execute on Docker container
xec run script.js --target my-container

# Execute on Kubernetes pod
xec run script.js --target my-pod
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
  // Kubernetes-specific logic
  await $target`kubectl get pods`;
} else {
  // Local execution
  await $`echo "Running locally"`;
}

// Always execute locally regardless of target
await $`echo "This always runs on the host"`;
```

## Parameter Parsing

Command-line parameters aren't parsed automatically — a script gets its raw
`args`/`argv` and parses them itself. `parseArgs`, one of the globals from
`@xec-sh/ops` (see [Utility Functions](#utility-functions) above), covers
the common `--key=value` and `--flag` cases:

```javascript
// Script called with: xec run deploy.js --env=prod --version=1.2.3 --force
const params = parseArgs(args);
console.log(params.env);     // 'prod'
console.log(params.version); // '1.2.3'
console.log(params.force);   // true

// Values are always strings or booleans — parseArgs does not coerce
// numbers, JSON, or anything else. Parse those yourself if you need them.
```

## Context Isolation

Each script runs in its own context with proper cleanup:

```javascript
// Variables set in one script don't affect others
globalThis.myVar = 'test';

// After script execution, global variables are cleaned up
// This prevents cross-script contamination
```

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
  async deployToAll(targets) {
    for (const target of targets) {
      console.log(`Deploying to ${target}...`);
      await targets.execute(target, 'npm run deploy');
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

Scripts inherit the process environment with Xec-specific additions:

```javascript
// Xec environment variables
console.log(process.env.XEC_TARGET);      // Current target name
console.log(process.env.XEC_TARGET_TYPE); // Target type (ssh, docker, k8s)
console.log(process.env.XEC_DEBUG);       // Debug mode flag
console.log(process.env.XEC_CONFIG_PATH); // Path to config file

// Pass environment variables to commands
process.env.API_KEY = 'secret';
await $`echo $API_KEY`;

// Or use env option
await $`node script.js`.env({ API_KEY: 'secret' });
```

## Script Info Object

The `__script` object provides complete script metadata:

```typescript
interface ScriptInfo {
  path: string;      // Full path to the script
  args: string[];    // Script arguments
  target?: Target;   // Target configuration if specified
}
```

Usage example:

```javascript
console.log('Script:', __script.path);
console.log('Arguments:', __script.args);

if (__script.target) {
  console.log('Running on target:', __script.target.name);
}
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
   // Usage: xec run deploy.js --env=<environment> --version=<version>
   
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
  // Check if running against a target
  if ($targetInfo) {
    console.log(chalk.blue(`Deploying to ${$targetInfo.type} target: ${$targetInfo.name}`));
    
    // Target-specific deployment
    switch ($targetInfo.type) {
      case 'ssh':
        await deployToSSH();
        break;
      case 'docker':
        await deployToDocker();
        break;
      case 'k8s':
        await deployToKubernetes();
        break;
      default:
        await deployLocal();
    }
  } else {
    // No target specified, deploy locally
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
xec run multi-target-deploy.js --target production

# Deploy to Docker container
xec run multi-target-deploy.js --target app-container

# Deploy to Kubernetes pod
xec run multi-target-deploy.js --target app-pod
```
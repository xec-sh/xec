---
title: Script Execution Context
description: The globals and context available inside Xec scripts
---

# Script Execution Context {#script-execution-context}

Every Xec script runs within a rich execution context that provides access to targets, configuration, and utility functions. This guide explains the execution context and how to leverage it effectively.

## Understanding $target and $ {#understanding-target-and-}

Xec provides two primary execution engines in your scripts:

```javascript
// $target - Executes on the configured target (local, SSH, Docker, or Kubernetes)
await $target`ls -la`;

// $ - Always executes locally, regardless of target
await $`pwd`;
```

`$target` and `$targetInfo` are bound to whatever the CLI ran the script
against: `xec on <host> script.js` and `xec in <container> script.js` bind
them to that host or container, while `xec run script.js` — and its direct
shorthand `xec script.js` — bind them to the local machine
(`$targetInfo.type === 'local'`), and `-e` evaluation gets the same
local binding. Code that may also run outside the CLI — under plain
`node` — should still check with `typeof`, since there the variables
aren't declared at all.

## Global Context Variables {#global-context-variables}

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

### Target Information {#target-information}

The `$targetInfo` object provides details about the execution target:

```typescript
import type { TargetInfo } from '@xec-sh/loader';

const target: TargetInfo = $targetInfo;
console.log(target.type, target.name); // name is required; config is the target's own config
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

## Utility Functions {#utility-functions}

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

`glob` answers paths relative to `cwd`, separated by `/` on every platform
— including Windows, where the result can be fed straight back into another
pattern. A single `*` never crosses a directory boundary; `**` does. Pass
`{ absolute: true }` for native paths instead, since those go to the
filesystem.

:::caution Changed in 0.11.0
On Windows, results previously came back with `\` separators, which also
meant a single `*` matched across directories there. Both are fixed; code
that spliced the old separator back together needs no adjustment, but code
comparing against a `\`-separated literal does.
:::

## Working with Multiple Targets {#working-with-multiple-targets}

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

## Parameter Parsing {#parameter-parsing}

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

The flags `run` owns — `--dry-run`, `--watch`, `-o/--output`,
`-c/--config`, `--typescript`, `-p/--param`, the root
`-v`/`-q` — are consumed by the CLI; everything else passes through. Put an
owned flag after `--` to reach the script:
`xec run deploy.js -- --dry-run`.

## Context Isolation {#context-isolation}

Each CLI invocation is its own process, and the globals Xec injects
(`$target`, `$targetInfo`, the utility functions) are restored to their
previous values after the script finishes. Variables your script assigns to
`globalThis` itself are not tracked — in `--watch` mode, where the file is
re-run inside the same process, they survive between runs.

## REPL Context {#repl-context}

When running in REPL mode, additional helpers are available:

```text
// Start REPL
xec run --repl

// In REPL:
> .help           // Show available commands
> .clear          // Clear the console
> await $`ls`     // Execute commands
```

`.help` and `.clear` are Node REPL dot-commands (`replServer.defineCommand`),
not callable functions — they're typed without parentheses.

## Custom Context Extension {#custom-context-extension}

Prefer ordinary module-scoped functions and imports. They preserve ownership and avoid leaking mutable globals between watch runs:

```javascript
// extend-context.js
import { $ } from '@xec-sh/core';

// Application helpers stay local to this module
const utils = {
  /** @param {string[]} targetNames */
  async deployToAll(targetNames) {
    for (const name of targetNames) {
      console.log(`Deploying to ${name}...`);
      await $`xec on ${name} "npm run deploy"`;
    }
  },
  
  /** @param {number} bytes */
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

## Environment Variables {#environment-variables}

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
process.env.API_KEY = 'example-token';
// Use the value in the authenticated operation; never echo it.

// Or use env option
await $`node script.js`.env({ API_KEY: 'secret' });
```

## Best Practices {#best-practices}

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
   const engine = typeof $target === 'undefined' ? $ : $target;
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

## Complete Example {#complete-example}

Here's a comprehensive example using the execution context:

```javascript
// inspect-target.js — run through xec run/on/in.
import { $ } from '@xec-sh/core';
import { prism } from '@xec-sh/kit';

async function inspect() {
  // Selecting a remote target must never silently fall back to local execution.
  if (typeof $target === 'undefined' || typeof $targetInfo === 'undefined') {
    throw new Error('Run this script with xec run, xec on or xec in');
  }
  console.log(prism.blue(`Inspecting ${$targetInfo.type}: ${$targetInfo.name}`));
  const remote = await $target`node --version`;
  const local = await $`${process.execPath} --version`;
  console.log({ targetVersion: remote.stdout.trim(), localVersion: local.stdout.trim() });
}

try {
  await inspect();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
```

Run this script with different targets:

```bash
# Inspect locally
xec run inspect-target.js

# Inspect an SSH server
xec on hosts.production inspect-target.js

# Inspect a Docker container
xec in containers.app inspect-target.js

# Inspect a Kubernetes pod
xec in pods.app inspect-target.js
```
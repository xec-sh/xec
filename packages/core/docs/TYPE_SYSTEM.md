# Xec Type System Documentation

## Overview

The Xec CLI now provides automatic type propagation from `@xec-sh/core` to all xec scripts and commands. This means that any types exported from the core package are automatically available in your scripts without manual updates.

## How It Works

### 1. Automatic Type Re-export

The `apps/xec/src/globals.ts` file now imports ALL exports from `@xec-sh/core` as a namespace:

```typescript
import * as CoreExports from '@xec-sh/core';

declare global {
  namespace Xec {
    export import Core = CoreExports;
  }
}
```

This means:
- **All current types** from `@xec-sh/core` are available
- **All future types** added to core will be automatically available
- No manual updates needed when core types change

### 2. Accessing Types

#### Common Types (Direct Access)

Frequently used types are available directly under the `Xec` namespace:

```typescript
const command: Xec.Command = { ... };
const result: Xec.ExecutionResult = await $`ls`;
const dockerOptions: Xec.DockerOptions = { ... };
```

#### All Core Types (Via Xec.Core)

Any type exported from `@xec-sh/core` is available through `Xec.Core`:

```typescript
// Error types
const error: Xec.Core.CommandError
const dockerError: Xec.Core.DockerError
const timeoutError: Xec.Core.TimeoutError

// Fluent API types
const dockerAPI: Xec.Core.DockerFluentAPI
const redisCluster: Xec.Core.DockerRedisClusterAPI

// Configuration types
const retryOptions: Xec.Core.RetryOptions
const progressOptions: Xec.Core.ProgressOptions

// Utility types
const disposable: Xec.Core.Disposable
const eventFilter: Xec.Core.EventFilter
```

### 3. Using in Command Files

In `.xec/commands/` files, reference the global types:

```typescript
/// <reference path="../../apps/xec/globals.d.ts" />

// Now all Xec types are available
const options: Xec.Core.RedisClusterOptions = {
  masters: 3,
  replicas: 1,
  basePort: 7001
};
```

### 4. Available Namespaces

- **`Xec`** - Main namespace with commonly used types
- **`Xec.Core`** - Complete exports from `@xec-sh/core`

## Examples

### Basic Usage

```typescript
// Command execution
const result: Xec.ExecutionResult = await $`echo "Hello"`;
console.log(result.text());      // trimmed stdout
console.log(result.lines());     // array of lines
console.log(result.toMetadata()); // metadata object
```

### SSH Execution

```typescript
const sshContext: Xec.Core.SSHExecutionContext = $.ssh({
  host: 'example.com',
  username: 'user'
});

const result = await sshContext`ls -la`;
```

### Docker Fluent API

```typescript
const docker: Xec.Core.DockerFluentAPI = $.docker();

// Redis cluster
const cluster = docker.redisCluster({
  masters: 3,
  replicas: 1
});
await cluster.start();

// Ephemeral container
const engine = docker.ephemeral('node:20')
  .withVolume('/app:/app')
  .withEnv({ NODE_ENV: 'production' });
```

### Error Handling

```typescript
try {
  await $`failing-command`;
} catch (error) {
  if (error instanceof Xec.Core.CommandError) {
    console.log(`Exit code: ${error.exitCode}`);
    console.log(`Command: ${error.command}`);
  } else if (error instanceof Xec.Core.TimeoutError) {
    console.log('Command timed out');
  }
}
```

### Parallel Execution

```typescript
const results = await Xec.Core.parallel([
  $`task1`,
  $`task2`,
  $`task3`
]);
```

### Temporary Resources

```typescript
// Temporary directory
await Xec.Core.withTempDir(async (dir) => {
  await $`echo "test" > ${dir}/file.txt`;
});

// Temporary file
await Xec.Core.withTempFile(async (file) => {
  await $`echo "content" > ${file}`;
});
```

## Benefits

1. **No Manual Updates**: Types are automatically synchronized with `@xec-sh/core`
2. **Full Type Safety**: All core types are available with IntelliSense
3. **Future Proof**: New types added to core are immediately available
4. **Clean Organization**: Types are namespaced to avoid pollution
5. **Easy Discovery**: Use `Xec.Core.` to explore all available types

## Migration

If you were previously defining types locally in command files:

```typescript
// OLD: Local type definition
interface RedisClusterOptions {
  masters: number;
  replicas: number;
}

// NEW: Use core types
const options: Xec.Core.RedisClusterOptions = {
  masters: 3,
  replicas: 1
};
```

## Type Discovery

To explore available types:

1. In your IDE, type `Xec.Core.` and use autocomplete
2. Check the [type usage example](./../examples/type-usage.ts)
3. View the core package exports at `packages/core/src/index.ts`

## Troubleshooting

### Types Not Available

If types are not showing up:

1. Rebuild the CLI package: `yarn workspace @xec-sh/cli build`
2. Ensure the reference path is correct: `/// <reference path="../../apps/xec/globals.d.ts" />`
3. Restart your TypeScript language server in your IDE

### Type Conflicts

If you have naming conflicts:

1. Use the full namespace: `Xec.Core.TypeName`
2. Create local type aliases: `type MyCommand = Xec.Command;`

## Summary

The new type system provides automatic, comprehensive access to all `@xec-sh/core` types through the global `Xec` namespace. This eliminates the need for manual type synchronization and ensures your scripts always have access to the latest type definitions from the core package.
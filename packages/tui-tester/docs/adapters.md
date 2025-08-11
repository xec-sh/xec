# Runtime Adapters

Documentation for runtime-specific adapters that enable TUI Tester to work across Node.js, Deno, and Bun.

## Table of Contents

- [Overview](#overview)
- [Adapter Architecture](#adapter-architecture)
- [Node.js Adapter](#nodejs-adapter)
- [Deno Adapter](#deno-adapter)
- [Bun Adapter](#bun-adapter)
- [Custom Adapters](#custom-adapters)
- [Adapter Selection](#adapter-selection)
- [API Reference](#api-reference)

## Overview

Runtime adapters provide a abstraction layer that allows TUI Tester to work seamlessly across different JavaScript runtimes. Each adapter implements platform-specific functionality while maintaining a consistent API.

### Why Adapters?

Different JavaScript runtimes have different APIs for:
- Process execution
- File system operations  
- Environment variables
- Standard I/O streams
- Path handling

Adapters normalize these differences, allowing the same test code to run everywhere.

## Adapter Architecture

```typescript
interface RuntimeAdapter {
  // Process execution
  exec(command: string): Promise<ExecResult>;
  spawn(command: string, args: string[]): Promise<ChildProcess>;
  
  // File system
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, options?: MkdirOptions): Promise<void>;
  
  // Utilities
  sleep(ms: number): Promise<void>;
  commandExists?(command: string): Promise<boolean>;
  tryExec?(command: string): Promise<ExecResult | null>;
}
```

## Node.js Adapter

The Node.js adapter uses built-in Node.js modules.

### Implementation Details

```typescript
import { NodeAdapter } from '@xec-sh/tui-tester/adapters';
```

**Modules Used:**
- `child_process` - Process execution
- `fs/promises` - File operations
- `process` - Environment and cwd
- `util` - Promisify utilities

### Features

- Full process control with `spawn` and `exec`
- Native file system operations
- Environment variable management
- Signal handling
- Stream piping support

### Example Usage

```typescript
// Automatically selected in Node.js environment
const adapter = new NodeAdapter();

// Execute command
const result = await adapter.exec('ls -la');
console.log(result.stdout);

// Spawn process
const proc = adapter.spawn('node', ['app.js']);
proc.on('data', (data) => console.log(data));

// File operations
await adapter.writeFile('test.txt', 'content');
const content = await adapter.readFile('test.txt');
```

### Node-Specific Options

```typescript
const adapter = new NodeAdapter({
  // Custom spawn options
  spawnOptions: {
    shell: true,
    env: { ...process.env, CUSTOM: 'value' }
  },
  
  // Execution timeout
  execTimeout: 30000,
  
  // Buffer size
  maxBuffer: 1024 * 1024 * 10 // 10MB
});
```

## Deno Adapter

The Deno adapter uses Deno's built-in APIs.

### Implementation Details

```typescript
import { DenoAdapter } from '@xec-sh/tui-tester/adapters';
```

**APIs Used:**
- `Deno.Command` - Process execution (Deno 1.31+)
- `Deno.readTextFile` / `Deno.writeTextFile` - File operations
- `Deno.env` - Environment variables
- `Deno.cwd` - Current directory

### Permissions

Deno requires explicit permissions:

```typescript
// Run tests with permissions
// deno test --allow-read --allow-write --allow-run --allow-env

// Or programmatically request
await Deno.permissions.request({ name: "run" });
await Deno.permissions.request({ name: "read" });
await Deno.permissions.request({ name: "write" });
await Deno.permissions.request({ name: "env" });
```

### Example Usage

```typescript
// Automatically selected in Deno environment
const adapter = new DenoAdapter();

// Execute with Deno.Command
const result = await adapter.exec('ls -la');

// File operations with permissions
await adapter.writeFile('test.txt', 'content');

// Environment access
const home = adapter.getEnv('HOME');
```

### Deno-Specific Features

```typescript
const adapter = new DenoAdapter({
  // Permission handling
  permissions: {
    autoRequest: true,  // Auto-request permissions
    fallback: true      // Fallback on permission denied
  },
  
  // Use Deno.run for older versions
  useLegacyRun: false
});
```

### Compatibility

- Deno 1.31+ : Uses `Deno.Command`
- Deno 1.0-1.30 : Falls back to `Deno.run`
- Handles API changes between versions

## Bun Adapter

The Bun adapter leverages Bun's optimized APIs.

### Implementation Details

```typescript
import { BunAdapter } from '@xec-sh/tui-tester/adapters';
```

**APIs Used:**
- `Bun.spawn` - Fast process spawning
- `Bun.file` / `Bun.write` - File operations
- `process` - Node-compatible environment
- `Bun.sleep` - Native sleep function

### Performance Benefits

Bun's native implementations are optimized for speed:

```typescript
const adapter = new BunAdapter();

// Fast process spawning
const proc = adapter.spawn('node', ['script.js']);

// Optimized file I/O
await adapter.writeFile('large.txt', hugeContent); // Very fast

// Native sleep (no setTimeout)
await adapter.sleep(1000);
```

### Bun-Specific Features

```typescript
const adapter = new BunAdapter({
  // Use Bun's shell for better performance
  useShell: true,
  
  // Bun-specific spawn options
  spawnOptions: {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe"
  }
});
```

### Compatibility Mode

Bun can run in Node.js compatibility mode:

```typescript
const adapter = new BunAdapter({
  // Use Node.js APIs instead of Bun APIs
  nodeCompat: true
});
```

## Custom Adapters

Create custom adapters for special environments.

### Base Adapter

Extend the base adapter class:

```typescript
import { BaseAdapter } from '@xec-sh/tui-tester/adapters';

export class CustomAdapter extends BaseAdapter {
  async exec(command: string): Promise<ExecResult> {
    // Custom implementation
    const result = await myCustomExec(command);
    
    return {
      stdout: result.output,
      stderr: result.errors,
      code: result.exitCode
    };
  }
  
  async readFile(path: string): Promise<string> {
    // Custom file reading
    return await myFileSystem.read(path);
  }
  
  // Implement other required methods...
}
```

### Registration

Register custom adapter:

```typescript
import { registerAdapter } from '@xec-sh/tui-tester/adapters';

// Register for automatic selection
registerAdapter('custom', CustomAdapter, {
  // Detection function
  detect: () => {
    return typeof globalThis.myRuntime !== 'undefined';
  },
  
  // Priority (higher = preferred)
  priority: 10
});

// Use the registered adapter by name
setDefaultAdapter('custom');

// Or use directly
const adapter = new CustomAdapter();
setAdapter(adapter);  // Set the adapter instance directly
```

### Mock Adapter

For testing the tester itself:

```typescript
export class MockAdapter extends BaseAdapter {
  private outputs: Map<string, string> = new Map();
  private files: Map<string, string> = new Map();
  
  // Set expected outputs
  setOutput(command: string, output: string): void {
    this.outputs.set(command, output);
  }
  
  async exec(command: string): Promise<ExecResult> {
    const output = this.outputs.get(command) || '';
    
    return {
      stdout: output,
      stderr: '',
      code: 0
    };
  }
  
  async readFile(path: string): Promise<string> {
    if (!this.files.has(path)) {
      throw new Error(`File not found: ${path}`);
    }
    return this.files.get(path)!;
  }
  
  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
}

// Usage in tests
const mockAdapter = new MockAdapter();
mockAdapter.setOutput('tmux capture-pane', 'Mock screen content');

const tester = createTester('app', {
  adapter: mockAdapter
});
```

## Adapter Selection

### Automatic Detection

Adapters are automatically selected based on the runtime:

```typescript
import { getAdapter } from '@xec-sh/tui-tester/adapters';

const adapter = getAdapter();
// Returns NodeAdapter, DenoAdapter, or BunAdapter
```

### Detection Order

1. Check for Deno global
2. Check for Bun global  
3. Check for process.versions.node
4. Fallback to NodeAdapter

### Manual Selection

Override automatic selection:

```typescript
import { NodeAdapter, DenoAdapter, BunAdapter } from '@xec-sh/tui-tester/adapters';

// Force specific adapter
const tester = createTester('app', {
  adapter: new NodeAdapter()
});

// Or set globally
import { setDefaultAdapter } from '@xec-sh/tui-tester/adapters';
setDefaultAdapter('bun');  // Use adapter name, not instance
```

### Environment Variables

Control adapter selection via environment:

```bash
# Force specific adapter
TUI_TESTER_ADAPTER=node npm test
TUI_TESTER_ADAPTER=deno deno test
TUI_TESTER_ADAPTER=bun bun test
```

## API Reference

### ExecResult

```typescript
interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
  signal?: string;
}
```

### ChildProcess

```typescript
interface ChildProcess {
  pid?: number;
  stdin?: Writable;
  stdout?: Readable;
  stderr?: Readable;
  
  on(event: 'data', listener: (data: string) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'close', listener: (code: number) => void): void;
  
  kill(signal?: string): void;
  write(data: string): void;
}
```

### MkdirOptions

```typescript
interface MkdirOptions {
  recursive?: boolean;
  mode?: number;
}
```

### RuntimeAdapter Interface

```typescript
interface RuntimeAdapter {
  // Process execution
  exec(command: string): Promise<ExecResult>;
  spawn(command: string, args: string[]): Promise<ChildProcess>;
  
  // File system
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, options?: MkdirOptions): Promise<void>;
  
  // Utilities
  sleep(ms: number): Promise<void>;
  commandExists?(command: string): Promise<boolean>;
  tryExec?(command: string): Promise<ExecResult | null>;
}
```

## Platform-Specific Considerations

### Path Handling

Different platforms use different path separators:

```typescript
// Adapters handle path normalization
await adapter.readFile('/home/user/file.txt');  // Unix
await adapter.readFile('C:\\Users\\file.txt');  // Windows

// Use path utilities
import { join } from '@xec-sh/tui-tester/utils';
const path = join('dir', 'file.txt');  // Platform-appropriate
```

### Line Endings

Handle different line ending styles:

```typescript
// Adapters normalize line endings
const content = await adapter.readFile('file.txt');
const lines = content.split(/\r?\n/);  // Works everywhere
```

### Shell Differences

Account for different shells:

```typescript
// Specify shell explicitly
const result = await adapter.exec('echo $SHELL', {
  shell: '/bin/bash'  // Use specific shell
});

// Or use shell-agnostic commands
const result = await adapter.exec('node -e "console.log(process.env.SHELL)"');
```

### Signal Handling

Different platforms have different signals:

```typescript
// Use cross-platform signals
process.kill('SIGTERM');  // Works everywhere
process.kill('SIGKILL');  // Works everywhere

// Avoid platform-specific signals
process.kill('SIGUSR1');  // Unix only
```

## Performance Considerations

### Adapter Overhead

Minimal overhead per operation:
- Node.js: ~0.1ms per exec
- Deno: ~0.2ms per exec  
- Bun: ~0.05ms per exec

### Optimization Tips

1. **Reuse Adapters**: Create once, use many times
2. **Batch Operations**: Combine multiple operations
3. **Use Native APIs**: Prefer adapter methods over shell commands
4. **Cache Results**: Cache file reads and command outputs

```typescript
// Good - use adapter methods
const exists = await adapter.exists('file.txt');

// Avoid - shell command for simple check
const result = await adapter.exec('test -f file.txt');
```

## Troubleshooting

### Common Issues

#### Permission Errors (Deno)

```typescript
// Request permissions upfront
if (typeof Deno !== 'undefined') {
  await Deno.permissions.request({ name: "run", command: "tmux" });
}
```

#### Command Not Found

```typescript
// Check command availability
if (adapter.commandExists) {
  const hasTmux = await adapter.commandExists('tmux');
  if (!hasTmux) {
    throw new Error('tmux is required');
  }
}
```

#### Path Resolution

```typescript
// Use absolute paths
import { resolve } from 'path';
const absPath = resolve('relative/path');
await adapter.readFile(absPath);
```
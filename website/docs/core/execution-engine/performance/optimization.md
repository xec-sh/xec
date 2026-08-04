# Performance Optimization

Optimizing Xec execution performance through caching, efficient resource usage, and strategic command execution patterns.

## Overview

Xec itself provides one performance-relevant primitive beyond connection
pooling: per-command result caching (`ProcessPromise.cache()`). Batching,
lazy evaluation, resource cleanup, profiling and dependency scheduling below
are patterns you build yourself on top of `$`, not features the package
ships — the examples show how to build them correctly against the real API,
not an API surface Xec exposes for them.

## Command Caching

### Result Caching

There is no engine-level or `$`-level cache method. Caching is per command,
chained on the `ProcessPromise` before awaiting it:

```typescript
import { $ } from '@xec-sh/core';

// First call executes and caches; the default TTL is 60000ms
await $`git rev-parse HEAD`.cache({ ttl: 60000 });

// A second call with the same command, cwd, env and target returns the
// cached result instead of running again
await $`git rev-parse HEAD`.cache({ ttl: 60000 });

// Cache with an explicit key, so unrelated commands can share an entry
await $`cat package.json | jq .version`.cache({
  key: 'app-version',
  ttl: 300000,  // 5 minutes
});
```

The cache key normally covers the command text, cwd, env and target (host,
container, pod, etc.) so two different hosts never share a cached result;
`key` overrides it outright. `invalidateOn: string[]` names glob-style
patterns matched against other cache keys to evict on a successful run.

### Conditional Caching

```typescript
// Cache based on conditions
class ConditionalCache {
  private cache = new Map<string, any>();
  
  // `key` must be passed explicitly — a ProcessPromise's own .toString()
  // does not describe the command (it resolves to stdout only once
  // awaited, and stringifies the pending promise object until then), so it
  // cannot be used to tell commands apart.
  async execute(command: any, options: {
    key: string;
    cacheIf?: (result: any) => boolean;
    ttl?: number;
  }) {
    const key = options.key;
    
    // Check cache
    if (this.cache.has(key)) {
      const cached = this.cache.get(key);
      if (Date.now() - cached.time < (options.ttl || 60000)) {
        return cached.result;
      }
    }
    
    // Execute
    const result = await command;
    
    // Cache if condition met
    if (!options.cacheIf || options.cacheIf(result)) {
      this.cache.set(key, {
        result,
        time: Date.now()
      });
    }
    
    return result;
  }
}

// Use conditional cache
const cache = new ConditionalCache();
await cache.execute($`expensive-operation`, {
  key: 'expensive-operation',
  cacheIf: (result) => result.exitCode === 0,
  ttl: 120000
});
```

## Resource Pooling

### Process Pooling

```typescript
// Reuse processes for multiple commands
class ProcessPool {
  private pool: any[] = [];
  private available: any[] = [];
  
  constructor(private size: number) {
    for (let i = 0; i < size; i++) {
      const proc = this.createProcess();
      this.pool.push(proc);
      this.available.push(proc);
    }
  }
  
  private createProcess() {
    // Create reusable process
    return spawn('sh', ['-i'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
  }
  
  async execute(command: string): Promise<any> {
    // Get available process
    const proc = this.available.pop() || await this.waitForAvailable();
    
    try {
      // Execute command
      return await this.runCommand(proc, command);
    } finally {
      // Return to pool
      this.available.push(proc);
    }
  }
  
  private async runCommand(proc: any, command: string) {
    return new Promise((resolve, reject) => {
      proc.stdin.write(`${command}\n`);
      proc.stdout.once('data', (data: Buffer) => {
        resolve({ stdout: data.toString() });
      });
    });
  }
  
  private waitForAvailable(): Promise<any> {
    return new Promise(resolve => {
      const check = setInterval(() => {
        if (this.available.length > 0) {
          clearInterval(check);
          resolve(this.available.pop());
        }
      }, 10);
    });
  }
}

// Use process pool
const pool = new ProcessPool(4);
await Promise.all([
  pool.execute('echo 1'),
  pool.execute('echo 2'),
  pool.execute('echo 3'),
  pool.execute('echo 4')
]);
```

### Connection Pooling

SSH connections are pooled automatically — there is no pool object to
create or drain. Reuse comes from calling `$.ssh(...)` with the same target
repeatedly; pool size and idle timeout are adapter-wide settings. See
[Connection Reuse](/docs/core/execution-engine/performance/connection-reuse) for
the full configuration shape:

```typescript
const server1 = $.ssh({ host: 'server1', username: 'deploy' });
const server2 = $.ssh({ host: 'server2', username: 'deploy' });

await server1`command`;
await server2`command`;
```

## Batch Operations

### Command Batching

```typescript
// Batch multiple commands into a single execution. $.exec() runs an
// already-built string through the shell verbatim — unlike the tagged
// template, it does not treat the string as something to escape, so a
// joined `&&` chain runs as a real shell script rather than being escaped
// into one literal (and non-existent) command name.
async function batchCommands(commands: string[]) {
  const batched = commands.join(' && ');
  return await $.exec(batched);
}

// Instead of multiple executions
for (const cmd of commands) {
  await $`${cmd}`;  // N round trips
}

// Use batching
await batchCommands(commands);  // 1 round trip

// Batch with error handling. `.stdin` is a property (the live input
// stream), not a method — write the script to it and end the stream rather
// than calling `.stdin(script)`.
async function safeBatch(commands: string[]) {
  const script = commands
    .map(cmd => `${cmd} || echo "Failed: ${cmd}"`)
    .join('\n');

  const proc = $`bash -e`;
  proc.stdin.write(script);
  proc.stdin.end();
  return await proc;
}
```

### File Operation Batching

```typescript
// Batch file operations
async function batchFileOps(operations: Array<{
  action: 'copy' | 'move' | 'delete';
  source: string;
  dest?: string;
}>) {
  const script = operations.map(op => {
    switch (op.action) {
      case 'copy': return `cp ${op.source} ${op.dest}`;
      case 'move': return `mv ${op.source} ${op.dest}`;
      case 'delete': return `rm ${op.source}`;
    }
  }).join('\n');

  const proc = $`bash`;
  proc.stdin.write(script);
  proc.stdin.end();
  return await proc;
}

// Batch remote operations
const remote = $.ssh('server');
await remote`
  cp file1.txt backup/
  mv file2.txt archive/
  rm temp.txt
  chmod 755 script.sh
`;  // Single SSH session
```

## Lazy Evaluation

### Deferred Execution

```typescript
// Create lazy command chain
class LazyCommand {
  private operations: Array<() => Promise<any>> = [];
  
  add(operation: () => Promise<any>) {
    this.operations.push(operation);
    return this;
  }
  
  async execute() {
    const results = [];
    for (const op of this.operations) {
      results.push(await op());
    }
    return results;
  }
  
  async executeParallel(limit = 5) {
    const results = [];
    const executing = [];
    
    for (const op of this.operations) {
      const promise = op().then(result => {
        executing.splice(executing.indexOf(promise), 1);
        return result;
      });
      
      results.push(promise);
      executing.push(promise);
      
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
    
    return Promise.all(results);
  }
}

// Build lazy pipeline
const lazy = new LazyCommand()
  .add(() => $`fetch-data`)
  .add(() => $`process-data`)
  .add(() => $`save-results`);

// Execute when ready
await lazy.execute();
```

### Conditional Evaluation

```typescript
// Only execute if needed
class ConditionalExecution {
  private conditions = new Map<string, () => boolean>();
  private commands = new Map<string, any>();
  
  register(name: string, condition: () => boolean, command: any) {
    this.conditions.set(name, condition);
    this.commands.set(name, command);
  }
  
  async execute() {
    const results = new Map<string, any>();
    
    for (const [name, condition] of this.conditions) {
      if (condition()) {
        results.set(name, await this.commands.get(name));
      }
    }
    
    return results;
  }
}

// Register conditional commands
const conditional = new ConditionalExecution();
conditional.register(
  'build',
  () => !existsSync('dist'),
  $`npm run build`
);
conditional.register(
  'test',
  () => process.env.RUN_TESTS === 'true',
  $`npm test`
);

await conditional.execute();
```

## Memory Management

### Streaming Large Data

```typescript
// Stream instead of buffering
import { pipeline } from 'stream/promises';

// Bad: Loads entire file in memory
const content = await $`cat huge-file.txt`;

// Good: Stream processing. ProcessPromise has no .stream() method — reach
// the live stdout through `.spawned`, which resolves once the command is
// actually running, and pipe that (a plain Node Readable) instead.
const proc = $`cat huge-file.txt`;
const handle = await proc.spawned;

await pipeline(
  handle.stdout,
  new Transform({
    transform(chunk, encoding, callback) {
      // Process chunk
      callback(null, chunk);
    }
  }),
  createWriteStream('output.txt')
);
await proc;

// Chunked processing
async function processLargeFile(file: string, chunkSize = 1000) {
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const chunk = await $`
      tail -n +${offset + 1} ${file} | head -n ${chunkSize}
    `.text();
    
    if (chunk) {
      await processChunk(chunk);
      offset += chunkSize;
    } else {
      hasMore = false;
    }
  }
}
```

### Resource Cleanup

```typescript
// Ensure resource cleanup
class ResourceManager {
  private resources: Array<{ name: string; cleanup: () => Promise<void> }> = [];
  
  register(name: string, cleanup: () => Promise<void>) {
    this.resources.push({ name, cleanup });
  }
  
  async cleanup() {
    for (const resource of this.resources) {
      try {
        await resource.cleanup();
        console.log(`Cleaned up: ${resource.name}`);
      } catch (error) {
        console.error(`Failed to clean up ${resource.name}:`, error);
      }
    }
    this.resources = [];
  }
}

// Use with commands
const resources = new ResourceManager();

try {
  const tempFile = await $`mktemp`.text();
  resources.register('temp-file', () => $`rm -f ${tempFile}`);
  
  const proc = $`long-running-process`;
  resources.register('process', async () => proc.kill());
  
  // Do work
  await proc;
} finally {
  await resources.cleanup();
}
```

## Profiling and Monitoring

### Performance Profiling

```typescript
// Profile command execution
class PerformanceProfiler {
  private metrics: any[] = [];
  
  async profile(name: string, command: any) {
    const start = process.hrtime.bigint();
    const startMemory = process.memoryUsage();
    
    try {
      const result = await command;
      
      const end = process.hrtime.bigint();
      const endMemory = process.memoryUsage();
      
      this.metrics.push({
        name,
        duration: Number(end - start) / 1e6,  // Convert to ms
        memory: {
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          external: endMemory.external - startMemory.external
        },
        success: true
      });
      
      return result;
    } catch (error) {
      const end = process.hrtime.bigint();
      
      this.metrics.push({
        name,
        duration: Number(end - start) / 1e6,
        success: false,
        error: error.message
      });
      
      throw error;
    }
  }
  
  getReport() {
    const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0);
    const avgDuration = totalDuration / this.metrics.length;
    
    return {
      totalCommands: this.metrics.length,
      totalDuration,
      averageDuration: avgDuration,
      slowest: this.metrics.sort((a, b) => b.duration - a.duration)[0],
      failures: this.metrics.filter(m => !m.success)
    };
  }
}

// Profile execution
const profiler = new PerformanceProfiler();

await profiler.profile('fetch', $`git fetch`);
await profiler.profile('build', $`npm run build`);
await profiler.profile('test', $`npm test`);

console.log(profiler.getReport());
```

### Resource Monitoring

```typescript
// Monitor resource usage
class ResourceMonitor {
  private interval: NodeJS.Timer;
  private samples: any[] = [];
  
  start(intervalMs = 1000) {
    this.interval = setInterval(() => {
      const usage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      this.samples.push({
        timestamp: Date.now(),
        memory: usage,
        cpu: cpuUsage
      });
    }, intervalMs);
  }
  
  stop() {
    clearInterval(this.interval);
  }
  
  getStats() {
    const memoryPeak = Math.max(...this.samples.map(s => s.memory.heapUsed));
    const avgMemory = this.samples.reduce((sum, s) => sum + s.memory.heapUsed, 0) / this.samples.length;
    
    return {
      samples: this.samples.length,
      memoryPeak,
      averageMemory: avgMemory,
      timeline: this.samples
    };
  }
}

// Monitor during execution
const monitor = new ResourceMonitor();
monitor.start();

try {
  await $`heavy-operation`;
} finally {
  monitor.stop();
  console.log(monitor.getStats());
}
```

## Optimization Strategies

### Parallel vs Sequential

```typescript
// Analyze dependencies for optimal execution
class DependencyOptimizer {
  private tasks = new Map<string, {
    command: any;
    dependencies: string[];
  }>();
  
  addTask(name: string, command: any, dependencies: string[] = []) {
    this.tasks.set(name, { command, dependencies });
  }
  
  async execute() {
    const completed = new Set<string>();
    const executing = new Map<string, Promise<any>>();
    
    const canExecute = (name: string) => {
      const task = this.tasks.get(name)!;
      return task.dependencies.every(dep => completed.has(dep));
    };
    
    while (completed.size < this.tasks.size) {
      // Find tasks that can execute
      const ready = Array.from(this.tasks.keys())
        .filter(name => !completed.has(name) && !executing.has(name) && canExecute(name));
      
      // Execute in parallel
      for (const name of ready) {
        const task = this.tasks.get(name)!;
        const promise = task.command.then((result: any) => {
          completed.add(name);
          executing.delete(name);
          return result;
        });
        executing.set(name, promise);
      }
      
      // Wait for at least one to complete
      if (executing.size > 0) {
        await Promise.race(executing.values());
      }
    }
  }
}

// Optimize execution order
const optimizer = new DependencyOptimizer();
optimizer.addTask('fetch', $`git fetch`);
optimizer.addTask('install', $`npm install`, ['fetch']);
optimizer.addTask('build', $`npm run build`, ['install']);
optimizer.addTask('test', $`npm test`, ['build']);
optimizer.addTask('lint', $`npm run lint`, ['install']);  // Can run parallel with build

await optimizer.execute();
```

## Best Practices

### Do's ✅

```typescript
// ✅ Cache expensive operations
const gitHash = await $`git rev-parse HEAD`.cache({ key: 'git-hash' });

// ✅ Reuse a target instead of re-resolving it — pooling is automatic
const server = $.ssh({ host: 'server', username: 'deploy' });
await server`command`;

// ✅ Batch operations
await $`
  command1
  command2
  command3
`;

// ✅ Stream large data straight to a destination
await $`cat large.txt`.pipe(output);

// ✅ Profile performance-critical code
const profiled = await profiler.profile('critical', $`important-command`);
```

### Don'ts ❌

```typescript
// ❌ Don't create unnecessary processes
for (let i = 0; i < 1000; i++) {
  await $`echo ${i}`;  // 1000 processes!
}

// ❌ Don't buffer large outputs
const huge = await $`cat 10gb-file.txt`;  // OOM risk

// ❌ Don't ignore connection limits
const connections = [];
for (let i = 0; i < 100; i++) {
  connections.push($.ssh('server'));  // Too many connections
}

// ❌ Don't skip cleanup
const temp = await $`mktemp`;
// Missing cleanup
```

## Implementation Details

`ProcessPromise.cache()` is implemented in:
- `packages/core/src/utils/cache.ts` - the result cache and key generation
- `packages/core/src/core/process-context.ts` - where `.cache()` is wired into `ProcessPromise`

There is no dedicated resource-pooling or profiling module — connection
pooling lives in the SSH adapter (see
[Connection Reuse](/docs/core/execution-engine/performance/connection-reuse)),
and profiling is left to the host application, as shown above.

## See Also

- [Connection Reuse](/docs/core/execution-engine/performance/connection-reuse)
- [Parallel Execution](/docs/core/execution-engine/performance/parallel-execution)
- [Connection Pooling](/docs/core/execution-engine/features/connection-pooling)
- [Streaming](/docs/core/execution-engine/features/streaming)
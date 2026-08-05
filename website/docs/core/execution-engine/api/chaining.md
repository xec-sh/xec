---
title: Chaining
description: Fluent method chaining on the execution engine
---

# Chaining

Method chaining enables fluent, readable command composition by linking multiple operations together in a single expression.

## Overview

Chaining support (`packages/core/src/core/process-context.ts`) provides:

- **Fluent interface** for readable code
- **Immutable operations** preventing side effects
- **Type-safe chaining** with IntelliSense
- **Conditional chaining** based on runtime values
- **Pipeline composition** for complex flows
- **Error propagation** through the chain

## Basic Chaining

### Method Chaining

```typescript
import { $ } from '@xec-sh/core';

// Chain multiple methods
await $`command`
  .cwd('/app')
  .env({ NODE_ENV: 'production' })
  .timeout(10000)
  .quiet();

// Each method returns a new instance
const base = $`npm install`;
const production = base.env({ NODE_ENV: 'production' });
const development = base.env({ NODE_ENV: 'development' });
```

There is no `.retry()` on `ProcessPromise` — retry configures the engine,
not an already-created command, because it has to wrap `execute()` to retry
the whole run. Apply it before the template tag: `` $.retry({ maxRetries: 3 })`command` ``.

### Configuration Chaining

```typescript
// Build complex configurations. maxBuffer isn't a ProcessPromise method —
// set it on the engine with .with() before the template tag runs. There is
// no process-priority control (no .nice()).
const result = await $.with({ maxBuffer: 50 * 1024 * 1024 })`build.sh`
  .cwd('/project')
  .env({
    NODE_ENV: 'production',
    API_URL: 'https://api.example.com'
  })
  .timeout(60000)
  .shell('/bin/bash')
  .nothrow();
```

## Pipe Chaining

### Command Pipes

```typescript
// Pipe commands together
await $`cat data.json`
  .pipe($`jq '.items[]'`)
  .pipe($`grep "active"`)
  .pipe($`sort`)
  .pipe($`uniq -c`);

// Store intermediate results
const filtered = $`cat large-file.txt`
  .pipe($`grep ERROR`);

const sorted = filtered
  .pipe($`sort -k2`);

const result = await sorted
  .pipe($`head -100`);
```

### Cross-Environment Pipes

```typescript
// Pipe across different adapters
await $.ssh('server')`cat remote-file.txt`
  .pipe($.docker({ container: 'processor' })`python process.py`)
  .pipe($`gzip > output.gz`);

// Complex pipeline
await $.k8s('pod')`kubectl logs -f`
  .pipe($`grep ERROR`)
  .pipe($.ssh('log-server')`cat >> /var/log/errors.log`);
```

## Stream Chaining

### Output Stream Chains

`.stdout(stream)` takes a single `Writable` — calling it more than once
doesn't build a pipeline, it just replaces the previous target, and the
earlier streams never receive anything. To route output through several
transforms, pipe the Node streams together yourself first, then hand the
head of that chain to one `.stdout()` call:

```typescript
import { Transform } from 'stream';

const uppercase = new Transform({
  transform(chunk, encoding, callback) {
    callback(null, chunk.toString().toUpperCase());
  }
});

const addTimestamp = new Transform({
  transform(chunk, encoding, callback) {
    const timestamp = new Date().toISOString();
    callback(null, `[${timestamp}] ${chunk}`);
  }
});

uppercase.pipe(addTimestamp).pipe(process.stdout);
await $`tail -f app.log`.stdout(uppercase);
```

### Handling Both Streams

There is no `.on()` on `ProcessPromise`, and `.stdout()`/`.stderr()` don't
accept a per-line callback — only `'pipe' | 'ignore' | 'inherit'` or a
`Writable`. To observe stdout and stderr separately as they arrive, read the
live streams off the running process handle instead:

```typescript
const proc = $`npm test`;
const handle = await proc.spawned;
handle.stdout?.on('data', (chunk) => console.log(`✓ ${chunk}`));
handle.stderr?.on('data', (chunk) => console.error(`✗ ${chunk}`));
const result = await proc;
console.log(`Exit: ${result.exitCode}`);
```

## Conditional Chaining

### Runtime Conditions

```typescript
// Conditional method application
const command = $`deploy.sh`;

const configured = isProduction
  ? command.env({ NODE_ENV: 'production' }).timeout(300000)
  : command.env({ NODE_ENV: 'development' }).timeout(60000);

await configured;

// Chain with conditionals
function buildCommand(options: any) {
  let cmd = $`build`;
  
  if (options.verbose) cmd = cmd.env({ VERBOSE: '1' });
  if (options.debug) cmd = cmd.env({ DEBUG: '1' });
  if (options.timeout) cmd = cmd.timeout(options.timeout);
  
  return cmd;
}
```

### Dynamic Chaining

```typescript
// Build chain dynamically
class CommandBuilder {
  private command: any;
  
  constructor(base: string) {
    this.command = $`${base}`;
  }
  
  addEnv(key: string, value: string) {
    this.command = this.command.env({ [key]: value });
    return this;
  }
  
  addTimeout(ms: number) {
    this.command = this.command.timeout(ms);
    return this;
  }
  
  when(condition: boolean, modifier: (cmd: any) => any) {
    if (condition) {
      this.command = modifier(this.command);
    }
    return this;
  }
  
  async execute() {
    return await this.command;
  }
}

// Usage
const builder = new CommandBuilder('npm run build')
  .addEnv('NODE_ENV', 'production')
  .when(useCache, cmd => cmd.env({ USE_CACHE: '1' }))
  .when(verbose, cmd => cmd.env({ VERBOSE: '1' }))
  .addTimeout(60000);

await builder.execute();
```

## Error Chain Handling

### Error Recovery Chains

```typescript
// Chain error handlers
await $`primary-command`
  .catch(() => $`fallback-command`)
  .catch(() => $`emergency-command`)
  .catch(() => {
    console.error('All commands failed');
    process.exit(1);
  });

// With specific error handling — retry configures the engine, so it's
// applied before the template tag rather than chained after it
await $.retry({ maxRetries: 3 })`risky-operation`
  .timeout(5000)
  .nothrow()
  .then(result => {
    if (!result.ok) {
      return $`recovery-operation`;
    }
    return result;
  });
```

### Try-Chain Pattern

```typescript
// Try multiple approaches
async function executeWithFallbacks(target: string) {
  const attempts = [
    () => $.ssh(target)`command`,
    () => $.docker({ container: target })`command`,
    () => $`command`
  ];
  
  for (const attempt of attempts) {
    const result = await attempt().nothrow();
    if (result.ok) return result;
  }
  
  throw new Error('All attempts failed');
}
```

## Transformation Chains

### Output Transformations

```typescript
// Chain output transformations
const result = await $`cat data.json`
  .json()                    // Parse as JSON
  .then(data => data.items)  // Extract items
  .then(items => items.filter(i => i.active))  // Filter
  .then(items => items.map(i => i.name));      // Map

console.log(result);  // Array of names

// Text transformations
const lines = await $`cat file.txt`
  .text()                    // Get as text
  .then(text => text.trim()) // Trim whitespace
  .then(text => text.split('\n'))  // Split lines
  .then(lines => lines.filter(Boolean));  // Remove empty
```

### Data Processing Chains

```typescript
// Process data through chain
const pipeline = $`generate-csv`
  .pipe($`csvtojson`)
  .json()
  .then(data => data.map(transformRecord))
  .then(data => data.filter(validateRecord))
  .then(data => JSON.stringify(data, null, 2));

const processed = await pipeline;
await $`echo '${processed}' > output.json`;
```

## Composition Patterns

### Builder Pattern

```typescript
class ExecutionBuilder {
  private steps: Array<(cmd: any) => any> = [];
  
  cwd(path: string) {
    this.steps.push(cmd => cmd.cwd(path));
    return this;
  }
  
  env(vars: Record<string, string>) {
    this.steps.push(cmd => cmd.env(vars));
    return this;
  }
  
  timeout(ms: number) {
    this.steps.push(cmd => cmd.timeout(ms));
    return this;
  }
  
  build(command: string) {
    let cmd = $`${command}`;
    for (const step of this.steps) {
      cmd = step(cmd);
    }
    return cmd;
  }
}

// Usage
const builder = new ExecutionBuilder()
  .cwd('/app')
  .env({ NODE_ENV: 'production' })
  .timeout(10000);

const command = builder.build('npm start');
await command;
```

### Pipeline Builder

```typescript
class Pipeline {
  private commands: any[] = [];
  
  add(command: any) {
    this.commands.push(command);
    return this;
  }
  
  async execute() {
    let result = null;
    
    for (let i = 0; i < this.commands.length; i++) {
      if (i === 0) {
        result = this.commands[i];
      } else {
        result = result.pipe(this.commands[i]);
      }
    }
    
    return await result;
  }
}

// Usage
const pipeline = new Pipeline()
  .add($`cat data.txt`)
  .add($`sort`)
  .add($`uniq`);

await pipeline.execute();
```

## Async Chain Operations

### Promise Chains

```typescript
// Chain with async operations
await $`fetch-data`
  .then(async (result) => {
    await saveToDatabase(result.stdout);
    return result;
  })
  .then(async (result) => {
    await notifyUsers(result);
    return result;
  })
  .finally(() => {
    console.log('Pipeline complete');
  });
```

### Sequential Execution

```typescript
// Execute commands sequentially
const commands = ['cmd1', 'cmd2', 'cmd3'];

const results = await commands.reduce(
  async (prevPromise, cmd) => {
    const prev = await prevPromise;
    const result = await $`${cmd}`;
    return [...prev, result];
  },
  Promise.resolve([])
);
```

## Advanced Chaining

### Middleware Pattern

Middleware here has to operate on the *engine*, not on an already-created
`ProcessPromise` — `.retry()` in particular only exists on the engine, since
it wraps `execute()` to retry the whole run:

```typescript
class CommandMiddleware {
  private middlewares: Array<(engine: any) => any> = [];
  
  use(middleware: (engine: any) => any) {
    this.middlewares.push(middleware);
    return this;
  }
  
  apply(engine: any) {
    return this.middlewares.reduce(
      (e, middleware) => middleware(e),
      engine
    );
  }
}

// Usage
const middleware = new CommandMiddleware()
  .use(engine => engine.timeout(10000))
  .use(engine => engine.retry({ maxRetries: 3 }))
  .use(engine => engine.env({ LOG_LEVEL: 'debug' }));

await middleware.apply($)`deploy`;
```

### Decorator Pattern

There is no `.on()` on `ProcessPromise` — a command has no per-instance
event hooks. Decorate the act of running it instead, by wrapping a thunk
rather than the `ProcessPromise` itself:

```typescript
// Decorate commands with additional behavior
async function withLogging<T>(run: () => Promise<T>): Promise<T> {
  console.log('Starting...');
  const result = await run();
  console.log('Complete');
  return result;
}

function withTiming<T>(run: () => Promise<T>): () => Promise<T> {
  return async () => {
    const start = Date.now();
    try {
      return await run();
    } finally {
      console.log(`Took ${Date.now() - start}ms`);
    }
  };
}

// Apply decorators
const decorated = withTiming(() => withLogging(() => $`long-operation`));
await decorated();
```

## Best Practices

### Do's ✅

```typescript
// ✅ Build chains progressively — retry is conditional on the engine,
// since it has to be in place before the template tag runs; timeout is
// conditional on the resulting ProcessPromise
let engine = $;
if (needsRetry) engine = engine.retry({ maxRetries: 3 });
let command = engine`base-command`;
if (needsTimeout) command = command.timeout(5000);
await command;

// ✅ Use immutable chaining
const base = $`npm install`;
const prod = base.env({ NODE_ENV: 'production' });
const dev = base.env({ NODE_ENV: 'development' });

// ✅ Handle errors in chains
await $.retry({ maxRetries: 3 })`risky`
  .timeout(5000)
  .catch(() => $`fallback`);

// ✅ Keep chains readable
await $`command`
  .cwd('/app')
  .env({ KEY: 'value' })
  .timeout(10000);
```

### Don'ts ❌

```typescript
// ❌ Don't create overly long chains
await $`cmd`.method1().method2().method3().method4().method5().method6();

// ❌ Don't mutate shared commands
const shared = $`command`;
shared.env({ VAR: '1' });  // This returns new instance
await shared;  // Original, not modified

// ❌ Don't mix sync and async inappropriately
const result = $`command`.then(r => r.stdout);  // Returns Promise
console.log(result);  // Promise, not value

// ❌ Don't ignore chain return values
$`command`.timeout(5000);  // Return value ignored
await $`command`;  // No timeout applied
```

## Implementation Details

Chaining is implemented in:
- `packages/core/src/core/process-context.ts` - `ProcessPromise` construction and its chainable methods
- `packages/core/src/core/execution-engine.ts` - Engine-level chaining methods (`.with()`, `.retry()`, `.env()`, ...)
- `packages/core/src/core/pipe-implementation.ts` - `.pipe()`

## See Also

- [Execution API](/docs/core/execution-engine/api/execution-api)
- [Composition](/docs/core/execution-engine/api/composition)
- [Streaming](/docs/core/execution-engine/features/streaming)
- [Error Handling](/docs/core/execution-engine/features/error-handling)
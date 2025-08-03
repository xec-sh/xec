# Chaining

Method chaining enables fluent, readable command composition by linking multiple operations together in a single expression.

## Overview

Chaining support (`packages/core/src/core/command-builder.ts`) provides:

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
  .retry(3)
  .quiet();

// Each method returns a new instance
const base = $`npm install`;
const production = base.env({ NODE_ENV: 'production' });
const development = base.env({ NODE_ENV: 'development' });
```

### Configuration Chaining

```typescript
// Build complex configurations
const result = await $`build.sh`
  .cwd('/project')
  .env({
    NODE_ENV: 'production',
    API_URL: 'https://api.example.com'
  })
  .timeout(60000)
  .maxBuffer(50 * 1024 * 1024)
  .shell('/bin/bash')
  .nice(10)
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
  .pipe($.docker('processor')`python process.py`)
  .pipe($`gzip > output.gz`);

// Complex pipeline
await $.k8s('pod')`kubectl logs -f`
  .pipe($`grep ERROR`)
  .pipe($.ssh('log-server')`cat >> /var/log/errors.log`);
```

## Stream Chaining

### Output Stream Chains

```typescript
import { Transform } from 'stream';

// Chain stream transformations
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

await $`tail -f app.log`
  .stdout(uppercase)
  .stdout(addTimestamp)
  .stdout(process.stdout);
```

### Multi-Stream Chains

```typescript
// Handle multiple streams
await $`npm test`
  .stdout((line) => console.log(`✓ ${line}`))
  .stderr((line) => console.error(`✗ ${line}`))
  .on('exit', (code) => console.log(`Exit: ${code}`));

// Split and process
const splitter = new Transform({/* ... */});
await $`generate-data`
  .stdout(splitter)
  .stdout(fileStream)
  .stdout(networkStream);
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

// With specific error handling
await $`risky-operation`
  .retry(3)
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
    () => $.docker(target)`command`,
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

```typescript
class CommandMiddleware {
  private middlewares: Array<(cmd: any) => any> = [];
  
  use(middleware: (cmd: any) => any) {
    this.middlewares.push(middleware);
    return this;
  }
  
  apply(command: any) {
    return this.middlewares.reduce(
      (cmd, middleware) => middleware(cmd),
      command
    );
  }
}

// Usage
const middleware = new CommandMiddleware()
  .use(cmd => cmd.timeout(10000))
  .use(cmd => cmd.retry(3))
  .use(cmd => cmd.env({ LOG_LEVEL: 'debug' }));

const command = middleware.apply($`deploy`);
await command;
```

### Decorator Pattern

```typescript
// Decorate commands with additional behavior
function withLogging(command: any) {
  return command
    .on('start', () => console.log('Starting...'))
    .on('output', (data: any) => console.log('Output:', data))
    .on('complete', () => console.log('Complete'));
}

function withTiming(command: any) {
  const start = Date.now();
  return command.on('complete', () => {
    console.log(`Took ${Date.now() - start}ms`);
  });
}

// Apply decorators
const decorated = withTiming(withLogging($`long-operation`));
await decorated;
```

## Best Practices

### Do's ✅

```typescript
// ✅ Build chains progressively
let command = $`base-command`;
if (needsTimeout) command = command.timeout(5000);
if (needsRetry) command = command.retry(3);
await command;

// ✅ Use immutable chaining
const base = $`npm install`;
const prod = base.env({ NODE_ENV: 'production' });
const dev = base.env({ NODE_ENV: 'development' });

// ✅ Handle errors in chains
await $`risky`
  .retry(3)
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
- `packages/core/src/core/command-builder.ts` - Chain building logic
- `packages/core/src/core/fluent-interface.ts` - Fluent API design
- `packages/core/src/utils/pipeline.ts` - Pipeline composition
- `packages/core/src/core/method-chain.ts` - Method chaining

## See Also

- [Execution API](/docs/core/execution-engine/api/execution-api)
- [Composition](/docs/core/execution-engine/api/composition)
- [Streaming](/docs/core/execution-engine/features/streaming)
- [Error Handling](/docs/core/execution-engine/features/error-handling)
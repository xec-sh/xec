# Composition

Composition enables building complex execution workflows by combining simple, reusable components into sophisticated automation patterns.

## Overview

Composition support (`packages/core/src/core/composition.ts`) provides:

- **Function composition** for reusable logic
- **Pipeline composition** for data flow
- **Parallel composition** for concurrent execution
- **Sequential composition** for ordered operations
- **Conditional composition** based on runtime state
- **Higher-order functions** for advanced patterns

## Function Composition

### Basic Composition

```typescript
import { $ } from '@xec-sh/core';

// Compose simple functions
const withProduction = (cmd: any) => cmd.env({ NODE_ENV: 'production' });
const withTimeout = (cmd: any) => cmd.timeout(10000);
const withRetry = (cmd: any) => cmd.retry(3);

// Apply compositions
const command = withRetry(withTimeout(withProduction($`npm start`)));
await command;

// Using compose utility
function compose(...fns: Function[]) {
  return (x: any) => fns.reduceRight((v, f) => f(v), x);
}

const enhance = compose(withRetry, withTimeout, withProduction);
await enhance($`npm start`);
```

### Command Factories

```typescript
// Create reusable command factories
function createBuildCommand(env: string) {
  return $`npm run build`
    .env({ NODE_ENV: env })
    .timeout(60000)
    .cwd('/app');
}

// Use factories
await createBuildCommand('production');
await createBuildCommand('staging');

// Parameterized factories
function createDeployCommand(options: {
  environment: string;
  region: string;
  version: string;
}) {
  return $`deploy.sh`
    .env({
      ENVIRONMENT: options.environment,
      AWS_REGION: options.region,
      VERSION: options.version
    })
    .timeout(300000);
}
```

## Pipeline Composition

### Linear Pipelines

```typescript
// Create processing pipeline
async function processPipeline(input: string) {
  return await $`echo "${input}"`
    .pipe($`tr '[:lower:]' '[:upper:]'`)
    .pipe($`sort`)
    .pipe($`uniq`);
}

// Compose pipeline functions
const pipeline = [
  (data: string) => $`echo "${data}"`,
  () => $`jq '.items[]'`,
  () => $`grep "active"`,
  () => $`wc -l`
];

async function runPipeline(input: string) {
  let result = await pipeline[0](input);
  for (let i = 1; i < pipeline.length; i++) {
    result = result.pipe(pipeline[i]());
  }
  return result;
}
```

### Branching Pipelines

```typescript
// Pipeline with branches
async function branchingPipeline(data: string) {
  const base = $`echo "${data}"`;
  
  // Branch 1: Process as JSON
  const jsonBranch = base
    .pipe($`jq '.'`)
    .json();
  
  // Branch 2: Process as text
  const textBranch = base
    .pipe($`wc -w`)
    .text();
  
  // Combine results
  const [json, wordCount] = await Promise.all([jsonBranch, textBranch]);
  
  return {
    data: json,
    words: parseInt(wordCount)
  };
}
```

## Parallel Composition

### Concurrent Execution

```typescript
// Parallel command execution
async function parallelDeploy(servers: string[]) {
  const deployments = servers.map(server =>
    $.ssh(server)`deploy.sh`
      .timeout(60000)
      .nothrow()
  );
  
  const results = await Promise.all(deployments);
  
  return results.map((result, index) => ({
    server: servers[index],
    success: result.ok,
    output: result.stdout
  }));
}

// With concurrency control
import pLimit from 'p-limit';

async function limitedParallel(commands: string[], limit: number) {
  const limiter = pLimit(limit);
  
  return Promise.all(
    commands.map(cmd =>
      limiter(() => $`${cmd}`.nothrow())
    )
  );
}
```

### Fan-out/Fan-in

```typescript
// Fan-out: distribute work
async function fanOut(data: any[], processor: string) {
  const chunks = chunkArray(data, 10);
  
  const processes = chunks.map(chunk =>
    $`echo '${JSON.stringify(chunk)}' | ${processor}`
  );
  
  return Promise.all(processes);
}

// Fan-in: collect results
async function fanIn(results: any[]) {
  const combined = results.flat();
  const json = JSON.stringify(combined);
  
  return await $`echo '${json}' | jq '.[] | sort_by(.timestamp)'`;
}

// Complete fan-out/fan-in
async function mapReduce(data: any[]) {
  const mapped = await fanOut(data, 'mapper.py');
  const reduced = await fanIn(mapped);
  return reduced;
}
```

## Sequential Composition

### Ordered Operations

```typescript
// Sequential workflow
class SequentialWorkflow {
  private steps: Array<() => Promise<any>> = [];
  
  addStep(name: string, command: any) {
    this.steps.push(async () => {
      console.log(`Starting: ${name}`);
      const result = await command;
      console.log(`Completed: ${name}`);
      return result;
    });
    return this;
  }
  
  async execute() {
    const results = [];
    for (const step of this.steps) {
      results.push(await step());
    }
    return results;
  }
}

// Usage
const workflow = new SequentialWorkflow()
  .addStep('Install', $`npm install`)
  .addStep('Build', $`npm run build`)
  .addStep('Test', $`npm test`)
  .addStep('Deploy', $`npm run deploy`);

await workflow.execute();
```

### Dependent Operations

```typescript
// Operations with dependencies
async function dependentOperations() {
  // Step 1: Get configuration
  const config = await $`cat config.json`.json();
  
  // Step 2: Use config for setup
  const setup = await $`setup.sh`
    .env({
      DB_HOST: config.database.host,
      DB_PORT: config.database.port
    });
  
  // Step 3: Run migrations if setup succeeded
  if (setup.exitCode === 0) {
    await $`migrate.sh`.env({ DB_URL: config.database.url });
  }
  
  // Step 4: Start application
  return await $`npm start`.env({ PORT: config.server.port });
}
```

## Conditional Composition

### Runtime Branching

```typescript
// Conditional execution paths
async function conditionalWorkflow(options: any) {
  const commands = [];
  
  // Always run
  commands.push($`git pull`);
  
  // Conditional steps
  if (options.install) {
    commands.push($`npm install`);
  }
  
  if (options.build) {
    commands.push($`npm run build`);
  }
  
  if (options.test) {
    commands.push($`npm test`);
  }
  
  if (options.deploy && options.environment) {
    commands.push(
      $`deploy.sh`.env({ ENV: options.environment })
    );
  }
  
  // Execute sequentially
  for (const cmd of commands) {
    await cmd;
  }
}
```

### Strategy Pattern

```typescript
// Different execution strategies
interface ExecutionStrategy {
  execute(command: string): Promise<any>;
}

class LocalStrategy implements ExecutionStrategy {
  async execute(command: string) {
    return await $`${command}`;
  }
}

class RemoteStrategy implements ExecutionStrategy {
  constructor(private host: string) {}
  
  async execute(command: string) {
    return await $.ssh(this.host)`${command}`;
  }
}

class DockerStrategy implements ExecutionStrategy {
  constructor(private container: string) {}
  
  async execute(command: string) {
    return await $.docker(this.container)`${command}`;
  }
}

// Context using strategy
class ExecutionContext {
  constructor(private strategy: ExecutionStrategy) {}
  
  setStrategy(strategy: ExecutionStrategy) {
    this.strategy = strategy;
  }
  
  async run(command: string) {
    return await this.strategy.execute(command);
  }
}

// Usage
const context = new ExecutionContext(new LocalStrategy());
await context.run('echo "local"');

context.setStrategy(new RemoteStrategy('server.com'));
await context.run('echo "remote"');
```

## Higher-Order Compositions

### Command Decorators

```typescript
// Higher-order function for timing
function withTiming<T>(name: string) {
  return async (command: Promise<T>): Promise<T> => {
    const start = Date.now();
    try {
      const result = await command;
      console.log(`${name} took ${Date.now() - start}ms`);
      return result;
    } catch (error) {
      console.log(`${name} failed after ${Date.now() - start}ms`);
      throw error;
    }
  };
}

// Usage
await withTiming('Build')($`npm run build`);

// Multiple decorators
function withLogging<T>(command: Promise<T>): Promise<T> {
  console.log('Executing command...');
  return command.then(result => {
    console.log('Command completed');
    return result;
  });
}

function withRetryOnFail<T>(attempts: number) {
  return async (command: () => Promise<T>): Promise<T> => {
    for (let i = 0; i < attempts; i++) {
      try {
        return await command();
      } catch (error) {
        if (i === attempts - 1) throw error;
        console.log(`Attempt ${i + 1} failed, retrying...`);
      }
    }
    throw new Error('Should not reach here');
  };
}
```

### Monadic Composition

```typescript
// Result monad for composition
class Result<T> {
  constructor(
    public ok: boolean,
    public value?: T,
    public error?: Error
  ) {}
  
  static success<T>(value: T): Result<T> {
    return new Result(true, value);
  }
  
  static failure<T>(error: Error): Result<T> {
    return new Result<T>(false, undefined, error);
  }
  
  map<U>(fn: (value: T) => U): Result<U> {
    if (this.ok && this.value !== undefined) {
      return Result.success(fn(this.value));
    }
    return Result.failure<U>(this.error!);
  }
  
  flatMap<U>(fn: (value: T) => Result<U>): Result<U> {
    if (this.ok && this.value !== undefined) {
      return fn(this.value);
    }
    return Result.failure<U>(this.error!);
  }
}

// Use with commands
async function safeExecute(command: any): Promise<Result<any>> {
  const result = await command.nothrow();
  if (result.ok) {
    return Result.success(result);
  }
  return Result.failure(new Error(result.stderr));
}

// Compose with Result
const result = await safeExecute($`cat config.json`)
  .then(r => r.map(res => JSON.parse(res.stdout)))
  .then(r => r.map(config => config.database))
  .then(r => r.map(db => db.connectionString));
```

## Workflow Composition

### Complex Workflows

```typescript
// Composable workflow builder
class Workflow {
  private tasks: Map<string, Task> = new Map();
  
  addTask(name: string, command: any, dependencies: string[] = []) {
    this.tasks.set(name, { name, command, dependencies });
    return this;
  }
  
  async execute() {
    const executed = new Set<string>();
    const results = new Map<string, any>();
    
    const executeTask = async (name: string) => {
      if (executed.has(name)) return results.get(name);
      
      const task = this.tasks.get(name)!;
      
      // Execute dependencies first
      for (const dep of task.dependencies) {
        await executeTask(dep);
      }
      
      // Execute task
      const result = await task.command;
      executed.add(name);
      results.set(name, result);
      
      return result;
    };
    
    // Execute all tasks
    for (const [name] of this.tasks) {
      await executeTask(name);
    }
    
    return results;
  }
}

// Build complex workflow
const workflow = new Workflow()
  .addTask('fetch', $`git pull`)
  .addTask('install', $`npm install`, ['fetch'])
  .addTask('build', $`npm run build`, ['install'])
  .addTask('test', $`npm test`, ['build'])
  .addTask('deploy', $`deploy.sh`, ['test']);\n\nawait workflow.execute();
```

## Best Practices

### Do's ✅

```typescript
// ✅ Keep compositions simple and focused
const withDefaults = (cmd: any) => 
  cmd.timeout(10000).retry(3);

// ✅ Use composition for reusability
const productionCommand = compose(
  withProductionEnv,
  withTimeout,
  withRetry
);

// ✅ Handle errors in compositions
async function safeCompose(...commands: any[]) {
  for (const cmd of commands) {
    const result = await cmd.nothrow();
    if (!result.ok) return result;
  }
}

// ✅ Document composition behavior
/**
 * Executes deployment with retries and notifications
 */
async function deployWithNotifications() {
  // Implementation
}
```

### Don'ts ❌

```typescript
// ❌ Don't over-compose
const overComposed = compose(
  fn1, fn2, fn3, fn4, fn5, fn6, fn7, fn8
);  // Too complex

// ❌ Don't hide side effects
function sneakyCompose(cmd: any) {
  // Unexpected side effect
  fs.writeFileSync('log.txt', 'executed');
  return cmd;
}

// ❌ Don't create circular dependencies
const task1 = { deps: ['task2'] };
const task2 = { deps: ['task1'] };  // Circular!

// ❌ Don't ignore composition errors
await compose(cmd1, cmd2, cmd3);  // No error handling
```

## Implementation Details

Composition is implemented in:
- `packages/core/src/core/composition.ts` - Composition utilities
- `packages/core/src/utils/functional.ts` - Functional helpers
- `packages/core/src/patterns/workflow.ts` - Workflow patterns
- `packages/core/src/patterns/pipeline.ts` - Pipeline composition

## See Also

- [Execution API](/docs/core/execution-engine/api/execution-api)
- [Chaining](/docs/core/execution-engine/api/chaining)
- [Parallel Execution](/docs/core/execution-engine/performance/parallel-execution)
- [Error Handling](/docs/core/execution-engine/features/error-handling)
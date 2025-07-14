# 06. API Reference

## Table of Contents

1. [Core API](#core-api)
2. [DSL API](#dsl-api)
3. [Context API](#context-api)
4. [Module API](#module-api)
5. [State API](#state-api)
6. [Pattern API](#pattern-api)
7. [CLI API](#cli-api)
8. [Integration API](#integration-api)
9. [Testing API](#testing-api)
10. [Utilities API](#utilities-api)

## Core API

### Task

#### `task(name?: string): TaskBuilder`

Creates a new task builder.

```typescript
const myTask = task('deploy-app')
  .description('Deploy application to production')
  .run(async ({ $ }) => {
    await $`docker pull myapp:latest`;
    await $`docker run -d myapp:latest`;
  })
  .build();
```

#### TaskBuilder Methods

##### `.name(name: string): TaskBuilder`
Sets the task name.

##### `.description(desc: string): TaskBuilder`
Sets the task description.

##### `.vars(variables: Variables): TaskBuilder`
Defines task variables with validation.

```typescript
.vars({
  version: { type: 'string', required: true },
  replicas: { type: 'number', default: 3, min: 1, max: 10 }
})
```

##### `.run(handler: TaskHandler): TaskBuilder`
Sets the task execution handler.

```typescript
type TaskHandler = (context: TaskContext) => Promise<any>;
```

##### `.retry(options: RetryOptions): TaskBuilder`
Configures retry behavior.

```typescript
.retry({
  attempts: 3,
  delay: 1000,        // Initial delay in ms
  backoff: 'exponential', // 'linear' | 'exponential'
  maxDelay: 30000     // Maximum delay between retries
})
```

##### `.timeout(ms: number): TaskBuilder`
Sets execution timeout.

##### `.when(condition: Condition): TaskBuilder`
Sets conditional execution.

```typescript
.when(ctx => ctx.vars.environment === 'production')
.when('{{ environment == "production" }}') // Template syntax
```

##### `.unless(condition: Condition): TaskBuilder`
Inverse of `.when()`.

##### `.dependsOn(...tasks: string[]): TaskBuilder`
Declares task dependencies.

##### `.tags(...tags: string[]): TaskBuilder`
Adds tags for categorization.

##### `.host(selector: HostSelector): TaskBuilder`
Specifies target host(s).

```typescript
.host('web-*')                           // Pattern matching
.host(['web1', 'web2'])                  // Specific hosts
.host(h => h.tags.includes('production')) // Function selector
```

##### `.parallel(): TaskBuilder`
Enables parallel execution on multiple hosts.

##### `.ignoreErrors(): TaskBuilder`
Continue execution even if task fails.

##### `.onError(handler: ErrorHandler): TaskBuilder`
Custom error handling.

```typescript
.onError(async (error, ctx) => {
  ctx.logger.error(`Task failed: ${error.message}`);
  // Return true to continue, false to stop
  return true;
})
```

##### `.before(hook: Hook): TaskBuilder`
Adds pre-execution hook.

##### `.after(hook: Hook): TaskBuilder`
Adds post-execution hook.

##### `.build(): Task`
Builds and returns the task.

### Recipe

#### `recipe(name: string): RecipeBuilder`

Creates a new recipe builder.

```typescript
const deployment = recipe('deploy-application')
  .version('1.0.0')
  .description('Full application deployment')
  .vars({
    environment: { type: 'string', required: true }
  })
  .task('backup', backupTask)
  .task('deploy', deployTask)
  .build();
```

#### RecipeBuilder Methods

##### `.version(version: string): RecipeBuilder`
Sets recipe version (semver).

##### `.description(desc: string): RecipeBuilder`
Sets recipe description.

##### `.vars(variables: Variables): RecipeBuilder`
Defines recipe variables.

##### `.task(name: string, task: Task | TaskBuilder): RecipeBuilder`
Adds a task to the recipe.

```typescript
// With Task instance
.task('deploy', deployTask)

// With inline builder
.task('deploy', task()
  .run(async ({ $ }) => {
    await $`npm run deploy`;
  })
)
```

##### `.phase(name: string, phase: Phase | PhaseBuilder): RecipeBuilder`
Adds an execution phase.

```typescript
.phase('prepare', phase()
  .description('Preparation phase')
  .parallel()
  .task('backup', backupTask)
  .task('validate', validateTask)
)
```

##### `.before(hook: Hook): RecipeBuilder`
Adds recipe-level pre-execution hook.

##### `.after(hook: Hook): RecipeBuilder`
Adds recipe-level post-execution hook.

##### `.onError(handler: ErrorHandler): RecipeBuilder`
Recipe-level error handling.

##### `.finally(hook: Hook): RecipeBuilder`
Always executed, regardless of success/failure.

##### `.hosts(selector: HostSelector): RecipeBuilder`
Default hosts for all tasks.

##### `.tags(...tags: string[]): RecipeBuilder`
Recipe tags for organization.

##### `.use(module: Module | string): RecipeBuilder`
Import and use a module.

```typescript
.use(nginxModule)
.use('@xec-community/aws')
```

##### `.build(): Recipe`
Builds and returns the recipe.

### Phase

#### `phase(name?: string): PhaseBuilder`

Creates a new phase builder.

```typescript
const prepPhase = phase('preparation')
  .description('Prepare environment')
  .parallel()
  .task('clean', cleanTask)
  .task('backup', backupTask)
  .build();
```

#### PhaseBuilder Methods

##### `.name(name: string): PhaseBuilder`
Sets phase name.

##### `.description(desc: string): PhaseBuilder`
Sets phase description.

##### `.parallel(): PhaseBuilder`
Execute tasks in parallel.

##### `.sequential(): PhaseBuilder`
Execute tasks sequentially (default).

##### `.task(name: string, task: Task): PhaseBuilder`
Adds task to phase.

##### `.continueOnError(): PhaseBuilder`
Continue to next phase even if this fails.

##### `.build(): Phase`
Builds and returns the phase.

## DSL API

### Task Creation Helpers

#### `shell(command: string | TemplateStringsArray, ...values: any[]): Task`

Quick shell command task.

```typescript
const update = shell`apt-get update && apt-get upgrade -y`;

// With interpolation
const deploy = shell`docker run -d ${imageName}:${version}`;
```

#### `script(path: string, args?: string[]): Task`

Execute external script.

```typescript
const migrate = script('./scripts/migrate.sh', ['--version', '2.0']);
```

#### `parallel(...tasks: Task[]): Task`

Combine tasks for parallel execution.

```typescript
const setup = parallel(
  shell`npm install`,
  shell`pip install -r requirements.txt`,
  shell`bundle install`
);
```

#### `sequence(...tasks: Task[]): Task`

Sequential task execution.

```typescript
const deploy = sequence(
  task('stop-service', stopTask),
  task('update-code', updateTask),
  task('start-service', startTask)
);
```

#### `group(name: string, tasks: Task[]): Task`

Group related tasks.

```typescript
const databases = group('database-setup', [
  task('postgres', setupPostgres),
  task('redis', setupRedis),
  task('elasticsearch', setupElastic)
]);
```

#### `noop(): Task`

No-operation task (useful for conditionals).

```typescript
const maybeTask = condition ? actualTask : noop();
```

#### `wait(ms: number): Task`

Delay execution.

```typescript
const delayed = sequence(
  deployTask,
  wait(5000),  // Wait 5 seconds
  healthCheck
);
```

## Context API

### Global Context Functions

These functions are available globally within task handlers via `context/globals`.

#### State Management

##### `setState(key: string, value: any): void`
Store value in execution state.

```typescript
setState('deployment_id', generateId());
```

##### `getState<T>(key: string): T | undefined`
Retrieve value from state.

```typescript
const deploymentId = getState<string>('deployment_id');
```

##### `hasState(key: string): boolean`
Check if state key exists.

##### `deleteState(key: string): boolean`
Remove state entry.

##### `clearState(): void`
Clear all state.

#### Variable Management

##### `getVar(name: string): any`
Get variable value (checks local, global, and secrets).

```typescript
const version = getVar('app_version');
```

##### `setVar(name: string, value: any, scope?: 'local' | 'global'): void`
Set variable value.

```typescript
setVar('build_number', 123, 'global');
```

##### `getVars(): Record<string, any>`
Get all available variables.

#### Logging

##### `log(message: string, level?: LogLevel): void`
Log message with optional level.

```typescript
log('Deployment starting');
log('Warning: Using default config', 'warn');
```

##### `debug(message: string): void`
Log debug message.

##### `info(message: string): void`
Log info message.

##### `warn(message: string): void`
Log warning message.

##### `error(message: string): void`
Log error message.

#### Execution Info

##### `isDryRun(): boolean`
Check if running in dry-run mode.

```typescript
if (isDryRun()) {
  log('DRY RUN: Would deploy here');
  return;
}
```

##### `isVerbose(): boolean`
Check if verbose mode enabled.

##### `getRunId(): string`
Get current run ID.

##### `getRecipeId(): string`
Get current recipe ID.

##### `getTaskId(): string`
Get current task ID.

##### `getPhase(): string | undefined`
Get current phase name.

##### `getAttempt(): number`
Get current retry attempt number.

##### `getHost(): Host | undefined`
Get current target host.

#### Host Management

##### `getHosts(): Host[]`
Get all available hosts.

##### `matchesHost(selector: HostSelector): boolean`
Check if current host matches selector.

```typescript
if (matchesHost('prod-*')) {
  // Production-specific logic
}
```

##### `matchesTags(...tags: string[]): boolean`
Check if current host has all specified tags.

```typescript
if (matchesTags('web', 'production')) {
  // Web production servers
}
```

#### Environment & Secrets

##### `env(name: string, defaultValue?: string): string`
Get environment variable.

```typescript
const apiUrl = env('API_URL', 'http://localhost:3000');
```

##### `secret(name: string): string`
Get secret value (throws if not found).

```typescript
const apiKey = secret('API_KEY');
```

#### Control Flow

##### `fail(message: string): never`
Fail task with message.

```typescript
if (!isValid) {
  fail('Validation failed');
}
```

##### `skip(reason?: string): never`
Skip task execution.

```typescript
if (alreadyDeployed) {
  skip('Already deployed');
}
```

#### Helpers

##### `registerHelper(name: string, fn: Function): void`
Register global helper function.

```typescript
registerHelper('formatDate', (date: Date) => {
  return date.toISOString().split('T')[0];
});
```

##### `getHelper(name: string): Function`
Get registered helper.

```typescript
const formatDate = getHelper('formatDate');
```

##### `template(str: string, data?: any): string`
Process template string.

```typescript
const message = template('Deploying {{app}} v{{version}}', {
  app: 'myapp',
  version: '2.0.0'
});
```

##### `when(condition: any): boolean`
Evaluate condition (supports multiple formats).

```typescript
if (when('{{ environment == "production" }}')) {
  // Production only
}
```

##### `unless(condition: any): boolean`
Inverse of when.

##### `retry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>`
Retry function with backoff.

```typescript
const result = await retry(
  () => httpClient.get('/api/health'),
  { attempts: 3, delay: 1000 }
);
```

### TaskContext Interface

Available as parameter in task handlers.

```typescript
interface TaskContext {
  // Task identification
  taskId: string;
  
  // Variables (local to task)
  vars: Record<string, any>;
  
  // Current host (if applicable)
  host?: Host;
  
  // Current phase (if applicable)
  phase?: string;
  
  // Retry attempt number (starts at 1)
  attempt: number;
  
  // Logger instance
  logger: Logger;
  
  // Execution engine (from ush)
  $: CallableExecutionEngine;
}
```

Usage in task handler:

```typescript
task('example')
  .run(async (ctx) => {
    // Access context properties
    ctx.logger.info(`Running on ${ctx.host?.name || 'local'}`);
    
    // Execute commands
    await ctx.$`echo "Hello from ${ctx.vars.name}"`;
    
    // Check attempt
    if (ctx.attempt > 1) {
      ctx.logger.warn(`Retry attempt ${ctx.attempt}`);
    }
  })
```

## Module API

### Module Interface

```typescript
interface Module {
  name: string;
  version: string;
  description?: string;
  exports: ModuleExports;
  dependencies?: string[];
  peerDependencies?: string[];
  setup?: (context: SetupContext) => Promise<void> | void;
  teardown?: (context: TeardownContext) => Promise<void> | void;
  config?: ModuleConfig;
}

interface ModuleExports {
  tasks?: Record<string, Task>;
  recipes?: Record<string, Recipe>;
  helpers?: Record<string, Helper>;
  patterns?: Record<string, Pattern>;
  integrations?: Record<string, Integration>;
}
```

### Creating a Module

```typescript
export const myModule: Module = {
  name: 'my-module',
  version: '1.0.0',
  description: 'My custom module',
  
  exports: {
    tasks: {
      install: task('install')
        .description('Install dependencies')
        .run(async ({ $ }) => {
          await $`npm install`;
        })
        .build(),
        
      test: task('test')
        .description('Run tests')
        .run(async ({ $ }) => {
          await $`npm test`;
        })
        .build()
    },
    
    recipes: {
      setup: recipe('setup')
        .task('install', 'my-module.install')
        .task('test', 'my-module.test')
        .build()
    },
    
    helpers: {
      isInstalled: async (pkg: string) => {
        try {
          await $`npm list ${pkg}`;
          return true;
        } catch {
          return false;
        }
      }
    }
  },
  
  setup: async (ctx) => {
    ctx.logger.info('Module initialized');
  }
};
```

### Module Registry API

#### `registerModule(module: Module): void`

Register a module with the system.

```typescript
const registry = new ModuleRegistry();
registry.registerModule(myModule);
```

#### `getModule(name: string): Module | undefined`

Get registered module by name.

#### `hasModule(name: string): boolean`

Check if module is registered.

#### `listModules(): Module[]`

Get all registered modules.

#### `resolveTask(path: string): Task | undefined`

Resolve task by module path.

```typescript
const task = registry.resolveTask('my-module.install');
```

## State API

### StateManager

#### `new StateManager(options?: StateOptions)`

Create state manager instance.

```typescript
const state = new StateManager({
  backend: 'memory', // 'memory' | 'file' | 'sqlite'
  persist: true,
  encryption: true
});
```

#### State Operations

##### `.get<T>(key: string): Promise<T | undefined>`
Get state value.

##### `.set(key: string, value: any): Promise<void>`
Set state value.

##### `.delete(key: string): Promise<boolean>`
Delete state entry.

##### `.has(key: string): Promise<boolean>`
Check if key exists.

##### `.clear(): Promise<void>`
Clear all state.

##### `.keys(pattern?: string): Promise<string[]>`
List keys matching pattern.

##### `.transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>`
Execute transactional operations.

```typescript
const result = await state.transaction(async (tx) => {
  const count = await tx.get('counter') || 0;
  await tx.set('counter', count + 1);
  await tx.set('last_update', Date.now());
  return count + 1;
});
```

### EventStore

#### Event Operations

##### `.append(event: Event): Promise<void>`
Append event to store.

```typescript
await eventStore.append({
  id: generateId(),
  type: 'TASK_COMPLETED',
  timestamp: Date.now(),
  actor: 'system',
  resource: 'task:deploy',
  action: 'complete',
  payload: { duration: 1234 }
});
```

##### `.getEvents(filter?: EventFilter): Promise<Event[]>`
Query events.

```typescript
const events = await eventStore.getEvents({
  type: 'TASK_*',
  from: Date.now() - 3600000, // Last hour
  resource: 'task:deploy'
});
```

##### `.subscribe(handler: EventHandler): Subscription`
Subscribe to live events.

```typescript
const subscription = eventStore.subscribe((event) => {
  console.log('Event:', event.type, event.resource);
});

// Later
subscription.unsubscribe();
```

### Ledger

#### `.record(entry: LedgerEntry): Promise<void>`
Record ledger entry.

#### `.verify(entryId: string): Promise<boolean>`
Verify entry integrity.

#### `.getHistory(resource: string, options?: HistoryOptions): Promise<LedgerEntry[]>`
Get resource history.

## Pattern API

### Deployment Patterns

#### BlueGreenPattern

```typescript
const blueGreen = new BlueGreenPattern({
  service: 'web-app',
  healthCheckUrl: 'http://localhost:3000/health',
  switchStrategy: 'dns', // 'dns' | 'loadbalancer' | 'proxy'
  
  deploy: async ({ color, hosts }) => {
    // Deploy to specified color environment
    await deployToHosts(hosts, { env: color });
  },
  
  validate: async ({ color, hosts }) => {
    // Validate deployment
    for (const host of hosts) {
      const healthy = await checkHealth(host);
      if (!healthy) return false;
    }
    return true;
  },
  
  switch: async ({ from, to }) => {
    // Switch traffic
    await updateDNS(to);
  },
  
  rollback: async ({ color }) => {
    // Rollback if needed
    await updateDNS(color === 'blue' ? 'green' : 'blue');
  }
});

// Execute pattern
const result = await blueGreen.execute();
```

#### CanaryPattern

```typescript
const canary = new CanaryPattern({
  service: 'api',
  version: '2.0.0',
  
  stages: [
    { percentage: 10, duration: 300000 },    // 10% for 5 min
    { percentage: 50, duration: 600000 },    // 50% for 10 min
    { percentage: 100 }                      // 100% (final)
  ],
  
  deploy: async ({ version, percentage }) => {
    const replicas = Math.ceil(totalReplicas * percentage / 100);
    await scaleDeployment(`api-${version}`, replicas);
  },
  
  validate: async ({ metrics }) => {
    return metrics.errorRate < 0.01 && 
           metrics.p99Latency < 200;
  },
  
  rollback: async () => {
    await scaleDeployment('api-2.0.0', 0);
    await scaleDeployment('api-1.0.0', totalReplicas);
  }
});

const result = await canary.execute();
```

#### RollingUpdatePattern

```typescript
const rolling = new RollingUpdatePattern({
  hosts: inventory.tagged('web'),
  batchSize: 2,
  pauseBetween: 30000, // 30 seconds
  
  update: async (host) => {
    await runTask('update-host', { host });
  },
  
  validate: async (host) => {
    return await checkHealth(host);
  },
  
  rollback: async (host) => {
    await runTask('rollback-host', { host });
  }
});

const result = await rolling.execute();
```

### Workflow Patterns

#### CircuitBreakerPattern

```typescript
const breaker = new CircuitBreakerPattern({
  timeout: 5000,
  errorThreshold: 5,
  resetTimeout: 60000,
  
  execute: async () => {
    return await riskyOperation();
  },
  
  fallback: async () => {
    return cachedResult();
  }
});

try {
  const result = await breaker.call();
} catch (error) {
  if (error instanceof CircuitOpenError) {
    console.log('Circuit is open, using fallback');
  }
}
```

## CLI API

### Command Interface

```typescript
interface Command {
  name: string;
  description: string;
  arguments: Argument[];
  options: Option[];
  action: (args: any, options: any) => Promise<void>;
  examples?: Example[];
}
```

### Built-in Commands

#### `run`
Execute a recipe or task.

```bash
xec run deploy --vars version=2.0.0 --env production
```

Options:
- `--vars, -v`: Set variables (key=value)
- `--env, -e`: Set environment
- `--hosts, -h`: Override hosts
- `--dry-run`: Simulate execution
- `--verbose`: Verbose output
- `--parallel`: Max parallel tasks

#### `list`
List available recipes and tasks.

```bash
xec list
xec list --tags deployment
xec list --module nginx
```

#### `show`
Show details about recipe or task.

```bash
xec show deploy
xec show nginx.install
```

#### `exec`
Execute ad-hoc command.

```bash
xec exec "ls -la" --hosts web1,web2
xec exec "docker ps" --tags production
```

#### `repl`
Start interactive REPL.

```bash
xec repl
> await $`ls -la`
> setState('test', 123)
> getState('test')
```

## Integration API

### Base Integration Interface

```typescript
interface Integration {
  name: string;
  connect(config: any): Promise<void>;
  disconnect(): Promise<void>;
  execute(operation: any): Promise<any>;
  validate?(config: any): ValidationResult;
}
```

### Ush Integration

```typescript
interface UshIntegration extends Integration {
  createEngine(options?: EngineOptions): CallableExecutionEngine;
  ssh(config: SSHConfig): CallableExecutionEngine;
  docker(config: DockerConfig): CallableExecutionEngine;
  local(): CallableExecutionEngine;
}
```

### Kubernetes Integration

```typescript
interface K8sIntegration extends Integration {
  apply(manifest: any): Promise<void>;
  delete(resource: string): Promise<void>;
  get(resource: string): Promise<any>;
  scale(deployment: string, replicas: number): Promise<void>;
  rollout(deployment: string, options?: RolloutOptions): Promise<void>;
}
```

### Terraform Integration

```typescript
interface TerraformIntegration extends Integration {
  init(options?: InitOptions): Promise<void>;
  plan(options?: PlanOptions): Promise<PlanResult>;
  apply(options?: ApplyOptions): Promise<ApplyResult>;
  destroy(options?: DestroyOptions): Promise<void>;
  output(name?: string): Promise<any>;
}
```

## Testing API

### Mock Utilities

#### `mockTask(overrides?: Partial<Task>): Task`

Create mock task for testing.

```typescript
const task = mockTask({
  name: 'test-task',
  handler: async () => 'mock result'
});
```

#### `mockContext(overrides?: Partial<TaskContext>): TaskContext`

Create mock context.

```typescript
const ctx = mockContext({
  vars: { test: true },
  dryRun: true
});
```

#### `mockExecutionEngine(responses?: Map<string, any>): CallableExecutionEngine`

Create mock execution engine.

```typescript
const $ = mockExecutionEngine(new Map([
  ['ls -la', { stdout: 'file1.txt\nfile2.txt', exitCode: 0 }],
  ['cat file1.txt', { stdout: 'content', exitCode: 0 }]
]));
```

### Test Helpers

#### `runTask(task: Task, context?: Partial<TaskContext>): Promise<TaskResult>`

Run task in test environment.

```typescript
const result = await runTask(myTask, {
  vars: { environment: 'test' }
});

expect(result.success).toBe(true);
```

#### `runRecipe(recipe: Recipe, options?: ExecutionOptions): Promise<ExecutionResult>`

Run recipe in test environment.

```typescript
const result = await runRecipe(deployment, {
  vars: { version: '2.0.0' },
  dryRun: true
});

expect(result.tasksCompleted).toBe(3);
```

## Utilities API

### Logger

#### `createLogger(options?: LoggerOptions): Logger`

Create logger instance.

```typescript
const logger = createLogger({
  level: 'debug',
  format: 'json',
  transports: [
    new ConsoleTransport(),
    new FileTransport({ path: 'xec.log' })
  ]
});
```

#### Logger Methods

- `.debug(message: string, meta?: any): void`
- `.info(message: string, meta?: any): void`
- `.warn(message: string, meta?: any): void`
- `.error(message: string, meta?: any): void`
- `.child(meta: any): Logger` - Create child logger

### Validation

#### `validate(value: any, schema: Schema): ValidationResult`

Validate value against schema.

```typescript
const result = validate(userInput, {
  type: 'object',
  properties: {
    name: { type: 'string', required: true },
    age: { type: 'number', min: 0, max: 120 }
  }
});

if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

### Template Engine

#### `renderTemplate(template: string, data: any): string`

Render template string.

```typescript
const output = renderTemplate(
  'Hello {{name}}, you have {{count}} messages',
  { name: 'John', count: 5 }
);
// "Hello John, you have 5 messages"
```

#### Template Functions

- `{{variable}}` - Variable interpolation
- `{{#if condition}}...{{/if}}` - Conditional
- `{{#each array}}...{{/each}}` - Iteration
- `{{#with object}}...{{/with}}` - Context change
- `{{> partial}}` - Partial inclusion

### Error Utilities

#### `isXecError(error: any): error is XecError`

Type guard for Xec errors.

#### `wrapError(error: Error, code: string, details?: any): XecError`

Wrap error with additional context.

```typescript
try {
  await riskyOperation();
} catch (error) {
  throw wrapError(error, 'OPERATION_FAILED', {
    operation: 'risky',
    timestamp: Date.now()
  });
}
```

### Async Utilities

#### `timeout<T>(promise: Promise<T>, ms: number): Promise<T>`

Add timeout to promise.

```typescript
try {
  const result = await timeout(longRunningOperation(), 5000);
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log('Operation timed out');
  }
}
```

#### `retry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>`

Retry async operation.

```typescript
const result = await retry(
  () => httpClient.get('/api/data'),
  {
    attempts: 3,
    delay: 1000,
    backoff: 'exponential'
  }
);
```

#### `parallel<T>(tasks: Array<() => Promise<T>>, limit?: number): Promise<T[]>`

Run tasks in parallel with concurrency limit.

```typescript
const results = await parallel(
  urls.map(url => () => fetch(url)),
  5 // Max 5 concurrent requests
);
```

## Type Definitions

### Common Types

```typescript
// Variable definition
interface Variable {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  default?: any;
  description?: string;
  // Type-specific validations
  pattern?: RegExp;        // string
  enum?: any[];           // any type
  min?: number;           // number
  max?: number;           // number
  items?: Variable;       // array
  properties?: Record<string, Variable>; // object
}

// Host definition
interface Host {
  id: string;
  name: string;
  address: string;
  port?: number;
  username?: string;
  password?: string;
  privateKey?: string;
  tags: string[];
  vars: Record<string, any>;
  metadata?: Record<string, any>;
}

// Retry configuration
interface RetryOptions {
  attempts?: number;
  delay?: number;
  backoff?: 'linear' | 'exponential';
  maxDelay?: number;
  factor?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

// Execution options
interface ExecutionOptions {
  vars?: Record<string, any>;
  hosts?: Host[] | HostSelector;
  dryRun?: boolean;
  verbose?: boolean;
  parallel?: number;
  continueOnError?: boolean;
  timeout?: number;
}

// Validation result
interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
  warnings?: ValidationWarning[];
}
```

## Error Reference

### Error Hierarchy

```typescript
XecError
├── TaskError         // Task execution failures
├── ValidationError   // Input validation failures
├── ExecutionError    // Recipe execution failures
├── StateError       // State management errors
├── ModuleError      // Module loading/execution errors
├── NetworkError     // Network-related errors
├── TimeoutError     // Operation timeouts
├── AuthError        // Authentication/authorization
└── ConfigError      // Configuration errors
```

### Error Codes

| Code | Description |
|------|-------------|
| `TASK_FAILED` | Task execution failed |
| `VALIDATION_FAILED` | Input validation failed |
| `DEPENDENCY_MISSING` | Required dependency not found |
| `TIMEOUT` | Operation timed out |
| `CONNECTION_FAILED` | Network connection failed |
| `AUTH_FAILED` | Authentication failed |
| `PERMISSION_DENIED` | Insufficient permissions |
| `MODULE_NOT_FOUND` | Module could not be loaded |
| `STATE_CORRUPTED` | State integrity check failed |
| `CIRCUIT_OPEN` | Circuit breaker is open |
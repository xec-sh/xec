# 03. Xec Core Architecture

## Architecture Overview

Xec Core is built on a modular, layered architecture where each layer has clear responsibilities and provides a specific level of abstraction.

## Architectural Layers

```
┌─────────────────────────────────────────────────────┐
│                   User Code                         │
│         (Recipes, Tasks, Custom Modules)            │
├─────────────────────────────────────────────────────┤
│                    CLI Layer                        │
│         (Commands, Parser, Output, REPL)            │
├─────────────────────────────────────────────────────┤
│                    DSL Layer                        │
│      (Recipe Builder, Task Builder, Patterns)       │
├─────────────────────────────────────────────────────┤
│                  Core Abstractions                  │
│        (Types, Interfaces, Base Classes)            │
├─────────────────────────────────────────────────────┤
│                 Execution Engine                    │
│      (Scheduler, Executor, Phase Builder)           │
├─────────────────────────────────────────────────────┤
│                  Context System                     │
│        (Provider, Builder, Global Access)           │
├─────────────────────────────────────────────────────┤
│                  Module System                      │
│    (Registry, Loader, Helpers, Integrations)        │
├─────────────────────────────────────────────────────┤
│                 State Management                    │
│      (Event Store, State Store, Ledger)             │
├─────────────────────────────────────────────────────┤
│              Integration Adapters                   │
│      (UshAdapter, K8sAdapter, TerraformAdapter)    │
├─────────────────────────────────────────────────────┤
│                  @xec/ush                      │
│         (Command Execution Engine)                  │
└─────────────────────────────────────────────────────┘
```

## Detailed Layer Description

### 1. User Code Layer

The topmost layer where users write their recipes and tasks.

```typescript
// Example user code
const deploy = recipe('deploy-app')
  .vars({ version: { required: true } })
  .task('backup', backupTask)
  .task('deploy', deployTask)
  .build();
```

**Characteristics:**
- Declarative style
- Uses DSL for workflow definition
- Can import and use modules
- Full access to TypeScript/JavaScript

### 2. CLI Layer

Provides command-line interface for interacting with the system.

```typescript
// packages/core/src/cli/
├── command.ts      // Base command class
├── parser.ts       // Argument parser
├── runner.ts       // Command runner
├── output.ts       // Output formatting
├── prompt.ts       // Interactive prompts
└── completion.ts   // Autocompletion
```

**Commands:**
- `xec run <recipe>` - run recipe
- `xec list` - list available recipes
- `xec task <task>` - run individual task
- `xec repl` - interactive mode

### 3. DSL Layer

Provides convenient API for creating recipes and tasks.

```typescript
// Task Builder
export class TaskBuilder {
  name(name: string): this
  description(desc: string): this
  vars(vars: Variables): this
  run(handler: TaskHandler): this
  retry(options: RetryOptions): this
  timeout(ms: number): this
  when(condition: Condition): this
  build(): Task
}

// Recipe Builder
export class RecipeBuilder {
  name(name: string): this
  version(version: string): this
  description(desc: string): this
  vars(vars: Variables): this
  task(name: string, task: Task): this
  phase(name: string, phase: Phase): this
  before(hook: Hook): this
  after(hook: Hook): this
  build(): Recipe
}
```

**DSL Patterns:**
- Fluent Interface for chain calls
- Type-safe builders
- Validation at build time

### 4. Core Abstractions Layer

Defines core types and interfaces of the system.

```typescript
// Core interfaces
interface Task {
  id: string;
  name: string;
  handler: TaskHandler;
  options: TaskOptions;
}

interface Recipe {
  id: string;
  name: string;
  tasks: Map<string, Task>;
  phases: Map<string, Phase>;
  vars: Variables;
}

interface Module {
  name: string;
  version: string;
  exports: ModuleExports;
}
```

**Principles:**
- Minimal interfaces
- Extensibility through composition
- Strict typing

### 5. Execution Engine Layer

Responsible for planning and executing tasks.

```typescript
// Scheduler - plans execution order
class TaskScheduler {
  schedule(recipe: Recipe): ExecutionPlan
  resolveDependencies(tasks: Task[]): Phase[]
  detectCycles(dependencies: Map<string, string[]>): boolean
}

// Executor - executes the plan
class RecipeExecutor {
  execute(plan: ExecutionPlan): Promise<ExecutionResult>
  executePhase(phase: Phase): Promise<PhaseResult>
  executeTask(task: Task, context: Context): Promise<TaskResult>
}

// Phase Builder - groups tasks into phases
class PhaseBuilder {
  build(tasks: Task[]): Phase[]
  optimize(phases: Phase[]): Phase[]
}
```

**Capabilities:**
- Parallel execution of independent tasks
- Dependency handling
- Retry and error handling
- Progress tracking

### 6. Context System Layer

Manages execution context through AsyncLocalStorage.

```typescript
// Context Provider
class ContextProvider {
  private storage = new AsyncLocalStorage<ExecutionContext>();
  
  run<T>(context: ExecutionContext, fn: () => T): T {
    return this.storage.run(context, fn);
  }
  
  get current(): ExecutionContext | undefined {
    return this.storage.getStore();
  }
}

// Global functions for context access
export function getVar(name: string): any {
  return contextProvider.current?.vars[name];
}

export function setState(key: string, value: any): void {
  contextProvider.current?.state.set(key, value);
}
```

**Advantages:**
- No need to explicitly pass context
- Isolation between parallel executions
- Clean API

### 7. Module System Layer

Provides modularity and extensibility.

```typescript
// Module Registry
class ModuleRegistry {
  private modules = new Map<string, Module>();
  
  register(module: Module): void
  resolve(path: string): ModuleExport
  load(name: string): Promise<Module>
}

// Helper Registry - for global functions
class HelperRegistry {
  register(name: string, helper: Helper): void
  get(name: string): Helper
}

// Integration Registry - for external integrations
class IntegrationRegistry {
  register(name: string, adapter: IntegrationAdapter): void
  get(name: string): IntegrationAdapter
}
```

**Module types:**
- Core modules (built-in)
- Standard library modules
- Community modules (npm)
- Private modules

### 8. State Management Layer

Manages execution state and persistence.

```typescript
// Event Store - stores all events
class EventStore {
  append(event: Event): Promise<void>
  getEvents(filter: EventFilter): AsyncIterator<Event>
  subscribe(handler: EventHandler): Subscription
}

// State Store - materialized views
class StateStore {
  get(key: string): Promise<any>
  set(key: string, value: any): Promise<void>
  query(filter: StateFilter): Promise<StateEntry[]>
}

// Ledger - immutable history
class Ledger {
  record(entry: LedgerEntry): Promise<void>
  verify(entryId: string): Promise<boolean>
  getHistory(resource: string): Promise<LedgerEntry[]>
}
```

**Capabilities:**
- Event sourcing
- Time-travel debugging
- Audit trail
- Distributed state sync

### 9. Integration Adapters Layer

Provides integration with external systems.

```typescript
// Base adapter interface
interface IntegrationAdapter {
  name: string;
  connect(config: any): Promise<void>
  disconnect(): Promise<void>
  execute(operation: any): Promise<any>
}

// Concrete adapters
class UshAdapter implements IntegrationAdapter {
  execute(command: string): Promise<ExecutionResult>
}

class KubernetesAdapter implements IntegrationAdapter {
  apply(manifest: any): Promise<void>
  get(resource: string): Promise<any>
}

class TerraformAdapter implements IntegrationAdapter {
  plan(config: any): Promise<PlanResult>
  apply(plan: PlanResult): Promise<void>
}
```

### 10. Ush Layer

Base command execution engine.

**Ush capabilities:**
- Local execution
- SSH execution
- Docker execution
- Stream processing
- Pipes and redirections
- Interactive mode

## Key Architectural Decisions

### 1. Dependency Injection

Using DI for loose coupling:

```typescript
class RecipeExecutor {
  constructor(
    private scheduler: TaskScheduler,
    private stateManager: StateManager,
    private logger: Logger
  ) {}
}
```

### 2. Event-Driven Architecture

Events for extensibility:

```typescript
interface SystemEvents {
  'task:start': { taskId: string; context: Context }
  'task:complete': { taskId: string; result: any }
  'task:error': { taskId: string; error: Error }
  'recipe:start': { recipeId: string }
  'recipe:complete': { recipeId: string; result: ExecutionResult }
}
```

### 3. Plugin System

Extending functionality through plugins:

```typescript
interface Plugin {
  name: string;
  version: string;
  install(core: XecCore): void;
}

// Plugin example
const metricsPlugin: Plugin = {
  name: 'metrics',
  version: '1.0.0',
  install(core) {
    core.on('task:complete', (event) => {
      metrics.record('task.duration', event.duration);
    });
  }
};
```

### 4. Immutable State

Using immutable structures:

```typescript
// State updates create new objects
function updateState(state: State, update: Partial<State>): State {
  return { ...state, ...update };
}
```

### 5. Async-First Design

All operations are asynchronous:

```typescript
// All handlers return Promise
type TaskHandler = (context: TaskContext) => Promise<any>;
type Hook = (context: HookContext) => Promise<void>;
```

## Design Patterns

### 1. Builder Pattern
Used for creating complex objects (Task, Recipe).

### 2. Strategy Pattern
For different execution strategies (local, ssh, docker).

### 3. Observer Pattern
For event system and hooks.

### 4. Adapter Pattern
For integration with external systems.

### 5. Repository Pattern
For state storage abstraction.

### 6. Chain of Responsibility
For middleware and error handling.

## Scalability

### Horizontal Scaling

```typescript
// Distributed execution
class DistributedExecutor {
  async executeOnWorker(task: Task, worker: Worker): Promise<TaskResult> {
    return worker.execute(task);
  }
  
  async distributePhase(phase: Phase, workers: Worker[]): Promise<PhaseResult> {
    const tasks = Array.from(phase.tasks.values());
    const results = await Promise.all(
      tasks.map((task, i) => 
        this.executeOnWorker(task, workers[i % workers.length])
      )
    );
    return combineResults(results);
  }
}
```

### Vertical Scaling

- Connection pooling for SSH
- Batch operations
- Result caching
- Lazy loading modules

## Security

### Security Principles

1. **Principle of Least Privilege**
   - Minimal rights for execution
   - Context isolation

2. **Defense in Depth**
   - Validation at all levels
   - Input sanitization
   - Audit logging

3. **Secure by Default**
   - Encryption of sensitive data
   - Secure defaults

### Implementation

```typescript
// Secret encryption
class SecretManager {
  private cipher: Cipher;
  
  async encrypt(value: string): Promise<string> {
    return this.cipher.encrypt(value);
  }
  
  async decrypt(encrypted: string): Promise<string> {
    return this.cipher.decrypt(encrypted);
  }
}

// Command validation
class CommandValidator {
  validate(command: string): void {
    if (this.containsInjection(command)) {
      throw new SecurityError('Command injection detected');
    }
  }
}
```

## Performance

### Optimizations

1. **Parallel Execution**
   ```typescript
   // Maximum parallelization
   const results = await Promise.all(
     independentTasks.map(task => executor.execute(task))
   );
   ```

2. **Connection Reuse**
   ```typescript
   class SSHPool {
     private connections = new Map<string, SSHConnection>();
     
     async getConnection(host: string): Promise<SSHConnection> {
       if (!this.connections.has(host)) {
         this.connections.set(host, await this.connect(host));
       }
       return this.connections.get(host)!;
     }
   }
   ```

3. **Lazy Loading**
   ```typescript
   // Modules loaded only when used
   async function loadModule(name: string): Promise<Module> {
     return import(`@xec/module-${name}`);
   }
   ```

## Monitoring and Debugging

### Built-in Telemetry

```typescript
interface Telemetry {
  traces: TraceCollector;
  metrics: MetricsCollector;
  logs: LogCollector;
}

// Automatic instrumentation
class InstrumentedExecutor extends RecipeExecutor {
  async executeTask(task: Task, context: Context): Promise<TaskResult> {
    const span = tracer.startSpan(`task.${task.name}`);
    
    try {
      const result = await super.executeTask(task, context);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }
}
```

## Conclusion

Xec Core architecture provides:
- **Modularity** - easy to add new functionality
- **Extensibility** - multiple extension points
- **Performance** - optimized for speed
- **Reliability** - error handling at all levels
- **Security** - protection at all levels
- **Usability** - simple and intuitive API

This architecture allows Xec Core to be both simple for beginners and powerful for advanced users.
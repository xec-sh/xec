# @xec-sh/core Unified Refactoring Specification

## Executive Summary

This specification provides a practical, detailed plan for refactoring @xec-sh/core with focus on:
- **Code Organization**: Clear separation of concerns and consistent file structure
- **Type Management**: Unified approach to type definitions and their locations
- **API Simplicity**: Maintaining simple public API while improving internals
- **Security**: Built-in command sanitization without API complexity
- **Performance**: Efficient resource management without overengineering

### Key Principles
1. **No Overengineering**: Remove unnecessary abstractions like `SecureCredentialStore`
2. **Clear Structure**: Every file in its proper domain folder
3. **Type Consistency**: All types follow the same organizational pattern
4. **Practical Security**: Automatic sanitization without exposing complexity
5. **Backward Compatible**: No breaking changes to public API

## Current State Analysis

### Problems Identified
1. **Mixed Responsibilities**: 26 files contain both types and implementations
2. **Inconsistent Organization**: Utils folder has 25 files mixing different concerns
3. **Type Chaos**: Some types in `/types`, others mixed with implementations
4. **Large Monoliths**: `execution-engine.ts` has 1000+ lines
5. **API Wrappers Mixed with Utils**: `ssh-api.ts`, `docker-api.ts` in utils folder

## Phase 1: Directory Structure Reorganization

### 1.1 New Directory Structure
```
packages/core/src/
├── types/                    # ALL type definitions
│   ├── index.ts             # Main type exports
│   ├── core.types.ts        # Core domain types
│   ├── adapter.types.ts     # Adapter interfaces
│   ├── command.types.ts     # Command-related types
│   ├── target.types.ts      # Target definitions
│   ├── result.types.ts      # Result and error types
│   ├── event.types.ts       # Event system types
│   ├── connection.types.ts  # Connection-related types
│   ├── docker.types.ts      # Docker-specific types
│   ├── kubernetes.types.ts  # K8s-specific types
│   └── ssh.types.ts         # SSH-specific types
│
├── core/                     # Core execution logic
│   ├── executor/            # Execution engine (split)
│   │   ├── executor.ts      # Main executor (200 lines)
│   │   ├── command-builder.ts # Command construction
│   │   ├── template-parser.ts # Template literal parsing
│   │   └── result-processor.ts # Result handling
│   ├── errors/              # Error classes
│   │   ├── base-error.ts    # Base error class
│   │   ├── execution-error.ts # Execution errors
│   │   └── validation-error.ts # Validation errors
│   └── context/             # Execution context
│       ├── process-context.ts # Process management
│       └── execution-context.ts # Execution state
│
├── adapters/                 # Environment adapters
│   ├── base/               # Base adapter logic
│   │   ├── base-adapter.ts # Abstract base
│   │   └── adapter-utils.ts # Shared utilities
│   ├── local/              # Local execution
│   │   └── local-adapter.ts
│   ├── ssh/                # SSH execution
│   │   ├── ssh-adapter.ts
│   │   └── ssh-connection-pool.ts
│   ├── docker/             # Docker execution
│   │   ├── docker-adapter.ts
│   │   └── docker-client.ts
│   └── kubernetes/         # K8s execution
│       ├── kubernetes-adapter.ts
│       └── kubectl-client.ts
│
├── api/                     # External API wrappers
│   ├── ssh/                # SSH API
│   │   ├── client.ts       # SSH client wrapper
│   │   ├── tunnel.ts       # SSH tunneling
│   │   └── transfer.ts     # File transfer
│   ├── docker/             # Docker API
│   │   ├── client.ts       # Docker client
│   │   ├── compose.ts      # Compose operations
│   │   └── container.ts    # Container management
│   └── kubernetes/         # K8s API
│       ├── client.ts       # kubectl wrapper
│       ├── pod.ts          # Pod operations
│       └── port-forward.ts # Port forwarding
│
├── security/               # Security features
│   ├── sanitizer.ts       # Command sanitization
│   ├── validator.ts       # Input validation
│   └── escaper.ts         # Shell escaping
│
├── system/                 # System utilities
│   ├── shell.ts           # Shell detection
│   ├── runtime.ts         # Runtime detection
│   ├── temp.ts            # Temp file handling
│   ├── stream.ts          # Stream utilities
│   └── process.ts         # Process utilities
│
├── framework/              # Framework components
│   ├── events/            # Event system
│   │   ├── event-emitter.ts
│   │   └── event-bus.ts
│   ├── retry/             # Retry logic
│   │   ├── retry-executor.ts
│   │   └── backoff.ts
│   ├── parallel/          # Parallel execution
│   │   ├── parallel-executor.ts
│   │   └── semaphore.ts
│   └── cache/             # Caching
│       ├── execution-cache.ts
│       └── lru-cache.ts
│
├── helpers/               # Pure utility functions
│   ├── string.ts         # String utilities
│   ├── path.ts           # Path utilities
│   ├── validation.ts     # Validation helpers
│   ├── formatting.ts     # Output formatting
│   └── data.ts           # Data manipulation
│
├── convenience/          # High-level convenience API
│   ├── shortcuts.ts     # API shortcuts
│   ├── templates.ts     # Template helpers
│   └── builders.ts      # Fluent builders
│
└── index.ts             # Main exports
```

### 1.2 File Movement Plan

#### Types Extraction (Week 1)
Extract types from implementation files into dedicated type files:

```typescript
// BEFORE: packages/core/src/core/execution-engine.ts
export interface ExecutionOptions { ... }
export class ExecutionEngine { ... }

// AFTER: packages/core/src/types/core.types.ts
export interface ExecutionOptions { ... }

// AFTER: packages/core/src/core/executor/executor.ts
import { ExecutionOptions } from '../../types/core.types';
export class Executor { ... }
```

**Files to process:**
1. `core/execution-engine.ts` → Extract 15 interfaces to `types/core.types.ts`
2. `core/command.ts` → Extract 8 types to `types/command.types.ts`
3. `core/process-context.ts` → Extract 5 interfaces to `types/context.types.ts`
4. `adapters/*.ts` → Extract all interfaces to `types/adapter.types.ts`
5. `utils/*.ts` → Extract 20+ interfaces to appropriate type files

#### Utils Reorganization (Week 2)
Move utils files to appropriate domain folders:

```bash
# API Wrappers → api/
mv src/utils/ssh-api.ts → src/api/ssh/client.ts
mv src/utils/docker-api.ts → src/api/docker/client.ts
mv src/utils/kubernetes-api.ts → src/api/kubernetes/client.ts
mv src/utils/docker-fluent-api.ts → src/api/docker/fluent.ts

# System Utilities → system/
mv src/utils/shell-escape.ts → src/system/shell.ts
mv src/utils/runtime-detect.ts → src/system/runtime.ts
mv src/utils/temp.ts → src/system/temp.ts
mv src/utils/stream.ts → src/system/stream.ts

# Framework Components → framework/
mv src/utils/event-emitter.ts → src/framework/events/event-emitter.ts
mv src/utils/retry-adapter.ts → src/framework/retry/retry-executor.ts
mv src/utils/parallel.ts → src/framework/parallel/parallel-executor.ts

# Pure Helpers → helpers/
mv src/utils/within.ts → src/helpers/async.ts
mv src/utils/templates.ts → src/helpers/templates.ts
mv src/utils/suggestions.ts → src/helpers/suggestions.ts

# High-level API → convenience/
mv src/utils/convenience.ts → src/convenience/shortcuts.ts
```

## Phase 2: Core Module Refactoring

### 2.1 Split ExecutionEngine (Week 3)

Current `execution-engine.ts` (1063 lines) becomes:

```typescript
// packages/core/src/core/executor/executor.ts (~200 lines)
export class Executor {
  constructor(
    private readonly commandBuilder: CommandBuilder,
    private readonly templateParser: TemplateParser,
    private readonly resultProcessor: ResultProcessor
  ) {}

  async execute(command: string, options?: ExecutionOptions): Promise<ExecutionResult> {
    const parsed = this.templateParser.parse(command);
    const built = this.commandBuilder.build(parsed, options);
    const result = await this.runCommand(built);
    return this.resultProcessor.process(result);
  }

  private async runCommand(command: BuiltCommand): Promise<RawResult> {
    const adapter = this.getAdapter(command.target);
    return adapter.execute(command);
  }
}

// packages/core/src/core/executor/command-builder.ts (~150 lines)
export class CommandBuilder {
  build(parsed: ParsedTemplate, options: ExecutionOptions): BuiltCommand {
    // Command construction logic
    return {
      text: this.constructCommand(parsed),
      env: this.mergeEnvironment(options.env),
      cwd: this.resolveCwd(options.cwd),
      target: this.resolveTarget(options.target)
    };
  }
}

// packages/core/src/core/executor/template-parser.ts (~100 lines)
export class TemplateParser {
  parse(template: string | TemplateStringsArray): ParsedTemplate {
    // Template parsing logic
    return {
      parts: this.extractParts(template),
      variables: this.extractVariables(template)
    };
  }
}

// packages/core/src/core/executor/result-processor.ts (~100 lines)
export class ResultProcessor {
  process(raw: RawResult): ExecutionResult {
    return {
      success: raw.exitCode === 0,
      exitCode: raw.exitCode,
      stdout: this.normalizeOutput(raw.stdout),
      stderr: this.normalizeOutput(raw.stderr),
      duration: raw.endTime - raw.startTime
    };
  }
}
```

### 2.2 Simplify Adapter Pattern (Week 4)

Remove unnecessary abstraction layers:

```typescript
// packages/core/src/adapters/base/base-adapter.ts (~50 lines)
export abstract class BaseAdapter {
  abstract execute(command: Command): Promise<RawResult>;
  abstract dispose(): Promise<void>;
  
  protected sanitize(input: string): string {
    return Sanitizer.sanitize(input, this.getContext());
  }
  
  protected abstract getContext(): AdapterContext;
}

// packages/core/src/adapters/ssh/ssh-adapter.ts (~200 lines)
export class SSHAdapter extends BaseAdapter {
  constructor(
    private readonly target: SSHTarget,
    private readonly pool: ConnectionPool
  ) {
    super();
  }

  async execute(command: Command): Promise<RawResult> {
    const connection = await this.pool.acquire(this.target.id);
    const sanitized = this.sanitize(command.text);
    
    try {
      const result = await connection.exec(sanitized, {
        cwd: command.cwd,
        env: command.env
      });
      
      return {
        exitCode: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        startTime: command.startTime,
        endTime: Date.now()
      };
    } finally {
      this.pool.release(this.target.id);
    }
  }

  protected getContext(): AdapterContext {
    return 'ssh';
  }

  async dispose(): Promise<void> {
    await this.pool.dispose();
  }
}
```

## Phase 3: Type Organization Strategy

### 3.1 Type Definition Rules

1. **All interfaces and types** go in `/types` folder
2. **Implementation classes** stay with their logic
3. **One type file per domain** (not per implementation file)
4. **Shared types** in base type files
5. **External library types** in `/types/external.d.ts`

### 3.2 Type File Structure

```typescript
// packages/core/src/types/core.types.ts
export interface ExecutionOptions {
  target?: Target;
  env?: Record<string, string>;
  cwd?: string;
  timeout?: number;
  retry?: RetryOptions;
}

export interface ExecutionResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  metadata?: ExecutionMetadata;
}

// packages/core/src/types/adapter.types.ts
export interface BaseAdapter {
  execute(command: Command): Promise<RawResult>;
  dispose(): Promise<void>;
}

export interface AdapterContext {
  type: 'local' | 'ssh' | 'docker' | 'kubernetes';
  capabilities: AdapterCapabilities;
}

// packages/core/src/types/target.types.ts
export interface Target {
  id: string;
  type: 'local' | 'ssh' | 'docker' | 'kubernetes';
}

export interface SSHTarget extends Target {
  type: 'ssh';
  host: string;
  port?: number;
  user?: string;
  password?: string;
  privateKey?: string;
}

export interface DockerTarget extends Target {
  type: 'docker';
  container: string;
  image?: string;
}
```

### 3.3 Import Convention

```typescript
// Always import types from /types
import type { ExecutionOptions, ExecutionResult } from '../types/core.types';
import type { SSHTarget } from '../types/target.types';

// Import implementations from their folders
import { Executor } from '../core/executor/executor';
import { SSHAdapter } from '../adapters/ssh/ssh-adapter';
```

## Phase 4: Security Without Complexity

### 4.1 Automatic Command Sanitization

```typescript
// packages/core/src/security/sanitizer.ts
export class Sanitizer {
  static sanitize(input: string, context: AdapterContext): string {
    // Remove null bytes
    let sanitized = input.replace(/\0/g, '');
    
    switch (context.type) {
      case 'ssh':
      case 'local':
        return this.shellEscape(sanitized);
      case 'docker':
        return this.dockerEscape(sanitized);
      case 'kubernetes':
        return this.k8sEscape(sanitized);
    }
  }

  private static shellEscape(str: string): string {
    // Use single quotes and escape single quotes
    if (!/[^A-Za-z0-9_\-./]/.test(str)) {
      return str; // No escaping needed
    }
    return `'${str.replace(/'/g, "'\\''")}'`;
  }

  private static dockerEscape(str: string): string {
    // Docker-specific escaping
    return str.replace(/(['"\\\n\r\t])/g, '\\$1');
  }

  private static k8sEscape(str: string): string {
    // Kubernetes-specific escaping
    return str.replace(/(['"])/g, '\\$1');
  }
}
```

### 4.2 Built-in Template Sanitization

```typescript
// packages/core/src/core/executor/template-parser.ts
export class TemplateParser {
  parse(strings: TemplateStringsArray, ...values: any[]): SafeCommand {
    const parts: string[] = [];
    
    for (let i = 0; i < strings.length; i++) {
      parts.push(strings[i]);
      if (i < values.length) {
        // Automatically sanitize interpolated values
        const sanitized = Sanitizer.sanitize(
          String(values[i]), 
          this.detectContext()
        );
        parts.push(sanitized);
      }
    }
    
    return {
      command: parts.join(''),
      isSanitized: true
    };
  }

  private detectContext(): AdapterContext {
    // Detect from current execution context
    return getCurrentContext();
  }
}
```

## Phase 5: Performance Improvements

### 5.1 Connection Pooling (Built-in, Invisible)

```typescript
// packages/core/src/adapters/ssh/ssh-connection-pool.ts
export class ConnectionPool {
  private readonly connections = new Map<string, PooledConnection>();
  private readonly maxSize = 10;
  private readonly idleTimeout = 5 * 60 * 1000; // 5 minutes
  
  async acquire(key: string, factory: ConnectionFactory): Promise<Connection> {
    let pooled = this.connections.get(key);
    
    if (!pooled || !pooled.isAlive()) {
      if (this.connections.size >= this.maxSize) {
        this.evictOldest();
      }
      
      const connection = await factory();
      pooled = {
        connection,
        lastUsed: Date.now(),
        useCount: 0
      };
      this.connections.set(key, pooled);
    }
    
    pooled.lastUsed = Date.now();
    pooled.useCount++;
    return pooled.connection;
  }

  release(key: string): void {
    const pooled = this.connections.get(key);
    if (pooled) {
      pooled.lastUsed = Date.now();
      
      // Schedule cleanup if idle
      setTimeout(() => {
        if (Date.now() - pooled.lastUsed > this.idleTimeout) {
          pooled.connection.dispose();
          this.connections.delete(key);
        }
      }, this.idleTimeout);
    }
  }
}
```

### 5.2 Optional Execution Caching

```typescript
// packages/core/src/framework/cache/execution-cache.ts
export class ExecutionCache {
  private readonly cache = new LRUCache<string, CachedResult>(100);
  
  get(command: Command): ExecutionResult | null {
    if (!command.options?.cache) return null;
    
    const key = this.getKey(command);
    const cached = this.cache.get(key);
    
    if (cached && !this.isExpired(cached)) {
      return cached.result;
    }
    
    return null;
  }

  set(command: Command, result: ExecutionResult): void {
    if (!command.options?.cache) return;
    
    const key = this.getKey(command);
    this.cache.set(key, {
      result,
      timestamp: Date.now()
    });
  }

  private getKey(command: Command): string {
    return JSON.stringify({
      text: command.text,
      target: command.target,
      env: command.env,
      cwd: command.cwd
    });
  }
}
```

## Phase 6: API Preservation

### 6.1 Public API Remains Simple

```typescript
// packages/core/src/index.ts
// The public API doesn't change
export const $ = createExecutor();

// Template literal API unchanged
await $`echo hello world`;
await $.ssh('server')`ls -la`;
await $.docker('container')`ps aux`;

// All improvements are internal
function createExecutor() {
  const parser = new TemplateParser();
  const builder = new CommandBuilder();
  const processor = new ResultProcessor();
  const executor = new Executor(parser, builder, processor);
  
  // Return the same simple API
  return createTemplateTag(executor);
}
```

### 6.2 No Breaking Changes

```typescript
// All existing patterns continue to work
await $`command`;                           // ✅ Works
await $.ssh('host')`command`;              // ✅ Works
await $.docker('container')`command`;       // ✅ Works
await $.k8s('pod')`command`;               // ✅ Works

// New features are opt-in
await $`command`.retry(3);                 // Optional
await $({ cache: true })`command`;         // Optional
await $.ssh('host', { timeout: 5000 })`command`; // Optional
```

## Phase 7: Helper Consolidation

### 7.1 Merge Small Utilities

```typescript
// packages/core/src/helpers/string.ts (from 5 separate files)
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseKeyValue(str: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pairs = str.split(/[,;]/);
  
  for (const pair of pairs) {
    const [key, value] = pair.split('=').map(s => s.trim());
    if (key && value) {
      result[key] = value;
    }
  }
  
  return result;
}

// packages/core/src/helpers/path.ts (from 3 separate files)
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function isAbsolute(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:/.test(path);
}

export function joinPath(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/');
}
```

## Phase 8: Implementation Timeline

### Week 1-2: Type Extraction
- Extract all interfaces to `/types` folder
- Update all imports
- Ensure no circular dependencies
- **Deliverable**: Clean type separation

### Week 3-4: Directory Restructuring
- Move files to new structure
- Update import paths
- Merge small utilities
- **Deliverable**: Organized codebase

### Week 5-6: Core Refactoring
- Split ExecutionEngine
- Simplify adapters
- Remove unnecessary abstractions
- **Deliverable**: Cleaner core modules

### Week 7: Security & Performance
- Implement automatic sanitization
- Add connection pooling
- Optional caching
- **Deliverable**: Secure and performant core

### Week 8: Testing & Documentation
- Update all tests
- Document new structure
- Migration guide
- **Deliverable**: Fully tested refactored code

## Success Metrics

### Code Quality
- **File Count**: Reduce from 135 to ~90 files
- **Average File Size**: <200 lines (from current 300+)
- **Type Coverage**: 100% types in `/types` folder
- **Circular Dependencies**: 0

### Performance
- **Connection Reuse**: 80% for SSH operations
- **Memory Usage**: 30% reduction in idle state
- **Startup Time**: 20% faster

### Maintainability
- **Clear Structure**: Every file in logical location
- **Type Consistency**: All types follow same pattern
- **API Simplicity**: Public API unchanged
- **Test Coverage**: Maintained at 90%+

## Migration Guide

### For Users
```typescript
// No changes required! All existing code works:
await $`echo hello`;
await $.ssh('server')`ls`;
```

### For Contributors
```typescript
// Old import
import { ExecutionEngine, ExecutionOptions } from '../core/execution-engine';

// New import
import type { ExecutionOptions } from '../types/core.types';
import { Executor } from '../core/executor/executor';
```

## Key Differences from Previous Plans

1. **No SecureCredentialStore** - Credentials handled by SSH libraries as-is
2. **No Complex Factories** - Simple, direct instantiation
3. **Types in One Place** - All types in `/types`, no mixing
4. **Practical Security** - Automatic sanitization without API changes
5. **Clear Folder Structure** - Each folder has single responsibility

## Conclusion

This refactoring plan focuses on practical improvements:
- **Better Organization**: Clear, logical file structure
- **Type Consistency**: All types in one place
- **Maintained Simplicity**: Public API unchanged
- **Real Security**: Automatic sanitization built-in
- **Performance**: Connection pooling and caching without complexity

The plan avoids overengineering while delivering real value through better code organization and maintainability.
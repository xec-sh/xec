---
sidebar_position: 3
sidebar_label: Philosophy
title: Philosophy & Design Principles
description: The core principles and design philosophy behind Xec
---

# Philosophy & Design Principles

Xec is built on a set of core principles that guide every design decision. Understanding these principles helps you use Xec effectively and contributes to its consistent, predictable behavior.

## Core Philosophy

### "Write Once, Execute Anywhere"

The fundamental philosophy of Xec is that **command execution should be environment-agnostic**. Whether you're running a command locally, on a remote server, in a Docker container, or within a Kubernetes pod, the syntax and behavior should be identical.

```typescript
// The same command works everywhere
const command = `echo "Hello, World"`;

await $`${command}`;                           // Local
await $.ssh({ host: 'server' })`${command}`;   // SSH
await $.docker({ container: 'app' })`${command}`; // Docker
await $.k8s({ pod: 'web', namespace: 'default' })`${command}`; // Kubernetes
```

This principle eliminates the cognitive overhead of learning different APIs for different environments.

## Design Principles

### 1. Simplicity Without Sacrifice

**Principle**: Simple things should be simple; complex things should be possible.

**Implementation**:
- Zero configuration for common cases
- Progressive disclosure of complexity
- Sensible defaults that work out of the box

```typescript
// Simple: Just works
await $`ls`;

// Complex: Still possible
await $`complex-command`
  .cd('/specific/path')
  .env({ CUSTOM_VAR: 'value' })
  .timeout(60000)
  .retry(3)
  .nothrow();
```

### 2. Safety by Default

**Principle**: Prevent common mistakes and security vulnerabilities automatically.

**Implementation**:
- Automatic shell escaping in template literals
- Command injection prevention
- Secure credential handling
- Resource cleanup guarantees

```typescript
// Automatically escaped - safe from injection
const userInput = "file'; rm -rf /; echo 'deleted";
await $`touch ${userInput}`;  // Creates file named exactly as input

// Explicit raw mode when needed
await $.raw`echo ${userInput}`;  // Use with caution
```

### 3. Composability

**Principle**: Small, focused components that combine into powerful workflows.

**Implementation**:
- Unix philosophy: do one thing well
- Chainable methods
- Piping support
- Adapter composition

```typescript
// Compose complex workflows from simple parts
await $`cat data.json`
  .pipe($`jq '.items[]'`)
  .pipe($`grep active`)
  .pipe($`wc -l`);

// Combine adapters
const prod = $.ssh({ host: 'prod.example.com', username: 'deploy' });
await prod.docker({ container: 'app' })`npm test`;
```

### 4. Predictable Behavior

**Principle**: Consistent behavior across all environments and contexts.

**Implementation**:
- Unified error handling
- Consistent result structure
- Standard exit code semantics
- Predictable option inheritance

```typescript
// Same result structure everywhere
interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  ok: boolean;        // true if exitCode === 0
  cause?: string;     // Error description if failed
  duration: number;   // Execution time in ms
}
```

### 5. Developer Ergonomics

**Principle**: The API should feel natural and intuitive to JavaScript developers.

**Implementation**:
- Native template literal syntax
- Promise-based async/await
- Familiar method names
- TypeScript-first design

```typescript
// Feels like writing shell scripts in JavaScript
const result = await $`git branch --show-current`;
const branch = result.stdout.trim();

const filesResult = await $`ls -1`;
const files = filesResult.stdout.split('\n').filter(Boolean);
```

### 6. Progressive Enhancement

**Principle**: Start simple, add capabilities as needed.

**Implementation**:
- Basic execution requires no configuration
- Advanced features are opt-in
- Graceful degradation
- Feature detection

```typescript
// Level 1: Basic execution
await $`echo "Hello"`;

// Level 2: Add configuration
await $`npm test`.timeout(30000);

// Level 3: Add error handling
await $`risky-command`.nothrow();

// Level 4: Add monitoring
await $`important-task`
  .on('start', () => console.log('Starting...'))
  .on('complete', (result) => console.log(`Done in ${result.duration}ms`));

// Level 5: Full control
await $`critical-operation`
  .timeout(60000)
  .retry(3)
  .env({ DEBUG: 'true' })
  .cd('/workspace')
  .nothrow();
```

### 7. Fail Fast, Fail Clearly

**Principle**: Errors should be detected early and reported clearly.

**Implementation**:
- Immediate validation of inputs
- Rich error messages with context
- Suggestions for fixes
- Error recovery strategies

```typescript
// Clear error messages
ExecutionError: Command failed with exit code 127
  Command: npm test
  Exit Code: 127
  Working Directory: /app
  Error Output: sh: npm: command not found
  
  Suggestion: npm is not installed or not in PATH.
  Try: apt-get install npm or check your PATH variable.
```

### 8. Resource Management

**Principle**: Resources should be managed automatically and cleaned up reliably.

**Implementation**:
- Automatic connection pooling
- Graceful shutdown
- Resource disposal
- Memory management

```typescript
// Automatic resource management
const ssh = $.ssh({ host: 'server', username: 'user' });
await ssh`command1`;  // Connection created
await ssh`command2`;  // Connection reused (via connection pool)
// Connection cleaned up automatically

// Ephemeral Docker containers
await $.docker({ image: 'alpine', autoRemove: true })`echo test`;
// Container removed automatically after execution
```

### 9. Extensibility

**Principle**: The system should be extensible without modification.

**Implementation**:
- Adapter pattern for new environments
- Plugin architecture
- Event system for monitoring
- Custom command support

```typescript
// Custom adapter implementation
import { BaseAdapter } from '@xec-sh/core';

class CustomAdapter extends BaseAdapter {
  async execute(command: Command): Promise<ExecutionResult> {
    // Custom execution logic
    return this.createResult({
      stdout: 'output',
      stderr: '',
      exitCode: 0
    });
  }
}
```

### 10. Performance Consciousness

**Principle**: Common operations should be fast; optimization should be possible.

**Implementation**:
- Connection pooling
- Result caching
- Lazy evaluation
- Streaming support
- Parallel execution

```typescript
// Parallel execution
const results = await $.parallel.all([
  $`test1`,
  $`test2`,
  $`test3`
]);

// Batch with concurrency control
await $.batch(['cmd1', 'cmd2', 'cmd3'], {
  concurrency: 2
});

// Stream processing with follow
await $`tail -f app.log`
  .timeout(0)  // No timeout for streaming
```

## The Xec Way

When using Xec, embrace these patterns:

### Think in Commands, Not APIs
Focus on what you want to execute, not how to execute it.

### Compose, Don't Complicate
Build complex operations from simple, tested components.

### Trust the Defaults
The default configuration is carefully chosen for the common case.

### Handle Errors Explicitly
Use `.nothrow()` and check `.ok` rather than relying on try/catch.

### Leverage Type Safety
Use TypeScript for better IDE support and compile-time checks.

## Anti-Patterns to Avoid

### Don't Fight the Abstraction
If you need low-level control, use the underlying libraries directly.

### Don't Ignore Errors
Always handle potential failures, especially in production code.

### Don't Assume Synchronous Behavior
Everything in Xec is asynchronous; always use await.

### Don't Bypass Security Features
The automatic escaping exists for good reasons. Use `$.raw` only when absolutely necessary and with trusted input.

## Conclusion

Xec's philosophy centers on making command execution **simple, safe, and consistent** across all environments. By following these principles, Xec provides a powerful yet approachable tool that scales from simple scripts to complex orchestration systems.

The beauty of Xec lies not in doing something entirely new, but in doing something necessary with elegance and consistency. It's not about replacing shell scripts or system commands—it's about making them accessible, safe, and enjoyable to use from JavaScript.
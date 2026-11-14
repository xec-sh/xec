---
sidebar_position: 3
sidebar_label: Philosophy
title: Philosophy & Design Principles
description: The core principles and design philosophy behind Xec
---

# Philosophy & Design Principles {#philosophy--design-principles}

Xec is built on a set of core principles that guide every design decision. Understanding these principles helps you use Xec effectively and contributes to its consistent, predictable behavior.

## Core Philosophy {#core-philosophy}

### "Write Once, Execute Anywhere" {#write-once-execute-anywhere}

The fundamental philosophy of Xec is that **command execution should be environment-agnostic**. Whether you're running a command locally, on a remote server, in a Docker container, or within a Kubernetes pod, the syntax and behavior should be identical.

```typescript
// The same command works everywhere
const command = `echo "Hello, World"`;

await $.exec(command);                           // Local
await $.ssh('deploy@server').raw`${command}`;   // SSH
await $.docker({ container: 'app' }).exec(command); // Docker
await $.k8s({ pod: 'web', namespace: 'default' }).raw`${command}`; // Kubernetes
```

This principle eliminates the cognitive overhead of learning different APIs for different environments.

## Design Principles {#design-principles}

### 1. Simplicity Without Sacrifice {#1-simplicity-without-sacrifice}

**Principle**: Simple things should be simple; complex things should be possible.

**Implementation**:
- Zero configuration for common cases
- Progressive disclosure of complexity
- Sensible defaults that work out of the box

```typescript
// Simple: Just works
await $`ls`;

// Complex: Still possible
await $.cd('/specific/path').env({ CUSTOM_VAR: 'value' })
  .timeout(60000)`complex-command`.nothrow();
```

### 2. Safety by Default {#2-safety-by-default}

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
const trustedCommand = 'printf ready';
await $.raw`${trustedCommand}`; // Only trusted shell source belongs in raw mode
```

### 3. Composability {#3-composability}

**Principle**: Small, focused components that combine into complete workflows.

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
await prod`docker exec app npm test`; // Explicitly runs Docker on that SSH host
```

### 4. Predictable Behavior {#4-predictable-behavior}

**Principle**: Consistent behavior across all environments and contexts.

**Implementation**:
- Unified error handling
- Consistent result structure
- Standard exit code semantics
- Predictable option inheritance

```typescript
import type { ExecutionResult } from '@xec-sh/core';

function report(result: ExecutionResult) {
  console.log(result.exitCode, result.ok, result.stdout, result.stderr, result.duration);
}
```

### 5. Developer Ergonomics {#5-developer-ergonomics}

**Principle**: The API should feel natural and intuitive to JavaScript developers.

**Implementation**:
- Native template literal syntax
- Promise-based async/await
- Familiar method names
- TypeScript-first design

```typescript
// Feels like writing shell scripts in JavaScript
const branch = await $`git branch --show-current`.text();
const files = await $`ls -1`.lines();
```

### 6. Progressive Enhancement {#6-progressive-enhancement}

**Principle**: Start simple, add capabilities as needed.

**Implementation**:
- Basic execution requires no configuration
- Advanced features are opt-in
- Graceful degradation
- Feature detection

```typescript
await $`echo Hello`;
await $`npm test`.timeout(30000);
const result = await $`risky-command`.nothrow();
console.log({ ok: result.ok, duration: result.duration });

await $.cd('/workspace').env({ DEBUG: 'true' })
  .timeout(60000)`critical-operation`.nothrow();
```

### 7. Fail Fast, Fail Clearly {#7-fail-fast-fail-clearly}

**Principle**: Errors should be detected early and reported clearly.

**Implementation**:
- Immediate validation of inputs
- Rich error messages with context
- Suggestions for fixes
- Error recovery strategies

```text
// Clear error messages
ExecutionError: Command failed with exit code 127
  Command: npm test
  Exit Code: 127
  Working Directory: /app
  Error Output: sh: npm: command not found
  
  Suggestion: npm is not installed or not in PATH.
  Try: apt-get install npm or check your PATH variable.
```

### 8. Resource Management {#8-resource-management}

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

### 9. Extensibility {#9-extensibility}

**Principle**: The system should be extensible without modification.

**Implementation**: `$` is a function and `$.with()` returns another `$`, so the
ways you already compose functions in TypeScript are the ways you extend Xec.
There is no plugin system to learn, and nothing you build can be broken by a
change to a plugin contract.

A step is a function that takes an engine. It does not know, and does not need
to know, which environment it was handed:

```typescript
import type { ProcessPromise } from '@xec-sh/core';

type CommandTarget = (parts: TemplateStringsArray, ...values: unknown[]) => ProcessPromise;

export async function restart(target: CommandTarget, service: string) {
  await target`systemctl restart ${service}`;
  return target`systemctl is-active ${service}`.nothrow().text();
}

await restart($.ssh('deploy@web-1'), 'api');
await restart($.docker('api'), 'nginx');
```

New *environments* are a different matter: an adapter is part of the core
contract, `BaseAdapter` is not exported, and adding one should be reviewed
rather than worked around. See [Extending Xec](../core/execution-engine/api/extensions.md).

### 10. Performance Consciousness {#10-performance-consciousness}

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
for await (const line of $`tail -f app.log`) {
  console.log(line);
}
```

## The Xec Way {#the-xec-way}

When using Xec, embrace these patterns:

### Think in Commands, Not APIs {#think-in-commands-not-apis}
Focus on what you want to execute, not how to execute it.

### Compose, Don't Complicate {#compose-dont-complicate}
Build complex operations from simple, tested components.

### Trust the Defaults {#trust-the-defaults}
The default configuration is carefully chosen for the common case.

### Handle Errors Explicitly {#handle-errors-explicitly}
Use `.nothrow()` and check `.ok` rather than relying on try/catch.

### Leverage Type Safety {#leverage-type-safety}
Use TypeScript for better IDE support and compile-time checks.

## Anti-Patterns to Avoid {#anti-patterns-to-avoid}

### Don't Fight the Abstraction {#dont-fight-the-abstraction}
If you need low-level control, use the underlying libraries directly.

### Don't Ignore Errors {#dont-ignore-errors}
Always handle potential failures, especially in production code.

### Don't Assume Synchronous Behavior {#dont-assume-synchronous-behavior}
Everything in Xec is asynchronous; always use await.

### Don't Bypass Security Features {#dont-bypass-security-features}
The automatic escaping exists for good reasons. Use `$.raw` only when absolutely necessary and with trusted input.

## Conclusion {#conclusion}

Xec's philosophy centers on making command execution **simple, safe, and consistent** across all environments. By following these principles, Xec scales from simple scripts to complex orchestration systems.

The beauty of Xec lies not in doing something entirely new, but in doing something necessary with elegance and consistency. It's not about replacing shell scripts or system commands—it's about making them accessible, safe, and enjoyable to use from JavaScript.
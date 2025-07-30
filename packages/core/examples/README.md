# @xec-sh/core Examples

Comprehensive examples demonstrating the capabilities of the universal execution engine.

## Structure

### 01-basics/
Core fundamentals and basic command execution patterns.

### 02-adapters/
Examples for each execution environment: local, SSH, Docker, Kubernetes.

### 03-advanced-features/
Advanced capabilities: parallel execution, streaming, retries, connection pooling.

### 04-event-system/
Event monitoring and lifecycle management.

### 05-utilities/
Helper functions for common tasks.

### 06-real-world/
Production-ready examples and complete workflows.

## Quick Start

```bash
# Install dependencies
cd packages/core
yarn install

# Run an example
tsx examples/01-basics/01-hello-world.ts
```

## Key Examples

### Basic Execution
```typescript
import { $ } from '@xec-sh/core';

await $`echo "Hello, World!"`;
```

### Multi-Environment
```typescript
// SSH
const ssh = $.ssh({ host: 'server.com' });
await ssh`uptime`;

// Docker - ephemeral container
await $.docker({ image: 'node:18' })`npm test`;

// Docker - existing container
await $.docker({ container: 'my-app' })`npm test`;

// Kubernetes
const pod = $.k8s().pod('web-app');
await pod.exec`hostname`;
```

### Advanced Patterns
```typescript
// Parallel execution
import { parallel } from '@xec-sh/core';
await parallel([$`task1`, $`task2`, $`task3`]);

// Error handling
const result = await $`command`.nothrow();
if (result.ok) {
  console.log(result.stdout);
} else {
  console.log('Failed:', result.cause);
}
```

## Learning Path

1. Start with `01-basics/` - Core concepts
2. Explore `02-adapters/` - Different environments
3. Study `03-advanced-features/` - Advanced patterns
4. Review `06-real-world/` - Complete workflows

## License

MIT
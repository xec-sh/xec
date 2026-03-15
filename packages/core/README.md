# @xec-sh/core

Universal shell execution engine with adapters for local, SSH, Docker, and Kubernetes environments.

## Install

```bash
pnpm add @xec-sh/core
```

## Quick Start

```typescript
import { $ } from '@xec-sh/core';

// Local execution with template literals
await $`echo "Hello, World!"`;

// Variables are automatically escaped
const file = 'my file.txt';
await $`cat ${file}`;

// SSH execution with connection pooling
const ssh = $.ssh({ host: 'server.com', username: 'deploy' });
await ssh`uptime`;

// Docker container execution
await $.docker('my-container')`ps aux`;

// Kubernetes pod execution
const k8s = $.k8s({ namespace: 'production' });
await k8s.pod('app-pod')`hostname`;
```

```typescript
// ProcessPromise methods
const result = await $`grep pattern file.txt`
  .nothrow()   // don't throw on non-zero exit
  .quiet()     // suppress output
  .timeout(5000);

// Consume output
const text = await $`cat file.txt`.text();
const data = await $`cat data.json`.json();
const lines = await $`ls`.lines();
const buf = await $`cat image.png`.buffer();

// Pipe commands
await $`cat access.log`.pipe($`grep 404`).pipe($`wc -l`);
```

```typescript
import { parallel, within, withTempFile } from '@xec-sh/core';

// Parallel execution with concurrency limit
const results = await parallel([
  $`test-1.sh`, $`test-2.sh`, $`test-3.sh`
], { maxConcurrent: 2 });

// Scoped execution context
await within(async () => {
  $.defaults({ cwd: '/tmp', env: { NODE_ENV: 'test' } });
  await $`npm test`;
});

// Helpers
import { echo, sleep, glob, kill, parseDuration, expBackoff } from '@xec-sh/core';

await sleep(1000);
echo('output');
const files = await glob('**/*.ts');
const ms = parseDuration('5m');
```

## API

| Export | Description |
|--------|-------------|
| `$` | Default callable execution engine (template literal tag) |
| `configure` | Configure the global engine |
| `dispose` | Clean up the global engine |
| `ExecutionEngine` | Core engine class |
| `createCallableEngine` | Wrap an engine as a callable |
| `LocalAdapter` | Local process adapter |
| `SSHAdapter` | SSH adapter with connection pooling |
| `DockerAdapter` | Docker container adapter |
| `KubernetesAdapter` | Kubernetes pod adapter |
| `DockerFluentAPI` | Fluent API for Docker lifecycle |
| `DockerContainer` | Docker container management |
| `parallel` / `ParallelEngine` | Parallel execution utilities |
| `within` / `withinSync` | Scoped execution context |
| `withTempDir` / `withTempFile` | Temporary file helpers |
| `echo` / `sleep` / `glob` / `kill` | Shell-like helpers |
| `parseDuration` / `expBackoff` | Duration and backoff utilities |
| `retry` / `RetryError` | Retry with backoff |
| `RuntimeDetector` | Detect Node.js, Bun, or Deno |
| `SSHKeyValidator` | Validate SSH keys |
| `SecurePasswordHandler` | Secure password handling |
| `EnhancedEventEmitter` | Typed event emitter |
| `pipeUtils` | Pipe composition utilities |

## Features

- Template literal syntax `$\`cmd\`` with automatic shell escaping
- Adapters: local, SSH, Docker, Kubernetes, mock, remote Docker
- SSH connection pooling and keep-alive
- ProcessPromise with `.text()`, `.json()`, `.lines()`, `.buffer()`, `.nothrow()`, `.quiet()`, `.timeout()`, `.signal()`, `.kill()`, `.pipe()`
- Pipe chaining between commands and adapters
- Parallel execution with concurrency control
- Automatic retry with exponential backoff
- Streaming output and async iteration
- `within`/`withinSync` for scoped configuration
- Temp file and directory helpers
- Shell helpers: `echo`, `sleep`, `glob`, `kill`, `parseDuration`, `expBackoff`
- `$.prefix` / `$.postfix` / `$.preferLocal` configuration
- `$.defaults()` for global configuration
- Chainable methods: `.cd()`, `.env()`, `.timeout()`, `.shell()`, `.retry()`
- Zero external runtime dependencies
- Works on Node.js, Bun, and Deno

## License

MIT

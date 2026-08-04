# @xec-sh/core examples

Runnable examples for the execution engine, ordered from basics to complete
workflows.

## Structure

| Directory | Contents |
|-----------|----------|
| `01-basics/` | Template literals, environment variables, working directory, result status |
| `02-adapters/` | One example per environment: local, SSH, Docker, Kubernetes |
| `02-environments/` | Docker run modes and the simplified Docker API |
| `03-advanced-features/` | Piping, parallel execution, streaming, retries, SSH pooling and tunnels |
| `04-event-system/` | Event monitoring and lifecycle management |
| `05-utilities/` | Temp files, transfers, prompts, passwords, shell escaping |
| `06-real-world/` | Complete workflows: git, builds, monitoring, deployment |

## Running

```bash
# From the repository root
corepack enable && pnpm install && pnpm build

npx tsx packages/core/examples/01-basics/01-hello-world.ts
```

SSH, Docker, and Kubernetes examples need the corresponding fixtures or a
real environment; the SSH test containers start with
`pnpm --filter @xec-sh/core docker:start`.

## The shapes the examples cover

```typescript
import { $ } from '@xec-sh/core';

// Local
await $`echo "Hello, World!"`;

// SSH
const ssh = $.ssh({ host: 'server.com', username: 'deploy' });
await ssh`uptime`;

// Docker — ephemeral container from an image, or an existing container
await $.docker({ image: 'node:20' })`node --version`;
await $.docker({ container: 'my-app' })`npm test`;

// Kubernetes
const pod = $.k8s().pod('web-app');
await pod.exec`hostname`;
```

```typescript
import { parallel } from '@xec-sh/core';

// Parallel execution with a result summary
const { succeeded, failed } = await parallel([$`task1`, $`task2`, $`task3`]);

// Error handling without throwing
const result = await $`command`.nothrow();
if (result.ok) {
  console.log(result.stdout);
} else {
  console.log('Failed:', result.cause);
}
```

## License

MIT

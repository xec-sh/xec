# Core examples

Runnable TypeScript examples of Xec's public execution API.

## Run

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
bun packages/core/examples/01-basics/01-hello-world.ts
```

Start with the local examples. SSH, Docker, and Kubernetes examples require the declared target and relevant tooling. Review commands and target configuration before running workflows that change remote resources.

## Contents

| Directory | Topics |
| --- | --- |
| [01-basics](01-basics) | Commands, interpolation, environment, directories, results |
| [02-adapters](02-adapters) | Local, SSH, Docker, and Kubernetes execution |
| [02-environments](02-environments) | Docker run modes and container APIs |
| [03-advanced-features](03-advanced-features) | Pipes, parallel work, streaming, retries, and tunnels |
| [04-event-system](04-event-system) | Execution events and lifecycle |
| [05-utilities](05-utilities) | Temporary files, transfers, prompts, and escaping |
| [06-real-world](06-real-world) | Build, monitoring, and deployment workflows |

[Core API](https://xec.sh/docs/api/execution-engine) · [Package overview](../README.md)

# Xec

TypeScript scripting and automation across local processes, SSH hosts, Docker containers, and Kubernetes pods. Use the same execution API in scripts, project commands, and deployment workflows.

[Documentation](https://xec.sh/docs/introduction/what-is-xec) · [Getting started](https://xec.sh/docs/introduction/quick-start) · [Examples](packages/core/examples) · [MIT license](LICENSE)

## Get started

```sh
npm install -g @xec-sh/cli
xec --help
xec run check.ts
```

```typescript
// check.ts — also runs as a module with @xec-sh/core installed.
import { $ } from '@xec-sh/core';

try {
  const revision = await $`git rev-parse --short HEAD`.text();
  const result = await $.exec(process.execPath, {
    args: ['--version'],
    shell: false,
  });
  console.log({ revision, runtime: result.stdout.trim() });
} finally {
  await $.dispose();
}
```

For library use, install `@xec-sh/core`. The CLI requires Node.js 22.18 or later. Package runtime requirements are declared in each package's manifest; Core and Kit also have Bun and Deno coverage. Local shell syntax remains platform-specific.

## One execution model

- **Targets:** `$`, `$.ssh(...)`, `$.docker(...)`, and `$.k8s(...)` share command composition and structured results.
- **Control:** working directories, environment variables, deadlines, cancellation scopes, bounded parallel work, and explicit cleanup.
- **Output:** captured text and bytes, streamed lines with backpressure, and diagnostic errors with credential masking.
- **SSH:** connections, SFTP, host-key verification, tunnels, and shell sessions through Xec APIs. The transport stays internal.
- **Workflows:** project configuration, dynamic CLI commands, TypeScript scripts, pipelines, and resumable package releases.
- **Terminal UI:** typed prompts, tables, progress, accessible output, and shared cancellation behavior.

Xec can orchestrate a workspace runner such as Turborepo. Keep the package graph and build cache with that runner; use Xec for the surrounding workflow. Deployed state, permissions, and reconciliation belong to the infrastructure controller.

## Packages

| Package | Responsibility |
| --- | --- |
| [@xec-sh/core](packages/core) | Execution, target adapters, transfers, and process lifetimes |
| [@xec-sh/cli](apps/xec) | The `xec` command and project integration |
| [@xec-sh/ops](packages/ops) | Pipelines, deployment strategies, configuration, and release tooling |
| [@xec-sh/kit](packages/kit) | Terminal UI components and formatting |
| [@xec-sh/loader](packages/loader) | TypeScript execution, module loading, watching, and REPL |
| [@xec-sh/testing](packages/testing) | Vitest helpers and SSH/Kubernetes fixtures |

Docker and Kubernetes operations require their respective `docker` and `kubectl` programs. SSH uses the bundled, reviewed `ssh2` transport and does not require a system SSH client.

## Develop

Use the pnpm version in `packageManager` and install Bun for Kit's build and examples.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @xec-sh/core test:unit
pnpm --filter @xec-sh/kit test
pnpm typecheck
pnpm lint
pnpm docs:check
```

Integration suites have explicit infrastructure requirements. See [contributor instructions](AGENTS.md), [testing helpers](packages/testing), and the [release workflow](https://xec.sh/docs/ops/release).

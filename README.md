# Xec

**One TypeScript API for commands, wherever they run** — local shell, SSH host, Docker container, Kubernetes pod.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/npm/l/@xec-sh/core.svg)](https://github.com/xec-sh/xec/blob/main/LICENSE)

Status: alpha. The API may change between minor versions until 1.0.

```typescript
import { $ } from '@xec-sh/core';

const app  = $.ssh('deploy@prod-1');                    // an SSH host
const db   = $.docker('postgres-main');                  // a container
const api  = $.k8s('production/api-7f9d');               // a pod
const here = $;                                          // this machine

// The same command, the same API, the same result shape — everywhere.
await here`pnpm build`;
await app`systemctl restart app`;
await db`pg_dump -U app mydb`.pipe`gzip`;
await api.cd('/var/log').env({ LINES: '200' })`tail -n $LINES app.log`;
```

## The seam this closes

To run a command somewhere other than your own machine, Node projects hand-assemble
four libraries with four APIs, four error models, four streaming models:

| Where | What people use | The API you learn |
|---|---|---|
| local | `execa` / `zx` | template literals, results |
| SSH | `ssh2` | connections, channels, callbacks |
| Docker | `dockerode` | exec instances, demuxed streams |
| Kubernetes | `@kubernetes/client-node` | informers, watch, exec websockets |

The code that "just restarts a service" looks completely different depending on where
that service lives — and moving it from a container to a host rewrites everything,
though the command is the same. zx, execa, dax and Bun Shell all stop at the local
machine. **Xec is the same `$` across all four.**

## The contract

Each of these is enforced by a test in this repository.

- **Interpolation is safe by default.** `` $`rm ${userInput}` `` quotes the value;
  it cannot alter the structure of the command. `$.raw` exists for when you mean it.
- **An option either works or fails loudly.** `.cd()` on a container changes the
  directory *in the container*. `.env()` on a pod exports *in the pod* — and never
  leaks into the local process environment. `AbortSignal` cancels on every adapter.
- **No silent data loss.** Output over `maxBuffer` kills the producer and fails with
  the truncated head preserved — never an empty result with exit code 0. A process
  killed by a signal is never `ok`.
- **Failures explain themselves.** The error message carries the exit code *and* the
  head of stderr. `result.ok`, `result.cause`, typed `FailureKind` for programmatic
  handling.
- **Secrets stay out of logs.** Command echoes, events, and error messages pass
  through the same masking rules — tokens, keys, URL credentials, PEM blocks.
- **Results read like strings.** `` `Branch: ${await $`git branch --show-current`}` ``
  works the way `$(...)` works in a shell.
- **Connections are pooled.** SSH reuses authenticated connections, reconnects on
  drop, and cleans up on dispose.

## Everything is a chain, every environment is equal

```typescript
// Each of these returns a new immutable context.
const staging = $.ssh('deploy@staging')
  .cd('/srv/app')
  .env({ NODE_ENV: 'staging' })
  .timeout(60_000)
  .retry({ maxRetries: 3 });

await staging`pnpm migrate`;

// The identical chain works on a pod:
const pod = $.k8s('staging/api').cd('/srv/app').env({ NODE_ENV: 'staging' });
await pod`node healthcheck.js`;

// Results are structured:
const result = await staging`git rev-parse HEAD`.nothrow();
result.ok        // boolean — exit 0 and no signal
result.stdout    // string
result.exitCode  // number (128+signal for signalled processes)
result.cause     // why not ok

// Or go straight to the shape you need:
const pkg   = await $`cat package.json`.json<{ version: string }>();
const files = await $`ls -1`.lines();

// Environment-specific power stays available:
await $.ssh('deploy@prod').tunnel({ localPort: 5432, remoteHost: 'db', remotePort: 5432 });
await $.k8s('production/api').pod('api-7f9d').portForward(8080, 80);
await $.k8s('production/api').pod('api-7f9d').follow(line => audit(line));
```

## Packages

| Package | What it is |
|---------|------------|
| **[@xec-sh/core](packages/core)** | The execution engine: `$`, adapters, pooling, masking. One runtime dependency (`ssh2`), loaded only when an SSH target is used. |
| **[@xec-sh/cli](apps/xec)** | `xec` command: run scripts and tasks against configured targets. |
| **[@xec-sh/ops](packages/ops)** | Deploy strategies, pipelines, health checks, secrets, discovery. |
| **[@xec-sh/kit](packages/kit)** | Terminal UI: prompts, spinners, tables, colors. |
| **[@xec-sh/loader](packages/loader)** | TypeScript script loading, CDN modules with integrity pinning, REPL. |
| **[@xec-sh/testing](packages/testing)** | Docker/SSH/kind fixtures for testing against real environments. |

```bash
pnpm add @xec-sh/core     # the engine
pnpm add -g @xec-sh/cli   # the CLI
```

## The CLI

```bash
xec on deploy@prod-1 'systemctl restart app'   # SSH
xec in postgres-main 'pg_dump mydb'            # Docker container by name
xec in pods.api 'cat /var/log/app.log'         # Kubernetes pod from config
xec run script.ts                              # TypeScript script with $ in scope
xec forward hosts.prod 8080:80                 # port forwarding, incl. reverse (-r)
```

Targets, defaults and tasks live in `.xec/config.yaml`; scripts get the same `$` API.

## What Xec is not

- **Not an Ansible replacement.** No inventory graph, no declarative convergence.
  Xec is imperative TypeScript for the automation you would otherwise write in bash —
  with types, tests and one API instead of four.
- **Not an SDK wrapper.** Adapters speak the native tools (ssh2 protocol, docker CLI,
  kubectl), so behaviour matches what you would get by hand — including exit codes.

## Development

```bash
corepack enable && pnpm install && pnpm build
pnpm test                 # unit tests
pnpm --filter @xec-sh/core docker:start   # SSH test fixtures
pnpm lint && pnpm typecheck               # both are kept at zero
```

License: MIT

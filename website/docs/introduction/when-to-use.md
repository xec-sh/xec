---
sidebar_position: 4
sidebar_label: When to Use Xec
title: When to Use Xec
description: Choose between command execution, scripts, project tasks and operational orchestration
---

# When to Use Xec {#when-to-use-xec}

Choose Xec when operational commands need a reusable, inspectable interface:
local developer tooling, remote diagnostics, container checks, release delivery
or a combination of those. Start at the smallest layer that owns your need.

## Choose your entry point {#choose-your-entry-point}

| Need | Start here | Boundary |
| --- | --- | --- |
| Run one remote observation | [`xec on` / `xec in`](../commands/overview.md) | The target and command must already be meaningful. |
| Parse output and make decisions | [TypeScript script](./quick-start.md) | Validate input and own cleanup explicitly. |
| Execute commands inside a service/tool | [`@xec-sh/core`](../core/execution-engine/overview.md) | No CLI globals or task configuration required. |
| Name repeatable project actions | [YAML tasks](../configuration/tasks/overview.md) | Simple execution, not durable scheduling or automatic rollback. |
| Give humans and agents structured options/help | [Dynamic commands](../commands/custom/creating-commands.md) | Command code owns policy and validation. |
| Coordinate dependencies or matrix runs | [Pipeline](../ops/pipeline.md) / [Workflow](../ops/workflow.md) | Review the selected API's caching, cancellation and retry contract. |
| Publish already accepted npm artifacts | [Release workflow](../ops/release.md) | Preparation, acceptance and publication remain separate. |
| Build a terminal interface | [Kit](../kit/index.md) | UI accompanies the same underlying operation API. |

## Local project automation {#development-tooling}

Use a project-pinned CLI to give every developer and CI the same commands.
Tasks can name a build or check; TypeScript can handle paths, parse JSON or
combine outcomes. You do not need remote infrastructure to benefit.

If Turbo already owns a package graph and cache, keep it there. An Xec task
can invoke Turbo; adding an alternate package dependency scheduler would
introduce competing sources of truth.

## Remote diagnostics and maintenance {#system-administration}

Use explicit targets, least-privileged accounts and bounded concurrency. A
read-only inspection is a useful first workflow before adding mutations.

```typescript
import { ExecutionEngine, createCallableEngine } from '@xec-sh/core';

async function inspectServer(host: string) {
  const engine = createCallableEngine(new ExecutionEngine());
  const server = engine.ssh({ host, username: 'deploy' });
  try {
    return {
      host,
      node: await server`node --version`.text(),
      disk: await server`df -h`.text(),
    };
  } finally {
    await engine.dispose();
  }
}

console.log(await inspectServer('build.example.com'));
```

This assumes Node and the POSIX `df` utility on that host. Selecting SSH changes
the execution location; it does not make local paths or programs available there.

## Containers and test environments {#container-management}

Core is useful when a test owns an ephemeral container or needs to execute in
an existing one. Use [Testing](../guides/automation/testing.md) for disposable fixtures
where its helpers fit. Distinguish the container's filesystem from the host's,
and do not confuse application commands with Docker-daemon management.

A live application deployment still needs a lifecycle owner, readiness criteria
and a recovery policy. A successful `docker exec` is only one observation.

## CI, releases and agent workflows {#cicd-pipelines}

Expose the same project command to people, CI and agents. Keep validation and
state checks in the operation itself, with structured inputs and inspectable
outcomes. An agent should not reconstruct an unpublished sequence of shell
commands to perform a normal release.

A production workflow should distinguish preparation from activation, identify
exact artifacts, retain rollback inputs and reconcile uncertain remote effects
before retrying. Those guarantees come from the workflow's implementation,
not from wrapping arbitrary commands in a task named `deploy`.

## When another owner is necessary {#when-not-to-use-xec}

- **Infrastructure desired state:** use a provisioning/configuration system;
  orchestrate its public interface from Xec when useful.
- **Long-running application supervision:** use Omnitron or the platform's
  service manager for restart policy and persistent lifecycle ownership.
- **Durable distributed jobs:** use a scheduler that records and recovers jobs
  across process/machine failure. YAML `schedule:` does not provide this in 0.12.0.
- **Hard real-time or in-process computation:** keep timing-sensitive/data-heavy
  work in its appropriate runtime. Xec can coordinate it at the process boundary.
- **A trivial one-off shell command:** it may need no additional tooling.

These boundaries do not exclude Xec from local scripts or from an application's
backend. Importing Core is independent of choosing a UI framework or a supervisor.

## Performance and security {#performance-considerations}

Measure startup, connection setup, command time and cleanup separately. Reuse
connections within their owner, bound concurrency and avoid repeating builds
whose accepted inputs and outputs have not changed. There is no universal
latency or memory figure valid for every host and target.

Tagged-template escaping protects argument construction, not authorization.
Treat project command modules and YAML shell text as code. Keep credentials out
of arguments and diagnostics, verify SSH host keys, and restrict the target
account. Do not use script execution or `--dry-run` as a security sandbox.

## See also {#see-also}

- [Design a project workflow](../guides/automation/workflow-design.md).
- [Core concepts](./core-concepts.md).
- [Comparison with other tools](./comparison.md).
- [Task capabilities and published limitations](../configuration/tasks/overview.md).

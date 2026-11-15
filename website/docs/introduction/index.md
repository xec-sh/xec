---
sidebar_position: 1
title: Introduction
description: Choose the Xec CLI, TypeScript execution API, tasks, or orchestration for your workflow
keywords: [xec, typescript, automation, ssh, docker, kubernetes]
---

# Xec {#universal-command-execution-for-the-modern-stack}

Xec turns operational commands into reusable TypeScript workflows. Run a local
check, inspect several SSH hosts, execute inside a container, or give a project
its own CLI. The same execution API carries output, exit status and errors across
those targets; the target's shell, permissions and installed tools still matter.

## Choose an entry point {#choose-an-entry-point}

| Your task | Use | Why |
| --- | --- | --- |
| Run a command on a host, container or pod | [Built-in CLI commands](../commands/overview.md) | Select a target without writing a program. |
| Combine commands with parsing, conditions or cleanup | [TypeScript scripts](./quick-start.md) | Use normal control flow and typed execution results. |
| Execute commands inside an existing application | [`@xec-sh/core`](../core/execution-engine/overview.md) | Import the library without adopting the CLI. |
| Give a repository named repeatable actions | [YAML tasks](../configuration/tasks/overview.md) | Keep commands and their parameters in project configuration. |
| Offer options, help and a deliberate operator interface | [Dynamic project commands](../commands/custom/creating-commands.md) | Register commands in `.xec/commands/`. |
| Coordinate a dependency graph, matrix or release | [Ops](./ecosystem.md) | Compose the execution engine through the owning orchestration API. |
| Build a terminal application | [Kit](../kit/index.md) | Reuse prompts, progress, formatting and keyboard interaction. |

These are composable layers. A project command can call an Ops pipeline, whose
steps use Core. A task can invoke an existing package build tool. You do not need
a separate implementation for the terminal, CI and an AI agent.

## Start with an observable operation {#your-first-script}

In a project with `@xec-sh/core` installed, this ESM script reports the current
Git revision and uncommitted changes:

```typescript
import { $ } from '@xec-sh/core';

const revision = await $`git rev-parse --short HEAD`.text();
const changes = await $`git status --short`.text();
console.log({ revision, changes });
```

Run a TypeScript file through `xec run inspect.ts`, or import Core in an existing
TypeScript application. The [quick start](./quick-start.md) supplies the complete
installation, file and command sequence.

## Select where a command runs {#execution-engine}

```typescript
import { $ } from '@xec-sh/core';

const localVersion = await $`node --version`.text();
console.log(localVersion);

// Requires an existing SSH host with a configured credential and trusted key.
const host = $.ssh({ host: 'build.example.com', username: 'deploy' });
try {
  console.log(await host`node --version`.text());
} finally {
  await $.dispose();
}
```

Docker execution runs inside a container; Kubernetes execution runs inside a
pod. Commands such as `kubectl rollout` normally run on the operator's machine
with its cluster credentials, not inside an application pod. See
[targets](../configuration/targets/overview.md) for those boundaries.

## What Xec owns {#-architecture}

Xec owns command construction, target adapters and the workflow mechanisms you
choose to use. It does not infer an application's deployment policy from shell
commands. A successful command does not by itself prove a service is ready, a
backup is restorable or a rollout can be reversed.

Keep responsibility with the right component:

- Turbo or another build tool can own the package dependency graph and build cache.
- Omnitron or a service manager can own long-running application lifecycle.
- A provisioning system can own desired infrastructure state.
- Xec can orchestrate these tools and make their outcomes visible through one
  project interface.

For a critical change, define its target, expected prior state, acceptance check
and recovery behavior in the workflow. Reconcile an uncertain remote outcome
before repeating the effect. TypeScript types and escaped arguments help;
they do not replace authorization or state verification.

## Read the documentation by goal {#-next-steps}

- [Installation](./installation.md) and [quick start](./quick-start.md): run a first project.
- [Core concepts](./core-concepts.md): understand execution, targets and outcomes.
- [When to use Xec](./when-to-use.md): select the appropriate layer and boundaries.
- [Design a project workflow](../guides/automation/workflow-design.md): grow from a script to a project interface.
- [Package ecosystem](./ecosystem.md): choose the APIs your application needs.

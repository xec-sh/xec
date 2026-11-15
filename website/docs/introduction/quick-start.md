---
sidebar_position: 2
sidebar_label: Quick Start
title: Quick Start
description: Run a script, define a task, inspect configuration and select a target
---

# Quick Start {#quick-start}

This guide starts with local, read-only operations. It then adds a named task
and shows how to select a remote target explicitly. Use Node.js 22.18.0 or later.

## Install in your project {#installation}

In a directory containing `package.json`:

```bash
npm install --save-dev --save-exact @xec-sh/cli
npx xec --version
```

Commit the manifest and lockfile. In the examples below, `npx xec` uses this
local installation. With pnpm, use `pnpm exec xec` instead.

## Run a script {#execute-a-script}

Create `inspect.ts`:

```typescript
/// <reference types="@xec-sh/cli/globals" />

const label = args[0] ?? 'local';
const version = await $`node --version`.text();
console.log({ label, version });
```

```bash
npx xec run inspect.ts workstation
```

Xec supplies `$`, `args` and other documented script globals. The type reference
helps an editor understand them; it does not launch Xec. If you run code inside
an existing application instead, import `$` from `@xec-sh/core` explicitly.

Use TypeScript when a workflow needs data parsing, typed inputs, branching or
`try`/`finally`. A file loaded by Xec runs with the privileges of the CLI process;
it is not sandboxed.

## Give repeated work a name {#project-configuration}

Create `.xec/config.yaml`:

```yaml
version: "1.0"
name: first-xec-project

tasks:
  check-node:
    description: Report the local Node.js version
    command: node --version

  greet:
    description: Greet a named operator
    params:
      - name: name
        type: string
        default: engineer
    env:
      GREETING: "Hello, ${params.name}"
    command: node -e "console.log(process.env.GREETING)"

  check:
    description: Run the project checks in order
    steps:
      - name: Node version
        task: check-node
      - name: Greeting
        task: greet
```

```bash
npx xec inspect tasks
npx xec inspect tasks check --explain
npx xec run check
npx xec run greet -p name=Ada
```

`check-node`, `greet` and `check` belong to this project. `xec run` is the built-in
that runs them. The greeting travels through an environment variable rather
than becoming part of a shell command. YAML `${...}` interpolation in command
strings is textual in published 0.12.0; it does not provide the escaping of Core's
tagged-template API.

## Select a target {#working-with-different-environments}

For an existing SSH server, extend the same configuration with:

```yaml
targets:
  hosts:
    build:
      host: build.example.com
      user: deploy
      privateKey: ~/.ssh/deploy_key
      hostKeyChecking: strict
```

Verify and record the server's host key through your SSH trust procedure before
using strict mode. Then run:

```bash
npx xec inspect targets
npx xec on hosts.build "node --version"
```

For an existing Docker container or Kubernetes pod, the corresponding built-ins
are:

```bash
npx xec in containers.app "node --version"
npx xec in pods.api "node --version"
```

Those last two commands require matching target definitions and running
resources. Xec does not create an application or install Node in a target merely
because its name appears on the command line.

## Handle outcomes explicitly {#error-handling}

In an Xec script:

```typescript
/// <reference types="@xec-sh/cli/globals" />

const result = await $`node -e "process.exit(3)"`.nothrow();
if (!result.ok) {
  console.error(`The check exited with ${result.exitCode}`);
}
```

Commands normally reject on a nonzero exit. `.nothrow()` lets you inspect a
completed command result; transport failures and uncertain remote completion
still require their own handling. Do not repeat a state-changing command merely
because the caller lost its response.

## Grow the project interface {#creating-custom-commands}

Choose [dynamic commands](../commands/custom/creating-commands.md) when operators
need structured options, contextual help or confirmation. Keep implementation
in reusable functions, and use [Ops pipelines](../ops/pipeline.md) when steps
need an explicit dependency graph. Neither requires an alternate shell runner.

`--dry-run` is specific to the selected command. In 0.12.0 it is **not safe as a
non-execution guarantee for scripts**, including `script:` entries in tasks.
Use `xec inspect tasks NAME --explain` to inspect a task definition; even
configuration inspection can evaluate an explicitly trusted `${cmd:...}` value.

## See also {#see-also}

- [Core concepts](./core-concepts.md): execution, targets and ownership.
- [Configuration](../configuration/overview.md): files, profiles and variables.
- [Tasks](../configuration/tasks/overview.md): supported task behavior and limits.
- [`run` reference](../commands/built-in/run.md): arguments and execution modes.

---
sidebar_position: 2
sidebar_label: What is Xec?
title: What is Xec?
description: A TypeScript toolkit for command execution, project CLIs and operational workflows
---

# What is Xec? {#what-is-xec}

Xec is a TypeScript toolkit for the work around an application: scripts, project
commands, terminal interfaces, orchestration and releases. Its Core library
executes commands locally, over SSH, in Docker containers and in Kubernetes pods
through one API.

## The problem it solves {#the-problem-xec-solves}

An operational workflow often starts as a few commands. Over time it acquires
parameters, multiple targets, output parsing, checks and recovery. Maintaining
separate shell fragments, SSH clients and CI implementations makes the behavior
hard to review and reuse.

Xec lets that workflow live in ordinary code and gives it a public project
interface. The same function can serve a command-line action and an automated
caller, with an explicit target and outcome instead of an agent-only procedure.

## Use as much as the project needs {#the-xec-solution}

| Layer | Responsibility |
| --- | --- |
| Core library | Construct and execute commands; expose output and failures. |
| CLI scripts | Run TypeScript automation without a separate script compilation step. |
| Configuration/tasks | Name environments and repeatable project actions. |
| Dynamic commands | Present arguments, help and operator decisions. |
| Ops | Compose pipelines, workflows, deployment and release operations. |
| Kit | Provide a consistent terminal UI. |

A local-only repository can benefit from Xec's task interface and TypeScript
scripts. Multiple remote targets are not a prerequisite. Conversely, an
application can use Core without adopting Xec's configuration or CLI.

## What the shared API guarantees—and what it does not {#core-concepts}

Tagged command templates escape interpolated values for the selected shell.
Execution results expose exit status and captured output. Target adapters keep
local, SSH, Docker and Kubernetes execution behind a common interface.

The target still determines available tools, shell syntax, paths and access
rights. Types do not authorize infrastructure changes. An exit code alone does
not establish application readiness or recoverability. Shell strings loaded
from YAML are trusted executable text, not the tagged-template API.

## Where other tools fit {#when-should-you-use-xec}

Use Xec to orchestrate the tools that already own state: a package build tool
for the build graph, a provisioning system for desired infrastructure, and a
service manager such as Omnitron for long-running processes. Xec's task runner
is not a durable distributed scheduler or an application supervisor.

The [use-case guide](./when-to-use.md) explains which layer fits each scenario.
The [quick start](./quick-start.md) begins with a local script and a complete task
configuration, without assuming production infrastructure.

## See also {#see-also}

- [Quick start](./quick-start.md).
- [Core concepts](./core-concepts.md).
- [Package ecosystem](./ecosystem.md).
- [Design a project workflow](../guides/automation/workflow-design.md).

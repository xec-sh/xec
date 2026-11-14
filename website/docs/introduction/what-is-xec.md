---
sidebar_position: 2
sidebar_label: What is Xec?
title: What is Xec?
description: Universal command execution system for seamless operations across local, SSH, Docker, and Kubernetes environments
---

# What is Xec? {#what-is-xec}

Xec is a TypeScript toolkit for the work around your application: scripts, project commands, task orchestration, terminal interfaces and releases. Its execution engine gives local processes, SSH hosts, Docker containers and Kubernetes pods a shared command and result API. Use the packages independently or expose your workflow through the Xec CLI.

## The Problem Xec Solves {#the-problem-xec-solves}

Modern infrastructure spans multiple environments:
- Local development machines
- Remote servers via SSH
- Docker containers
- Kubernetes clusters

Each environment traditionally requires different tools and APIs:
- `child_process.exec()` for local commands
- SSH client libraries for remote execution
- Docker SDK for container operations
- kubectl or Kubernetes client for pod management

This fragmentation leads to:
- **Duplicated code** for similar operations
- **Context switching** between different APIs
- **Inconsistent error handling** across environments
- **Complex deployment scripts** with multiple tools

## The Xec Solution {#the-xec-solution}

A script can call the execution engine directly, a project can expose dynamic CLI commands, and a pipeline can coordinate those commands. The target determines where a command runs; its shell and installed tools still determine what it means.

## Core Concepts {#core-concepts}

### 1. Universal Execution {#1-universal-execution}
Use the same TypeScript execution API across environments. Select a target explicitly and account for its shell, filesystem, permissions and installed programs.

### 2. Template Literal Safety {#2-template-literal-safety}
Tagged templates escape interpolated values for the selected shell. Keep executable shell source trusted; escaping does not validate a path, grant authorization or make a program safe. Use direct argv execution when shell interpretation is unnecessary.

### 3. Promise-Based API {#3-promise-based-api}
Modern async/await support with rich execution results including stdout, stderr, exit codes, and error context.

### 4. Method Chaining {#4-method-chaining}
Fluent API for configuration with options like working directory, environment variables, timeouts, retries, and error handling.

### 5. Type Safety {#5-type-safety}
Full TypeScript support with comprehensive type definitions and IntelliSense.

## Key Features {#key-features}

### Multi-Environment Support {#multi-environment-support}
- **Local**: Direct command execution on the host machine
- **SSH**: Remote execution with connection pooling and tunneling
- **Docker**: Container operations with lifecycle management
- **Kubernetes**: Pod execution with port forwarding and log streaming
- **Remote Docker**: Docker operations over SSH

### Advanced Capabilities {#advanced-capabilities}
- **Connection pooling** for efficient resource usage
- **Explicit retries** for operations that are safe to repeat
- **Opt-in command result caching** with caller-owned invalidation; pipeline artifact caching is a separate concern
- **Stream processing** for real-time output
- **Interactive mode** for user input
- **Parallel execution** with concurrency control

### Developer Experience {#developer-experience}
- **Intuitive API** that feels like shell scripting
- **Comprehensive error messages** with context
- **Event system** for monitoring and debugging
- **Extensible architecture** via adapters
- **Zero configuration** for common use cases

## When Should You Use Xec? {#when-should-you-use-xec}

### Perfect For {#perfect-for}
- **Multi-environment deployments** where you need to execute similar commands across different platforms
- **Infrastructure automation** that spans local development, staging containers, and production clusters
- **CI/CD pipelines** requiring consistent command execution across diverse targets
- **DevOps workflows** that need type safety and error handling
- **Teams using TypeScript** who want shell scripting with full IDE support
- **Complex deployments** involving multiple steps across different environments

### Not Ideal For {#not-ideal-for}
- Desired-state infrastructure reconciliation: use a provisioning/configuration system and orchestrate it from Xec when needed
- Durable, distributed job execution across process restarts: use a scheduler with that persistence contract
- Heavy data processing: invoke the appropriate processing engine rather than moving the computation into the orchestrator

## Core Philosophy {#core-philosophy}

### Write Once, Execute Anywhere {#write-once-execute-anywhere}
Xec eliminates the need to learn different APIs for different environments. Write your automation logic once using familiar TypeScript syntax, then execute it anywhere.

### Developer Experience First {#developer-experience-first}
Every API is designed for developer productivity with comprehensive TypeScript support, intuitive method chaining, and detailed error messages.

### Production Ready {#production-ready}
Built-in features like connection pooling, automatic retries, result caching, and event monitoring ensure your scripts work reliably in production environments.

## Next Steps {#next-steps}

- [Quick Start](./quick-start.md) - Get up and running in 5 minutes  
- [Core Concepts](./core-concepts.md) - Deep dive into Xec's architecture
- [Philosophy](./philosophy.md) - Understand the design principles
- [When to Use](./when-to-use.md) - Determine if Xec fits your use case
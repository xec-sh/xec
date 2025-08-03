---
sidebar_position: 2
sidebar_label: What is Xec?
title: What is Xec?
description: Universal command execution system for seamless operations across local, SSH, Docker, and Kubernetes environments
---

# What is Xec?

Xec is a **universal command execution system** that provides a unified API for running commands across diverse environments - local machines, SSH servers, Docker containers, and Kubernetes pods - all through a single, elegant TypeScript interface.

## The Problem Xec Solves

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

## The Xec Solution

Xec provides **one API to rule them all** - the same intuitive template literal syntax works across all supported environments with automatic adaptation to each platform's requirements.

## Core Concepts

### 1. Universal Execution
Write once, run anywhere. The same command syntax works across all supported environments.

### 2. Template Literal Safety
Native JavaScript template literals with automatic escaping prevent injection attacks while maintaining readability.

### 3. Promise-Based API
Modern async/await support with rich execution results including stdout, stderr, exit codes, and error context.

### 4. Method Chaining
Fluent API for configuration with options like working directory, environment variables, timeouts, retries, and error handling.

### 5. Type Safety
Full TypeScript support with comprehensive type definitions and IntelliSense.

## Key Features

### Multi-Environment Support
- **Local**: Direct command execution on the host machine
- **SSH**: Remote execution with connection pooling and tunneling
- **Docker**: Container operations with lifecycle management
- **Kubernetes**: Pod execution with port forwarding and log streaming
- **Remote Docker**: Docker operations over SSH

### Advanced Capabilities
- **Connection pooling** for efficient resource usage
- **Automatic retries** with exponential backoff
- **Result caching** to avoid redundant executions
- **Stream processing** for real-time output
- **Interactive mode** for user input
- **Parallel execution** with concurrency control

### Developer Experience
- **Intuitive API** that feels like shell scripting
- **Comprehensive error messages** with context
- **Event system** for monitoring and debugging
- **Extensible architecture** via adapters
- **Zero configuration** for common use cases

## When Should You Use Xec?

### Perfect For
- **Multi-environment deployments** where you need to execute similar commands across different platforms
- **Infrastructure automation** that spans local development, staging containers, and production clusters
- **CI/CD pipelines** requiring consistent command execution across diverse targets
- **DevOps workflows** that need type safety and error handling
- **Teams using TypeScript** who want shell scripting with full IDE support
- **Complex deployments** involving multiple steps across different environments

### Not Ideal For
- Simple single-environment scripts (use native tools)
- Non-interactive batch processing (consider dedicated workflow engines)
- Heavy data processing (use appropriate data processing frameworks)

## Core Philosophy

### Write Once, Execute Anywhere
Xec eliminates the need to learn different APIs for different environments. Write your automation logic once using familiar TypeScript syntax, then execute it anywhere.

### Developer Experience First
Every API is designed for developer productivity with comprehensive TypeScript support, intuitive method chaining, and detailed error messages.

### Production Ready
Built-in features like connection pooling, automatic retries, result caching, and event monitoring ensure your scripts work reliably in production environments.

## Next Steps

- [Quick Start](./quick-start.md) - Get up and running in 5 minutes  
- [Core Concepts](./core-concepts.md) - Deep dive into Xec's architecture
- [Philosophy](./philosophy.md) - Understand the design principles
- [When to Use](./when-to-use.md) - Determine if Xec fits your use case
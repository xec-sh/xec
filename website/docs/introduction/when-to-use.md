---
sidebar_position: 4
sidebar_label: When to Use Xec
title: When to Use Xec
description: Understanding when Xec is the right tool for your needs
---

# When to Use Xec

Xec is not the right tool for every situation. This guide helps you determine when it is the best choice for your project.

## Perfect Use Cases

### 1. Multi-Environment Orchestration

**Scenario**: You need to coordinate operations across local, SSH, Docker, and Kubernetes environments.

**Why Xec**: Unified API eliminates the complexity of juggling multiple tools.

```typescript
// Deploy across environments with one API
await $`npm run build`;                          // Build locally
await $.ssh('deploy@staging').cd('/srv/app')`npm run deploy`; // Project-owned deployment
await $.k8s({ pod: 'web', namespace: 'default' })`curl --fail http://localhost:3000/health`; // Verify in K8s
```

### 2. DevOps Automation Scripts

**Scenario**: Writing deployment, backup, or maintenance scripts.

**Why Xec**: Replace complex bash scripts with maintainable JavaScript/TypeScript.

```typescript
// The server's package.json defines the deploy operation, including rollback.
async function deploy(environment: 'staging' | 'production') {
  const server = $.ssh({
    host: `${environment}.example.com`,
    username: 'deploy'
  }).cd('/srv/app');
  await server`npm run deploy`;
  await server`curl --fail --silent http://localhost:3000/health`;
}
```

### 3. CI/CD Pipelines

**Scenario**: Building continuous integration and deployment pipelines.

**Why Xec**: Consistent execution across different CI environments.

```typescript
// CI pipeline script
async function runCI() {
  // Run tests in parallel
  await $.parallel.all([
    $`npm test`,
    $`npm run lint`,
    $`npm run type-check`
  ]);
  
  // Build in Docker
  await $.docker({ image: 'node:24', volumes: [`${process.cwd()}:/app`], workdir: '/app' })
    `npm run build`;
  
  // Deploy if on main branch
  if (process.env.BRANCH === 'main') {
    await $.ssh('deploy@prod')`./deploy.sh`;
  }
}
```

### 4. Container Management

**Scenario**: Managing Docker containers across multiple hosts.

**Why Xec**: Simplified container operations with automatic resource cleanup.

```typescript
// Each server owns its compose.yaml and deployment policy.
async function updateContainers(hosts: string[]) {
  await $.parallel.map(hosts, (host) =>
    $.ssh({ host, username: 'deploy' }).cd('/srv/app')
      `docker compose pull && docker compose up -d --wait`,
    { maxConcurrency: 3 }
  );
}
```

### 5. System Administration

**Scenario**: Managing multiple servers and performing routine maintenance.

**Why Xec**: Execute commands across server fleets with error handling.

```typescript
// Inspect first; a maintenance task can use these observations to plan changes.
async function inspectServers(servers: string[]) {
  for (const host of servers) {
    const ssh = $.ssh({ host, username: 'admin' });
    const disk = await ssh`df -h`.text();
    const service = await ssh`systemctl is-active nginx`.nothrow();
    console.log({ host, disk, nginx: service.stdout.trim(), exitCode: service.exitCode });
  }
}
```

### 6. Testing Infrastructure

**Scenario**: Setting up and tearing down test environments.

**Why Xec**: Reliable environment management with proper cleanup.

```typescript
// app:test must contain the application and its self-contained test fixtures.
// The container exits with the test command and is removed afterwards.
async function runContainerTests() {
  await $.docker({ image: 'app:test', autoRemove: true })`npm test`;
}
```

### 7. Development Tooling

**Scenario**: Creating development tools and utilities.

**Why Xec**: Quick script development.

```typescript
// Compare service versions without copying databases or changing either host.
async function compareVersions(from: string, to: string) {
  const source = $.ssh({ host: from, username: 'deploy' }).cd('/srv/app');
  const target = $.ssh({ host: to, username: 'deploy' }).cd('/srv/app');
  const [sourceVersion, targetVersion] = await Promise.all([
    source`npm pkg get version`.text(),
    target`npm pkg get version`.text()
  ]);
  return { sourceVersion: sourceVersion.trim(), targetVersion: targetVersion.trim() };
}
```

## Good Use Cases

### Log Aggregation
Collecting and processing logs from multiple sources.

### Monitoring Scripts
Checking service health across environments.

### Data Processing Pipelines
Orchestrating data processing across systems.

### Migration Scripts
Moving data or applications between environments.

### Backup Automation
Coordinating backups across multiple systems.

## When NOT to Use Xec

### 1. High-Performance Requirements

**Issue**: JavaScript overhead for command execution.

**Alternative**: Use native system programming languages (C, Rust, Go).

### 2. Simple, Single-Environment Scripts

**Issue**: Overhead for simple local scripts.

**Alternative**: Use basic shell scripts or Node.js child_process.

```bash
# Simple enough for bash
#!/bin/bash
echo "Hello"
ls -la
```

### 3. Real-Time Systems

**Issue**: Non-deterministic execution timing.

**Alternative**: Use specialized real-time frameworks.

### 4. GUI Applications

**Issue**: Xec is designed for command-line operations.

**Alternative**: Use GUI frameworks like Electron or native toolkits.

### 5. Long-Running Services

**Issue**: Xec is designed for command execution, not service hosting.

**Alternative**: Use proper service managers (systemd, PM2, Kubernetes).

## Decision Framework

Ask yourself these questions:

### 1. Do you need to execute commands?
- ✅ **Yes** → Consider Xec
- ❌ **No** → Look elsewhere

### 2. Do you work with multiple environments?
- ✅ **Yes** → Xec is ideal
- ❌ **No** → Xec might be overkill

### 3. Do you value maintainability over raw performance?
- ✅ **Yes** → Xec is a good fit
- ❌ **No** → Consider lower-level tools

### 4. Do you need type safety and modern JavaScript features?
- ✅ **Yes** → Xec provides both
- ❌ **No** → Shell scripts might suffice

### 5. Is your team familiar with JavaScript/TypeScript?
- ✅ **Yes** → Xec will feel natural
- ❌ **No** → Consider the learning curve

## Comparison with Alternatives

### vs. Shell Scripts
- ✅ **Xec**: Type safety, better error handling, testing support
- ❌ **Shell**: Simpler for basic tasks, no runtime dependency

### vs. Ansible/Terraform
- ✅ **Xec**: More flexible, programmatic control, real-time execution
- ❌ **IaC Tools**: Better for declarative infrastructure

### vs. Node.js child_process
- ✅ **Xec**: Unified API, built-in safety, multi-environment support
- ❌ **child_process**: Lower overhead for simple local execution

### vs. SSH Libraries
- ✅ **Xec**: Simpler API, connection pooling, automatic escaping
- ❌ **SSH Libraries**: More control over SSH-specific features

### vs. Docker/K8s SDKs
- ✅ **Xec**: Unified interface, simpler commands
- ❌ **Native SDKs**: Full API access, more features

## Performance Considerations

Xec is suitable when:
- Command execution time dominates (not startup overhead)
- Convenience and safety outweigh microsecond optimizations
- You can leverage caching and connection pooling

Xec may not be suitable when:
- Executing thousands of tiny commands per second
- Microsecond latency is critical
- Memory footprint must be minimal

## Security Considerations

Xec escapes interpolated arguments and masks recognized sensitive values in normal execution diagnostics. These mechanisms do not authorize a command or make arbitrary shell text safe: treat `.raw`, `.exec()` and configuration-provided commands as trusted code.

Keep target credentials in a secret provider, restrict accounts and container privileges, and review commands that mutate infrastructure. Xec is not a tenant-isolation boundary or a substitute for operating-system and cluster access controls.

## Conclusion

Xec shines when you need to:
- **Orchestrate** commands across multiple environments
- **Automate** DevOps and system administration tasks
- **Simplify** complex shell scripting with modern JavaScript
- **Maintain** readable, testable infrastructure code

Choose Xec when the benefits of a unified, safe, and maintainable API outweigh the overhead of a JavaScript runtime. For most DevOps, automation, and orchestration tasks, Xec provides the perfect balance of power and simplicity.
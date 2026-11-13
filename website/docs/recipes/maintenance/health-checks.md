---
title: Service Health Monitoring
description: Monitor service health and availability across multiple environments
keywords: [health checks, monitoring, uptime, availability, alerting]
source_files:
  - packages/ops/src/health/index.ts
  - packages/ops/src/config/target-resolver.ts
---

# Service Health Monitoring

## Problem

Monitoring the health and availability of services across multiple environments (local, containers, Kubernetes, remote servers) requires different tools and approaches. Teams need consistent health checking, automated alerting, and historical tracking.

## Solution

Xec provides a unified approach to health monitoring by executing health checks across all target types using the same API, enabling consistent monitoring regardless of deployment environment.

## Quick Example

```typescript
import { HealthChecker } from '@xec-sh/ops';
const report = await HealthChecker.create()
  .http('http://127.0.0.1:3000/health', { timeout: 2000, status: 200 })
  .tcp('127.0.0.1', 5432, { timeout: 1000 })
  .run();
console.log(report);
if (!report.healthy) process.exitCode = 1;
```

## Complete Health Monitoring System

### 1. Multi-Environment Health Checks

```typescript
import { HealthChecker } from '@xec-sh/ops';
const checker = HealthChecker.create()
  .http('https://staging.example.com/health', { timeout: 5000 })
  .custom('production-service', async () => {
    const result = await $.ssh({ host: 'prod.example.com', username: 'observer' })
      `curl --fail --silent http://localhost:3000/health`.timeout(5000).nothrow();
    return result.ok;
  });
const report = await checker.run();
for (const check of report.checks) console.log(check.name, check.healthy, check.error ?? check.message);
if (!report.healthy) throw new Error('One or more services failed their declared check');
```

### 2. Docker Container Health Monitoring

```typescript
import { HealthChecker } from '@xec-sh/ops';
const checker = HealthChecker.create().custom('app-container', async () => {
  const result = await $`docker inspect --format=${'{{.State.Health.Status}}'} app-container`.timeout(5000).nothrow();
  return result.ok && result.stdout.trim() === 'healthy';
});
const report = await checker.run();
console.log(report);
// Running without a declared healthcheck is not evidence of application health.
if (!report.healthy) process.exitCode = 1;
```

### 3. Kubernetes Pod Health Monitoring

```typescript
import { HealthChecker } from '@xec-sh/ops';
const report = await HealthChecker.create()
  .command('kubectl --context staging --namespace myapp wait --for=condition=Ready pod --all --timeout=10s', { timeout: 15_000 })
  .http('https://staging.example.com/health', { timeout: 3000 })
  .run();
console.log(report);
if (!report.healthy) process.exitCode = 1;
// Pod readiness and application health are separate observations.
```

### 4. Continuous Health Monitoring

```typescript
import { HealthChecker } from '@xec-sh/ops';
import { getExecutionSignal } from '@xec-sh/core';
import { setTimeout as delay } from 'node:timers/promises';
const signal = getExecutionSignal();
const checker = HealthChecker.create().http('http://127.0.0.1:3000/health', { timeout: 2000 });
while (true) {
  signal?.throwIfAborted();
  const report = await checker.run({ signal });
  console.log(JSON.stringify(report));
  await delay(10_000, undefined, { signal });
}
// A supervisor owns this process; alert routing belongs to the monitoring system.
```

### 5. Configuration File

Use the ordinary Xec configuration to name targets; the typed `HealthChecker` script defines the actual probes. There is no separate implicit health YAML loader.

```yaml
version: '1.0'
targets:
  hosts:
    production:
      host: prod.example.com
      username: observer
```

The custom SSH probe above is explicit about its host. To use the configured name instead, resolve it through `ConfigurationManager` and `TargetResolver` as shown in the [configuration guide](../../configuration/overview.md).

### 6. Xec Task Configuration

```yaml
version: '1.0'
tasks:
  health:check:
    description: Run the bounded health-check script once
    command: xec run scripts/health-check.ts
  health:monitor:
    description: Run the continuous monitor in the foreground
    command: xec run scripts/continuous-monitor.ts
```

Save the corresponding examples under these paths. An external supervisor may own the continuous task; `daemon: true` is not a Xec task option.

## Best Practices

### 1. Health Check Design
- **Fast checks**: Keep health checks under 5 seconds
- **Dependency checks**: Verify critical dependencies (DB, cache, etc.)
- **Graceful degradation**: Distinguish between critical and non-critical failures
- **Detailed responses**: Include version, uptime, and dependency status

### 2. Monitoring Strategy
- **Multi-level checks**: Application, system, and infrastructure health
- **Appropriate intervals**: Balance between freshness and load
- **Historical tracking**: Store metrics for trend analysis
- **Automated recovery**: Implement self-healing where possible

### 3. Alert Management
- **Smart alerting**: Avoid alert fatigue with proper thresholds
- **Escalation paths**: Define clear escalation procedures
- **Runbook integration**: Link alerts to remediation guides
- **Correlation**: Group related alerts to identify root causes

## Common Patterns

### Health Endpoint Implementation
```typescript
// The application owns /health and its DB/cache checks. Xec consumes that contract.
import { HealthChecker } from '@xec-sh/ops';
await HealthChecker.create().http('http://127.0.0.1:3000/health', { status: 200, timeout: 2000 })
  .waitUntilHealthy({ timeout: 30_000, interval: 500 });
```

### Load Balancer Integration
```bash
# HAProxy health check
backend web_servers
    option httpchk GET /health
    http-check expect status 200
    server web1 10.0.1.10:3000 check
    server web2 10.0.1.11:3000 check
```

## Troubleshooting

### Common Issues

1. **False positives**: Health check passes but service is degraded
   - Add more comprehensive checks
   - Verify actual functionality, not just process existence

2. **Flapping services**: Services repeatedly failing and recovering
   - Increase check intervals
   - Add hysteresis to prevent rapid state changes

3. **Cascading failures**: One failure triggers multiple alerts
   - Implement dependency mapping
   - Use circuit breakers

## Related Topics

- [Log Aggregation](./log-aggregation.md) - Centralized logging
- [Backup & Restore](./backup-restore.md) - Data protection
- [Certificate Renewal](./certificate-renewal.md) - SSL management
- [GitHub Actions Integration](../integration/github-actions.md) - CI/CD health checks
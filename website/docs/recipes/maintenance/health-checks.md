---
title: Service Health Monitoring
description: Monitor service health and availability across multiple environments
keywords: [health checks, monitoring, uptime, availability, alerting]
source_files:
  - packages/core/src/adapters/ssh-adapter.ts
  - packages/core/src/adapters/docker-adapter.ts
  - packages/core/src/adapters/k8s-adapter.ts
  - packages/core/src/utils/retry.ts
  - apps/xec/src/commands/on.ts
key_functions:
  - SSHAdapter.execute()
  - DockerAdapter.exec()
  - KubernetesAdapter.exec()
  - retry()
  - parallel()
verification_date: 2025-08-03
---

# Service Health Monitoring

## Problem

Monitoring the health and availability of services across multiple environments (local, containers, Kubernetes, remote servers) requires different tools and approaches. Teams need consistent health checking, automated alerting, and historical tracking.

## Solution

Xec provides a unified approach to health monitoring by executing health checks across all target types using the same API, enabling consistent monitoring regardless of deployment environment.

## Quick Example

```typescript
// health-check.ts
import { $ } from '@xec-sh/core';

// Check health across all production servers
const results = await $.ssh('prod-*')`curl -f http://localhost:3000/health`;

// Check all results
const allHealthy = results.every(r => r.exitCode === 0);
console.log(allHealthy ? '✅ All services healthy' : '❌ Some services unhealthy');
```

## Complete Health Monitoring System

### 1. Multi-Environment Health Checks

```typescript
// health-monitor.ts
import { $, on, docker, k8s } from '@xec-sh/core';
import { parallel } from '@xec-sh/core/utils';

interface HealthCheckResult {
  target: string;
  service: string;
  healthy: boolean;
  responseTime: number;
  details?: any;
}

class HealthMonitor {
  private checks: HealthCheckResult[] = [];

  // HTTP health endpoint check
  async checkHttpHealth(target: string, url: string): Promise<HealthCheckResult> {
    const start = Date.now();
    
    try {
      const result = await on(target)`
        curl -s -f -w '%{http_code}' -o /dev/null ${url}
      `;
      
      return {
        target,
        service: 'http',
        healthy: result.exitCode === 0,
        responseTime: Date.now() - start,
        details: { statusCode: result.stdout.trim() }
      };
    } catch (error) {
      return {
        target,
        service: 'http',
        healthy: false,
        responseTime: Date.now() - start,
        details: { error: error.message }
      };
    }
  }

  // Process health check
  async checkProcessHealth(target: string, processName: string): Promise<HealthCheckResult> {
    const start = Date.now();
    
    const result = await on(target)`
      pgrep -f ${processName} > /dev/null && echo "running" || echo "stopped"
    `;
    
    return {
      target,
      service: processName,
      healthy: result.stdout.trim() === 'running',
      responseTime: Date.now() - start
    };
  }

  // Port availability check
  async checkPortHealth(target: string, port: number): Promise<HealthCheckResult> {
    const start = Date.now();
    
    const result = await on(target)`
      nc -z localhost ${port} && echo "open" || echo "closed"
    `;
    
    return {
      target,
      service: `port-${port}`,
      healthy: result.stdout.trim() === 'open',
      responseTime: Date.now() - start
    };
  }

  // Database health check
  async checkDatabaseHealth(target: string, dbType: string): Promise<HealthCheckResult> {
    const start = Date.now();
    let command = '';
    
    switch (dbType) {
      case 'postgres':
        command = 'pg_isready -h localhost';
        break;
      case 'mysql':
        command = 'mysqladmin ping -h localhost';
        break;
      case 'redis':
        command = 'redis-cli ping';
        break;
      case 'mongodb':
        command = 'mongosh --eval "db.adminCommand({ping: 1})" --quiet';
        break;
    }
    
    const result = await on(target)`${command}`;
    
    return {
      target,
      service: `db-${dbType}`,
      healthy: result.exitCode === 0,
      responseTime: Date.now() - start
    };
  }

  // Run all health checks
  async runAllChecks(config: HealthConfig): Promise<HealthCheckResult[]> {
    const checks = [];
    
    // HTTP endpoint checks
    for (const endpoint of config.endpoints) {
      for (const target of endpoint.targets) {
        checks.push(this.checkHttpHealth(target, endpoint.url));
      }
    }
    
    // Process checks
    for (const process of config.processes) {
      for (const target of process.targets) {
        checks.push(this.checkProcessHealth(target, process.name));
      }
    }
    
    // Port checks
    for (const port of config.ports) {
      for (const target of port.targets) {
        checks.push(this.checkPortHealth(target, port.number));
      }
    }
    
    // Database checks
    for (const db of config.databases) {
      for (const target of db.targets) {
        checks.push(this.checkDatabaseHealth(target, db.type));
      }
    }
    
    // Run all checks in parallel
    this.checks = await Promise.all(checks);
    return this.checks;
  }

  // Generate health report
  generateReport(): string {
    const healthy = this.checks.filter(c => c.healthy).length;
    const unhealthy = this.checks.filter(c => !c.healthy).length;
    const avgResponseTime = this.checks.reduce((sum, c) => sum + c.responseTime, 0) / this.checks.length;
    
    let report = `
Health Check Report
==================
Total Checks: ${this.checks.length}
Healthy: ${healthy} (${(healthy / this.checks.length * 100).toFixed(1)}%)
Unhealthy: ${unhealthy} (${(unhealthy / this.checks.length * 100).toFixed(1)}%)
Avg Response Time: ${avgResponseTime.toFixed(0)}ms

Details:
--------
`;
    
    for (const check of this.checks) {
      const status = check.healthy ? '✅' : '❌';
      report += `${status} ${check.target}/${check.service} - ${check.responseTime}ms\n`;
      if (!check.healthy && check.details?.error) {
        report += `   Error: ${check.details.error}\n`;
      }
    }
    
    return report;
  }
}

// Configuration
interface HealthConfig {
  endpoints: Array<{ url: string; targets: string[] }>;
  processes: Array<{ name: string; targets: string[] }>;
  ports: Array<{ number: number; targets: string[] }>;
  databases: Array<{ type: string; targets: string[] }>;
}

// Usage
const config: HealthConfig = {
  endpoints: [
    { url: 'http://localhost:3000/health', targets: ['web-1', 'web-2'] },
    { url: 'http://localhost:8080/api/health', targets: ['api-1', 'api-2'] }
  ],
  processes: [
    { name: 'node', targets: ['web-1', 'web-2'] },
    { name: 'nginx', targets: ['lb-1'] }
  ],
  ports: [
    { number: 3000, targets: ['web-1', 'web-2'] },
    { number: 5432, targets: ['db-1'] }
  ],
  databases: [
    { type: 'postgres', targets: ['db-1'] },
    { type: 'redis', targets: ['cache-1'] }
  ]
};

const monitor = new HealthMonitor();
await monitor.runAllChecks(config);
console.log(monitor.generateReport());
```

### 2. Docker Container Health Monitoring

```typescript
// docker-health.ts
import { docker } from '@xec-sh/core';

interface DockerHealth {
  container: string;
  status: string;
  healthy: boolean;
  restartCount: number;
  uptime: string;
}

async function checkDockerHealth(): Promise<DockerHealth[]> {
  // Get all running containers with health status
  const result = await docker()`
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Health}}" --no-trunc
  `;
  
  const lines = result.stdout.trim().split('\n').slice(1); // Skip header
  const health: DockerHealth[] = [];
  
  for (const line of lines) {
    const [container, status, healthStatus] = line.split('\t');
    
    // Get detailed container info
    const inspect = await docker()`
      docker inspect ${container} --format '{{.RestartCount}},{{.State.Health.Status}}'
    `;
    
    const [restartCount, actualHealth] = inspect.stdout.trim().split(',');
    
    health.push({
      container,
      status,
      healthy: actualHealth === 'healthy' || !actualHealth,
      restartCount: parseInt(restartCount),
      uptime: status.match(/Up (.*?)(\s|$)/)?.[1] || 'unknown'
    });
  }
  
  return health;
}

// Monitor and restart unhealthy containers
async function maintainContainerHealth() {
  const health = await checkDockerHealth();
  
  for (const container of health) {
    if (!container.healthy || container.restartCount > 3) {
      console.log(`⚠️ Container ${container.container} is unhealthy`);
      
      // Restart unhealthy container
      await docker()`docker restart ${container.container}`;
      console.log(`🔄 Restarted ${container.container}`);
      
      // Wait for container to be healthy
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Verify health after restart
      const newHealth = await docker()`
        docker inspect ${container.container} --format '{{.State.Health.Status}}'
      `;
      
      if (newHealth.stdout.trim() === 'healthy') {
        console.log(`✅ ${container.container} is now healthy`);
      } else {
        console.log(`❌ ${container.container} still unhealthy - manual intervention required`);
      }
    }
  }
}
```

### 3. Kubernetes Pod Health Monitoring

```typescript
// k8s-health.ts
import { k8s } from '@xec-sh/core';

interface PodHealth {
  namespace: string;
  name: string;
  ready: boolean;
  restarts: number;
  status: string;
}

async function checkK8sHealth(namespace: string = 'default'): Promise<PodHealth[]> {
  // Get pod health status
  const result = await k8s()`
    kubectl get pods -n ${namespace} -o json
  `;
  
  const pods = JSON.parse(result.stdout);
  const health: PodHealth[] = [];
  
  for (const pod of pods.items) {
    const containerStatuses = pod.status.containerStatuses || [];
    const ready = containerStatuses.every(c => c.ready);
    const restarts = containerStatuses.reduce((sum, c) => sum + c.restartCount, 0);
    
    health.push({
      namespace,
      name: pod.metadata.name,
      ready,
      restarts,
      status: pod.status.phase
    });
    
    // Check pod events for issues
    if (!ready || restarts > 0) {
      const events = await k8s()`
        kubectl get events -n ${namespace} --field-selector involvedObject.name=${pod.metadata.name} --sort-by='.lastTimestamp' | tail -5
      `;
      console.log(`Events for ${pod.metadata.name}:\n${events.stdout}`);
    }
  }
  
  return health;
}

// Automated pod recovery
async function recoverUnhealthyPods(namespace: string = 'default') {
  const health = await checkK8sHealth(namespace);
  
  for (const pod of health) {
    if (!pod.ready || pod.restarts > 5) {
      console.log(`⚠️ Pod ${pod.name} is unhealthy`);
      
      // Delete pod to trigger recreation
      await k8s()`kubectl delete pod ${pod.name} -n ${namespace}`;
      console.log(`🔄 Deleted pod ${pod.name} for recreation`);
      
      // Wait for new pod to be ready
      await k8s()`
        kubectl wait --for=condition=ready pod -l app=${pod.name.split('-')[0]} -n ${namespace} --timeout=60s
      `;
      console.log(`✅ New pod ready for ${pod.name}`);
    }
  }
}
```

### 4. Continuous Health Monitoring

```typescript
// continuous-monitor.ts
import { $ } from '@xec-sh/core';
import { createWriteStream } from 'fs';

class ContinuousMonitor {
  private interval: NodeJS.Timer;
  private logStream: any;
  
  constructor(
    private config: HealthConfig,
    private intervalMs: number = 60000,
    private logFile: string = 'health.log'
  ) {
    this.logStream = createWriteStream(logFile, { flags: 'a' });
  }
  
  async start() {
    console.log('🚀 Starting continuous health monitoring...');
    
    // Run initial check
    await this.runCheck();
    
    // Schedule regular checks
    this.interval = setInterval(() => this.runCheck(), this.intervalMs);
  }
  
  async runCheck() {
    const timestamp = new Date().toISOString();
    const monitor = new HealthMonitor();
    const results = await monitor.runAllChecks(this.config);
    
    // Log results
    const summary = {
      timestamp,
      total: results.length,
      healthy: results.filter(r => r.healthy).length,
      unhealthy: results.filter(r => !r.healthy).length,
      avgResponseTime: results.reduce((sum, r) => sum + r.responseTime, 0) / results.length
    };
    
    this.logStream.write(JSON.stringify(summary) + '\n');
    
    // Alert on failures
    const failures = results.filter(r => !r.healthy);
    if (failures.length > 0) {
      await this.sendAlert(failures);
    }
    
    // Display status
    console.log(`[${timestamp}] Health: ${summary.healthy}/${summary.total} (${summary.avgResponseTime.toFixed(0)}ms)`);
  }
  
  async sendAlert(failures: HealthCheckResult[]) {
    // Send alert via webhook, email, etc.
    const message = failures.map(f => `${f.target}/${f.service}`).join(', ');
    console.log(`🚨 ALERT: Services unhealthy: ${message}`);
    
    // Example: Send to Slack
    if (process.env.SLACK_WEBHOOK) {
      await fetch(process.env.SLACK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🚨 Health Check Alert: ${failures.length} services unhealthy`,
          attachments: failures.map(f => ({
            color: 'danger',
            text: `${f.target}/${f.service} - ${f.details?.error || 'Failed'}`
          }))
        })
      });
    }
  }
  
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.logStream.end();
      console.log('🛑 Stopped health monitoring');
    }
  }
}

// Start monitoring
const monitor = new ContinuousMonitor(config, 60000);
await monitor.start();

// Graceful shutdown
process.on('SIGINT', () => {
  monitor.stop();
  process.exit(0);
});
```

### 5. Configuration File

```yaml
# .xec/health-config.yaml
health:
  interval: 60s
  timeout: 5s
  retries: 3
  
  targets:
    production:
      - web-1.prod.example.com
      - web-2.prod.example.com
      - api-1.prod.example.com
      - db-1.prod.example.com
    staging:
      - staging.example.com
    
  checks:
    http:
      - name: web-health
        url: http://localhost:3000/health
        targets: [production.web-*, staging]
        expect:
          status: 200
          body: "ok"
          
    process:
      - name: node-app
        command: pgrep -f "node.*app.js"
        targets: [production.web-*]
        
    port:
      - name: web-port
        port: 3000
        targets: [production.web-*]
        
    database:
      - name: postgres-main
        type: postgres
        targets: [production.db-*]
        connection: "postgresql://localhost/myapp"
        
  alerts:
    slack:
      webhook: ${SLACK_WEBHOOK}
      channel: "#ops"
    email:
      to: ops@example.com
      from: monitoring@example.com
```

### 6. Xec Task Configuration

```yaml
# .xec/config.yaml
tasks:
  health:check:
    description: Run health checks across all environments
    command: xec run scripts/health-check.ts
    
  health:monitor:
    description: Start continuous health monitoring
    command: xec run scripts/continuous-monitor.ts
    daemon: true
    
  health:report:
    description: Generate health report
    params:
      - name: format
        values: [json, html, markdown]
        default: markdown
    command: |
      xec run scripts/health-report.ts --format=${params.format}
```

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
```javascript
// health-endpoint.js
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {}
  };
  
  // Check database
  try {
    await db.query('SELECT 1');
    health.checks.database = 'ok';
  } catch (e) {
    health.checks.database = 'failed';
    health.status = 'degraded';
  }
  
  // Check cache
  try {
    await redis.ping();
    health.checks.cache = 'ok';
  } catch (e) {
    health.checks.cache = 'failed';
    health.status = 'degraded';
  }
  
  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});
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
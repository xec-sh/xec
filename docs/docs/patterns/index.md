---
title: Common Patterns & Best Practices
description: Design patterns and best practices for Xec automation
keywords: [patterns, best practices, design, architecture, automation]
verification_date: 2025-08-03
---

# Common Patterns & Best Practices

## Overview

This section covers common patterns, best practices, and design approaches for building robust automation with Xec.

## Pattern Categories

### Execution Patterns
- [Error Handling](../guides/advanced/error-handling.md) - Robust error management
- [Parallel Execution](../core/execution-engine/performance/parallel-execution.md) - Concurrent command execution
- [Async Patterns](../scripting/patterns/async-patterns.md) - Async/await usage

### Target Patterns
- [Multi-Target Execution](../environments/hybrid/multi-target.md) - Running across multiple hosts
- [Failover Strategies](../environments/hybrid/failover.md) - Handling target failures
- [Orchestration](../environments/hybrid/orchestration.md) - Complex orchestration

### Data Patterns
- [Stream Processing](../scripting/patterns/streaming.md) - Real-time data handling
- [File Operations](../core/execution-engine/features/file-operations.md) - Cross-environment file management
- [Secret Management](../commands/built-in/secrets.md) - Secure credential handling

### Workflow Patterns
- [Chaining Commands](../scripting/patterns/chaining.md) - Method chaining patterns
- [Error Handling](../scripting/patterns/error-handling.md) - Try/catch patterns
- [Task Automation](../guides/automation/first-automation.md) - Building automation workflows

### Integration Patterns
- [CI/CD Integration](../guides/automation/ci-cd-pipelines.md) - Pipeline automation
- [Database Operations](../recipes/development/database-setup.md) - Database automation
- [Container Orchestration](../guides/infrastructure/container-orchestration.md) - Docker/K8s patterns
- [Deployment Automation](../guides/automation/deployment.md) - Deployment patterns

## Quick Examples

### Error Handling Pattern

```typescript
// Robust error handling with retries
async function deployWithRetry(target: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await $.ssh(target)`
        cd /app &&
        git pull &&
        npm install &&
        npm run build &&
        pm2 restart app
      `.timeout(300000);
      
      console.log(`✅ Deployed successfully to ${target}`);
      return result;
      
    } catch (error) {
      console.log(`⚠️ Attempt ${i + 1} failed: ${error.message}`);
      
      if (i === maxRetries - 1) {
        throw new Error(`Failed to deploy after ${maxRetries} attempts`);
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}
```

### Parallel Execution Pattern

```typescript
// Execute commands across multiple targets in parallel
async function healthCheckAll(targets: string[]) {
  const results = await Promise.allSettled(
    targets.map(async target => {
      const result = await $.ssh(target)`
        echo "=== System Health ===" &&
        uptime &&
        df -h / &&
        free -m &&
        systemctl status app
      `.nothrow();
      
      return {
        target,
        healthy: result.exitCode === 0,
        output: result.stdout,
        error: result.stderr
      };
    })
  );
  
  // Process results
  const summary = results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        target: targets[i],
        healthy: false,
        error: result.reason
      };
    }
  });
  
  return summary;
}
```

### Pipeline Pattern

```typescript
// Build a data processing pipeline
async function processLogs(logFile: string) {
  const result = await $`
    cat ${logFile} |
    grep ERROR |
    awk '{print $1, $2, $NF}' |
    sort |
    uniq -c |
    sort -rn |
    head -20
  `;
  
  return result.stdout
    .trim()
    .split('\n')
    .map(line => {
      const [count, date, time, error] = line.trim().split(/\s+/);
      return { count: parseInt(count), date, time, error };
    });
}
```

### State Management Pattern

```typescript
// Maintain state across execution
class DeploymentManager {
  private state: Map<string, any> = new Map();
  
  async deploy(environment: string) {
    // Save initial state
    this.state.set('start_time', Date.now());
    this.state.set('environment', environment);
    
    try {
      // Pre-deployment checks
      await this.runChecks();
      this.state.set('checks_passed', true);
      
      // Backup current version
      const backup = await this.createBackup();
      this.state.set('backup_id', backup.id);
      
      // Deploy new version
      await this.deployCode();
      this.state.set('deployed', true);
      
      // Verify deployment
      await this.verify();
      this.state.set('verified', true);
      
      // Cleanup
      await this.cleanup();
      
      return {
        success: true,
        duration: Date.now() - this.state.get('start_time'),
        backup: this.state.get('backup_id')
      };
      
    } catch (error) {
      // Rollback on failure
      if (this.state.get('deployed') && !this.state.get('verified')) {
        await this.rollback(this.state.get('backup_id'));
      }
      throw error;
    }
  }
}
```

### Stream Processing Pattern

```typescript
// Process streaming data in real-time
async function monitorLogs(service: string) {
  const proc = $.ssh('log-server')`
    journalctl -u ${service} -f --output=json
  `;
  
  for await (const line of proc.lines()) {
    try {
      const entry = JSON.parse(line);
      
      // Process based on severity
      if (entry.PRIORITY <= 3) { // ERROR or worse
        await notifyOncall({
          service,
          message: entry.MESSAGE,
          timestamp: entry.__REALTIME_TIMESTAMP
        });
      }
      
      // Store in metrics
      await metrics.record({
        service,
        level: entry.PRIORITY,
        timestamp: Date.now()
      });
      
    } catch (error) {
      console.error('Failed to process log entry:', error);
    }
  }
}
```

## Best Practices

### 1. Error Handling

Always handle errors appropriately:

```typescript
// ❌ Bad - No error handling
await $`deploy.sh`;

// ✅ Good - Proper error handling
try {
  await $`deploy.sh`;
} catch (error) {
  console.error('Deployment failed:', error.message);
  await $`rollback.sh`;
  throw error;
}

// ✅ Better - Using nothrow pattern
const result = await $`deploy.sh`.nothrow();
if (result.exitCode !== 0) {
  console.error('Deployment failed:', result.stderr);
  await $`rollback.sh`;
}
```

### 2. Resource Management

Always clean up resources:

```typescript
// ✅ Good - Proper cleanup
const conn = await pool.acquire();
try {
  await conn.exec('command');
} finally {
  await pool.release(conn);
}
```

### 3. Timeout Configuration

Set appropriate timeouts:

```typescript
// ✅ Good - Timeout for long operations
await $`backup.sh`.timeout(600000); // 10 minutes

// ✅ Better - Configurable timeout
const timeout = config.get('backup.timeout', 600000);
await $`backup.sh`.timeout(timeout);
```

### 4. Logging and Monitoring

Add comprehensive logging:

```typescript
// ✅ Good - Detailed logging
console.log(`Starting deployment to ${environment}`);
const startTime = Date.now();

try {
  const result = await deploy(environment);
  console.log(`✅ Deployment successful in ${Date.now() - startTime}ms`);
  await metrics.recordSuccess('deployment', Date.now() - startTime);
} catch (error) {
  console.error(`❌ Deployment failed: ${error.message}`);
  await metrics.recordFailure('deployment', error);
  throw error;
}
```

### 5. Configuration Management

Externalize configuration:

```typescript
// ❌ Bad - Hardcoded values
await $.ssh('prod-server')`deploy`;

// ✅ Good - Configuration-driven
const target = config.get('deployment.target');
await $.ssh(target)`deploy`;
```

## Anti-Patterns to Avoid

### 1. Ignoring Exit Codes

```typescript
// ❌ Bad - Ignoring failures
await $`test.sh`;
await $`deploy.sh`; // Deploys even if tests fail

// ✅ Good - Check exit codes
await $`test.sh`;
if (result.exitCode === 0) {
  await $`deploy.sh`;
}
```

### 2. No Timeout on Long Operations

```typescript
// ❌ Bad - No timeout
await $`long-running-task`;

// ✅ Good - Set timeout
await $`long-running-task`.timeout(300000);
```

### 3. Mixing Concerns

```typescript
// ❌ Bad - Mixed responsibilities
async function deployAndMonitor() {
  // Deployment logic
  // Monitoring logic
  // Notification logic
}

// ✅ Good - Separated concerns
async function deploy() { /* ... */ }
async function monitor() { /* ... */ }
async function notify() { /* ... */ }
```

## Performance Patterns

### Connection Reuse

```typescript
// Reuse SSH connections
const engine = new ExecutionEngine({
  connectionPool: {
    max: 10,
    idleTimeoutMillis: 30000
  }
});

// Connections are automatically reused
for (const command of commands) {
  await engine.ssh('server').execute(command);
}
```

### Batch Operations

```typescript
// Batch multiple operations
async function batchUpdate(servers: string[], commands: string[]) {
  const script = commands.join(' && ');
  
  return Promise.all(
    servers.map(server =>
      $.ssh(server)`${script}`.nothrow()
    )
  );
}
```

## Security Patterns

### Secret Management

```typescript
// ✅ Good - Use environment variables
const apiKey = process.env.API_KEY;
await $`curl -H "Authorization: Bearer ${apiKey}" https://api.example.com`;

// ✅ Better - Use secret management
const secrets = await loadSecrets();
await $`deploy`.env({ API_KEY: secrets.apiKey });
```

### Input Validation

```typescript
// Always validate external input
function validateTarget(target: string): boolean {
  const pattern = /^[a-zA-Z0-9.-]+$/;
  return pattern.test(target);
}

async function executeOn(target: string, command: string) {
  if (!validateTarget(target)) {
    throw new Error('Invalid target format');
  }
  
  await $.ssh(target)`${command}`;
}
```

## Testing Patterns

### Unit Testing Commands

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('deployment', () => {
  it('should deploy successfully', async () => {
    const mockExec = vi.fn().mockResolvedValue({
      stdout: 'Success',
      exitCode: 0
    });
    
    const result = await deploy('staging', { exec: mockExec });
    
    expect(result.success).toBe(true);
    expect(mockExec).toHaveBeenCalledWith('deploy.sh');
  });
});
```

### Integration Testing

```typescript
import { TestContainer } from '@xec-sh/testing';

describe('integration', () => {
  let container: TestContainer;
  
  beforeAll(async () => {
    container = new TestContainer();
    await container.start();
  });
  
  afterAll(async () => {
    await container.stop();
  });
  
  it('should execute in container', async () => {
    const result = await $.docker(container.id)`echo test`;
    expect(result.stdout).toBe('test\n');
  });
});
```

## Related Documentation

- [Error Handling](../guides/advanced/error-handling.md) - Detailed error handling patterns
- [Parallel Execution](../core/execution-engine/performance/parallel-execution.md) - Concurrent execution strategies
- [Stream Processing](../scripting/patterns/streaming.md) - Real-time data processing
- [API Reference](../api/index.md) - Core API documentation
- [Examples](../recipes/index.md) - Practical examples
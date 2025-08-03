---
title: SSH Batch Operations
description: Multi-host command execution, parallel operations, and batch management
keywords: [ssh, batch, parallel, multi-host, orchestration]
source_files:
  - packages/core/src/ssh/batch.ts
  - packages/core/src/utils/parallel.ts
  - packages/core/src/core/multi-target.ts
key_functions:
  - executeBatch()
  - executeParallel()
  - executeSequential()
  - aggregateResults()
verification_date: 2025-08-03
---

# SSH Batch Operations

## Implementation Reference

**Source Files:**
- `packages/core/src/ssh/batch.ts` - Batch execution logic
- `packages/core/src/utils/parallel.ts` - Parallel execution utilities
- `packages/core/src/core/multi-target.ts` - Multi-target coordination
- `apps/xec/src/commands/on.ts` - On command implementation

**Key Functions:**
- `executeBatch()` - Execute on multiple hosts
- `executeParallel()` - Parallel execution with limits
- `executeSequential()` - Sequential execution
- `aggregateResults()` - Combine results from multiple hosts

## Multi-Host Execution

### Basic Batch Operations

```typescript
// Execute on multiple hosts
const hosts = ['host1', 'host2', 'host3'];

for (const host of hosts) {
  await $.ssh(`user@${host}`)`uptime`;
}

// Using target patterns
await $.target('hosts.*')`systemctl status nginx`;
```

### Configuration-Based Batching

```yaml
# .xec/config.yaml
targets:
  web-servers:
    type: group
    members:
      - web1
      - web2
      - web3
      
  web1:
    type: ssh
    host: web1.example.com
    user: deploy
    
  web2:
    type: ssh
    host: web2.example.com
    user: deploy
    
  web3:
    type: ssh
    host: web3.example.com
    user: deploy
```

```typescript
// Execute on group
await $.target('web-servers')`sudo systemctl restart nginx`;
```

## Parallel Execution

### Unlimited Parallelism

```typescript
// Execute on all hosts simultaneously
const hosts = ['host1', 'host2', 'host3', 'host4', 'host5'];

const results = await Promise.all(
  hosts.map(host => 
    $.ssh(`user@${host}`)`df -h`
  )
);

// Process results
results.forEach((result, i) => {
  console.log(`${hosts[i]}:`, result.stdout);
});
```

### Controlled Parallelism

```typescript
import pLimit from 'p-limit';

// Limit to 3 concurrent connections
const limit = pLimit(3);

const hosts = Array.from({ length: 20 }, (_, i) => `host${i + 1}`);

const results = await Promise.all(
  hosts.map(host => 
    limit(() => $.ssh(`user@${host}`)`apt-get update`)
  )
);
```

### Batch with Progress

```typescript
class BatchExecutor {
  async execute(hosts: string[], command: string, options: BatchOptions = {}) {
    const { 
      parallel = 5,
      onProgress,
      onError
    } = options;
    
    const limit = pLimit(parallel);
    let completed = 0;
    const total = hosts.length;
    const results: BatchResult[] = [];
    
    await Promise.all(
      hosts.map(host => 
        limit(async () => {
          try {
            const start = Date.now();
            const result = await $.ssh(`user@${host}`)`${command}`;
            
            completed++;
            const progress = {
              host,
              completed,
              total,
              percentage: (completed / total) * 100,
              duration: Date.now() - start,
              success: true
            };
            
            onProgress?.(progress);
            
            results.push({
              host,
              success: true,
              stdout: result.stdout,
              stderr: result.stderr,
              duration: progress.duration
            });
          } catch (error) {
            completed++;
            onError?.({ host, error });
            
            results.push({
              host,
              success: false,
              error: error.message
            });
          }
        })
      )
    );
    
    return results;
  }
}

// Usage
const executor = new BatchExecutor();
const results = await executor.execute(
  hosts,
  'sudo apt-get upgrade -y',
  {
    parallel: 3,
    onProgress: (p) => console.log(`Progress: ${p.percentage.toFixed(1)}%`),
    onError: (e) => console.error(`Failed on ${e.host}: ${e.error.message}`)
  }
);
```

## Sequential Execution

### Simple Sequential

```typescript
// Execute one by one
const hosts = ['critical1', 'critical2', 'critical3'];

for (const host of hosts) {
  console.log(`Updating ${host}...`);
  
  try {
    await $.ssh(`user@${host}`)`
      sudo apt-get update &&
      sudo apt-get upgrade -y &&
      sudo systemctl restart app
    `;
    console.log(`✓ ${host} updated successfully`);
  } catch (error) {
    console.error(`✗ ${host} failed: ${error.message}`);
    // Decide whether to continue or abort
    if (options.stopOnError) {
      throw error;
    }
  }
}
```

### Rolling Updates

```typescript
class RollingUpdater {
  async update(hosts: string[], options: RollingOptions = {}) {
    const {
      batchSize = 1,
      delay = 0,
      healthCheck,
      rollback
    } = options;
    
    const batches = this.chunk(hosts, batchSize);
    const updated: string[] = [];
    
    for (const batch of batches) {
      console.log(`Updating batch: ${batch.join(', ')}`);
      
      try {
        // Update batch
        await Promise.all(
          batch.map(host => this.updateHost(host))
        );
        
        // Health check
        if (healthCheck) {
          await this.waitForHealth(batch, healthCheck);
        }
        
        updated.push(...batch);
        
        // Delay between batches
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        console.error(`Batch failed: ${batch.join(', ')}`);
        
        // Rollback if needed
        if (rollback) {
          await this.rollbackHosts(updated);
        }
        
        throw error;
      }
    }
  }
  
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
  
  private async updateHost(host: string): Promise<void> {
    await $.ssh(`user@${host}`)`
      sudo systemctl stop app &&
      sudo cp /tmp/app.new /usr/local/bin/app &&
      sudo systemctl start app
    `;
  }
  
  private async waitForHealth(hosts: string[], check: HealthCheck): Promise<void> {
    const maxAttempts = 30;
    const delay = 2000;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const healthy = await Promise.all(
        hosts.map(host => check(host))
      );
      
      if (healthy.every(h => h)) {
        return;  // All healthy
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    throw new Error('Health check timeout');
  }
}
```

## Pattern-Based Execution

### Wildcard Patterns

```yaml
# Configuration with patterns
targets:
  web1:
    type: ssh
    host: web1.example.com
    tags: [web, production]
    
  web2:
    type: ssh
    host: web2.example.com
    tags: [web, production]
    
  db1:
    type: ssh
    host: db1.example.com
    tags: [database, production]
```

```typescript
// Execute on pattern
await $.target('web*')`systemctl status nginx`;

// Execute on tagged hosts
await $.target('tags:production')`uptime`;

// Complex patterns
await $.target('web* && tags:production')`deploy.sh`;
```

### Dynamic Host Selection

```typescript
// Select hosts dynamically
async function selectHosts(criteria: HostCriteria): Promise<string[]> {
  const allHosts = await $.config.getTargets();
  
  return allHosts.filter(host => {
    // Match by name pattern
    if (criteria.pattern) {
      const regex = new RegExp(criteria.pattern.replace('*', '.*'));
      if (!regex.test(host.name)) return false;
    }
    
    // Match by tags
    if (criteria.tags) {
      const hostTags = host.tags || [];
      if (!criteria.tags.every(tag => hostTags.includes(tag))) {
        return false;
      }
    }
    
    // Match by custom predicate
    if (criteria.predicate) {
      if (!criteria.predicate(host)) return false;
    }
    
    return true;
  }).map(h => h.name);
}

// Usage
const webServers = await selectHosts({
  pattern: 'web*',
  tags: ['production'],
  predicate: (host) => host.region === 'us-east-1'
});

await $.batch(webServers)`deploy.sh`;
```

## Result Aggregation

### Collecting Results

```typescript
interface BatchResults {
  successful: Map<string, CommandResult>;
  failed: Map<string, Error>;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    duration: number;
  };
}

async function executeBatchCommand(
  hosts: string[],
  command: string
): Promise<BatchResults> {
  const startTime = Date.now();
  const successful = new Map<string, CommandResult>();
  const failed = new Map<string, Error>();
  
  await Promise.all(
    hosts.map(async (host) => {
      try {
        const result = await $.ssh(`user@${host}`)`${command}`;
        successful.set(host, result);
      } catch (error) {
        failed.set(host, error);
      }
    })
  );
  
  return {
    successful,
    failed,
    summary: {
      total: hosts.length,
      succeeded: successful.size,
      failed: failed.size,
      duration: Date.now() - startTime
    }
  };
}

// Usage
const results = await executeBatchCommand(hosts, 'uptime');

// Process results
console.log(`Success: ${results.summary.succeeded}/${results.summary.total}`);

for (const [host, result] of results.successful) {
  console.log(`${host}: ${result.stdout.trim()}`);
}

for (const [host, error] of results.failed) {
  console.error(`${host} failed: ${error.message}`);
}
```

### Aggregating Output

```typescript
// Aggregate similar output
function aggregateOutput(results: Map<string, string>): Map<string, string[]> {
  const aggregated = new Map<string, string[]>();
  
  for (const [host, output] of results) {
    const normalized = output.trim();
    
    if (!aggregated.has(normalized)) {
      aggregated.set(normalized, []);
    }
    
    aggregated.get(normalized)!.push(host);
  }
  
  return aggregated;
}

// Usage
const outputs = new Map([
  ['web1', 'nginx is running'],
  ['web2', 'nginx is running'],
  ['web3', 'nginx is stopped']
]);

const aggregated = aggregateOutput(outputs);
// Map {
//   'nginx is running' => ['web1', 'web2'],
//   'nginx is stopped' => ['web3']
// }
```

## Error Handling Strategies

### Fail Fast

```typescript
// Stop on first error
async function failFast(hosts: string[], command: string): Promise<void> {
  for (const host of hosts) {
    await $.ssh(`user@${host}`)`${command}`;  // Throws on error
  }
}
```

### Fail Soft

```typescript
// Continue on errors
async function failSoft(hosts: string[], command: string): Promise<BatchResults> {
  const results: BatchResults = {
    successful: [],
    failed: []
  };
  
  for (const host of hosts) {
    try {
      const result = await $.ssh(`user@${host}`)`${command}`;
      results.successful.push({ host, result });
    } catch (error) {
      results.failed.push({ host, error });
      // Continue to next host
    }
  }
  
  return results;
}
```

### Retry Logic

```typescript
// Retry failed hosts
async function withRetry(
  hosts: string[],
  command: string,
  maxRetries = 3
): Promise<BatchResults> {
  let remainingHosts = [...hosts];
  const successful: string[] = [];
  const failed: Map<string, Error> = new Map();
  
  for (let attempt = 0; attempt < maxRetries && remainingHosts.length > 0; attempt++) {
    if (attempt > 0) {
      console.log(`Retry attempt ${attempt} for ${remainingHosts.length} hosts`);
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
    
    const retryHosts = [...remainingHosts];
    remainingHosts = [];
    
    for (const host of retryHosts) {
      try {
        await $.ssh(`user@${host}`)`${command}`;
        successful.push(host);
      } catch (error) {
        if (attempt === maxRetries - 1) {
          failed.set(host, error);
        } else {
          remainingHosts.push(host);
        }
      }
    }
  }
  
  return { successful, failed };
}
```

## Performance Optimization

### Connection Pooling

```typescript
// Reuse connections for batch operations
class BatchSSHExecutor {
  private pools = new Map<string, SSHConnectionPool>();
  
  async execute(host: string, command: string): Promise<CommandResult> {
    if (!this.pools.has(host)) {
      this.pools.set(host, new SSHConnectionPool({
        host,
        maxConnections: 5
      }));
    }
    
    const pool = this.pools.get(host)!;
    const connection = await pool.acquire();
    
    try {
      return await connection.exec(command);
    } finally {
      pool.release(connection);
    }
  }
  
  async cleanup(): Promise<void> {
    for (const pool of this.pools.values()) {
      await pool.destroy();
    }
    this.pools.clear();
  }
}
```

### Batch Command Optimization

```typescript
// Combine multiple commands
async function batchCommands(host: string, commands: string[]): Promise<void> {
  // Instead of multiple round trips
  // for (const cmd of commands) {
  //   await $.ssh(host)`${cmd}`;
  // }
  
  // Single round trip
  const combinedCommand = commands.join(' && ');
  await $.ssh(host)`${combinedCommand}`;
}
```

## Monitoring and Reporting

### Progress Reporting

```typescript
class BatchReporter {
  private startTime = Date.now();
  private completed = 0;
  private failed = 0;
  
  report(host: string, success: boolean, output?: string): void {
    if (success) {
      this.completed++;
      console.log(`✓ ${host} completed`);
    } else {
      this.failed++;
      console.error(`✗ ${host} failed`);
    }
    
    this.printProgress();
  }
  
  private printProgress(): void {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const rate = this.completed / elapsed;
    
    console.log(
      `Progress: ${this.completed} completed, ${this.failed} failed ` +
      `(${rate.toFixed(1)} hosts/sec)`
    );
  }
  
  summary(): void {
    const elapsed = (Date.now() - this.startTime) / 1000;
    console.log('\n=== Batch Execution Summary ===');
    console.log(`Total: ${this.completed + this.failed}`);
    console.log(`Succeeded: ${this.completed}`);
    console.log(`Failed: ${this.failed}`);
    console.log(`Duration: ${elapsed.toFixed(1)}s`);
    console.log(`Success Rate: ${(this.completed / (this.completed + this.failed) * 100).toFixed(1)}%`);
  }
}
```

### Detailed Logging

```typescript
// Log batch operations
class BatchLogger {
  private logFile: string;
  
  constructor(logFile = 'batch-execution.log') {
    this.logFile = logFile;
  }
  
  async log(entry: LogEntry): Promise<void> {
    const timestamp = new Date().toISOString();
    const logLine = JSON.stringify({
      timestamp,
      ...entry
    }) + '\n';
    
    await fs.appendFile(this.logFile, logLine);
  }
  
  async logExecution(host: string, command: string, result: any): Promise<void> {
    await this.log({
      type: 'execution',
      host,
      command,
      success: result.success,
      stdout: result.stdout?.substring(0, 1000),  // Truncate
      stderr: result.stderr?.substring(0, 1000),
      duration: result.duration
    });
  }
}
```

## Use Cases

### Deployment

```typescript
async function deployToServers(servers: string[], version: string) {
  const deployer = new RollingUpdater();
  
  await deployer.update(servers, {
    batchSize: 2,  // Deploy 2 at a time
    delay: 5000,    // 5 seconds between batches
    
    async updateHost(host: string) {
      await $.ssh(`user@${host}`)`
        cd /app &&
        git fetch &&
        git checkout ${version} &&
        npm install &&
        npm run build &&
        pm2 reload app
      `;
    },
    
    async healthCheck(host: string) {
      try {
        const response = await fetch(`http://${host}/health`);
        return response.ok;
      } catch {
        return false;
      }
    }
  });
}
```

### Maintenance

```typescript
async function performMaintenance(hosts: string[]) {
  // Take hosts out of load balancer
  await $.batch(hosts)`sudo touch /tmp/maintenance.flag`;
  
  // Wait for connections to drain
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  // Perform maintenance
  await $.batch(hosts, { parallel: 1 })`
    sudo apt-get update &&
    sudo apt-get upgrade -y &&
    sudo reboot
  `;
  
  // Wait for hosts to come back
  await waitForHosts(hosts);
  
  // Put back in service
  await $.batch(hosts)`sudo rm /tmp/maintenance.flag`;
}
```

## Best Practices

1. **Use connection pooling** for better performance
2. **Implement proper error handling** (fail-fast vs fail-soft)
3. **Add progress reporting** for long operations
4. **Log all operations** for audit trail
5. **Test with small batches** before full deployment
6. **Implement health checks** after changes
7. **Plan rollback strategy** for critical operations
8. **Monitor resource usage** during batch operations

## Related Documentation

- [SSH Overview](./overview.md) - SSH fundamentals
- [Connection Config](./connection-config.md) - Connection management
- [Parallel Execution](../../scripting/patterns/async-patterns.md) - Async patterns
- [On Command](../../commands/built-in/on.md) - CLI batch execution
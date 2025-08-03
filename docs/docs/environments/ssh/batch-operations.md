# SSH Batch Operations

Execute commands across multiple SSH servers efficiently with parallel processing, error handling, and result aggregation.

## Overview

SSH batch operations in Xec enable you to:

- **Execute commands across multiple hosts** simultaneously
- **Control concurrency** to prevent overwhelming servers
- **Handle failures gracefully** with configurable error strategies
- **Aggregate results** from multiple servers
- **Track progress** for long-running batch operations
- **Load balance** across server groups

## Basic Multi-Host Execution

### Simple Parallel Execution

```typescript
import { $ } from '@xec-sh/core';

// Define your server fleet
const servers = [
  { host: 'web1.example.com', username: 'deploy' },
  { host: 'web2.example.com', username: 'deploy' },
  { host: 'web3.example.com', username: 'deploy' }
];

// Execute the same command on all servers
const results = await Promise.all(
  servers.map(server => 
    $.ssh(server)`uptime`
  )
);

// Process results
results.forEach((result, index) => {
  console.log(`${servers[index].host}: ${result.stdout.trim()}`);
});
```

### Error-Resilient Batch Execution

```typescript
// Use Promise.allSettled to continue even if some servers fail
const results = await Promise.allSettled(
  servers.map(server => 
    $.ssh(server)`systemctl status nginx`
  )
);

// Handle mixed success/failure results
results.forEach((result, index) => {
  const server = servers[index];
  
  if (result.status === 'fulfilled') {
    console.log(`✅ ${server.host}: ${result.value.stdout.trim()}`);
  } else {
    console.error(`❌ ${server.host}: ${result.reason.message}`);
  }
});
```

## Concurrency Control

### Limited Concurrent Connections

```typescript
// Limit concurrent SSH connections to prevent overwhelming servers
async function batchExecuteWithLimit<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number = 5
): Promise<T[]> {
  const results: T[] = [];
  
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(task => task())
    );
    results.push(...batchResults);
  }
  
  return results;
}

// Execute deployment across 20 servers with max 5 concurrent connections
const deploymentTasks = servers.map(server => () => 
  $.ssh(server)`./deploy.sh --version=${version}`
);

const deployResults = await batchExecuteWithLimit(deploymentTasks, 5);
```

### Adaptive Concurrency

```typescript
// Adjust concurrency based on server response times
class AdaptiveBatchExecutor {
  private concurrency = 3;
  private maxConcurrency = 10;
  private minConcurrency = 1;
  
  async executeBatch(servers: any[], command: string) {
    const results = [];
    
    for (let i = 0; i < servers.length; i += this.concurrency) {
      const batch = servers.slice(i, i + this.concurrency);
      const startTime = Date.now();
      
      const batchResults = await Promise.allSettled(
        batch.map(server => $.ssh(server)`${command}`)
      );
      
      const duration = Date.now() - startTime;
      this.adjustConcurrency(duration, batchResults);
      
      results.push(...batchResults);
    }
    
    return results;
  }
  
  private adjustConcurrency(duration: number, results: any[]) {
    const successRate = results.filter(r => r.status === 'fulfilled').length / results.length;
    const avgDuration = duration / results.length;
    
    if (successRate > 0.9 && avgDuration < 1000) {
      // Increase concurrency for fast, successful operations
      this.concurrency = Math.min(this.maxConcurrency, this.concurrency + 1);
    } else if (successRate < 0.7 || avgDuration > 5000) {
      // Decrease concurrency for slow or failing operations
      this.concurrency = Math.max(this.minConcurrency, this.concurrency - 1);
    }
  }
}
```

## Advanced Batch Patterns

### Server Groups and Environments

```typescript
// Organize servers by environment and role
const environments = {
  production: {
    web: ['web1.prod.com', 'web2.prod.com', 'web3.prod.com'],
    api: ['api1.prod.com', 'api2.prod.com'],
    database: ['db1.prod.com']
  },
  staging: {
    web: ['web1.staging.com'],
    api: ['api1.staging.com'],
    database: ['db1.staging.com']
  }
};

// Rolling deployment across server groups
async function rollingDeployment(env: string, version: string) {
  const servers = environments[env];
  
  // Deploy to database first
  console.log('Deploying to database...');
  await Promise.all(
    servers.database.map(host => 
      $.ssh({ host, username: 'deploy' })`./migrate.sh --version=${version}`
    )
  );
  
  // Deploy to API servers
  console.log('Deploying to API servers...');
  await Promise.all(
    servers.api.map(host => 
      $.ssh({ host, username: 'deploy' })`./deploy-api.sh --version=${version}`
    )
  );
  
  // Deploy to web servers one by one for zero-downtime
  console.log('Rolling deployment to web servers...');
  for (const host of servers.web) {
    console.log(`Deploying to ${host}...`);
    await $.ssh({ host, username: 'deploy' })`./deploy-web.sh --version=${version}`;
    
    // Wait for health check
    await $.ssh({ host, username: 'deploy' })`./health-check.sh`;
    console.log(`${host} deployment complete`);
  }
}
```

### Result Aggregation and Reporting

```typescript
interface BatchResult {
  host: string;
  success: boolean;
  output: string;
  error?: string;
  duration: number;
}

async function executeBatchWithReporting(
  servers: Array<{ host: string; username: string }>,
  command: string
): Promise<BatchResult[]> {
  const results = await Promise.allSettled(
    servers.map(async (server) => {
      const startTime = Date.now();
      
      try {
        const result = await $.ssh(server)`${command}`;
        return {
          host: server.host,
          success: true,
          output: result.stdout.trim(),
          duration: Date.now() - startTime
        };
      } catch (error) {
        return {
          host: server.host,
          success: false,
          output: '',
          error: error.message,
          duration: Date.now() - startTime
        };
      }
    })
  );
  
  return results.map(result => 
    result.status === 'fulfilled' ? result.value : result.value
  );
}

// Generate execution report
function generateReport(results: BatchResult[]): void {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  
  console.log('\n📊 Batch Execution Report');
  console.log('========================');
  console.log(`Total servers: ${results.length}`);
  console.log(`Successful: ${successful.length} (${(successful.length/results.length*100).toFixed(1)}%)`);
  console.log(`Failed: ${failed.length} (${(failed.length/results.length*100).toFixed(1)}%)`);
  console.log(`Average duration: ${avgDuration.toFixed(0)}ms`);
  
  if (failed.length > 0) {
    console.log('\n❌ Failed Servers:');
    failed.forEach(result => {
      console.log(`  ${result.host}: ${result.error}`);
    });
  }
}
```

## Progress Tracking

### Real-time Progress Updates

```typescript
class BatchProgressTracker {
  private completed = 0;
  private total: number;
  private startTime: number;
  
  constructor(total: number) {
    this.total = total;
    this.startTime = Date.now();
  }
  
  update(increment: number = 1): void {
    this.completed += increment;
    const progress = (this.completed / this.total * 100).toFixed(1);
    const elapsed = Date.now() - this.startTime;
    const estimated = elapsed / this.completed * this.total;
    const remaining = Math.max(0, estimated - elapsed);
    
    process.stdout.write(
      `\r📊 Progress: ${this.completed}/${this.total} (${progress}%) ` +
      `⏱️ ETA: ${Math.round(remaining/1000)}s`
    );
    
    if (this.completed === this.total) {
      console.log('\n✅ Batch operation completed!');
    }
  }
}

// Execute with progress tracking
async function batchWithProgress(servers: any[], command: string) {
  const tracker = new BatchProgressTracker(servers.length);
  
  const results = await Promise.allSettled(
    servers.map(async (server) => {
      try {
        const result = await $.ssh(server)`${command}`;
        tracker.update();
        return { server: server.host, success: true, result };
      } catch (error) {
        tracker.update();
        return { server: server.host, success: false, error };
      }
    })
  );
  
  return results;
}
```

### Streaming Progress Events

```typescript
import { EventEmitter } from 'events';

class BatchExecutor extends EventEmitter {
  async executeBatch(servers: any[], command: string) {
    this.emit('batch:start', { total: servers.length });
    
    const results = [];
    let completed = 0;
    
    const promises = servers.map(async (server, index) => {
      this.emit('server:start', { server: server.host, index });
      
      try {
        const result = await $.ssh(server)`${command}`;
        completed++;
        
        this.emit('server:success', { 
          server: server.host, 
          index, 
          result: result.stdout.trim(),
          progress: completed / servers.length 
        });
        
        return { server: server.host, success: true, result };
      } catch (error) {
        completed++;
        
        this.emit('server:error', { 
          server: server.host, 
          index, 
          error: error.message,
          progress: completed / servers.length 
        });
        
        return { server: server.host, success: false, error };
      }
    });
    
    const results = await Promise.all(promises);
    this.emit('batch:complete', { results });
    
    return results;
  }
}

// Usage with event handling
const executor = new BatchExecutor();

executor.on('batch:start', ({ total }) => {
  console.log(`🚀 Starting batch operation on ${total} servers`);
});

executor.on('server:success', ({ server, progress }) => {
  console.log(`✅ ${server} completed (${(progress * 100).toFixed(1)}%)`);
});

executor.on('server:error', ({ server, error, progress }) => {
  console.log(`❌ ${server} failed: ${error} (${(progress * 100).toFixed(1)}%)`);
});

executor.on('batch:complete', ({ results }) => {
  const successful = results.filter(r => r.success).length;
  console.log(`🏁 Batch complete: ${successful}/${results.length} successful`);
});
```

## Error Handling Strategies

### Fail-Fast vs Continue-on-Error

```typescript
// Fail-fast: Stop on first error
async function failFastExecution(servers: any[], command: string) {
  for (const server of servers) {
    console.log(`Executing on ${server.host}...`);
    await $.ssh(server)`${command}`; // Will throw on error
    console.log(`✅ ${server.host} completed`);
  }
}

// Continue-on-error: Complete all attempts
async function resilientExecution(servers: any[], command: string) {
  const results = await Promise.allSettled(
    servers.map(server => $.ssh(server)`${command}`)
  );
  
  const errors = results
    .map((result, index) => ({ result, server: servers[index] }))
    .filter(({ result }) => result.status === 'rejected');
  
  if (errors.length > 0) {
    console.warn(`⚠️ ${errors.length} servers failed:`);
    errors.forEach(({ server, result }) => {
      console.error(`  ${server.host}: ${result.reason.message}`);
    });
  }
  
  return results;
}
```

### Retry Strategies

```typescript
// Retry failed servers with exponential backoff
async function batchWithRetry(servers: any[], command: string, maxRetries: number = 3) {
  let failedServers = [...servers];
  let attempt = 0;
  const allResults = [];
  
  while (failedServers.length > 0 && attempt < maxRetries) {
    attempt++;
    console.log(`🔄 Attempt ${attempt}/${maxRetries} for ${failedServers.length} servers`);
    
    const results = await Promise.allSettled(
      failedServers.map(server => $.ssh(server)`${command}`)
    );
    
    const newFailures = [];
    
    results.forEach((result, index) => {
      const server = failedServers[index];
      
      if (result.status === 'fulfilled') {
        console.log(`✅ ${server.host} succeeded on attempt ${attempt}`);
        allResults.push({ server, success: true, result: result.value });
      } else {
        console.log(`❌ ${server.host} failed on attempt ${attempt}`);
        newFailures.push(server);
      }
    });
    
    failedServers = newFailures;
    
    // Exponential backoff between retries
    if (failedServers.length > 0 && attempt < maxRetries) {
      const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // Record final failures
  failedServers.forEach(server => {
    allResults.push({ 
      server, 
      success: false, 
      error: `Failed after ${maxRetries} attempts` 
    });
  });
  
  return allResults;
}
```

## Performance Optimization

### Connection Reuse with Shared SSH Context

```typescript
// Reuse SSH connections for multiple commands
async function multiCommandBatch(servers: any[], commands: string[]) {
  // Create persistent SSH connections
  const sshConnections = servers.map(server => $.ssh(server));
  
  try {
    // Execute all commands on all servers
    const results = await Promise.all(
      sshConnections.map(async (ssh, serverIndex) => {
        const serverResults = [];
        
        for (const command of commands) {
          try {
            const result = await ssh`${command}`;
            serverResults.push({ command, success: true, output: result.stdout });
          } catch (error) {
            serverResults.push({ command, success: false, error: error.message });
          }
        }
        
        return {
          server: servers[serverIndex].host,
          commands: serverResults
        };
      })
    );
    
    return results;
  } finally {
    // SSH connections are automatically pooled and cleaned up
  }
}
```

### Batch File Operations

```typescript
// Efficient file distribution across servers
async function distributeFiles(servers: any[], files: Array<{ local: string; remote: string }>) {
  console.log(`📁 Distributing ${files.length} files to ${servers.length} servers`);
  
  const results = await Promise.allSettled(
    servers.map(async (server) => {
      const ssh = $.ssh(server);
      const fileResults = [];
      
      for (const file of files) {
        try {
          // Use SFTP for file transfer
          await ssh.uploadFile(file.local, file.remote);
          fileResults.push({ file: file.remote, success: true });
        } catch (error) {
          fileResults.push({ file: file.remote, success: false, error: error.message });
        }
      }
      
      return {
        server: server.host,
        files: fileResults,
        successful: fileResults.filter(f => f.success).length
      };
    })
  );
  
  return results;
}
```

## Best Practices

### Do's ✅

```typescript
// ✅ Use appropriate concurrency limits
const results = await batchExecuteWithLimit(tasks, 5);

// ✅ Handle mixed success/failure gracefully
const results = await Promise.allSettled(tasks);

// ✅ Provide progress feedback for long operations
const tracker = new BatchProgressTracker(servers.length);

// ✅ Reuse SSH connections for multiple commands
const ssh = $.ssh(server);
await ssh`command1`;
await ssh`command2`;

// ✅ Group servers logically
const webServers = servers.filter(s => s.role === 'web');
const apiServers = servers.filter(s => s.role === 'api');

// ✅ Implement proper error handling
try {
  await failFastExecution(servers, command);
} catch (error) {
  console.error('Batch operation failed:', error.message);
  // Implement rollback logic
}
```

### Don'ts ❌

```typescript
// ❌ Don't overwhelm servers with unlimited concurrency
await Promise.all(thousandsOfServers.map(server => ssh(server)`command`));

// ❌ Don't ignore errors in batch operations
servers.forEach(server => ssh(server)`command`); // No error handling

// ❌ Don't create new SSH connections for each command
for (const command of commands) {
  await $.ssh(server)`${command}`; // Creates new connection each time
}

// ❌ Don't block on slow servers in rolling deployments
await Promise.all(servers.map(server => deploy(server))); // All wait for slowest

// ❌ Don't skip progress tracking for long operations
await longRunningBatchOperation(servers); // No feedback
```

## Common Patterns

### Health Check Across Fleet

```typescript
async function healthCheck(servers: any[]) {
  const results = await Promise.allSettled(
    servers.map(async (server) => {
      const ssh = $.ssh(server);
      
      const checks = await Promise.allSettled([
        ssh`systemctl is-active nginx`,
        ssh`df -h / | tail -1 | awk '{print $5}' | sed 's/%//'`,
        ssh`free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}'`,
        ssh`uptime | awk '{print $3}'`
      ]);
      
      return {
        server: server.host,
        nginx: checks[0].status === 'fulfilled',
        diskUsage: checks[1].status === 'fulfilled' ? parseInt(checks[1].value.stdout) : null,
        memoryUsage: checks[2].status === 'fulfilled' ? parseInt(checks[2].value.stdout) : null,
        uptime: checks[3].status === 'fulfilled' ? checks[3].value.stdout.trim() : null
      };
    })
  );
  
  return results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
}
```

### Configuration Sync

```typescript
async function syncConfiguration(servers: any[], configFiles: string[]) {
  console.log('📋 Syncing configuration across servers...');
  
  const results = await Promise.all(
    servers.map(async (server) => {
      const ssh = $.ssh(server);
      const changes = [];
      
      for (const configFile of configFiles) {
        try {
          // Backup existing config
          await ssh`cp ${configFile} ${configFile}.backup`;
          
          // Upload new config
          await ssh.uploadFile(`./configs/${configFile}`, configFile);
          
          // Validate config
          const validation = await ssh`nginx -t`.nothrow();
          
          if (validation.exitCode !== 0) {
            // Restore backup on validation failure
            await ssh`mv ${configFile}.backup ${configFile}`;
            changes.push({ file: configFile, success: false, error: 'Validation failed' });
          } else {
            changes.push({ file: configFile, success: true });
          }
        } catch (error) {
          changes.push({ file: configFile, success: false, error: error.message });
        }
      }
      
      return { server: server.host, changes };
    })
  );
  
  return results;
}
```

## See Also

- [SSH Connection Management](./connection-mgmt.md) - Connection pooling and lifecycle management
- [SSH Authentication](./authentication.md) - Authentication methods and security
- [SSH Tunneling](./tunneling.md) - Port forwarding and tunnel management
- [Parallel Execution](/docs/core/execution-engine/performance/parallel-execution) - Advanced parallel patterns
- [Error Handling](/docs/core/execution-engine/features/error-handling) - Error handling strategies
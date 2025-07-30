---
sidebar_position: 8
---

# Performance Optimization

Optimize Xec CLI for large-scale operations and high-performance workflows.

## Connection Management

### SSH Connection Pooling

Xec automatically pools SSH connections for optimal performance:

```javascript
// Connections are automatically reused
const ssh = $.ssh({ host: 'server.com' });

// First command creates connection
await ssh`uptime`;  // ~200ms (new connection)

// Subsequent commands reuse connection  
await ssh`free -m`;  // ~20ms (reused)
await ssh`df -h`;    // ~20ms (reused)
await ssh`ps aux`;   // ~20ms (reused)
```

#### Manual Pool Management

```javascript
// Configure pool settings
const ssh = $.ssh({
  host: 'server.com',
  pool: {
    maxConnections: 10,
    idleTimeout: 300000,  // 5 minutes
    evictionRunInterval: 60000  // Check every minute
  }
});

// Monitor pool status
const pool = ssh.getConnectionPool();
console.log(`Active connections: ${pool.activeCount}`);
console.log(`Idle connections: ${pool.idleCount}`);

// Clear idle connections
await pool.clear();

// Dispose all connections
await ssh.dispose();
```

### Docker Connection Reuse

```javascript
// Reuse Docker client
const docker = $.docker({ /* config */ });

// Multiple operations on same connection
const containers = await docker.ps();
for (const container of containers) {
  await docker.exec(container.id, 'health-check.sh');
}
```

## Parallel Execution

### Basic Parallelization

```javascript
// Sequential (slow)
const results = [];
for (const server of servers) {
  const result = await $.ssh({ host: server })`uptime`;
  results.push(result);
}
// Total time: servers.length * ~200ms

// Parallel (fast)
const results = await Promise.all(
  servers.map(server => 
    $.ssh({ host: server })`uptime`
  )
);
// Total time: ~200ms (all at once)
```

### Controlled Concurrency

```javascript
import pLimit from 'p-limit';

// Limit concurrent connections
const limit = pLimit(5);  // Max 5 concurrent

const tasks = servers.map(server => 
  limit(() => $.ssh({ host: server })`deploy.sh`)
);

await Promise.all(tasks);
```

### Batch Processing

```javascript
// Process large datasets in batches
async function processBatch(items, batchSize = 10) {
  const results = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(item => processItem(item))
    );
    
    results.push(...batchResults);
    
    // Progress update
    console.log(`Processed ${results.length}/${items.length}`);
  }
  
  return results;
}
```

## Streaming Operations

### Stream Large Files

```javascript
// Instead of loading into memory
const content = await $`cat large-file.txt`;  // ❌ Loads entire file

// Stream it
import { createWriteStream } from 'fs';

const output = createWriteStream('output.txt');
await $`cat large-file.txt`.pipe(output);  // ✅ Streams data

// Or process line by line
await $`cat large-file.txt`
  .lines()
  .forEach(line => processLine(line));
```

### Stream Processing Pipeline

```javascript
// Efficient log processing
await $`tail -f /var/log/app.log`
  .pipe($`grep ERROR`)
  .pipe($`awk '{print $1, $2, $NF}'`)
  .lines()
  .forEach(line => {
    const [date, time, error] = line.split(' ');
    console.log(`Error at ${date} ${time}: ${error}`);
  });
```

### Streaming Between Environments

```javascript
// Stream from remote to local
const ssh = $.ssh({ host: 'server.com' });
await ssh`cat /var/log/app.log`
  .pipe($`gzip`)
  .pipe(createWriteStream('app.log.gz'));

// Stream between servers
const source = $.ssh({ host: 'source.com' });
const target = $.ssh({ host: 'target.com' });

await source`mysqldump database`
  .pipe(target`mysql database`);
```

## Memory Management

### Process Large Results

```javascript
// Avoid storing large results in memory
// ❌ Bad - loads everything into memory
const files = await $`find / -name "*.log"`;
const lines = files.stdout.split('\n');

// ✅ Good - process as stream
let count = 0;
await $`find / -name "*.log"`
  .lines()
  .forEach(() => count++);
console.log(`Found ${count} log files`);
```

### Chunked Processing

```javascript
// Process files in chunks to avoid memory issues
async function processLargeDirectory(dir) {
  const chunkSize = 1000;
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const files = await $`ls ${dir} | tail -n +${offset} | head -n ${chunkSize}`;
    const fileList = files.stdout.trim().split('\n').filter(f => f);
    
    if (fileList.length === 0) {
      hasMore = false;
      break;
    }
    
    // Process chunk
    await processFiles(fileList);
    
    offset += chunkSize;
  }
}
```

### Memory Monitoring

```javascript
// Monitor memory usage
function logMemoryUsage(label) {
  const usage = process.memoryUsage();
  console.log(`${label}:`);
  console.log(`  RSS: ${Math.round(usage.rss / 1024 / 1024)}MB`);
  console.log(`  Heap Used: ${Math.round(usage.heapUsed / 1024 / 1024)}MB`);
}

// Use in your scripts
logMemoryUsage('Before processing');
await processLargeDataset();
logMemoryUsage('After processing');

// Force garbage collection if needed
if (global.gc) {
  global.gc();
  logMemoryUsage('After GC');
}
```

## Caching Strategies

### Command Result Caching

```javascript
// Simple in-memory cache
const cache = new Map();

async function getCachedResult(key, command, ttl = 60000) {
  const cached = cache.get(key);
  
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.result;
  }
  
  const result = await command();
  cache.set(key, { result, timestamp: Date.now() });
  
  return result;
}

// Usage
const pods = await getCachedResult(
  'k8s-pods-prod',
  () => $`kubectl get pods -n production -o json`,
  300000  // 5 minute cache
);
```

### File-Based Caching

```javascript
import { existsSync, statSync, readFileSync, writeFileSync } from 'fs';

async function getCachedFile(cacheFile, command, ttl = 3600000) {
  if (existsSync(cacheFile)) {
    const stats = statSync(cacheFile);
    const age = Date.now() - stats.mtimeMs;
    
    if (age < ttl) {
      return readFileSync(cacheFile, 'utf8');
    }
  }
  
  const result = await command();
  writeFileSync(cacheFile, result.stdout);
  
  return result.stdout;
}

// Cache expensive operations
const inventory = await getCachedFile(
  '.xec/cache/inventory.json',
  () => $`ansible-inventory --list`,
  86400000  // 24 hour cache
);
```

### Distributed Caching

```javascript
// Redis-based caching for multi-instance
import Redis from 'ioredis';

const redis = new Redis();

async function getDistributedCache(key, command, ttl = 3600) {
  const cached = await redis.get(key);
  
  if (cached) {
    return JSON.parse(cached);
  }
  
  const result = await command();
  await redis.setex(key, ttl, JSON.stringify(result));
  
  return result;
}
```

## Network Optimization

### Compression

```javascript
// Enable SSH compression for slow connections
const ssh = $.ssh({
  host: 'remote.server.com',
  compression: true,
  compressionLevel: 6  // 1-9, 6 is default
});

// Compress file transfers
await ssh`tar czf - /large/directory`
  .pipe(createWriteStream('backup.tar.gz'));
```

### Multiplexing

```yaml
# ~/.ssh/config - Enable connection multiplexing
Host *
  ControlMaster auto
  ControlPath ~/.ssh/cm-%r@%h:%p
  ControlPersist 10m
  ServerAliveInterval 60
  ServerAliveCountMax 3
```

### Bandwidth Limiting

```javascript
// Limit bandwidth for transfers
await $`rsync -avz --bwlimit=1000 source/ destination/`;

// Or use pv for any pipe
await $`cat large-file | pv -L 1M | ssh server "cat > file"`;
```

## Query Optimization

### Efficient Data Retrieval

```javascript
// ❌ Inefficient - multiple queries
for (const pod of pods) {
  const logs = await $`kubectl logs ${pod}`;
  process(logs);
}

// ✅ Efficient - single query with filtering
const allLogs = await $`kubectl logs -l app=myapp --all-containers --prefix`;
processAll(allLogs);
```

### Projection and Filtering

```javascript
// Only get needed fields
const pods = await $`kubectl get pods -o custom-columns=NAME:.metadata.name,STATUS:.status.phase`;

// Server-side filtering
const errorLogs = await $`journalctl -u myapp --since "1 hour ago" --grep ERROR`;

// Combine with jq for complex queries
const activeJobs = await $`kubectl get jobs -o json | jq '.items[] | select(.status.active > 0)'`;
```

## Resource Pooling

### Connection Pool Manager

```javascript
class ResourcePool {
  constructor(factory, options = {}) {
    this.factory = factory;
    this.pool = [];
    this.active = new Set();
    this.maxSize = options.maxSize || 10;
    this.idleTimeout = options.idleTimeout || 300000;
  }
  
  async acquire() {
    // Return idle resource
    const idle = this.pool.find(r => !this.active.has(r));
    if (idle) {
      this.active.add(idle);
      return idle;
    }
    
    // Create new if under limit
    if (this.pool.length < this.maxSize) {
      const resource = await this.factory();
      this.pool.push(resource);
      this.active.add(resource);
      return resource;
    }
    
    // Wait for available resource
    await new Promise(resolve => setTimeout(resolve, 100));
    return this.acquire();
  }
  
  release(resource) {
    this.active.delete(resource);
  }
  
  async dispose() {
    for (const resource of this.pool) {
      if (resource.dispose) {
        await resource.dispose();
      }
    }
    this.pool = [];
    this.active.clear();
  }
}

// Use for SSH connections
const sshPool = new ResourcePool(
  () => $.ssh({ host: 'server.com' }),
  { maxSize: 5 }
);
```

### Container Pool

```javascript
// Reuse containers for testing
class ContainerPool {
  constructor(image, poolSize = 3) {
    this.image = image;
    this.available = [];
    this.busy = new Set();
    this.poolSize = poolSize;
  }
  
  async init() {
    // Pre-warm pool
    const creates = Array(this.poolSize).fill(0).map(() => 
      $.docker({ image: this.image, name: `pool-${Date.now()}-${Math.random()}` }).start()
    );
    
    this.available = await Promise.all(creates);
  }
  
  async acquire() {
    if (this.available.length > 0) {
      const container = this.available.pop();
      this.busy.add(container);
      return container;
    }
    
    // Wait and retry
    await new Promise(resolve => setTimeout(resolve, 1000));
    return this.acquire();
  }
  
  async release(container) {
    this.busy.delete(container);
    
    // Reset container
    await container.exec`sh -c "rm -rf /tmp/* && cd / && killall -9 node || true"`;
    
    this.available.push(container);
  }
  
  async dispose() {
    const all = [...this.available, ...this.busy];
    await Promise.all(all.map(c => c.remove()));
  }
}
```

## Monitoring & Profiling

### Performance Metrics

```javascript
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
  }
  
  async measure(name, fn) {
    const start = process.hrtime.bigint();
    
    try {
      const result = await fn();
      const duration = Number(process.hrtime.bigint() - start) / 1e6; // ms
      
      this.record(name, duration, 'success');
      return result;
    } catch (error) {
      const duration = Number(process.hrtime.bigint() - start) / 1e6;
      this.record(name, duration, 'error');
      throw error;
    }
  }
  
  record(name, duration, status) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        count: 0,
        total: 0,
        min: Infinity,
        max: 0,
        errors: 0
      });
    }
    
    const metric = this.metrics.get(name);
    metric.count++;
    metric.total += duration;
    metric.min = Math.min(metric.min, duration);
    metric.max = Math.max(metric.max, duration);
    
    if (status === 'error') {
      metric.errors++;
    }
  }
  
  report() {
    console.log('\n=== Performance Report ===\n');
    
    for (const [name, metric] of this.metrics) {
      const avg = metric.total / metric.count;
      console.log(`${name}:`);
      console.log(`  Calls: ${metric.count}`);
      console.log(`  Avg: ${avg.toFixed(2)}ms`);
      console.log(`  Min: ${metric.min.toFixed(2)}ms`);
      console.log(`  Max: ${metric.max.toFixed(2)}ms`);
      console.log(`  Errors: ${metric.errors}`);
      console.log();
    }
  }
}

// Usage
const monitor = new PerformanceMonitor();

// Measure operations
await monitor.measure('ssh-deploy', async () => {
  await ssh`deploy.sh`;
});

await monitor.measure('docker-build', async () => {
  await $`docker build -t myapp .`;
});

// Show report
monitor.report();
```

### Resource Usage Tracking

```javascript
// Track resource usage over time
class ResourceTracker {
  constructor() {
    this.samples = [];
    this.interval = null;
  }
  
  start(sampleInterval = 1000) {
    this.interval = setInterval(() => {
      const memory = process.memoryUsage();
      const cpu = process.cpuUsage();
      
      this.samples.push({
        timestamp: Date.now(),
        memory: {
          rss: memory.rss,
          heapUsed: memory.heapUsed,
          heapTotal: memory.heapTotal
        },
        cpu: {
          user: cpu.user,
          system: cpu.system
        }
      });
    }, sampleInterval);
  }
  
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }
  
  getReport() {
    if (this.samples.length === 0) return null;
    
    const memoryPeak = Math.max(...this.samples.map(s => s.memory.heapUsed));
    const avgMemory = this.samples.reduce((sum, s) => sum + s.memory.heapUsed, 0) / this.samples.length;
    
    return {
      duration: this.samples[this.samples.length - 1].timestamp - this.samples[0].timestamp,
      memoryPeak: Math.round(memoryPeak / 1024 / 1024),
      memoryAvg: Math.round(avgMemory / 1024 / 1024),
      samples: this.samples.length
    };
  }
}
```

## Best Practices

### 1. Connection Reuse

```javascript
// ❌ Bad - new connection each time
async function deployToServers(servers) {
  for (const server of servers) {
    await $.ssh({ host: server })`deploy.sh`;
  }
}

// ✅ Good - reuse connections
async function deployToServers(servers) {
  const connections = servers.map(server => ({
    server,
    ssh: $.ssh({ host: server })
  }));
  
  try {
    for (const { server, ssh } of connections) {
      await ssh`deploy.sh`;
    }
  } finally {
    // Cleanup
    await Promise.all(connections.map(c => c.ssh.dispose()));
  }
}
```

### 2. Batch Operations

```javascript
// ❌ Bad - individual operations
for (const file of files) {
  await ssh`rm ${file}`;
}

// ✅ Good - batch operation
await ssh`rm ${files.join(' ')}`;

// Or with xargs for very long lists
await ssh`echo ${files.join('\n')} | xargs -n 100 rm`;
```

### 3. Early Filtering

```javascript
// ❌ Bad - filter after transfer
const allLogs = await ssh`cat /var/log/app.log`;
const errors = allLogs.stdout.split('\n').filter(line => line.includes('ERROR'));

// ✅ Good - filter before transfer
const errors = await ssh`grep ERROR /var/log/app.log`;
```

### 4. Parallel with Limits

```javascript
// ❌ Bad - unlimited parallelism
await Promise.all(
  hundreds.map(item => expensiveOperation(item))
);

// ✅ Good - controlled parallelism
import pMap from 'p-map';

await pMap(
  hundreds,
  item => expensiveOperation(item),
  { concurrency: 10 }
);
```

### 5. Progressive Loading

```javascript
// ❌ Bad - load everything at once
const results = await $`find / -name "*.log"`;
processResults(results.stdout.split('\n'));

// ✅ Good - progressive processing
await $`find / -name "*.log"`
  .lines()
  .forEach(file => processFile(file));
```
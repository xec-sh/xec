---
sidebar_position: 4
---

# Streaming Output

Learn how to handle real-time command output streaming for logs, progress monitoring, and interactive feedback.

## Overview

Streaming in @xec-sh/core allows you to:
- Process command output in real-time as it's generated
- Handle large outputs without memory constraints
- Provide immediate feedback for long-running commands
- Process output line by line with custom handlers
- Stream logs from containers and remote systems

## Basic Streaming

### Stream to Console

The simplest way to stream output is using the `.stream()` method:

```typescript
import { $ } from '@xec-sh/core';

// Stream output to console
await $`npm install`.stream();

// Long-running commands with real-time output
await $`docker build -t myapp .`.stream();
```

### Custom Stream Handlers

```typescript
// Handle stdout and stderr separately
await $`npm test`.stream({
  stdout: (chunk) => console.log('[OUT]', chunk),
  stderr: (chunk) => console.error('[ERR]', chunk)
});

// Process output chunks
await $`tail -f /var/log/app.log`.stream({
  stdout: (chunk) => {
    const lines = chunk.toString().split('\n');
    lines.forEach(line => {
      if (line.includes('ERROR')) {
        console.error('🔴', line);
      } else {
        console.log('📝', line);
      }
    });
  }
});
```

## Line-by-Line Processing

### Pipe Method

Process output line by line with the `.pipe()` method:

```typescript
// Process each line
await $`find . -name "*.js"`.pipe(async (line) => {
  console.log('Found:', line);
  // Can be async
  await processFile(line);
});

// Filter and transform
await $`cat large-file.log`.pipe(async (line) => {
  if (line.includes('ERROR')) {
    await saveError(line);
  }
});
```

### Line Counting Example

```typescript
let lineCount = 0;
let errorCount = 0;

await $`cat application.log`.pipe(async (line) => {
  lineCount++;
  if (line.includes('ERROR')) {
    errorCount++;
  }
});

console.log(`Total lines: ${lineCount}`);
console.log(`Errors found: ${errorCount}`);
```

## Streaming with Adapters

### SSH Streaming

```typescript
const remote = $.ssh({ host: 'server.com', username: 'user' });

// Stream remote logs
await remote`tail -f /var/log/nginx/access.log`.stream({
  stdout: (chunk) => console.log(`[${new Date().toISOString()}] ${chunk}`)
});

// Process remote files
await remote`find /data -name "*.csv"`.pipe(async (file) => {
  const size = await remote`stat -c%s ${file}`.text();
  console.log(`${file}: ${size} bytes`);
});
```

### Docker Log Streaming

```typescript
// Stream container logs
const container = await $.docker({ 
  image: 'myapp:latest',
  name: 'app' 
}).start();

// Follow logs with timestamps
await container.follow((line) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${line}`);
});

// Stream with filtering
await container.streamLogs(
  (line) => {
    const log = JSON.parse(line);
    if (log.level === 'error') {
      alertError(log);
    }
  },
  { follow: true, tail: 100 }
);
```

### Kubernetes Log Streaming

```typescript
const k8s = $.k8s({ namespace: 'production' });
const pod = k8s.pod('app-server');

// Stream pod logs
const stream = await pod.streamLogs(
  (line) => console.log(`[POD] ${line}`),
  { follow: true, timestamps: true }
);

// Stop after some time
setTimeout(() => stream.stop(), 60000);

// Multi-container streaming
const web = await pod.streamLogs(
  (line) => console.log(`[WEB] ${line}`),
  { container: 'nginx', follow: true }
);

const app = await pod.streamLogs(
  (line) => console.log(`[APP] ${line}`),
  { container: 'app', follow: true }
);
```

## Advanced Streaming Patterns

### Progress Monitoring

```typescript
// Track file processing progress
let processed = 0;
const startTime = Date.now();

await $`find . -name "*.jpg"`.pipe(async (file) => {
  await $`convert ${file} -resize 800x600 ${file}`;
  processed++;
  
  if (processed % 10 === 0) {
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed;
    console.log(`Processed ${processed} files (${rate.toFixed(1)} files/sec)`);
  }
});
```

### Log Parsing

```typescript
// Parse structured logs
interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  metadata?: any;
}

const logs: LogEntry[] = [];

await $`cat app.log`.pipe(async (line) => {
  try {
    const entry = JSON.parse(line) as LogEntry;
    logs.push(entry);
    
    // Real-time alerting
    if (entry.level === 'error' && entry.metadata?.critical) {
      await sendAlert(entry);
    }
  } catch {
    // Handle non-JSON lines
    console.warn('Unparseable line:', line);
  }
});

// Analyze collected logs
const errorRate = logs.filter(l => l.level === 'error').length / logs.length;
console.log(`Error rate: ${(errorRate * 100).toFixed(2)}%`);
```

### Stream Aggregation

```typescript
// Aggregate data from multiple sources
async function aggregateLogs(servers: string[]) {
  const streams = servers.map(server => {
    const ssh = $.ssh({ host: server, username: 'monitor' });
    
    return ssh`tail -f /var/log/app.log`.stream({
      stdout: (chunk) => {
        const lines = chunk.toString().split('\n');
        lines.forEach(line => {
          if (line.trim()) {
            console.log(`[${server}] ${line}`);
          }
        });
      }
    });
  });
  
  // Run all streams concurrently
  await Promise.all(streams);
}
```

## Memory-Efficient Processing

### Large File Processing

```typescript
// Process large files without loading into memory
async function processLargeCSV(filename: string) {
  let headers: string[] = [];
  let rowCount = 0;
  
  await $`cat ${filename}`.pipe(async (line) => {
    if (rowCount === 0) {
      headers = line.split(',');
    } else {
      const values = line.split(',');
      const record = Object.fromEntries(
        headers.map((h, i) => [h, values[i]])
      );
      
      // Process each record
      await processRecord(record);
    }
    rowCount++;
  });
  
  console.log(`Processed ${rowCount} rows`);
}
```

### Stream Transformation

```typescript
// Transform data while streaming
async function transformLogs(input: string, output: string) {
  const writeStream = fs.createWriteStream(output);
  
  await $`cat ${input}`.pipe(async (line) => {
    // Parse old format
    const match = line.match(/\[(\d{4}-\d{2}-\d{2})\] \[(\w+)\] (.+)/);
    if (match) {
      const [, date, level, message] = match;
      
      // Convert to JSON format
      const json = JSON.stringify({
        timestamp: new Date(date).toISOString(),
        level: level.toLowerCase(),
        message: message.trim()
      });
      
      writeStream.write(json + '\n');
    }
  });
  
  writeStream.end();
}
```

## Real-Time Monitoring

### System Metrics

```typescript
// Monitor system metrics in real-time
async function monitorSystem() {
  // CPU usage
  $`top -b -d 1`.stream({
    stdout: (chunk) => {
      const lines = chunk.toString().split('\n');
      const cpuLine = lines.find(l => l.includes('Cpu(s)'));
      if (cpuLine) {
        const usage = parseCpuUsage(cpuLine);
        updateDashboard('cpu', usage);
      }
    }
  });
  
  // Memory usage
  setInterval(async () => {
    const memInfo = await $`free -m | grep Mem`.text();
    const [, total, used] = memInfo.split(/\s+/).map(Number);
    updateDashboard('memory', { total, used, percent: (used / total) * 100 });
  }, 1000);
}
```

### Build Progress

```typescript
// Track build progress with custom formatting
async function streamBuildWithProgress() {
  const stages = new Map<string, string>();
  
  await $`docker build -t myapp .`.stream({
    stdout: (chunk) => {
      const output = chunk.toString();
      
      // Parse Docker build output
      const stageMatch = output.match(/Step (\d+\/\d+) : (.+)/);
      if (stageMatch) {
        const [, progress, command] = stageMatch;
        stages.set(progress, command);
        
        // Clear and redraw
        console.clear();
        console.log('🔨 Building Docker Image\n');
        
        for (const [stage, cmd] of stages) {
          console.log(`  ${stage} ${cmd}`);
        }
      }
      
      // Show current operation
      if (output.includes('-->')) {
        console.log(`\n${output.trim()}`);
      }
    }
  });
  
  console.log('\n✅ Build complete!');
}
```

## Stream Control

### Stopping Streams

```typescript
// Control long-running streams
const controller = new AbortController();

// Start streaming
const streamPromise = $`tail -f /var/log/app.log`.stream({
  stdout: (chunk) => console.log(chunk),
  signal: controller.signal
});

// Stop after 30 seconds
setTimeout(() => {
  controller.abort();
}, 30000);

try {
  await streamPromise;
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Stream stopped');
  }
}
```

### Conditional Streaming

```typescript
// Stream until condition is met
async function streamUntilReady() {
  let ready = false;
  
  await $`docker logs -f container`.pipe(async (line) => {
    console.log(line);
    
    if (line.includes('Server started on port')) {
      ready = true;
      return false; // Stop piping
    }
  });
  
  if (ready) {
    console.log('✅ Application is ready!');
  }
}
```

## Error Handling

### Stream Errors

```typescript
try {
  await $`tail -f /nonexistent/file`.stream();
} catch (error) {
  console.error('Stream failed:', error.message);
}

// Handle errors in pipe
await $`cat files.txt`.pipe(async (filename) => {
  try {
    await processFile(filename);
  } catch (error) {
    console.error(`Failed to process ${filename}:`, error);
    // Continue with next file
  }
});
```

### Partial Output Handling

```typescript
// Handle incomplete lines
let buffer = '';

await $`tail -f app.log`.stream({
  stdout: (chunk) => {
    const text = buffer + chunk.toString();
    const lines = text.split('\n');
    
    // Keep last incomplete line in buffer
    buffer = lines.pop() || '';
    
    // Process complete lines
    lines.forEach(line => {
      if (line.trim()) {
        processLogLine(line);
      }
    });
  }
});

// Process any remaining data
if (buffer) {
  processLogLine(buffer);
}
```

## Performance Considerations

### Buffering Strategies

```typescript
// Batch processing for efficiency
async function batchProcess() {
  const batch: string[] = [];
  const BATCH_SIZE = 100;
  
  await $`find . -name "*.txt"`.pipe(async (file) => {
    batch.push(file);
    
    if (batch.length >= BATCH_SIZE) {
      await processBatch([...batch]);
      batch.length = 0;
    }
  });
  
  // Process remaining items
  if (batch.length > 0) {
    await processBatch(batch);
  }
}
```

### Backpressure Handling

```typescript
// Handle slow consumers
async function streamWithBackpressure() {
  const queue: string[] = [];
  let processing = false;
  
  async function processQueue() {
    if (processing || queue.length === 0) return;
    
    processing = true;
    const items = queue.splice(0, 10); // Process 10 at a time
    
    await Promise.all(items.map(item => slowOperation(item)));
    processing = false;
    
    // Process next batch
    setImmediate(processQueue);
  }
  
  await $`fast-data-generator`.pipe(async (line) => {
    queue.push(line);
    processQueue();
  });
}
```

## Best Practices

1. **Use streaming for large outputs** - Don't buffer gigabytes in memory
2. **Handle partial lines** - Network streams may split lines
3. **Add error handling** - Streams can fail mid-operation
4. **Implement timeouts** - Prevent infinite streams
5. **Process asynchronously** - Use async handlers for I/O operations
6. **Clean up resources** - Stop streams when no longer needed
7. **Monitor memory usage** - Watch for buffer growth

## Next Steps

- Learn about [Error Handling](./error-handling) for robust streaming
- Explore [Parallel Execution](./parallel-execution) for concurrent streams
- See [Progress Tracking](./progress-tracking) for advanced monitoring
- Check [Real Examples](https://github.com/xec-sh/xec/tree/main/packages/core/examples/03-advanced-features) for streaming patterns
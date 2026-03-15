# Streaming

The Xec execution engine provides powerful streaming capabilities for handling real-time output, large data transfers, and continuous log monitoring across all adapters.

## Overview

Streaming support (`packages/core/src/utils/stream.ts`) provides:

- **Real-time output streaming** from commands
- **Pipe operations** between commands
- **Transform streams** for data processing
- **Backpressure handling** for flow control
- **Multi-stream management** (stdout/stderr)
- **Stream composition** and splitting

## Basic Streaming

### Output Streaming

```typescript
import { $ } from '@xec-sh/core';

// Stream output in real-time
await $`tail -f /var/log/app.log`
  .stdout((line) => {
    console.log('LOG:', line);
  })
  .stderr((line) => {
    console.error('ERROR:', line);
  });

// Stream with line buffering
await $`long-running-process`
  .stdout((line) => process.stdout.write(`[OUT] ${line}\n`))
  .stderr((line) => process.stderr.write(`[ERR] ${line}\n`));
```

### Stream to File

```typescript
import { createWriteStream } from 'fs';

// Stream output to file
const logFile = createWriteStream('output.log');
const errorFile = createWriteStream('error.log');

await $`npm run build`
  .stdout(logFile)
  .stderr(errorFile);

// Append mode
const appendStream = createWriteStream('app.log', { flags: 'a' });
await $`echo "New log entry"`
  .stdout(appendStream);
```

## Pipe Operations

### Command Piping

```typescript
// Pipe between commands
await $`cat large-file.txt`
  .pipe($`grep "error"`)
  .pipe($`sort`)
  .pipe($`uniq -c`);

// Store intermediate results
const filtered = await $`cat data.json`
  .pipe($`jq '.items[]'`);

const sorted = await filtered
  .pipe($`sort -n`);
```

### Cross-Environment Piping

```typescript
// Pipe from local to remote
await $`cat local-file.txt`
  .pipe($.ssh('server')`cat > remote-file.txt`);

// Pipe from container to local
await $.docker('container')`cat /app/data.json`
  .pipe($`jq '.'`)
  .stdout(process.stdout);

// Chain across multiple environments
await $.k8s('pod')`cat /data/export.csv`
  .pipe($.docker('processor')`python process.py`)
  .pipe($`gzip > processed.csv.gz`);
```

## Transform Streams

### Data Transformation

```typescript
import { Transform } from 'stream';

// Create transform stream
const uppercase = new Transform({
  transform(chunk, encoding, callback) {
    callback(null, chunk.toString().toUpperCase());
  }
});

// Apply transformation
await $`echo "hello world"`
  .stdout(uppercase)
  .stdout(process.stdout);  // Outputs: HELLO WORLD

// JSON transformation
const jsonParser = new Transform({
  transform(chunk, encoding, callback) {
    try {
      const data = JSON.parse(chunk);
      callback(null, JSON.stringify(data, null, 2));
    } catch (err) {
      callback(err);
    }
  }
});

await $`curl api.example.com/data`
  .stdout(jsonParser)
  .stdout(process.stdout);
```

### Line Processing

```typescript
// Process lines individually
const lineProcessor = new Transform({
  transform(chunk, encoding, callback) {
    const lines = chunk.toString().split('\n');
    const processed = lines
      .filter(line => line.includes('ERROR'))
      .map(line => `[${new Date().toISOString()}] ${line}`)
      .join('\n');
    callback(null, processed);
  }
});

await $`tail -f app.log`
  .stdout(lineProcessor)
  .stdout(process.stdout);
```

## Stream Control

### Backpressure Handling

```typescript
// Handle backpressure automatically
const slowConsumer = new Transform({
  async transform(chunk, encoding, callback) {
    // Simulate slow processing
    await new Promise(resolve => setTimeout(resolve, 100));
    callback(null, chunk);
  }
});

// Execution automatically handles backpressure
await $`cat large-file.txt`
  .stdout(slowConsumer)
  .stdout(process.stdout);
```

### Stream Pausing/Resuming

```typescript
// Manual stream control
const command = $`tail -f /var/log/syslog`;
const stream = command.stream();

// Pause after 5 seconds
setTimeout(() => {
  stream.pause();
  console.log('Stream paused');
}, 5000);

// Resume after 10 seconds
setTimeout(() => {
  stream.resume();
  console.log('Stream resumed');
}, 10000);

await command;
```

## Multi-Stream Management

### Separate Stream Handling

```typescript
// Handle stdout and stderr separately
await $`command 2>&1`
  .stdout((line) => {
    if (line.startsWith('ERROR:')) {
      logger.error(line);
    } else {
      logger.info(line);
    }
  });

// Different handlers for each stream
await $`npm test`
  .stdout((line) => console.log(`✓ ${line}`))
  .stderr((line) => console.error(`✗ ${line}`));
```

### Stream Merging

```typescript
import { PassThrough } from 'stream';

// Merge multiple streams
const merged = new PassThrough();

// Merge outputs from multiple commands
await Promise.all([
  $`tail -f app1.log`.stdout(merged),
  $`tail -f app2.log`.stdout(merged),
  $`tail -f app3.log`.stdout(merged)
]);

// Process merged stream
merged.pipe(process.stdout);
```

## Log Streaming

### Real-time Logs

```typescript
// Stream Docker logs
await $.docker('container').logs({
  follow: true,
  tail: 100,
  timestamps: true
}).stdout((line) => {
  const [timestamp, ...message] = line.split(' ');
  console.log({
    timestamp,
    message: message.join(' ')
  });
});

// Stream Kubernetes logs
await $.k8s('pod', 'namespace').logs({
  follow: true,
  container: 'app',
  since: '10m'
}).stdout((line) => {
  console.log(`[K8S] ${line}`);
});
```

### Multi-Source Log Aggregation

```typescript
// Aggregate logs from multiple sources
async function aggregateLogs(sources: string[]) {
  const logStream = new PassThrough();
  
  // Start all log streams
  await Promise.all(sources.map(source =>
    $.ssh(source)`tail -f /var/log/app.log`
      .stdout((line) => {
        logStream.write(`[${source}] ${line}\n`);
      })
  ));
  
  // Process aggregated logs
  logStream.pipe(process.stdout);
}

await aggregateLogs(['server1', 'server2', 'server3']);
```

## Stream Composition

### Pipeline Creation

```typescript
import { pipeline } from 'stream/promises';

// Create processing pipeline
async function processPipeline(input: string, output: string) {
  const gunzip = $`gunzip -c ${input}`.stream();
  const process = $`python process.py`.stream();
  const compress = $`gzip -c`.stream();
  const outputFile = createWriteStream(output);
  
  await pipeline(
    gunzip,
    process,
    compress,
    outputFile
  );
}
```

### Stream Splitting

```typescript
// Split stream to multiple destinations
const splitter = new PassThrough();
const file1 = createWriteStream('output1.log');
const file2 = createWriteStream('output2.log');

splitter.pipe(file1);
splitter.pipe(file2);
splitter.pipe(process.stdout);

await $`generate-data`
  .stdout(splitter);
```

## Progress Tracking

### Stream Progress

```typescript
// Track streaming progress
let bytesProcessed = 0;
let linesProcessed = 0;

const progressStream = new Transform({
  transform(chunk, encoding, callback) {
    bytesProcessed += chunk.length;
    linesProcessed += chunk.toString().split('\n').length - 1;
    
    // Report progress every 100 lines
    if (linesProcessed % 100 === 0) {
      console.log(`Processed: ${linesProcessed} lines, ${bytesProcessed} bytes`);
    }
    
    callback(null, chunk);
  }
});

await $`cat large-file.txt`
  .stdout(progressStream)
  .stdout(process.stdout);
```

### Download Progress

```typescript
// Track download progress
await $.ssh('server')`cat large-file.tar.gz`
  .progress((transferred, total) => {
    const percent = (transferred / total * 100).toFixed(2);
    process.stdout.write(`\rDownloading: ${percent}%`);
  })
  .stdout(createWriteStream('downloaded.tar.gz'));
```

## Buffer Management

### Custom Buffer Sizes

```typescript
// Configure buffer sizes
await $`process-large-data`.stream({
  highWaterMark: 1024 * 1024,  // 1MB buffer
  encoding: 'utf8'
});

// Line buffering
await $`tail -f log.txt`.stream({
  lineBuffer: true,
  maxLineLength: 4096
});
```

### Memory Management

```typescript
// Limit memory usage for large streams
const limitedStream = new Transform({
  highWaterMark: 64 * 1024,  // 64KB chunks
  transform(chunk, encoding, callback) {
    // Process chunk without accumulating
    const processed = processChunk(chunk);
    callback(null, processed);
  }
});

await $`cat huge-file.dat`
  .stdout(limitedStream)
  .stdout(process.stdout);
```

## Error Handling in Streams

### Stream Error Recovery

```typescript
// Handle stream errors
await $`unreliable-stream`
  .stdout(process.stdout)
  .on('error', (error) => {
    console.error('Stream error:', error);
    // Attempt recovery
  })
  .on('end', () => {
    console.log('Stream completed');
  });

// Retry on stream failure
async function streamWithRetry(command: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await $`${command}`.stdout(process.stdout);
      break;
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error);
      if (i === retries - 1) throw error;
    }
  }
}
```

## Best Practices

### Do's ✅

```typescript
// ✅ Use streaming for large data
await $`cat large-file.txt`
  .stdout(processStream);  // Don't load all in memory

// ✅ Handle backpressure
const transform = new Transform({
  highWaterMark: 16384,  // Control buffer size
  transform(chunk, encoding, callback) {
    // Process and pass through
    callback(null, chunk);
  }
});

// ✅ Clean up streams
const stream = createWriteStream('output.txt');
try {
  await $`generate-data`.stdout(stream);
} finally {
  stream.end();
}

// ✅ Use appropriate encoding
await $`cat text-file.txt`.stream({ encoding: 'utf8' });
await $`cat binary-file.dat`.stream({ encoding: null });
```

### Don'ts ❌

```typescript
// ❌ Buffer entire stream in memory
const output = await $`cat huge-file.txt`;  // May cause OOM

// ❌ Ignore stream errors
$`stream-command`.stdout(output);  // No error handling

// ❌ Create infinite buffers
await $`infinite-stream`.stdout(accumulatorArray);

// ❌ Mix stream APIs incorrectly
stream.write(await $`command`);  // Wrong approach
```

## Implementation Details

Streaming is implemented in:
- `packages/core/src/utils/stream.ts` - Stream utilities
- `packages/core/src/core/stream-handler.ts` - Stream management
- `packages/core/src/adapters/base-adapter.ts` - Adapter stream interface
- `packages/core/src/utils/line-buffer.ts` - Line buffering

## See Also

- [Execution API](/docs/core/execution-engine/api/execution-api)
- [Pipe Operations](/docs/core/execution-engine/api/chaining)
- [File Operations](/docs/core/execution-engine/features/file-operations)
- [Performance Optimization](/docs/core/execution-engine/performance/optimization)
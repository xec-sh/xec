---
sidebar_position: 8
---

# Piping and Stream Processing

Advanced command piping and stream processing capabilities.

## Overview

The piping system in @xec-sh/core provides powerful ways to chain commands, transform data, and process streams. All pipe functionality is available through the `ProcessPromise.pipe()` method.

## Basic Piping

### Template Literal Piping

The most common way to pipe commands:

```typescript
import { $ } from '@xec-sh/core';

// Simple pipe
const result = await $`echo "hello world"`.pipe`tr a-z A-Z`;
console.log(result.stdout); // HELLO WORLD

// Chain multiple pipes
const processed = await $`cat data.txt`
  .pipe`grep ERROR`
  .pipe`sort`
  .pipe`uniq -c`;
```

### ProcessPromise to ProcessPromise

Pipe between ProcessPromise instances:

```typescript
const firstCommand = $`cat large-file.log`;
const grepCommand = $`grep -E "(ERROR|WARN)"`;
const sortCommand = $`sort -k1,1`;

const result = await firstCommand
  .pipe(grepCommand)
  .pipe(sortCommand);
```

## Stream Processing

### Node.js Streams

Pipe to any Node.js writable stream:

```typescript
import { createWriteStream, createGzip } from 'node:fs';
import { Transform } from 'node:stream';

// Pipe to file
const outputFile = createWriteStream('output.txt');
await $`generate-report`.pipe(outputFile);

// Pipe through compression
const gzipStream = createGzip();
const compressedFile = createWriteStream('output.gz');
gzipStream.pipe(compressedFile);

await $`cat large-file.txt`.pipe(gzipStream);
```

### Transform Streams

Process data with custom transform streams:

```typescript
const jsonTransform = new Transform({
  transform(chunk, encoding, callback) {
    try {
      const data = JSON.parse(chunk.toString());
      data.timestamp = new Date().toISOString();
      callback(null, JSON.stringify(data) + '\n');
    } catch (err) {
      callback(err);
    }
  }
});

await $`cat data.jsonl`.pipe(jsonTransform).pipe`gzip > processed.jsonl.gz`;
```

## Pipe Utilities

Built-in utilities for common transformations:

```typescript
import { $, pipeUtils } from '@xec-sh/core';

// Convert to uppercase
await $`echo "hello"`.pipe(pipeUtils.toUpperCase());
// Output: HELLO

// Filter lines (grep-like)
await $`cat log.txt`
  .pipe(pipeUtils.grep('ERROR'))        // String pattern
  .pipe(pipeUtils.grep(/^\[2024/));     // Regex pattern

// Replace text
await $`cat config.txt`
  .pipe(pipeUtils.replace('localhost', 'production.server'))
  .pipe(pipeUtils.replace(/password=\w+/g, 'password=***'));

// Tee - write to multiple destinations
const log1 = createWriteStream('output1.log');
const log2 = createWriteStream('output2.log');
await $`tail -f app.log`.pipe(pipeUtils.tee(log1, log2));
```

## Line-by-Line Processing

Process output line by line with functions:

```typescript
const errors: string[] = [];
const warnings: string[] = [];

await $`cat application.log`
  .pipe((line: string) => {
    if (line.includes('ERROR')) {
      errors.push(line);
    } else if (line.includes('WARN')) {
      warnings.push(line);
    }
  }, { lineByLine: true });

console.log(`Found ${errors.length} errors and ${warnings.length} warnings`);
```

### Custom Line Separators

```typescript
// Process CSV fields
const fields: string[] = [];
await $`echo "name,age,city"`
  .pipe((field: string) => {
    fields.push(field.trim());
  }, { 
    lineByLine: true, 
    lineSeparator: ',' 
  });
// fields = ['name', 'age', 'city']

// Process null-terminated strings
await $`find . -name "*.js" -print0`
  .pipe((file: string) => {
    console.log(`Processing: ${file}`);
  }, { 
    lineByLine: true, 
    lineSeparator: '\0' 
  });
```

## Advanced Patterns

### Conditional Piping

Pipe based on conditions:

```typescript
const processLargeOutput = async (result: any) => {
  const lineCount = result.stdout.split('\n').length;
  if (lineCount > 1000) {
    // Return a command to pipe to
    return 'gzip';
  }
  // Return null to skip piping
  return null;
};

const result = await $`generate-data`
  .pipe(processLargeOutput as any);
```

### Parallel Piping

Process multiple pipes in parallel:

```typescript
const urls = ['url1.com', 'url2.com', 'url3.com'];

const results = await Promise.all(
  urls.map(url => 
    $`curl -s ${url}`
      .pipe`grep -o '<title>.*</title>'`
      .pipe`sed 's/<[^>]*>//g'`
      .then(r => ({ url, title: r.stdout.trim() }))
  )
);
```

### Error Handling in Pipes

Handle errors gracefully:

```typescript
// By default, pipe fails if any command fails
try {
  await $`false`.pipe`echo "This won't run"`;
} catch (error) {
  console.log('Pipe failed as expected');
}

// Use nothrow() to continue on error
const result = await $`false`
  .nothrow()
  .pipe`echo "This will run"`;
console.log(result.stdout); // "This will run"

// Check individual command results
const pipeline = await $`cat maybe-missing.txt`
  .nothrow()
  .pipe`grep pattern || echo "No matches found"`;
```

### Streaming Large Files

Efficiently process large files:

```typescript
// Process large log file in chunks
const processChunk = new Transform({
  transform(chunk, encoding, callback) {
    // Process chunk without loading entire file
    const lines = chunk.toString().split('\n');
    const errors = lines.filter(l => l.includes('ERROR'));
    callback(null, errors.join('\n') + '\n');
  }
});

await $`tail -n 10000 huge.log`
  .pipe(processChunk)
  .pipe(createWriteStream('errors-only.log'));
```

## Performance Tips

1. **Use template literals for simple pipes** - Most efficient for shell commands
2. **Stream large data** - Don't load everything into memory
3. **Batch operations** - Process multiple lines at once
4. **Avoid unnecessary pipes** - Each pipe adds overhead

```typescript
// Good - single pipe
await $`cat file | grep pattern | sort | uniq`;

// Less efficient - multiple pipes
await $`cat file`.pipe`grep pattern`.pipe`sort`.pipe`uniq`;

// Best for complex processing - mixed approach
await $`cat large-file.json`
  .pipe(new Transform({
    transform(chunk, enc, cb) {
      // Complex JSON processing
      cb(null, processedData);
    }
  }))
  .pipe`gzip > output.gz`;
```

## Migration from Legacy API

If you're using the deprecated `pipe()` function:

```typescript
// Old way (deprecated)
import { pipe } from '@xec-sh/core';
const result = await pipe(['echo "hello"', 'tr a-z A-Z'], $);

// New way
const result = await $`echo "hello"`.pipe`tr a-z A-Z`;

// Old way with options (deprecated)
const result = await pipe(
  ['cat file', 'grep pattern'],
  $,
  { throwOnError: false }
);

// New way with options
const result = await $`cat file`
  .nothrow()  // Don't throw on error
  .pipe`grep pattern`;
```

## See Also

- [ProcessPromise API](../api-reference/process-promise.md) - Complete ProcessPromise reference
- [Streaming](./streaming.md) - Advanced streaming patterns
- [Template Literals](../core-features/template-literals.md) - Command construction
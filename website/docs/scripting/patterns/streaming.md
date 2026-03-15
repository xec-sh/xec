# Stream Processing Patterns

Xec provides powerful streaming capabilities for handling large outputs, real-time data, and efficient I/O operations. This guide covers stream processing patterns for command execution.

## Basic Output Streaming

### Streaming to Console

```javascript
import { $ } from '@xec-sh/core';

// Stream output directly to console
await $`npm install`.pipe(process.stdout);

// Stream both stdout and stderr
await $`npm test`
  .pipe(process.stdout)
  .stderr(process.stderr);

// Stream with prefix
import { Transform } from 'stream';

const prefixer = new Transform({
  transform(chunk, encoding, callback) {
    const lines = chunk.toString().split('\n');
    const prefixed = lines.map(line => line ? `[LOG] ${line}` : '').join('\n');
    callback(null, prefixed);
  }
});

await $`npm run dev`.pipe(prefixer).pipe(process.stdout);
```

### Streaming to Files

```javascript
import { createWriteStream, createReadStream } from 'fs';

// Stream to file
const logFile = createWriteStream('build.log');
await $`npm run build`.pipe(logFile);

// Append to file
const appendLog = createWriteStream('app.log', { flags: 'a' });
await $`echo "New log entry"`.pipe(appendLog);

// Tee - stream to multiple destinations
import { PassThrough } from 'stream';

const tee = new PassThrough();
const file1 = createWriteStream('output1.log');
const file2 = createWriteStream('output2.log');

tee.pipe(file1);
tee.pipe(file2);
tee.pipe(process.stdout);

await $`npm test`.pipe(tee);
```

## Real-Time Log Processing

### Log Parsing and Filtering

```javascript
import { Transform } from 'stream';

class LogParser extends Transform {
  constructor(options = {}) {
    super(options);
    this.filters = options.filters || [];
    this.formatter = options.formatter || (log => JSON.stringify(log));
  }
  
  _transform(chunk, encoding, callback) {
    const lines = chunk.toString().split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const log = this.parseLine(line);
        
        // Apply filters
        if (this.filters.some(filter => !filter(log))) {
          continue;
        }
        
        // Format and output
        this.push(this.formatter(log) + '\n');
      } catch (error) {
        // Pass through unparseable lines
        this.push(line + '\n');
      }
    }
    
    callback();
  }
  
  parseLine(line) {
    // Try JSON format
    if (line.startsWith('{')) {
      return JSON.parse(line);
    }
    
    // Try common log format
    const match = line.match(/^\[([^\]]+)\] \[([^\]]+)\] (.+)$/);
    if (match) {
      return {
        timestamp: match[1],
        level: match[2],
        message: match[3]
      };
    }
    
    // Default format
    return { message: line };
  }
}

// Usage
const parser = new LogParser({
  filters: [
    log => log.level !== 'DEBUG',  // Filter out DEBUG logs
    log => !log.message.includes('deprecated')  // Filter deprecation warnings
  ],
  formatter: log => `${log.timestamp || new Date().toISOString()} - ${log.message}`
});

await $`tail -f /var/log/app.log`
  .pipe(parser)
  .pipe(process.stdout);
```

### Multi-Source Log Aggregation

```javascript
import { Readable } from 'stream';

class LogAggregator extends Transform {
  constructor() {
    super();
    this.sources = new Map();
  }
  
  addSource(name, stream) {
    stream.on('data', chunk => {
      const lines = chunk.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          this.push(`[${name}] ${line}\n`);
        }
      });
    });
    
    stream.on('error', error => {
      this.push(`[${name}] ERROR: ${error.message}\n`);
    });
    
    this.sources.set(name, stream);
  }
  
  removeSource(name) {
    const stream = this.sources.get(name);
    if (stream) {
      stream.destroy();
      this.sources.delete(name);
    }
  }
}

// Usage
const aggregator = new LogAggregator();

// Add multiple log sources
aggregator.addSource('app', $`tail -f /var/log/app.log`);
aggregator.addSource('nginx', $`tail -f /var/log/nginx/access.log`);
aggregator.addSource('system', $`journalctl -f`);

// Output aggregated logs
aggregator.pipe(process.stdout);
```

## Stream Transformation

### Data Transformation Pipeline

```javascript
class StreamPipeline {
  constructor() {
    this.transforms = [];
  }
  
  add(transform) {
    this.transforms.push(transform);
    return this;
  }
  
  createStream() {
    if (this.transforms.length === 0) {
      return new PassThrough();
    }
    
    let stream = this.transforms[0];
    for (let i = 1; i < this.transforms.length; i++) {
      stream = stream.pipe(this.transforms[i]);
    }
    
    return stream;
  }
}

// Create transformation pipeline
const pipeline = new StreamPipeline()
  .add(new Transform({
    transform(chunk, encoding, callback) {
      // Convert to uppercase
      callback(null, chunk.toString().toUpperCase());
    }
  }))
  .add(new Transform({
    transform(chunk, encoding, callback) {
      // Add timestamp
      const lines = chunk.toString().split('\n');
      const timestamped = lines.map(line => 
        line ? `[${new Date().toISOString()}] ${line}` : ''
      ).join('\n');
      callback(null, timestamped);
    }
  }))
  .add(new Transform({
    transform(chunk, encoding, callback) {
      // Colorize
      const colored = chunk.toString()
        .replace(/ERROR/g, '\x1b[31mERROR\x1b[0m')
        .replace(/WARNING/g, '\x1b[33mWARNING\x1b[0m')
        .replace(/INFO/g, '\x1b[32mINFO\x1b[0m');
      callback(null, colored);
    }
  }));

await $`npm test`
  .pipe(pipeline.createStream())
  .pipe(process.stdout);
```

### JSON Stream Processing

```javascript
import { Transform } from 'stream';

class JSONStreamProcessor extends Transform {
  constructor(processor) {
    super();
    this.processor = processor;
    this.buffer = '';
  }
  
  _transform(chunk, encoding, callback) {
    this.buffer += chunk.toString();
    
    // Try to extract complete JSON objects
    let startIndex = 0;
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < this.buffer.length; i++) {
      const char = this.buffer[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        
        if (braceCount === 0 && i > startIndex) {
          const jsonStr = this.buffer.substring(startIndex, i + 1);
          
          try {
            const json = JSON.parse(jsonStr);
            const processed = this.processor(json);
            this.push(JSON.stringify(processed) + '\n');
            startIndex = i + 1;
          } catch (error) {
            // Invalid JSON, skip
          }
        }
      }
    }
    
    this.buffer = this.buffer.substring(startIndex);
    callback();
  }
  
  _flush(callback) {
    if (this.buffer.trim()) {
      try {
        const json = JSON.parse(this.buffer);
        const processed = this.processor(json);
        this.push(JSON.stringify(processed) + '\n');
      } catch (error) {
        // Invalid JSON at end
      }
    }
    callback();
  }
}

// Usage - process JSON logs
const processor = new JSONStreamProcessor(log => ({
  ...log,
  processed: true,
  timestamp: new Date().toISOString()
}));

await $`docker logs -f container_name`
  .pipe(processor)
  .pipe(process.stdout);
```

## Progress Monitoring

### Progress Stream

```javascript
class ProgressStream extends Transform {
  constructor(options = {}) {
    super();
    this.total = options.total || 0;
    this.current = 0;
    this.label = options.label || 'Progress';
    this.updateInterval = options.updateInterval || 100;
    this.lastUpdate = 0;
  }
  
  _transform(chunk, encoding, callback) {
    const lines = chunk.toString().split('\n');
    
    for (const line of lines) {
      // Look for progress indicators
      const progressMatch = line.match(/(\d+)\/(\d+)/);
      if (progressMatch) {
        this.current = parseInt(progressMatch[1]);
        this.total = parseInt(progressMatch[2]);
        this.updateProgress();
      }
      
      const percentMatch = line.match(/(\d+)%/);
      if (percentMatch) {
        const percent = parseInt(percentMatch[1]);
        this.current = Math.floor(this.total * percent / 100);
        this.updateProgress();
      }
    }
    
    // Pass through original data
    callback(null, chunk);
  }
  
  updateProgress() {
    const now = Date.now();
    if (now - this.lastUpdate < this.updateInterval) return;
    
    this.lastUpdate = now;
    const percent = this.total > 0 ? Math.floor(this.current / this.total * 100) : 0;
    const bar = this.createProgressBar(percent);
    
    process.stdout.write(`\r${this.label}: ${bar} ${percent}% (${this.current}/${this.total})`);
    
    if (this.current >= this.total) {
      process.stdout.write('\n');
    }
  }
  
  createProgressBar(percent) {
    const width = 30;
    const filled = Math.floor(width * percent / 100);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }
}

// Usage
const progress = new ProgressStream({
  label: 'Building',
  total: 100
});

await $`npm run build:verbose`
  .pipe(progress)
  .pipe(createWriteStream('build.log'));
```

## Parallel Stream Processing

### Multi-Stream Processor

```javascript
class ParallelStreamProcessor {
  constructor(workerCount = 4) {
    this.workerCount = workerCount;
    this.workers = [];
    this.currentWorker = 0;
  }
  
  async process(inputStream, processor) {
    // Create worker streams
    for (let i = 0; i < this.workerCount; i++) {
      this.workers.push(this.createWorker(processor));
    }
    
    // Distribute input to workers
    return new Promise((resolve, reject) => {
      inputStream.on('data', chunk => {
        const lines = chunk.toString().split('\n');
        
        lines.forEach(line => {
          if (line.trim()) {
            // Round-robin distribution
            this.workers[this.currentWorker].write(line + '\n');
            this.currentWorker = (this.currentWorker + 1) % this.workerCount;
          }
        });
      });
      
      inputStream.on('end', () => {
        this.workers.forEach(worker => worker.end());
        resolve();
      });
      
      inputStream.on('error', reject);
    });
  }
  
  createWorker(processor) {
    return new Transform({
      async transform(chunk, encoding, callback) {
        try {
          const result = await processor(chunk.toString());
          callback(null, result);
        } catch (error) {
          callback(error);
        }
      }
    }).pipe(process.stdout);
  }
}

// Usage
const parallelProcessor = new ParallelStreamProcessor(4);

await parallelProcessor.process(
  $`find . -name "*.log"`,
  async (filename) => {
    const result = await $`wc -l ${filename.trim()}`.nothrow();
    return result.stdout;
  }
);
```

## Buffering and Batching

### Batch Stream Processor

```javascript
class BatchStream extends Transform {
  constructor(options = {}) {
    super({ objectMode: true });
    this.batchSize = options.batchSize || 100;
    this.flushInterval = options.flushInterval || 1000;
    this.processor = options.processor || (batch => batch);
    
    this.batch = [];
    this.timer = null;
    
    this.startTimer();
  }
  
  _transform(chunk, encoding, callback) {
    this.batch.push(chunk);
    
    if (this.batch.length >= this.batchSize) {
      this.flush();
    }
    
    callback();
  }
  
  _flush(callback) {
    this.flush();
    clearInterval(this.timer);
    callback();
  }
  
  async flush() {
    if (this.batch.length === 0) return;
    
    const currentBatch = this.batch;
    this.batch = [];
    
    try {
      const result = await this.processor(currentBatch);
      this.push(result);
    } catch (error) {
      this.emit('error', error);
    }
  }
  
  startTimer() {
    this.timer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }
}

// Usage - batch database inserts
const batcher = new BatchStream({
  batchSize: 1000,
  flushInterval: 5000,
  processor: async (batch) => {
    // Insert batch into database
    await $`psql -c "INSERT INTO logs VALUES ${batch.join(',')}"`;
    return `Inserted ${batch.length} records\n`;
  }
});

await $`tail -f /var/log/app.log`
  .pipe(new Transform({
    transform(chunk, encoding, callback) {
      const lines = chunk.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          this.push(line);
        }
      });
      callback();
    },
    objectMode: true
  }))
  .pipe(batcher)
  .pipe(process.stdout);
```

## Error Handling in Streams

### Resilient Stream Pipeline

```javascript
class ResilientStream extends Transform {
  constructor(options = {}) {
    super();
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.errorHandler = options.errorHandler || (() => {});
  }
  
  async _transform(chunk, encoding, callback) {
    let retries = 0;
    
    while (retries < this.maxRetries) {
      try {
        const result = await this.process(chunk);
        callback(null, result);
        return;
      } catch (error) {
        retries++;
        
        if (retries >= this.maxRetries) {
          this.errorHandler(error, chunk);
          // Skip this chunk but continue processing
          callback();
          return;
        }
        
        await new Promise(resolve => 
          setTimeout(resolve, this.retryDelay * retries)
        );
      }
    }
  }
  
  async process(chunk) {
    // Override in subclass
    return chunk;
  }
}

// Usage
class APIStream extends ResilientStream {
  async process(chunk) {
    const data = JSON.parse(chunk.toString());
    const response = await $`curl -X POST https://api.example.com/data -d '${JSON.stringify(data)}'`;
    return response.stdout;
  }
}

const apiStream = new APIStream({
  maxRetries: 5,
  retryDelay: 2000,
  errorHandler: (error, chunk) => {
    console.error('Failed to process chunk:', error.message);
    // Log to dead letter queue
    fs.appendFileSync('failed.log', chunk + '\n');
  }
});
```

## Complete Streaming Example

```javascript
// streaming-log-processor.js
import { $ } from '@xec-sh/core';
import { Transform, PassThrough } from 'stream';
import { createWriteStream } from 'fs';
import chalk from 'chalk';

class LogProcessingPipeline {
  constructor(config) {
    this.config = config;
    this.stats = {
      total: 0,
      errors: 0,
      warnings: 0,
      processed: 0
    };
  }
  
  async start() {
    console.log(chalk.blue('Starting log processing pipeline...'));
    
    // Create pipeline stages
    const source = this.createSource();
    const parser = this.createParser();
    const filter = this.createFilter();
    const enricher = this.createEnricher();
    const aggregator = this.createAggregator();
    const writer = this.createWriter();
    
    // Connect pipeline
    source
      .pipe(parser)
      .pipe(filter)
      .pipe(enricher)
      .pipe(aggregator)
      .pipe(writer);
    
    // Monitor pipeline
    this.monitorPipeline([source, parser, filter, enricher, aggregator, writer]);
    
    // Start stats reporting
    this.startStatsReporting();
    
    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }
  
  createSource() {
    if (this.config.follow) {
      return $`tail -f ${this.config.logFile}`;
    } else {
      return $`cat ${this.config.logFile}`;
    }
  }
  
  createParser() {
    return new Transform({
      transform: (chunk, encoding, callback) => {
        const lines = chunk.toString().split('\n');
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            // Parse log line
            const log = this.parseLogLine(line);
            this.stats.total++;
            
            // Track log levels
            if (log.level === 'ERROR') this.stats.errors++;
            if (log.level === 'WARNING') this.stats.warnings++;
            
            callback(null, JSON.stringify(log) + '\n');
          } catch (error) {
            // Pass through unparseable lines
            callback(null, line + '\n');
          }
        }
      }
    });
  }
  
  createFilter() {
    return new Transform({
      transform: (chunk, encoding, callback) => {
        try {
          const log = JSON.parse(chunk.toString());
          
          // Apply filters
          if (this.config.filters.level && 
              log.level !== this.config.filters.level) {
            callback(); // Skip
            return;
          }
          
          if (this.config.filters.timeRange) {
            const logTime = new Date(log.timestamp);
            const { start, end } = this.config.filters.timeRange;
            
            if (logTime < start || logTime > end) {
              callback(); // Skip
              return;
            }
          }
          
          if (this.config.filters.pattern && 
              !log.message.match(this.config.filters.pattern)) {
            callback(); // Skip
            return;
          }
          
          callback(null, JSON.stringify(log) + '\n');
        } catch (error) {
          callback(); // Skip invalid entries
        }
      }
    });
  }
  
  createEnricher() {
    return new Transform({
      transform: async (chunk, encoding, callback) => {
        try {
          const log = JSON.parse(chunk.toString());
          
          // Enrich with additional data
          if (log.userId) {
            // Lookup user info (example)
            const userInfo = await this.getUserInfo(log.userId);
            log.user = userInfo;
          }
          
          if (log.ip) {
            // Geo-locate IP (example)
            const location = await this.geoLocate(log.ip);
            log.location = location;
          }
          
          // Add processing metadata
          log.processedAt = new Date().toISOString();
          log.pipeline = this.config.pipelineName;
          
          this.stats.processed++;
          
          callback(null, JSON.stringify(log) + '\n');
        } catch (error) {
          callback(null, chunk); // Pass through on error
        }
      }
    });
  }
  
  createAggregator() {
    const aggregator = new Transform({
      transform: function(chunk, encoding, callback) {
        // Collect for batching
        if (!this.buffer) this.buffer = [];
        this.buffer.push(chunk);
        
        if (this.buffer.length >= 100) {
          const batch = this.buffer.join('');
          this.buffer = [];
          callback(null, batch);
        } else {
          callback();
        }
      },
      flush: function(callback) {
        if (this.buffer && this.buffer.length > 0) {
          callback(null, this.buffer.join(''));
        } else {
          callback();
        }
      }
    });
    
    return aggregator;
  }
  
  createWriter() {
    const outputs = [];
    
    // File output
    if (this.config.output.file) {
      outputs.push(createWriteStream(this.config.output.file, { flags: 'a' }));
    }
    
    // Database output
    if (this.config.output.database) {
      outputs.push(this.createDatabaseStream());
    }
    
    // Console output
    if (this.config.output.console) {
      outputs.push(this.createConsoleStream());
    }
    
    // Create tee for multiple outputs
    const tee = new PassThrough();
    outputs.forEach(output => tee.pipe(output));
    
    return tee;
  }
  
  createDatabaseStream() {
    return new Transform({
      transform: async (chunk, encoding, callback) => {
        const logs = chunk.toString()
          .split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line));
        
        if (logs.length > 0) {
          // Insert into database
          const values = logs.map(log => 
            `('${log.timestamp}', '${log.level}', '${log.message}')`
          ).join(',');
          
          await $`psql -c "INSERT INTO logs (timestamp, level, message) VALUES ${values}"`;
        }
        
        callback();
      }
    });
  }
  
  createConsoleStream() {
    return new Transform({
      transform: (chunk, encoding, callback) => {
        const logs = chunk.toString()
          .split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line));
        
        for (const log of logs) {
          const color = {
            'ERROR': chalk.red,
            'WARNING': chalk.yellow,
            'INFO': chalk.blue,
            'DEBUG': chalk.gray
          }[log.level] || chalk.white;
          
          console.log(color(`[${log.timestamp}] [${log.level}] ${log.message}`));
        }
        
        callback();
      }
    });
  }
  
  parseLogLine(line) {
    // Try different log formats
    
    // JSON format
    if (line.startsWith('{')) {
      return JSON.parse(line);
    }
    
    // Apache/Nginx format
    const apacheMatch = line.match(/^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]+)" (\d+) (\d+)/);
    if (apacheMatch) {
      return {
        ip: apacheMatch[1],
        timestamp: apacheMatch[2],
        request: apacheMatch[3],
        status: apacheMatch[4],
        bytes: apacheMatch[5],
        level: 'INFO'
      };
    }
    
    // Syslog format
    const syslogMatch = line.match(/^(\w+\s+\d+\s+\d+:\d+:\d+)\s+(\S+)\s+(\S+)\[(\d+)\]:\s+(.+)$/);
    if (syslogMatch) {
      return {
        timestamp: syslogMatch[1],
        host: syslogMatch[2],
        process: syslogMatch[3],
        pid: syslogMatch[4],
        message: syslogMatch[5],
        level: 'INFO'
      };
    }
    
    // Default format
    return {
      timestamp: new Date().toISOString(),
      message: line,
      level: 'INFO'
    };
  }
  
  async getUserInfo(userId) {
    // Mock user lookup
    return { id: userId, name: 'User ' + userId };
  }
  
  async geoLocate(ip) {
    // Mock geo-location
    return { country: 'US', city: 'New York' };
  }
  
  monitorPipeline(stages) {
    stages.forEach((stage, index) => {
      stage.on('error', error => {
        console.error(chalk.red(`Error in stage ${index}:`), error.message);
      });
    });
  }
  
  startStatsReporting() {
    setInterval(() => {
      console.log(chalk.gray(
        `Stats: Total=${this.stats.total} Processed=${this.stats.processed} ` +
        `Errors=${this.stats.errors} Warnings=${this.stats.warnings}`
      ));
    }, 5000);
  }
}

// Usage
const pipeline = new LogProcessingPipeline({
  logFile: '/var/log/app.log',
  follow: true,
  pipelineName: 'main',
  filters: {
    level: 'ERROR',
    timeRange: {
      start: new Date(Date.now() - 3600000), // Last hour
      end: new Date()
    },
    pattern: /database|connection/i
  },
  output: {
    file: 'processed.log',
    database: true,
    console: true
  }
});

await pipeline.start();
```

This comprehensive example demonstrates:
- Multi-stage streaming pipeline
- Log parsing and filtering
- Data enrichment
- Batch processing
- Multiple output destinations
- Error handling and monitoring
- Real-time statistics
- Format detection
- Performance optimization through batching
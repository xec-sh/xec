# Log Streaming

The Kubernetes adapter provides comprehensive real-time log streaming capabilities, enabling efficient monitoring and debugging of applications running in pods. This includes support for container-specific logs, historical log retrieval, and advanced filtering and processing patterns.

## Basic Log Streaming

### Simple Log Streaming
Stream logs from pods in real-time:

```javascript
import { $ } from '@xec-sh/core';
import { KubernetesAdapter } from '@xec-sh/core';

const k8s = new KubernetesAdapter();

// Stream logs from a pod
const logStream = await k8s.streamLogs(
  'web-server-pod',
  (data) => {
    console.log('Log:', data.trim());
  },
  {
    namespace: 'production',
    follow: true,
    timestamps: true
  }
);

// Stop streaming after 30 seconds
setTimeout(() => {
  logStream.stop();
}, 30000);
```

### Container-Specific Streaming
Stream logs from specific containers in multi-container pods:

```javascript
// Stream from main application container
const appStream = await k8s.streamLogs(
  'multi-container-pod',
  (data) => {
    console.log('[APP]', data.trim());
  },
  {
    namespace: 'production',
    container: 'app',
    follow: true,
    tail: 100
  }
);

// Stream from sidecar container
const sidecarStream = await k8s.streamLogs(
  'multi-container-pod',
  (data) => {
    console.log('[SIDECAR]', data.trim());
  },
  {
    namespace: 'production',
    container: 'log-collector',
    follow: true,
    tail: 50
  }
);

// Stop both streams
setTimeout(() => {
  appStream.stop();
  sidecarStream.stop();
}, 60000);
```

### Historical Log Retrieval
Retrieve historical logs with various options:

```javascript
// Get last 100 lines
const recentLogs = await k8s.streamLogs(
  'api-server-pod',
  (data) => {
    console.log(data.trim());
  },
  {
    namespace: 'production',
    tail: 100,
    follow: false  // Don't follow, just get historical
  }
);

// Get logs from previous container instance
const previousLogs = await k8s.streamLogs(
  'crashed-pod',
  (data) => {
    console.error('Previous instance:', data.trim());
  },
  {
    namespace: 'production',
    previous: true,
    follow: false
  }
);
```

## Pod API Integration

### Using Pod Context
Use the pod API for convenient log streaming:

```javascript
import { $k8s } from '@xec-sh/core';

// Create Kubernetes context
const k8s = $k8s({
  namespace: 'production'
});

// Get pod instance
const webPod = k8s.pod('web-server-pod');

// Stream logs with follow
const followStream = await webPod.follow(
  (data) => {
    console.log('Live log:', data.trim());
  },
  {
    tail: 50,
    timestamps: true
  }
);

// Get static logs
const staticLogs = await webPod.logs({
  tail: 200,
  timestamps: true
});
console.log('Static logs:', staticLogs);

// Stop following
setTimeout(() => {
  followStream.stop();
}, 30000);
```

### Multi-Container Log Management
Manage logs from multiple containers:

```javascript
const multiPod = k8s.pod('multi-service-pod');

// Stream logs from all containers
const containers = ['app', 'proxy', 'monitor'];
const streams = [];

for (const container of containers) {
  const stream = await multiPod.streamLogs(
    (data) => {
      console.log(`[${container.toUpperCase()}] ${data.trim()}`);
    },
    {
      container,
      follow: true,
      timestamps: true,
      tail: 20
    }
  );
  
  streams.push({ container, stream });
}

// Stop all streams after 2 minutes
setTimeout(() => {
  streams.forEach(({ container, stream }) => {
    console.log(`Stopping logs for ${container}`);
    stream.stop();
  });
}, 120000);
```

## Advanced Log Processing

### Log Filtering and Processing
Implement advanced log filtering and processing:

```javascript
// Error log aggregator
class LogProcessor {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.metrics = {
      totalLines: 0,
      errorCount: 0,
      warningCount: 0
    };
  }
  
  processLine(line, source) {
    this.metrics.totalLines++;
    
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, source, line };
    
    if (line.includes('ERROR') || line.includes('FATAL')) {
      this.errors.push(logEntry);
      this.metrics.errorCount++;
      console.error(`🔴 [${source}] ERROR:`, line.trim());
    } else if (line.includes('WARN') || line.includes('WARNING')) {
      this.warnings.push(logEntry);
      this.metrics.warningCount++;
      console.warn(`🟡 [${source}] WARN:`, line.trim());
    } else if (line.includes('INFO')) {
      console.log(`ℹ️ [${source}] INFO:`, line.trim());
    } else {
      console.log(`[${source}]`, line.trim());
    }
  }
  
  getReport() {
    return {
      metrics: this.metrics,
      recentErrors: this.errors.slice(-10),
      recentWarnings: this.warnings.slice(-10)
    };
  }
}

// Use log processor across multiple pods
const processor = new LogProcessor();

const pods = ['api-server-pod', 'worker-pod', 'scheduler-pod'];
const logStreams = [];

for (const podName of pods) {
  const stream = await k8s.streamLogs(
    podName,
    (data) => {
      const lines = data.split('\n').filter(Boolean);
      lines.forEach(line => processor.processLine(line, podName));
    },
    {
      namespace: 'production',
      follow: true,
      timestamps: true
    }
  );
  
  logStreams.push(stream);
}

// Generate periodic reports
const reportInterval = setInterval(() => {
  const report = processor.getReport();
  console.log('\n--- Log Report ---');
  console.log('Metrics:', report.metrics);
  if (report.recentErrors.length > 0) {
    console.log('Recent Errors:', report.recentErrors.length);
  }
  console.log('---\n');
}, 30000);

// Cleanup after 5 minutes
setTimeout(() => {
  clearInterval(reportInterval);
  logStreams.forEach(stream => stream.stop());
  
  const finalReport = processor.getReport();
  console.log('Final report:', JSON.stringify(finalReport, null, 2));
}, 300000);
```

### Pattern-Based Log Analysis
Implement pattern-based log analysis:

```javascript
// Log pattern analyzer
class LogPatternAnalyzer {
  constructor() {
    this.patterns = {
      httpRequests: /(\w+)\s+(\S+)\s+HTTP\/[\d.]+"\s+(\d+)\s+(\d+)/,
      exceptions: /Exception|Error|Failure/i,
      performance: /(\d+)ms|took\s+(\d+)/i,
      database: /SQL|query|transaction/i,
      authentication: /login|logout|auth|token/i
    };
    
    this.matches = {
      httpRequests: [],
      exceptions: [],
      performance: [],
      database: [],
      authentication: []
    };
  }
  
  analyze(line) {
    for (const [category, pattern] of Object.entries(this.patterns)) {
      if (pattern.test(line)) {
        this.matches[category].push({
          timestamp: new Date(),
          line: line.trim()
        });
        
        this.handleMatch(category, line);
      }
    }
  }
  
  handleMatch(category, line) {
    switch (category) {
      case 'httpRequests':
        const match = this.patterns.httpRequests.exec(line);
        if (match) {
          const [, method, path, status, size] = match;
          console.log(`🌐 HTTP: ${method} ${path} ${status} (${size} bytes)`);
        }
        break;
        
      case 'exceptions':
        console.error(`❌ Exception detected:`, line.trim());
        break;
        
      case 'performance':
        const perfMatch = this.patterns.performance.exec(line);
        if (perfMatch) {
          const duration = perfMatch[1] || perfMatch[2];
          if (parseInt(duration) > 1000) {
            console.warn(`⚠️ Slow operation: ${duration}ms`);
          }
        }
        break;
        
      case 'database':
        console.log(`🗄️ Database activity:`, line.trim());
        break;
        
      case 'authentication':
        console.log(`🔐 Auth event:`, line.trim());
        break;
    }
  }
  
  getStats() {
    const stats = {};
    for (const [category, matches] of Object.entries(this.matches)) {
      stats[category] = {
        count: matches.length,
        recent: matches.slice(-5)
      };
    }
    return stats;
  }
}

// Use pattern analyzer
const analyzer = new LogPatternAnalyzer();

const patternStream = await k8s.streamLogs(
  'web-app-pod',
  (data) => {
    const lines = data.split('\n').filter(Boolean);
    lines.forEach(line => analyzer.analyze(line));
  },
  {
    namespace: 'production',
    follow: true,
    timestamps: false
  }
);

// Generate pattern analysis report
setInterval(() => {
  const stats = analyzer.getStats();
  console.log('\n--- Pattern Analysis ---');
  for (const [category, data] of Object.entries(stats)) {
    if (data.count > 0) {
      console.log(`${category}: ${data.count} matches`);
    }
  }
  console.log('---\n');
}, 60000);

// Stop after 10 minutes
setTimeout(() => {
  patternStream.stop();
  console.log('Final pattern analysis:', analyzer.getStats());
}, 600000);
```

## Label-Based Log Streaming

### Multi-Pod Log Aggregation
Stream logs from multiple pods using label selectors:

```javascript
// Stream logs from all pods matching a label
async function streamFromSelector(selector, namespace, options = {}) {
  // Get all pods matching selector
  const podsResult = await k8s.executeKubectl([
    'get', 'pods',
    '-l', selector,
    '-n', namespace,
    '-o', 'jsonpath={.items[*].metadata.name}'
  ]);
  
  const pods = podsResult.stdout.trim().split(' ').filter(Boolean);
  const streams = [];
  
  for (const pod of pods) {
    console.log(`Starting log stream for pod: ${pod}`);
    
    const stream = await k8s.streamLogs(
      pod,
      (data) => {
        const lines = data.split('\n').filter(Boolean);
        lines.forEach(line => {
          console.log(`[${pod}] ${line.trim()}`);
        });
      },
      {
        namespace,
        follow: true,
        timestamps: true,
        ...options
      }
    );
    
    streams.push({ pod, stream });
  }
  
  return streams;
}

// Stream from all web server pods
const webServerStreams = await streamFromSelector(
  'app=web-server,tier=frontend',
  'production',
  { tail: 50 }
);

console.log(`Streaming logs from ${webServerStreams.length} web server pods`);

// Stop all streams after 5 minutes
setTimeout(() => {
  webServerStreams.forEach(({ pod, stream }) => {
    console.log(`Stopping log stream for ${pod}`);
    stream.stop();
  });
}, 300000);
```

### Service-Level Log Aggregation
Aggregate logs at the service level:

```javascript
// Service log aggregator
class ServiceLogAggregator {
  constructor(k8s, serviceName, namespace) {
    this.k8s = k8s;
    this.serviceName = serviceName;
    this.namespace = namespace;
    this.activeStreams = new Map();
    this.logBuffer = [];
    this.maxBufferSize = 1000;
  }
  
  async start() {
    // Get initial pods
    await this.refreshPods();
    
    // Refresh pod list every 30 seconds
    this.refreshInterval = setInterval(() => {
      this.refreshPods();
    }, 30000);
  }
  
  async refreshPods() {
    try {
      const podsResult = await this.k8s.executeKubectl([
        'get', 'pods',
        '-l', `app=${this.serviceName}`,
        '-n', this.namespace,
        '--field-selector=status.phase=Running',
        '-o', 'jsonpath={.items[*].metadata.name}'
      ]);
      
      const currentPods = new Set(podsResult.stdout.trim().split(' ').filter(Boolean));
      const trackedPods = new Set(this.activeStreams.keys());
      
      // Remove streams for pods that no longer exist
      for (const pod of trackedPods) {
        if (!currentPods.has(pod)) {
          console.log(`Pod ${pod} no longer exists, stopping stream`);
          this.activeStreams.get(pod).stop();
          this.activeStreams.delete(pod);
        }
      }
      
      // Add streams for new pods
      for (const pod of currentPods) {
        if (!trackedPods.has(pod)) {
          console.log(`New pod detected: ${pod}, starting stream`);
          await this.startPodStream(pod);
        }
      }
      
    } catch (error) {
      console.error('Failed to refresh pods:', error.message);
    }
  }
  
  async startPodStream(pod) {
    try {
      const stream = await this.k8s.streamLogs(
        pod,
        (data) => {
          this.processLogData(pod, data);
        },
        {
          namespace: this.namespace,
          follow: true,
          timestamps: true,
          tail: 20
        }
      );
      
      this.activeStreams.set(pod, stream);
      
    } catch (error) {
      console.error(`Failed to start stream for pod ${pod}:`, error.message);
    }
  }
  
  processLogData(pod, data) {
    const lines = data.split('\n').filter(Boolean);
    
    lines.forEach(line => {
      const logEntry = {
        timestamp: new Date(),
        pod,
        service: this.serviceName,
        line: line.trim()
      };
      
      this.logBuffer.push(logEntry);
      
      // Maintain buffer size
      if (this.logBuffer.length > this.maxBufferSize) {
        this.logBuffer = this.logBuffer.slice(-this.maxBufferSize);
      }
      
      // Output formatted log
      console.log(`[${this.serviceName}:${pod}] ${line.trim()}`);
    });
  }
  
  stop() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    
    for (const stream of this.activeStreams.values()) {
      stream.stop();
    }
    
    this.activeStreams.clear();
  }
  
  getRecentLogs(count = 50) {
    return this.logBuffer.slice(-count);
  }
  
  getActivePodsCount() {
    return this.activeStreams.size;
  }
}

// Use service log aggregator
const apiAggregator = new ServiceLogAggregator(k8s, 'api-server', 'production');
const workerAggregator = new ServiceLogAggregator(k8s, 'background-worker', 'production');

await apiAggregator.start();
await workerAggregator.start();

console.log('Service log aggregation started');

// Status reporting
setInterval(() => {
  console.log(`\n--- Service Status ---`);
  console.log(`API Server: ${apiAggregator.getActivePodsCount()} active pods`);
  console.log(`Workers: ${workerAggregator.getActivePodsCount()} active pods`);
  console.log('---\n');
}, 60000);

// Stop aggregation after 10 minutes
setTimeout(() => {
  apiAggregator.stop();
  workerAggregator.stop();
  
  console.log('Recent API logs:', apiAggregator.getRecentLogs(10));
  console.log('Recent Worker logs:', workerAggregator.getRecentLogs(10));
}, 600000);
```

## Log Export and Persistence

### Log Export to Files
Export streamed logs to files:

```javascript
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

// Log file exporter
class LogExporter {
  constructor(outputDir = './logs') {
    this.outputDir = outputDir;
    this.fileStreams = new Map();
  }
  
  async startExport(podName, namespace, options = {}) {
    const filename = `${this.outputDir}/${podName}-${Date.now()}.log`;
    const fileStream = createWriteStream(filename);
    
    console.log(`Exporting logs to: ${filename}`);
    
    const logStream = await k8s.streamLogs(
      podName,
      (data) => {
        fileStream.write(data);
        
        // Also log to console if requested
        if (options.console) {
          process.stdout.write(`[${podName}] ${data}`);
        }
      },
      {
        namespace,
        follow: true,
        timestamps: true,
        ...options
      }
    );
    
    this.fileStreams.set(podName, { logStream, fileStream, filename });
    
    return filename;
  }
  
  async stopExport(podName) {
    const streams = this.fileStreams.get(podName);
    if (streams) {
      streams.logStream.stop();
      streams.fileStream.end();
      this.fileStreams.delete(podName);
      
      console.log(`Log export stopped for ${podName}: ${streams.filename}`);
      return streams.filename;
    }
  }
  
  async stopAll() {
    const filenames = [];
    for (const [podName, streams] of this.fileStreams.entries()) {
      const filename = await this.stopExport(podName);
      filenames.push(filename);
    }
    return filenames;
  }
}

// Export logs from multiple pods
const exporter = new LogExporter('./exported-logs');

// Start exports
const exportedFiles = await Promise.all([
  exporter.startExport('api-server-pod', 'production', { console: true }),
  exporter.startExport('database-pod', 'production'),
  exporter.startExport('cache-pod', 'production')
]);

console.log('Exporting logs to files:', exportedFiles);

// Stop exports after 5 minutes
setTimeout(async () => {
  const finalFiles = await exporter.stopAll();
  console.log('Export completed. Files:', finalFiles);
}, 300000);
```

### Structured Log Processing
Process structured logs (JSON) for better analysis:

```javascript
// Structured log processor
class StructuredLogProcessor {
  constructor() {
    this.events = [];
    this.errors = [];
    this.metrics = new Map();
  }
  
  processLine(line, source) {
    try {
      // Try to parse as JSON
      const logEntry = JSON.parse(line.trim());
      
      // Add metadata
      logEntry._source = source;
      logEntry._processed = new Date();
      
      // Process based on log level
      switch (logEntry.level) {
        case 'error':
        case 'ERROR':
          this.errors.push(logEntry);
          console.error(`❌ [${source}] ERROR:`, logEntry.message || logEntry.msg);
          break;
          
        case 'warn':
        case 'WARN':
          console.warn(`⚠️ [${source}] WARN:`, logEntry.message || logEntry.msg);
          break;
          
        case 'info':
        case 'INFO':
          console.log(`ℹ️ [${source}] INFO:`, logEntry.message || logEntry.msg);
          break;
          
        default:
          console.log(`[${source}]`, logEntry.message || logEntry.msg || line.trim());
      }
      
      // Track metrics
      if (logEntry.metrics) {
        for (const [key, value] of Object.entries(logEntry.metrics)) {
          if (!this.metrics.has(key)) {
            this.metrics.set(key, []);
          }
          this.metrics.get(key).push({ timestamp: new Date(), value, source });
        }
      }
      
      this.events.push(logEntry);
      
    } catch (error) {
      // Not JSON, treat as plain text
      console.log(`[${source}] ${line.trim()}`);
    }
  }
  
  getErrorSummary() {
    const errorCounts = {};
    this.errors.forEach(error => {
      const key = error.error_type || error.type || 'unknown';
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    });
    return errorCounts;
  }
  
  getMetricsSummary() {
    const summary = {};
    for (const [metric, values] of this.metrics.entries()) {
      const numericValues = values.map(v => parseFloat(v.value)).filter(v => !isNaN(v));
      if (numericValues.length > 0) {
        summary[metric] = {
          count: numericValues.length,
          avg: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
          min: Math.min(...numericValues),
          max: Math.max(...numericValues)
        };
      }
    }
    return summary;
  }
}

// Use structured log processor
const processor = new StructuredLogProcessor();

const structuredStream = await k8s.streamLogs(
  'json-logging-pod',
  (data) => {
    const lines = data.split('\n').filter(Boolean);
    lines.forEach(line => processor.processLine(line, 'json-app'));
  },
  {
    namespace: 'production',
    follow: true,
    timestamps: false
  }
);

// Generate structured reports
setInterval(() => {
  console.log('\n--- Structured Log Report ---');
  console.log('Total events:', processor.events.length);
  console.log('Error summary:', processor.getErrorSummary());
  console.log('Metrics summary:', processor.getMetricsSummary());
  console.log('---\n');
}, 60000);

// Stop after 10 minutes
setTimeout(() => {
  structuredStream.stop();
  
  console.log('Final structured analysis:');
  console.log('Events:', processor.events.length);
  console.log('Errors:', processor.errors.length);
  console.log('Metrics:', processor.getMetricsSummary());
}, 600000);
```

## Error Handling and Recovery

### Stream Error Handling
Handle log streaming errors gracefully:

```javascript
// Resilient log streamer
class ResilientLogStreamer {
  constructor(k8s, podSelector, namespace, options = {}) {
    this.k8s = k8s;
    this.podSelector = podSelector;
    this.namespace = namespace;
    this.options = options;
    this.currentStream = null;
    this.isActive = false;
    this.onData = options.onData || (() => {});
    this.retryDelay = options.retryDelay || 5000;
    this.maxRetries = options.maxRetries || -1; // -1 for infinite
    this.retryCount = 0;
  }
  
  async start() {
    this.isActive = true;
    this.retryCount = 0;
    await this.establishStream();
  }
  
  async establishStream() {
    if (!this.isActive) return;
    
    try {
      // Find healthy pod
      const pod = await this.k8s.getPodFromSelector(this.podSelector, this.namespace);
      if (!pod) {
        throw new Error(`No pod found for selector: ${this.podSelector}`);
      }
      
      if (!(await this.k8s.isPodReady(pod, this.namespace))) {
        throw new Error(`Pod ${pod} is not ready`);
      }
      
      console.log(`Establishing log stream for pod: ${pod}`);
      
      this.currentStream = await this.k8s.streamLogs(
        pod,
        (data) => {
          this.retryCount = 0; // Reset retry count on successful data
          this.onData(data, pod);
        },
        {
          namespace: this.namespace,
          follow: true,
          ...this.options
        }
      );
      
      console.log(`Log stream established for pod: ${pod}`);
      
    } catch (error) {
      console.error(`Failed to establish log stream (attempt ${this.retryCount + 1}):`, error.message);
      
      this.retryCount++;
      if (this.maxRetries !== -1 && this.retryCount >= this.maxRetries) {
        console.error('Max retries reached, stopping log stream');
        this.isActive = false;
        return;
      }
      
      if (this.isActive) {
        console.log(`Retrying in ${this.retryDelay}ms...`);
        setTimeout(() => this.establishStream(), this.retryDelay);
      }
    }
  }
  
  stop() {
    this.isActive = false;
    if (this.currentStream) {
      this.currentStream.stop();
      this.currentStream = null;
    }
  }
  
  get isConnected() {
    return this.currentStream !== null;
  }
}

// Use resilient log streamer
const resilientStreamer = new ResilientLogStreamer(
  k8s,
  'app=web-server',
  'production',
  {
    onData: (data, pod) => {
      console.log(`[${pod}] ${data.trim()}`);
    },
    retryDelay: 3000,
    maxRetries: 10,
    timestamps: true,
    tail: 50
  }
);

await resilientStreamer.start();

// Monitor connection status
const statusInterval = setInterval(() => {
  console.log(`Log streamer status: ${resilientStreamer.isConnected ? 'Connected' : 'Disconnected'}`);
}, 30000);

// Stop after 10 minutes
setTimeout(() => {
  clearInterval(statusInterval);
  resilientStreamer.stop();
}, 600000);
```

## Performance Optimization

### Efficient Log Streaming
Optimize log streaming for high-volume scenarios:

```javascript
// High-performance log streamer
class HighPerformanceLogStreamer {
  constructor(batchSize = 100, flushInterval = 1000) {
    this.batchSize = batchSize;
    this.flushInterval = flushInterval;
    this.logBuffer = [];
    this.processors = new Map();
    this.startFlushTimer();
  }
  
  addProcessor(name, processor) {
    this.processors.set(name, processor);
  }
  
  processLogData(source, data) {
    const lines = data.split('\n').filter(Boolean);
    
    lines.forEach(line => {
      this.logBuffer.push({
        timestamp: Date.now(),
        source,
        line: line.trim()
      });
    });
    
    // Flush if buffer is full
    if (this.logBuffer.length >= this.batchSize) {
      this.flush();
    }
  }
  
  flush() {
    if (this.logBuffer.length === 0) return;
    
    const batch = this.logBuffer.splice(0, this.batchSize);
    
    // Process batch with all registered processors
    for (const [name, processor] of this.processors.entries()) {
      try {
        processor(batch);
      } catch (error) {
        console.error(`Processor ${name} failed:`, error.message);
      }
    }
  }
  
  startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }
  
  stop() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush(); // Final flush
  }
}

// Setup high-performance streaming
const hpStreamer = new HighPerformanceLogStreamer(200, 2000);

// Add log processors
hpStreamer.addProcessor('console', (batch) => {
  batch.forEach(entry => {
    console.log(`[${entry.source}] ${entry.line}`);
  });
});

hpStreamer.addProcessor('error-filter', (batch) => {
  const errors = batch.filter(entry => 
    entry.line.includes('ERROR') || entry.line.includes('FATAL')
  );
  
  if (errors.length > 0) {
    console.error(`🚨 Batch contained ${errors.length} errors`);
  }
});

hpStreamer.addProcessor('metrics', (batch) => {
  const metrics = batch.filter(entry => entry.line.includes('metric:'));
  // Process metrics...
});

// Stream from multiple high-volume pods
const highVolumePods = ['api-server-1', 'api-server-2', 'api-server-3'];

const streams = await Promise.all(
  highVolumePods.map(pod => 
    k8s.streamLogs(
      pod,
      (data) => hpStreamer.processLogData(pod, data),
      {
        namespace: 'production',
        follow: true,
        timestamps: false  // Disable timestamps for performance
      }
    )
  )
);

console.log(`High-performance streaming from ${streams.length} pods`);

// Stop streaming after 15 minutes
setTimeout(() => {
  streams.forEach(stream => stream.stop());
  hpStreamer.stop();
}, 900000);
```

## Best Practices

### Resource Management
- Use appropriate tail limits to avoid memory issues
- Implement log rotation and cleanup strategies
- Monitor streaming resource usage
- Use batching for high-volume log processing
- Implement proper cleanup on stream termination

### Error Handling
- Implement retry logic for stream failures
- Handle pod restarts and migrations gracefully
- Monitor stream health and connectivity
- Use circuit breakers for failing streams
- Log streaming errors appropriately

### Security Considerations
- Filter sensitive information from logs
- Use appropriate RBAC for log access
- Secure log export and storage
- Monitor log access patterns
- Implement log retention policies

```javascript
// Comprehensive log streaming solution
class ComprehensiveLogStreamer {
  constructor(config) {
    this.config = config;
    this.k8s = new KubernetesAdapter();
    this.streams = new Map();
    this.processors = [];
    this.isRunning = false;
  }
  
  addProcessor(processor) {
    this.processors.push(processor);
  }
  
  async start() {
    this.isRunning = true;
    
    for (const [name, streamConfig] of Object.entries(this.config.streams)) {
      await this.startStream(name, streamConfig);
    }
    
    console.log(`Started ${this.streams.size} log streams`);
  }
  
  async startStream(name, config) {
    try {
      const pods = await this.getPodsForStream(config);
      
      for (const pod of pods) {
        const streamKey = `${name}-${pod}`;
        
        const stream = await this.k8s.streamLogs(
          pod,
          (data) => this.processLogData(streamKey, pod, data),
          {
            namespace: config.namespace,
            container: config.container,
            follow: true,
            timestamps: config.timestamps ?? true,
            tail: config.tail ?? 100
          }
        );
        
        this.streams.set(streamKey, { stream, pod, config });
        console.log(`Started stream: ${streamKey}`);
      }
      
    } catch (error) {
      console.error(`Failed to start stream ${name}:`, error.message);
    }
  }
  
  async getPodsForStream(config) {
    if (config.pod) {
      return [config.pod];
    }
    
    if (config.selector) {
      const result = await this.k8s.executeKubectl([
        'get', 'pods',
        '-l', config.selector,
        '-n', config.namespace,
        '--field-selector=status.phase=Running',
        '-o', 'jsonpath={.items[*].metadata.name}'
      ]);
      
      return result.stdout.trim().split(' ').filter(Boolean);
    }
    
    throw new Error('Must specify either pod or selector');
  }
  
  processLogData(streamKey, pod, data) {
    const logEntry = {
      timestamp: new Date(),
      stream: streamKey,
      pod,
      data: data.trim()
    };
    
    // Process with all registered processors
    this.processors.forEach(processor => {
      try {
        processor(logEntry);
      } catch (error) {
        console.error('Processor error:', error.message);
      }
    });
  }
  
  async stop() {
    this.isRunning = false;
    
    for (const [key, { stream }] of this.streams.entries()) {
      stream.stop();
      console.log(`Stopped stream: ${key}`);
    }
    
    this.streams.clear();
    await this.k8s.dispose();
  }
}

// Usage
const streamConfig = {
  streams: {
    api: {
      selector: 'app=api-server',
      namespace: 'production',
      timestamps: true,
      tail: 50
    },
    worker: {
      selector: 'app=background-worker',
      namespace: 'production',
      timestamps: true,
      tail: 30
    },
    database: {
      pod: 'postgres-primary',
      namespace: 'production',
      container: 'postgresql',
      timestamps: true,
      tail: 20
    }
  }
};

const logStreamer = new ComprehensiveLogStreamer(streamConfig);

// Add processors
logStreamer.addProcessor((entry) => {
  console.log(`[${entry.stream}] ${entry.data}`);
});

logStreamer.addProcessor((entry) => {
  if (entry.data.includes('ERROR')) {
    console.error(`🚨 Error in ${entry.pod}: ${entry.data}`);
  }
});

// Start streaming
await logStreamer.start();

// Stop after configured time
setTimeout(() => {
  logStreamer.stop();
}, 600000); // 10 minutes
```
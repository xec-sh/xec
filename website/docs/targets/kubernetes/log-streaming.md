---
title: Log Streaming
description: Streaming and following logs from Kubernetes pods using Xec
keywords: [kubernetes, k8s, logs, streaming, follow, tail, monitoring]
source_files:
  - packages/core/src/adapters/kubernetes-adapter.ts
  - packages/core/src/utils/kubernetes-api.ts
key_functions:
  - KubernetesAdapter.streamLogs()
  - K8sPod.logs()
  - K8sPod.streamLogs()
  - K8sPod.follow()
verification_date: 2025-08-03
---

# Log Streaming

## Implementation Reference

**Source Files:**
- `packages/core/src/adapters/kubernetes-adapter.ts` - Log streaming implementation
- `packages/core/src/utils/kubernetes-api.ts` - Pod-level log methods

**Key Functions:**
- `KubernetesAdapter.streamLogs()` - Core log streaming functionality
- `K8sPod.logs()` - Get static log content
- `K8sPod.streamLogs()` - Stream logs with full options
- `K8sPod.follow()` - Convenient log following (streamLogs with follow: true)

## Overview

Xec provides comprehensive log streaming capabilities for Kubernetes pods through `kubectl logs`. This enables real-time monitoring, debugging, and log aggregation from containerized applications with support for filtering, tailing, and multi-container pods.

## Basic Log Operations

### Static Log Retrieval

Get log content without streaming:

```typescript
import { $ } from '@xec-sh/core';

const k8s = $.k8s({ namespace: 'production' });
const pod = k8s.pod('web-server');

// Get recent logs
const logs = await pod.logs({ tail: 100 });
console.log('Recent logs:');
console.log(logs);

// Get logs with timestamps
const timestampedLogs = await pod.logs({
  tail: 50,
  timestamps: true
});
console.log('Timestamped logs:');
console.log(timestampedLogs);
```

### Previous Container Logs

Access logs from previous container instances:

```typescript
// Get logs from previous container (after restart)
const previousLogs = await pod.logs({
  previous: true,
  tail: 200
});

console.log('Logs from previous container:');
console.log(previousLogs);
```

## Real-time Log Streaming

### Basic Streaming

Stream logs in real-time:

```typescript
const pod = k8s.pod('api-server');

// Stream logs with callback
const stream = await pod.streamLogs(
  (line) => {
    console.log(`[${new Date().toISOString()}] ${line.trim()}`);
  },
  {
    follow: true,
    tail: 10 // Start with last 10 lines
  }
);

// Let it stream for 30 seconds
setTimeout(() => {
  stream.stop();
  console.log('Log streaming stopped');
}, 30000);
```

### Follow Logs (Simplified)

Use the convenient `follow()` method:

```typescript
// Simplified log following
const followStream = await pod.follow(
  (line) => {
    // Parse structured logs
    try {
      const logEntry = JSON.parse(line);
      console.log(`[${logEntry.level}] ${logEntry.message}`);
    } catch {
      // Handle plain text logs
      console.log(`RAW: ${line.trim()}`);
    }
  },
  {
    tail: 20,
    timestamps: true
  }
);

// Stop after some time
setTimeout(() => followStream.stop(), 60000);
```

## Container-Specific Logging

### Multi-Container Pods

Stream logs from specific containers:

```typescript
const multiPod = k8s.pod('multi-container-pod');

// Stream from nginx container
const nginxStream = await multiPod.streamLogs(
  (line) => console.log(`[nginx] ${line.trim()}`),
  {
    container: 'nginx',
    follow: true,
    tail: 50
  }
);

// Stream from app container
const appStream = await multiPod.streamLogs(
  (line) => console.log(`[app] ${line.trim()}`),
  {
    container: 'app',
    follow: true,
    tail: 50
  }
);

// Monitor both containers
console.log('Monitoring both containers...');
setTimeout(() => {
  nginxStream.stop();
  appStream.stop();
}, 30000);
```

### Container Selection

Target specific containers in complex pods:

```typescript
// Get list of containers first (if needed)
const podInfo = await $.k8s({
  pod: 'complex-pod',
  namespace: 'production'
})`echo "Container: $HOSTNAME"`;

// Stream from sidecar container
const sidecarLogs = await pod.streamLogs(
  (line) => {
    if (line.includes('ERROR') || line.includes('WARN')) {
      console.log(`🚨 SIDECAR: ${line.trim()}`);
    }
  },
  {
    container: 'istio-proxy',
    follow: true
  }
);
```

## Advanced Log Filtering

### Log Processing

Process and filter logs during streaming:

```typescript
const pod = k8s.pod('application-server');

const logStream = await pod.follow(
  (line) => {
    const trimmedLine = line.trim();
    
    // Filter and categorize logs
    if (trimmedLine.includes('ERROR')) {
      console.error(`❌ ERROR: ${trimmedLine}`);
    } else if (trimmedLine.includes('WARN')) {
      console.warn(`⚠️  WARN:  ${trimmedLine}`);
    } else if (trimmedLine.includes('INFO')) {
      console.info(`ℹ️  INFO:  ${trimmedLine}`);
    } else if (trimmedLine.includes('DEBUG')) {
      // Skip debug logs in production
      return;
    } else {
      console.log(`📝 LOG:   ${trimmedLine}`);
    }
  },
  {
    tail: 0, // Only new logs
    timestamps: true
  }
);
```

### Structured Log Parsing

Parse and format structured logs:

```typescript
interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  service?: string;
  traceId?: string;
}

const stream = await pod.follow(
  (line) => {
    try {
      const entry: LogEntry = JSON.parse(line);
      
      const timestamp = new Date(entry.timestamp).toLocaleTimeString();
      const level = entry.level.padEnd(5);
      const service = entry.service || 'unknown';
      const traceId = entry.traceId ? ` [${entry.traceId.slice(0, 8)}]` : '';
      
      console.log(`${timestamp} ${level} [${service}]${traceId} ${entry.message}`);
      
    } catch {
      // Fallback for non-JSON logs
      console.log(`RAW: ${line.trim()}`);
    }
  },
  { follow: true }
);
```

## Log Aggregation

### Multiple Pod Monitoring

Aggregate logs from multiple pods:

```typescript
async function aggregateLogs(podNames: string[], namespace: string) {
  const k8s = $.k8s({ namespace });
  const streams: Array<{ pod: string; stream: { stop: () => void } }> = [];
  
  console.log(`Starting log aggregation for ${podNames.length} pods...\n`);
  
  // Set up streaming for each pod
  for (const podName of podNames) {
    const pod = k8s.pod(podName);
    
    const stream = await pod.follow(
      (line) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${podName}] ${line.trim()}`);
      },
      {
        tail: 5, // Start with recent logs
        timestamps: false // We add our own timestamps
      }
    );
    
    streams.push({ pod: podName, stream });
  }
  
  console.log(`Aggregating logs from ${streams.length} pods. Press Ctrl+C to stop...\n`);
  
  // Return cleanup function
  return () => {
    console.log('\nStopping log aggregation...');
    streams.forEach(({ pod, stream }) => {
      stream.stop();
      console.log(`  Stopped ${pod}`);
    });
  };
}

// Usage
const stopAggregation = await aggregateLogs(
  ['web-1', 'web-2', 'web-3'],
  'production'
);

// Stop after 2 minutes
setTimeout(stopAggregation, 120000);
```

### Deployment Monitoring

Monitor all pods in a deployment:

```typescript
async function monitorDeployment(deploymentName: string, namespace: string) {
  // Get pods for deployment (this would require kubectl integration)
  const labelSelector = `app=${deploymentName}`;
  
  // For this example, assume we have pod names
  const pods = ['web-deploy-abc', 'web-deploy-def', 'web-deploy-ghi'];
  
  const k8s = $.k8s({ namespace });
  const activeStreams = new Map();
  
  console.log(`Monitoring deployment: ${deploymentName}`);
  
  for (const podName of pods) {
    const pod = k8s.pod(podName);
    
    const stream = await pod.follow(
      (line) => {
        // Add pod identifier and format
        const timestamp = new Date().toISOString().slice(11, 23);
        console.log(`${timestamp} [${podName.slice(-3)}] ${line.trim()}`);
      },
      {
        tail: 0, // Only new logs
        timestamps: false
      }
    );
    
    activeStreams.set(podName, stream);
  }
  
  return {
    stop: () => {
      activeStreams.forEach((stream, podName) => {
        stream.stop();
        console.log(`Stopped monitoring ${podName}`);
      });
      activeStreams.clear();
    },
    getActiveCount: () => activeStreams.size
  };
}
```

## Error Handling and Monitoring

### Connection Resilience

Handle streaming interruptions:

```typescript
async function resilientLogStreaming(podName: string, maxRetries = 3) {
  const pod = k8s.pod(podName);
  let retryCount = 0;
  let currentStream: { stop: () => void } | null = null;
  
  const startStream = async (): Promise<void> => {
    try {
      currentStream = await pod.follow(
        (line) => {
          console.log(`[${podName}] ${line.trim()}`);
          retryCount = 0; // Reset on successful data
        },
        { follow: true, tail: 10 }
      );
      
    } catch (error) {
      console.error(`Stream error for ${podName}:`, error.message);
      
      if (retryCount < maxRetries) {
        retryCount++;
        console.log(`Retrying in 5 seconds... (${retryCount}/${maxRetries})`);
        setTimeout(startStream, 5000);
      } else {
        console.error(`Max retries exceeded for ${podName}`);
      }
    }
  };
  
  await startStream();
  
  return {
    stop: () => {
      if (currentStream) {
        currentStream.stop();
        currentStream = null;
      }
    }
  };
}
```

### Log Quality Monitoring

Monitor log quality and detect issues:

```typescript
async function monitorLogQuality(podName: string) {
  const pod = k8s.pod(podName);
  
  let errorCount = 0;
  let warningCount = 0;
  let totalLines = 0;
  let lastLogTime = Date.now();
  
  const stream = await pod.follow(
    (line) => {
      totalLines++;
      lastLogTime = Date.now();
      
      const trimmedLine = line.trim();
      
      if (trimmedLine.includes('ERROR')) {
        errorCount++;
        console.error(`🔥 ERROR [${errorCount}]: ${trimmedLine}`);
      } else if (trimmedLine.includes('WARN')) {
        warningCount++;
        console.warn(`⚠️  WARN [${warningCount}]: ${trimmedLine}`);
      }
      
      // Alert on high error rate
      if (errorCount > 10 && totalLines > 50) {
        const errorRate = (errorCount / totalLines) * 100;
        if (errorRate > 20) {
          console.error(`🚨 HIGH ERROR RATE: ${errorRate.toFixed(1)}% in ${podName}`);
        }
      }
    },
    { follow: true }
  );
  
  // Monitor for log silence
  const silenceCheck = setInterval(() => {
    const timeSinceLastLog = Date.now() - lastLogTime;
    if (timeSinceLastLog > 60000) { // 1 minute
      console.warn(`⏰ No logs from ${podName} for ${Math.round(timeSinceLastLog/1000)}s`);
    }
  }, 30000);
  
  return {
    stop: () => {
      stream.stop();
      clearInterval(silenceCheck);
    },
    getStats: () => ({
      totalLines,
      errorCount,
      warningCount,
      errorRate: totalLines > 0 ? (errorCount / totalLines) * 100 : 0
    })
  };
}
```

## Debugging Workflows

### Application Debugging

Set up comprehensive debugging log monitoring:

```typescript
async function debugApplication(appPod: string) {
  const pod = k8s.pod(appPod);
  
  console.log(`🔍 Starting debug session for ${appPod}\n`);
  
  // Get recent error context
  const recentLogs = await pod.logs({
    tail: 100,
    timestamps: true
  });
  
  const errorLines = recentLogs.split('\n').filter(line => 
    line.includes('ERROR') || line.includes('FATAL')
  );
  
  if (errorLines.length > 0) {
    console.log('Recent errors found:');
    errorLines.forEach(line => console.log(`  ${line}`));
    console.log();
  }
  
  // Start real-time monitoring
  const debugStream = await pod.follow(
    (line) => {
      const timestamp = new Date().toISOString();
      
      if (line.includes('ERROR') || line.includes('FATAL')) {
        console.error(`${timestamp} 🔥 ${line.trim()}`);
      } else if (line.includes('WARN')) {
        console.warn(`${timestamp} ⚠️  ${line.trim()}`);
      } else if (line.includes('DEBUG')) {
        console.debug(`${timestamp} 🐛 ${line.trim()}`);
      } else {
        console.log(`${timestamp} ℹ️  ${line.trim()}`);
      }
    },
    {
      tail: 0,
      timestamps: false
    }
  );
  
  return {
    stop: () => {
      debugStream.stop();
      console.log('\n🔍 Debug session ended');
    }
  };
}
```

### Performance Monitoring

Monitor application performance through logs:

```typescript
async function monitorPerformance(appPod: string) {
  const pod = k8s.pod(appPod);
  const metrics = {
    requestCount: 0,
    errorCount: 0,
    slowRequests: 0,
    responseTimes: [] as number[]
  };
  
  const stream = await pod.follow(
    (line) => {
      // Parse access logs (assume nginx-style)
      const httpMatch = line.match(/(\d{3})\s+(\d+\.\d+)/);
      if (httpMatch) {
        const [, status, responseTime] = httpMatch;
        const statusCode = parseInt(status);
        const time = parseFloat(responseTime);
        
        metrics.requestCount++;
        metrics.responseTimes.push(time);
        
        if (statusCode >= 400) {
          metrics.errorCount++;
        }
        
        if (time > 1.0) { // Slow request threshold
          metrics.slowRequests++;
          console.warn(`🐌 Slow request: ${time}s (${statusCode})`);
        }
        
        // Report metrics every 100 requests
        if (metrics.requestCount % 100 === 0) {
          const avgTime = metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length;
          const errorRate = (metrics.errorCount / metrics.requestCount) * 100;
          
          console.log(`📊 Metrics (${metrics.requestCount} requests):`);
          console.log(`   Average response time: ${avgTime.toFixed(2)}s`);
          console.log(`   Error rate: ${errorRate.toFixed(1)}%`);
          console.log(`   Slow requests: ${metrics.slowRequests}`);
          
          // Reset for next period
          metrics.responseTimes = [];
        }
      }
    },
    { follow: true }
  );
  
  return { stream, metrics };
}
```

## Performance Considerations

### Stream Management

- **Memory Usage**: Log streams buffer data in memory
- **CPU Impact**: Log parsing can be CPU intensive
- **Network**: Continuous data transfer from cluster

### Best Practices

```typescript
// Good: Limit tail size for initial logs
const stream = await pod.follow(onData, { tail: 50 });

// Good: Use structured logging for better parsing
const parseStructuredLog = (line: string) => {
  try {
    return JSON.parse(line);
  } catch {
    return { message: line, level: 'unknown' };
  }
};

// Good: Always clean up streams
const cleanup = () => {
  activeStreams.forEach(stream => stream.stop());
  activeStreams.clear();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
```

### Resource Optimization

```typescript
// Batch log processing for efficiency
let logBuffer: string[] = [];

const batchedStream = await pod.follow(
  (line) => {
    logBuffer.push(line);
    
    // Process in batches of 10
    if (logBuffer.length >= 10) {
      processBatch(logBuffer);
      logBuffer = [];
    }
  },
  { follow: true }
);

function processBatch(lines: string[]) {
  // Process multiple lines together
  const errors = lines.filter(line => line.includes('ERROR'));
  if (errors.length > 0) {
    console.log(`Batch contains ${errors.length} errors`);
  }
}
```
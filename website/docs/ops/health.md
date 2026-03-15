---
sidebar_position: 5
sidebar_label: Health Checks
title: Health Check Framework
---

# Health Check Framework

Verify service availability with HTTP, TCP, command, and custom checks.

## Usage

```typescript
import { HealthChecker } from '@xec-sh/ops';

const checker = HealthChecker.create()
  .http('https://api.example.com/health', { status: 200, timeout: 5000 })
  .tcp('db.example.com', 5432, { timeout: 3000 })
  .command('docker ps', { contains: 'my-service' })
  .custom('cache', async () => {
    const resp = await fetch('http://redis:6379/ping');
    return resp.ok;
  });

const report = await checker.run();
// { healthy: true, checks: [...], summary: { total: 4, healthy: 4, unhealthy: 0 } }
```

## Check Types

### HTTP
```typescript
.http('https://api.example.com/health', {
  status: 200,           // Expected status code
  timeout: 10_000,       // Timeout in ms
  method: 'GET',         // HTTP method
  headers: { 'Authorization': 'Bearer ...' },
  contains: '"ok":true', // Response body must contain
})
```

### TCP
```typescript
.tcp('db.example.com', 5432, {
  timeout: 5000,         // Connection timeout
})
```

### Command
```typescript
.command('docker ps --filter name=api', {
  contains: 'running',   // Output must contain
  exitCode: 0,           // Expected exit code
  timeout: 10_000,
})
```

### Custom
```typescript
.custom('my-check', async () => {
  // Return boolean or string (string = healthy with message)
  const db = await connectToDatabase();
  return db.isConnected;
});
```

## Wait Until Healthy

Poll until all checks pass:

```typescript
const report = await checker.waitUntilHealthy({
  timeout: 60_000,    // Max wait time
  interval: 2000,     // Poll interval
  signal: controller.signal,  // AbortSignal for cancellation
});
```

## Sequential Execution

Run checks one by one instead of parallel:

```typescript
const report = await checker.run({ sequential: true });
```

## Report Structure

```typescript
interface HealthReport {
  healthy: boolean;       // All checks passed
  timestamp: number;
  duration: number;       // Total check time (ms)
  checks: CheckResult[];  // Per-check results
  summary: { total, healthy, unhealthy };
}

interface CheckResult {
  name: string;
  healthy: boolean;
  duration: number;
  message?: string;   // Success message
  error?: string;     // Error details
}
```

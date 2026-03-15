---
sidebar_position: 7
sidebar_label: Retry
title: Retry Policies
---

# Retry Policies

Retry failed operations with exponential backoff, jitter, and custom predicates.

## Quick Retry

```typescript
import { retry } from '@xec-sh/ops';

const data = await retry(() => fetch('https://api.example.com/data'), {
  maxAttempts: 3,
  initialDelay: 200,
});
```

## Fluent Builder

```typescript
import { RetryPolicy } from '@xec-sh/ops';

const policy = RetryPolicy.create()
  .maxAttempts(5)
  .backoff('exponential', { initial: 100, max: 30_000, multiplier: 2 })
  .jitter(0.25)
  .retryOn(err => err.message.includes('ECONNRESET'))
  .onRetry((attempt, err, delay) => {
    console.log(`Retry ${attempt} in ${delay}ms: ${err.message}`);
  })
  .signal(controller.signal)
  .build();

const result = await policy.execute(() => riskyOperation());
```

## Backoff Strategies

| Strategy | Behavior | Example (initial=200ms) |
|----------|----------|------------------------|
| `fixed` | Same delay every time | 200, 200, 200, 200 |
| `linear` | Delay increases linearly | 200, 400, 600, 800 |
| `exponential` | Delay doubles (default) | 200, 400, 800, 1600 |

## Configuration

```typescript
interface RetryConfig {
  maxAttempts: number;      // Default: 3
  backoff: BackoffStrategy; // Default: 'exponential'
  initialDelay: number;     // Default: 200ms
  maxDelay: number;         // Default: 30_000ms
  multiplier: number;       // Default: 2
  jitter: number;           // Default: 0.1 (±10%)
  retryOn?: (error: Error) => boolean;
  onRetry?: (attempt, error, delay) => void;
  abortSignal?: AbortSignal;
}
```

## Exponential Backoff Generator

For manual retry loops:

```typescript
import { expBackoff } from '@xec-sh/core';

for (const delay of expBackoff(60_000, 50)) {
  try {
    await connectToDatabase();
    break;
  } catch {
    await sleep(delay);
  }
}
```

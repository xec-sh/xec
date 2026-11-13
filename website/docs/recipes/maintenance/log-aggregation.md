---
title: Log Aggregation
description: Inspect and correlate logs through Xec's configured targets
keywords: [logs, aggregation, monitoring, elk, loki]
source_files:
  - apps/xec/src/commands/logs.ts
  - packages/ops/src/config/target-resolver.ts
---

# Log Aggregation

## Problem

An incident may span local files, SSH hosts, Docker containers and Kubernetes pods. Operators need explicit source selection and useful timestamps without rebuilding the application's logging system inside a deployment script.

## Solution

Use Xec's `logs` command for inspection. A separately configured collector and storage service own durable delivery, retention and alerting. Viewing a stream is not proof that every record reached durable storage.

## Quick Example

```bash
xec logs hosts.web-1 /var/log/app.log --tail 100 --timestamps
xec logs containers.app --tail 100 --timestamps
xec logs pods.api --tail 100 --timestamps
```

## Complete Log Aggregation Recipes

### Configuration

```yaml
version: '1.0'
targets:
  hosts:
    web-1:
      host: web-1.example.com
      username: observer
    web-2:
      host: web-2.example.com
      username: observer
  containers:
    app:
      container: app-container
  pods:
    api:
      pod: api-server
      namespace: production
      context: production-cluster
tasks:
  follow-logs:
    command: xec run scripts/follow-logs.ts
  setup-logging:
    command: xec run scripts/setup-logging.ts
```

Provision target credentials and read permissions separately. Docker and Kubernetes log commands run on the controller that has the corresponding client; they are not executed inside the target container.

### Multi-Source Log Aggregation

For a bounded incident view, use a quoted target pattern:

```bash
xec logs 'hosts.web-*' /var/log/app.log --tail 100 --aggregate --prefix
```

Aggregation orders recognized timestamps; it does not invent clock synchronization. Lines without a recognized timestamp stay associated with their source. Multi-target inspection reports individual source failures, so review those diagnostics before claiming complete coverage.

For a strict script, await one command per declared source. A single-target failure rejects the command:

```typescript
// scripts/collect-logs.ts
await $`xec logs hosts.web-1 /var/log/app.log --tail 100 --timestamps`;
await $`xec logs containers.app --tail 100 --timestamps`;
await $`xec logs pods.api --tail 100 --timestamps`;
```

To follow the same sources, let the shared execution lifecycle own all three CLI processes:

```typescript
// scripts/follow-logs.ts
await $.parallel.all([
  $`xec logs hosts.web-1 /var/log/app.log --follow --prefix`,
  $`xec logs containers.app --follow --prefix`,
  $`xec logs pods.api --follow --prefix`
], { maxConcurrency: 3 });
```

### Setup Centralized Logging Stack

Keep a reviewed deployment declaration in the application. Pin the collector and storage images, restrict listening addresses, configure authentication and define healthchecks and persistent volumes there. Xec starts and verifies that declaration:

```typescript
// scripts/setup-logging.ts
await $`docker compose -f observability/compose.yaml config --quiet`;
await $`docker compose -f observability/compose.yaml up -d --wait --wait-timeout 120`;
// This project-owned command sends a unique probe and verifies it in the store.
await $`npm run verify:log-delivery`;
```

`up --wait` verifies the declared container healthchecks. Only the application's delivery probe can establish end-to-end ingestion; no ELK or Loki configuration is generated implicitly by Xec.

### Log Analysis and Alerting

For an already captured application NDJSON file, validate each record before counting it. This example reports only counts; it does not forward potentially sensitive log messages to another service.

```typescript
// scripts/analyze-logs.ts
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const file = args[0];
if (!file) throw new Error('Pass an application NDJSON log file');
const input = createReadStream(file, { encoding: 'utf8' });
const lines = createInterface({ input, crlfDelay: Infinity });
const counts = new Map<string, number>();
let records = 0;
try {
  for await (const line of lines) {
    if (!line.trim()) continue;
    const record: unknown = JSON.parse(line);
    if (!record || typeof record !== 'object' || !('level' in record) || typeof record.level !== 'string') {
      throw new Error(`Invalid structured record after ${records} accepted records`);
    }
    counts.set(record.level, (counts.get(record.level) ?? 0) + 1);
    records++;
  }
} finally {
  lines.close();
  input.destroy();
}
console.log(JSON.stringify({ records, counts: Object.fromEntries(counts) }));
```

Alert thresholds, notification credentials and deduplication belong to the monitoring system. A malformed file fails this analysis instead of silently reducing the observed error count.

## Usage Examples

```bash
xec logs hosts.web-1 /var/log/app.log --grep ERROR --context 3
xec logs pods.api --previous --tail 100
xec follow-logs
xec run scripts/analyze-logs.ts .observations/app.ndjson
```

## Best Practices

- Use structured application records with source, timestamp and correlation ID.
- Distinguish the event timestamp from ingestion time and record clock uncertainty.
- Keep retention and redaction policies in the collector/store, not ad hoc shell cleanup.
- Verify delivery using a unique probe before accepting a logging deployment.
- Bound incident queries and restrict log read access.

## Troubleshooting

### High Log Volume

Inspect collector backpressure, ingestion lag and disk use. Change the application's log level through its supported configuration. Do not compress or delete files still owned by a running writer.

```bash
docker compose -f observability/compose.yaml ps
docker compose -f observability/compose.yaml logs --tail 100
```

### Missing Logs

Check one named source first, then the collector and finally the storage query. A failed source, invalid timestamp and an empty successful query are different observations. Preserve that distinction in incident reports.

## Related Topics

- [Health Checks](health-checks.md)
- [Backup and Restore](backup-restore.md)
- [GitHub Actions Integration](../integration/github-actions.md)

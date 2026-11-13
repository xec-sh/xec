---
title: Test Data Generation
description: Generate realistic test data for development and testing
keywords: [test, data, faker, generation, seed, fixtures]
source_files:
  - apps/xec/src/commands/run.ts
  - packages/core/src/core/execution-engine.ts
---

# Test Data Generation Recipe

## Implementation Reference

The recipe uses Xec’s public execution API and standard Node APIs. Its Xec entry points are:

- `apps/xec/src/commands/run.ts`
- `packages/core/src/core/execution-engine.ts`

## Overview

This recipe demonstrates how to generate realistic test data for development and testing with deterministic fixtures and standard Node streams, orchestrated by Xec. If the application needs realistic generated names or locales, declare and test a dedicated generator in that application; Xec does not bundle Faker.

## Basic Data Generation

### User Data Generation

```typescript
// scripts/generate-users.ts
import { mkdir, writeFile } from 'node:fs/promises';

// Fixed values make failures reproducible; these addresses cannot receive email.
const users = Array.from({ length: 100 }, (_, index) => ({
  id: index + 1,
  name: `Fixture user ${index + 1}`,
  email: `user-${index + 1}@example.invalid`,
  role: index === 0 ? 'admin' : 'user',
  active: index % 10 !== 0
}));
await mkdir('.fixtures', { recursive: true });
await writeFile('.fixtures/users.json', JSON.stringify(users, null, 2));
```

### Product Data Generation

```typescript
// scripts/generate-products.ts
import { mkdir, writeFile } from 'node:fs/promises';

const categories = ['books', 'hardware', 'clothing'] as const;
const products = Array.from({ length: 100 }, (_, index) => ({
  id: index + 1,
  sku: `FIXTURE-${String(index + 1).padStart(4, '0')}`,
  name: `Fixture product ${index + 1}`,
  category: categories[index % categories.length],
  priceCents: 100 + index * 37,
  stock: index % 20
}));
await mkdir('.fixtures', { recursive: true });
await writeFile('.fixtures/products.json', JSON.stringify(products, null, 2));
```

## Relational Data Generation

### Order and Transaction Data

```typescript
// scripts/generate-orders.ts
import { mkdir, writeFile } from 'node:fs/promises';

// IDs refer to the deterministic 100-user and 100-product datasets above.
const orders = Array.from({ length: 250 }, (_, index) => ({
  id: index + 1,
  userId: (index % 100) + 1,
  productId: ((index * 7) % 100) + 1,
  quantity: (index % 3) + 1,
  state: index % 5 === 0 ? 'pending' : 'completed'
}));
await mkdir('.fixtures', { recursive: true });
await writeFile('.fixtures/orders.json', JSON.stringify(orders, null, 2));
```

## Time Series Data

### Metrics and Analytics Data

```typescript
// scripts/generate-metrics.ts
import { mkdir, writeFile } from 'node:fs/promises';

const start = Date.parse('2026-01-01T00:00:00Z');
const metrics = Array.from({ length: 1440 }, (_, minute) => ({
  timestamp: new Date(start + minute * 60_000).toISOString(),
  requests: 100 + (minute % 60),
  errors: minute % 17 === 0 ? 1 : 0
}));
await mkdir('.fixtures', { recursive: true });
await writeFile('.fixtures/metrics.json', JSON.stringify(metrics, null, 2));
```

## Database Seeding

### PostgreSQL Seeding

```typescript
// scripts/seed-postgres.ts
// The application's seed command owns schema validation, parameterized writes
// and transaction boundaries. It must reject non-test database configurations.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
await $`npm run db:seed -- .fixtures`.env({ DATABASE_URL: databaseUrl });
await $`npm run db:verify-fixtures`.env({ DATABASE_URL: databaseUrl });
// No success is reported if either application command fails.
```

## Bulk Data Generation

### Large Dataset Generation

```typescript
// scripts/generate-bulk.ts
import { mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

function* rows(count: number) {
  for (let id = 1; id <= count; id++) {
    yield JSON.stringify({ id, name: `Fixture ${id}`, active: id % 7 !== 0 }) + '\n';
  }
}
await mkdir('.fixtures', { recursive: true });
// pipeline observes backpressure and rejects file errors instead of claiming success.
await pipeline(Readable.from(rows(100_000)), createWriteStream('.fixtures/users.ndjson'));
```

## Test Data Management

### Data Cleanup Script

```typescript
// scripts/cleanup-test-data.ts
import { rm } from 'node:fs/promises';

// Delete only this recipe's generated files. Database/Redis cleanup belongs to
// the application fixture lifecycle, never a generic TRUNCATE or FLUSHALL here.
for (const file of ['users.json', 'products.json', 'orders.json', 'metrics.json', 'users.ndjson']) {
  await rm(`.fixtures/${file}`, { force: true });
}
```

## Configuration

### Xec Task Configuration

Save the examples above under `scripts/` with the names below. The seed task requires the application's declared `db:seed` and `db:verify-fixtures` scripts and an isolated test database.

```yaml
version: '1.0'
tasks:
  data:generate:
    description: Generate deterministic fixtures
    steps:
      - name: Users
        command: xec run scripts/generate-users.ts
      - name: Products
        command: xec run scripts/generate-products.ts
      - name: Orders
        command: xec run scripts/generate-orders.ts
      - name: Metrics
        command: xec run scripts/generate-metrics.ts
  data:seed:
    command: xec run scripts/seed-postgres.ts
  data:cleanup:
    description: Remove only the fixture files generated by this recipe
    command: xec run scripts/cleanup-test-data.ts
```

## Performance Characteristics

### Generation Performance

Measure the intended record shape and count on the target runtime. No generic records-per-second claim applies to every generator.

### Memory Usage

Use the streaming example for large files; array-based examples intentionally retain their small datasets in memory.

### I/O Performance

Await stream completion and database acceptance separately. The application's seed verifier checks the inserted record count and relationships.

## Best Practices

1. **Deterministic Generation**
   ```typescript
   const fixedEpoch = Date.parse('2026-01-01T00:00:00Z');
   console.log(new Date(fixedEpoch).toISOString());
   ```

2. **Realistic Relationships**
   - Maintain referential integrity
   - Use weighted distributions
   - Follow business rules

3. **Performance Optimization**
   - Stream large datasets
   - Batch database inserts
   - Use appropriate formats (NDJSON for streaming)

4. **Data Variety**
   - Include edge cases
   - Vary data distributions
   - Test boundary conditions

## Related Recipes

- [Database Setup](./database-setup.md) - Database configuration
- [API Mocking](./api-mocking.md) - Mock servers
- [Hot Reload](./hot-reload.md) - Development workflow
- [Backup Restore](../maintenance/backup-restore.md) - Data backup

## See Also

- [File Operations](../../scripting/basics/command-execution.md)
- [Data Processing](../../scripting/patterns/streaming.md)
- [Testing Guide](../../guides/automation/testing.md)
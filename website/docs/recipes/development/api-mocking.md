---
title: API Mocking
description: Mock API servers and services for development and testing
keywords: [api, mock, testing, json-server, wiremock, development]
source_files:
  - packages/core/src/core/execution-engine.ts
  - packages/ops/src/health/index.ts
---

# API Mocking Recipe {#api-mocking-recipe}

## Implementation Reference {#implementation-reference}

The recipe uses Xec’s public execution API and standard Node APIs. Its Xec entry points are:

- `packages/core/src/core/execution-engine.ts`
- `packages/ops/src/health/index.ts`

## Overview {#overview}

Declare the chosen mock tool in the application lockfile and its launch commands in package.json. The examples below use project-owned mock:json, mock:wiremock, mock:express and mock:graphql scripts. They show Xec orchestration; the mock implementation and its route/schema tests belong to the application. No dependencies are installed implicitly at runtime.

## JSON Server Mock {#json-server-mock}

### Quick JSON Server Setup {#quick-json-server-setup}

```typescript
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('.fixtures', { recursive: true });
await writeFile('.fixtures/api.json', JSON.stringify({
  users: [
    { id: '1', name: 'Alice', email: 'alice@example.invalid' },
    { id: '2', name: 'Bob', email: 'bob@example.invalid' }
  ]
}, null, 2));
// The project's mock:json script starts its pinned JSON Server on loopback.
// Keep it in the foreground so failure and cancellation propagate through Xec.
await $`npm run mock:json`;
```

### JSON Server with Docker {#json-server-with-docker}

```typescript
// docker-compose.mock.yml belongs to the project: pin its image, publish only
// a loopback test port, and mount .fixtures/api.json read-only.
await $`docker compose -f docker-compose.mock.yml up -d --wait`;
await $`docker compose -f docker-compose.mock.yml ps`;
```

## WireMock Setup {#wiremock-setup}

### WireMock for Complex Mocking {#wiremock-for-complex-mocking}

```typescript
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('.fixtures/wiremock/mappings', { recursive: true });
const login = {
  request: {
    method: 'POST',
    url: '/api/auth/login',
    bodyPatterns: [
      { matchesJsonPath: '$.email' },
      { matchesJsonPath: '$.password' }
    ]
  },
  response: {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    jsonBody: { token: 'synthetic-test-token' }
  }
};
await writeFile('.fixtures/wiremock/mappings/login.json', JSON.stringify(login, null, 2));
// The application owns the pinned WireMock dependency/container and its mount.
await $`npm run mock:wiremock`;
```

## Custom Express Mock Server {#custom-express-mock-server}

### Express Server with TypeScript {#express-server-with-typescript}

```typescript
// Keep the mock server as an ordinary application module, with declared
// Express dependencies and its own route tests. Xec orchestrates that module.
await $`npm run typecheck:mock`;
await $`npm run mock:express`;
```

### Running the Custom Server {#running-the-custom-server}

```typescript
// mock:express must bind 127.0.0.1 and honor PORT; do not expose test fixtures publicly.
await $`npm run mock:express`.env({ HOST: '127.0.0.1', PORT: '3001' });
```

## GraphQL Mock Server {#graphql-mock-server}

### Apollo Server Mock {#apollo-server-mock}

```typescript
// The project's GraphQL schema/resolvers remain in a tested module. Do not
// generate source strings or install dependencies at runtime in the orchestrator.
await $`npm run test:mock-schema`;
await $`npm run mock:graphql`;
```

## Testing with Mock APIs {#testing-with-mock-apis}

### Integration Test Example {#integration-test-example}

```typescript
import { HealthChecker } from '@xec-sh/ops';
import { getExecutionSignal } from '@xec-sh/core';

const stop = new AbortController();
const inherited = getExecutionSignal();
const signal = inherited ? AbortSignal.any([stop.signal, inherited]) : stop.signal;
const server = $`npm run mock:json`.env({ HOST: '127.0.0.1', PORT: '3001' })
  .signal(signal).nothrow().start();
try {
  await HealthChecker.create().http('http://127.0.0.1:3001/users', { timeout: 1000 })
    .waitUntilHealthy({ timeout: 10_000, interval: 100, signal });
  const response = await fetch('http://127.0.0.1:3001/users', { signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]) });
  if (!response.ok) throw new Error(`Mock returned HTTP ${response.status}`);
  const users: unknown = await response.json();
  if (!Array.isArray(users) || users.length !== 2) throw new Error('Expected both configured fixture users');
  await $`npm run test:api`.env({ API_URL: 'http://127.0.0.1:3001' }).signal(signal);
} finally {
  stop.abort();
  await server; // Terminate only the process owned here; never pkill by command name.
}
```

## Mock Service Configuration {#mock-service-configuration}

### Xec Configuration {#xec-configuration}

Save the integration example as `scripts/test-api.ts`. Each server command runs in the foreground; the owner of that process also owns its shutdown. No process-name search or global `pkill` is needed.

```yaml
version: '1.0'
tasks:
  mock:json:
    command: npm run mock:json
  mock:wiremock:
    command: npm run mock:wiremock
  mock:graphql:
    command: npm run mock:graphql
  test:api:
    description: Start one owned mock, await health, test and clean up
    command: xec run scripts/test-api.ts
```

## Performance Characteristics {#performance-characteristics}

### Mock Server Performance {#mock-server-performance}

Measure the selected mock implementation with the application's real fixture shape and request concurrency.

### Response Times {#response-times}

Use explicit readiness and request deadlines. Artificial latency should be a declared mock scenario, not a fixed sleep standing in for server acceptance.

### Resource Usage {#resource-usage}

Bind mocks to loopback and clean up only owned processes and containers. Xec does not provide an application HTTP router or bundle Express, Apollo, JSON Server or WireMock.

## Best Practices {#best-practices}

1. **Version Control Mock Data**
   - Keep `db.json` in git
   - Use `.gitignore` for generated data
   - Maintain seed scripts

2. **Consistent Mock Responses**
   - Use deterministic IDs
   - Consistent timestamps
   - Predictable error scenarios

3. **Environment Separation**
   - Different ports for different mocks
   - Environment-specific configurations
   - Clear naming conventions

4. **Mock State Management**
   - Reset between test runs
   - Snapshot and restore capabilities
   - Clear state endpoints

## Troubleshooting {#troubleshooting}

### Common Issues {#common-issues}

1. **Port Conflicts**
   ```bash
   # Find process using port
   lsof -i :3000
   # Kill process
   kill -9 <PID>
   ```

2. **Mock Data Corruption**
   ```bash
   # Restore from backup
   cp db.backup.json db.json
   # Restart server
   ```

3. **Docker Network Issues**
   ```bash
   # Use host network
   docker run --network host ...
   ```

## Related Recipes {#related-recipes}

- [Database Setup](./database-setup.md) - Database configuration
- [Test Data](./test-data.md) - Generate test data
- [Hot Reload](./hot-reload.md) - Development workflow
- [GitHub Actions](../integration/github-actions.md) - CI/CD with mocks

## See Also {#see-also}

- [HTTP Operations](../../scripting/basics/command-execution.md)
- [Docker Targets](../../targets/docker/overview.md)
- [Testing Guide](../../guides/automation/testing.md)
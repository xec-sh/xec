---
sidebar_position: 5
sidebar_label: Health Checks
title: Health Check Framework
description: Asynchronous HTTP, TCP, command and custom checks with explicit cancellation
---

# Health Check Framework {#health-check-framework}

`HealthChecker` evaluates declared observations and returns a result for each check. Checks run concurrently by default; `run({ sequential: true })` runs them in declaration order.

## Usage {#usage}

```typescript
import { HealthChecker } from '@xec-sh/ops';

const report = await HealthChecker.create()
  .http('https://api.example.com/health', { status: 200, timeout: 5000 })
  .tcp('db.example.com', 5432, { timeout: 3000 })
  .command({ command: 'docker', args: ['ps', '--format', '{{.Names}}'], shell: false }, { contains: 'api' })
  .run();
console.log(report.healthy, report.checks);
```

## Check Types {#check-types}

### HTTP {#http}

`http(url, options)` compares the response status with `status` (default 200). Optional `contains` also checks the response body. `method`, `headers` and `body` are passed to fetch. The timeout covers response headers and body reading; it defaults to ten seconds.

```typescript
import { HealthChecker } from '@xec-sh/ops';

const report = await HealthChecker.create()
  .http('https://api.example.com/health', { status: 200, contains: '"ok":true', timeout: 5000 })
  .run();
console.log(report.summary);
```

### TCP {#tcp}

`tcp(host, port, { timeout })` reports whether a TCP connection can be established. It does not authenticate or validate the service protocol. The socket is closed before the check settles. The default timeout is five seconds.

### Command {#command}

`command(source, options)` accepts trusted shell source or a core `Command` with literal `args`. The command uses the common asynchronous Xec execution engine. Its default deadline is ten seconds.

Both `exitCode` (default zero) and optional `contains` must match. A nonzero status can be expected, but it never bypasses the output predicate. A cancelled or signalled command is not healthy. The predicate reads exact protocol output; diagnostic messages remain sanitized.

```typescript
import { HealthChecker } from '@xec-sh/ops';

const report = await HealthChecker.create()
  .command({ command: 'git', args: ['rev-parse', '--is-inside-work-tree'], shell: false }, {
    exitCode: 0, contains: 'true', timeout: 5000, cwd: process.cwd(),
  }).run();
console.log(report.healthy);
```

Command options also accept `env`, `cwd` and `signal`. Prefer argument vectors to interpolated shell strings when values come from configuration or users.

### Custom {#custom}

A custom check returns a boolean, or a string meaning a healthy result with that message. It receives the run's optional cancellation signal. Custom asynchronous work must cooperate with cancellation.

```typescript
import { HealthChecker } from '@xec-sh/ops';

const report = await HealthChecker.create()
  .custom('version', async signal => {
    const response = await fetch('https://api.example.com/version', { signal });
    if (!response.ok) { await response.body?.cancel(); return false; }
    return (await response.text()).startsWith('1.');
  }).run({ signal: AbortSignal.timeout(5000) });
console.log(report.healthy);
```

## Wait Until Healthy {#wait-until-healthy}

```typescript
import { HealthChecker } from '@xec-sh/ops';

const checker = HealthChecker.create().tcp('127.0.0.1', 8080);
const report = await checker.waitUntilHealthy({ timeout: 60_000, interval: 1000 });
console.log(report.summary);
```

Polling uses one overall deadline, including active checks and retry delays. It does not perform an extra unbounded check after the deadline. A caller's `signal` cancels polling and active commands. Cancellation rejects the run instead of masquerading as an ordinary unhealthy observation.

## Report Structure {#report-structure}

The report contains `healthy`, `timestamp`, total `duration`, ordered `checks` and a summary of healthy/unhealthy counts. Each check has `name`, `healthy`, `duration` and optional `message` or `error`. An empty checker has no observations; declare the checks required by your readiness policy before treating a report as readiness evidence.

---
title: Extending Xec
description: Composing and extending the engine without a plugin system
---

# Extending Xec

Xec has no plugin system, and that is deliberate. `$` is a function and `$.with()`
returns another `$`, so the ways you already compose functions and objects in
TypeScript are the ways you extend Xec. Nothing has to be registered, and nothing
you build can be broken by a change to a plugin contract.

This page covers the four extension points that exist: configured engines,
wrappers, events, and process-wide configuration.

## Configured engines

`$.with(config)` returns a new engine that carries your settings. The original is
untouched, so a preset is just a value you can export and share.

```typescript
import { $ } from '@xec-sh/core';

export const prod = $.with({
  defaultCwd: '/srv/app',
  defaultEnv: { NODE_ENV: 'production' },
  timeout: 60_000,
});

await prod`npm run migrate`;
```

Presets compose, because the result of `.with()` has `.with()` too:

```typescript
const verbose = prod.with({ timeout: 300_000 });
```

The same call selects a target, which is how a preset becomes environment-specific:

```typescript
export const web1 = $.ssh('deploy@web-1').with({ defaultCwd: '/srv/app' });
```

## Wrappers

To add behavior rather than configuration, wrap `$`. It is an ordinary function,
so a wrapper is an ordinary function.

```typescript
import { $ } from '@xec-sh/core';

/** Run a command, and log how long it took. */
export async function timed(strings: TemplateStringsArray, ...values: unknown[]) {
  const started = performance.now();
  const result = await $(strings, ...values);
  console.log(`${result.command} took ${Math.round(performance.now() - started)}ms`);
  return result;
}

await timed`npm run build`;
```

For anything that is not per-command — a deployment step, a health check, a
release — write a plain async function that takes an engine. It then works
against every environment without knowing which one it got:

```typescript
import type { ExecutionEngine } from '@xec-sh/core';

export async function restart(target: ExecutionEngine, service: string) {
  await target`systemctl restart ${service}`;
  return target`systemctl is-active ${service}`.nothrow().text();
}

await restart($.ssh('deploy@web-1'), 'api');
await restart($.docker('api'), 'nginx');
```

That signature — take an engine, return a result — is the whole extension model.
It is why a step written for one environment runs unchanged on another.

## Events

The engine emits events for commands, connections, transfers and caching. Use
them for logging, metrics and audit trails.

```typescript
import { $ } from '@xec-sh/core';

$.on('command:start', event => {
  console.log(`→ ${event.command}`);
});

$.on('command:complete', event => {
  console.log(`✓ ${event.command} (${event.duration}ms)`);
});

$.on('command:error', event => {
  console.error(`✗ ${event.command}: ${event.error}`);
});
```

Sensitive values are masked before an event is emitted, so a listener that writes
to a log cannot leak a password that appeared in a command.

### Event names

| Group | Events |
|---|---|
| Commands | `command:start`, `command:complete`, `command:error`, `command:retry` |
| SSH | `ssh:connect`, `ssh:disconnect`, `ssh:execute`, `ssh:reconnect`, `ssh:key-validated`, `ssh:pool-metrics`, `ssh:pool-cleanup`, `ssh:tunnel-created`, `ssh:tunnel-closed` |
| Docker | `docker:run`, `docker:exec` |
| Files | `file:read`, `file:write`, `file:delete`, `transfer:start`, `transfer:complete`, `transfer:error` |
| Connections | `connection:open`, `connection:close` |
| Cache | `cache:hit`, `cache:miss`, `cache:set`, `cache:evict` |
| Retries | `retry:attempt`, `retry:success`, `retry:failed` |
| Temp files | `temp:create`, `temp:cleanup` |

### Patterns and filters

`onFiltered` accepts a `*` wildcard, and an optional predicate that decides
whether the listener runs.

```typescript
// Every SSH event.
$.onFiltered('ssh:*', event => metrics.increment(event.type));

// Only commands that took longer than a second.
$.onFiltered('command:complete', event => slowLog.write(event), e => e.duration > 1000);
```

Listeners are strongly typed per event, so `event.duration` on a
`command:complete` and `event.host` on an `ssh:connect` are both checked at
compile time.

## Process-wide configuration

`configure()` sets defaults for the default `$`. Call it once, at startup.

```typescript
import { configure } from '@xec-sh/core';

configure({
  defaultTimeout: 30_000,
  throwOnNonZeroExit: true,
});
```

Prefer `$.with()` where you can. `configure()` changes a global, so it is right
for a program's own entry point and wrong for a library.

To change configuration for part of a program instead of all of it, use
`within()`, which confines the change to its own scope even across concurrent
tasks:

```typescript
import { within, $ } from '@xec-sh/core';

await within(async () => {
  $.defaults({ env: { DEBUG: '1' } });
  await $`npm test`;      // sees DEBUG
});

await $`npm test`;        // does not
```

## Custom adapters

`$.registerAdapter(name, adapter)` exists, but `BaseAdapter` is not part of the
public API, so an adapter cannot currently be written outside this package. If
you need Xec to reach an environment it does not support, open an issue rather
than working around this — a new environment is a change to the core contract,
and it should be reviewed as one.

To run something Xec has no adapter for today, wrap the tool's own CLI in a
function that takes an engine, as shown under [Wrappers](#wrappers). That keeps
the call site uniform without pretending the environment is native.

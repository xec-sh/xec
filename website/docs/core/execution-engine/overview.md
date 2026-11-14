---
title: Universal Execution Engine
sidebar_label: Overview
description: Architecture and principles of Xec's universal command execution engine
---

# Universal Execution Engine {#universal-execution-engine}

The Execution Engine (`ExecutionEngine`) is the core of the Xec system, providing unified command execution across diverse environments. It offers a universal API for working with local processes, SSH connections, Docker containers, and Kubernetes pods.

## Core Concepts {#core-concepts}

### Universal Execution {#universal-execution}

The engine abstracts environment-specific details, allowing the same code to work across different target systems:

```typescript
import { $ } from '@xec-sh/core';

// Local execution
await $`ls -la`;

// SSH execution — string shorthand or options object
const remote = $.ssh('user@server.com');           // [user@]host[:port]
// const remote = $.ssh({ host: 'server.com', username: 'user' });
await remote`ls -la`;

// Docker execution
const container = $.docker({ container: 'my-app' });
await container`ls -la`;

// Kubernetes execution — string shorthand or options object
const pod = $.k8s('my-pod');                       // [namespace/]pod[:container]
// const pod = $.k8s({ pod: 'my-pod', namespace: 'default' });
await pod`ls -la`;

// The pod object API: $.k8s().pod(name) returns a K8sPod whose
// commands run via .exec (the pod object itself is not callable)
await $.k8s().pod('my-pod').exec`ls -la`;
```

### Engine Architecture {#engine-architecture}

The engine parses the template literal, builds and escapes the command, then routes it to the adapter for the target environment:

```mermaid
flowchart TD
    Engine["ExecutionEngine<br/>template literal API · escaping ·<br/>configuration · events"]

    subgraph Adapters["Adapters"]
        Local["Local"]
        SSH["SSH"]
        Docker["Docker"]
        K8s["Kubernetes"]
    end

    Engine --> Local
    Engine --> SSH
    Engine --> Docker
    Engine --> K8s
```

## Command Lifecycle {#command-lifecycle}

### 1. Command Building {#1-command-building}

Commands are built through template literals with automatic escaping:

```typescript
const file = "file with spaces.txt";
const dangerous = "'; rm -rf /";

// Safe escaping — each value becomes one POSIX-quoted argument
await $`cat ${file}`;        // cat 'file with spaces.txt'
await $`echo ${dangerous}`;  // echo ''\''; rm -rf /'
```

### 2. Context Configuration {#2-context-configuration}

Commands are enriched with execution context:

```typescript
import { ExecutionEngine, createCallableEngine } from '@xec-sh/core';

const run = createCallableEngine(new ExecutionEngine({
  defaultTimeout: 30_000,
  defaultCwd: '/app',
  defaultEnv: { NODE_ENV: 'production' },
}));
await run`pnpm build`.cwd('/projects/app').env({ DEBUG: 'true' }).timeout(60_000);
```

### 3. Adapter Selection {#3-adapter-selection}

The engine automatically selects the appropriate adapter:

```typescript
// Explicit selection via method
const ssh = $.ssh({ host: 'server', username: 'deploy' });

// Automatic selection via options — adapterOptions.type must match adapter
await $.execute({
  command: 'ls',
  adapter: 'docker',
  adapterOptions: { type: 'docker', container: 'app' }
});
```

### 4. Execution and Result Processing {#4-execution-and-result-processing}

```typescript
const result = await $`ls -la`;

// Result contains:
result.stdout;      // Standard output
result.stderr;      // Error output
result.exitCode;    // Exit code
result.ok;          // true when exitCode === 0
result.duration;    // Execution time (ms)
result.startedAt;   // Start time
result.finishedAt;  // Finish time
```

## ProcessPromise API {#processpromise-api}

`ProcessPromise` is an extended Promise with additional methods for execution control:

### Stream Management {#stream-management}

```typescript
// Output redirection
await $`ls -la`
  .stdout(process.stdout)
  .stderr(process.stderr);

// Interactive mode
await $`npm init`.interactive();

// Quiet mode (no output)
await $`npm install`.quiet();
```

### Error Handling {#error-handling}

```typescript
// Don't throw on error
const result = await $`may-fail`.nothrow();
if (result.exitCode !== 0) {
  console.log('Command failed:', result.stderr);
}

// Retry on failure (engine-level: $.retry() returns a derived engine)
await $.retry({
  maxRetries: 3,
  initialDelay: 1000
})`flaky-command`;
```

### Execution Control {#execution-control}

```typescript
// Timeout
await $`long-running`.timeout(5000);

// Cancellation via AbortSignal
const controller = new AbortController();
const promise = $`sleep 100`.signal(controller.signal);
setTimeout(() => controller.abort(), 1000);

// Force termination
const proc = $`server`;
setTimeout(() => proc.kill(), 5000);
```

### Result Transformation {#result-transformation}

```typescript
// Get trimmed text
const text = await $`cat file.txt`.text();

// Parse JSON
const data = await $`cat config.json`.json();

// Array of lines
const lines = await $`ls`.lines();

// Buffer
const buffer = await $`cat binary.dat`.buffer();
```

## Piping {#piping}

The engine supports Unix-like pipes:

```typescript
import { $ } from '@xec-sh/core';

await $`cat file.txt`.pipe($`grep pattern`).pipe($`wc -l`);
await $`ls -la`.pipe((line: string) => {
  if (line.includes('.txt')) console.log(line);
});
```

## Parallel Execution {#parallel-execution}

```typescript
import { $ } from '@xec-sh/core';

const commands = ['pnpm test:unit', 'pnpm test:integration', 'pnpm test:e2e'];
const outcomes = await $.batch(commands, {
  concurrency: 2,
  onProgress: (completed, total) => console.log(`${completed}/${total}`),
});
if (outcomes.failed.length) throw new AggregateError(outcomes.failed, 'Test batch failed');
```

## Events and Monitoring {#events-and-monitoring}

The engine provides an event system for monitoring:

```typescript
import { ExecutionEngine } from '@xec-sh/core';
const $ = new ExecutionEngine();

$.on('command:start', ({ command, cwd }) => {
  console.log(`Starting: ${command} in ${cwd}`);
});

$.on('command:complete', ({ command, exitCode, duration }) => {
  console.log(`Completed: ${command} (${exitCode}) in ${duration}ms`);
});

$.on('command:error', ({ command, error }) => {
  console.error(`Failed: ${command}`, error);
});
```

## Result Caching {#result-caching}

```typescript
// Cache command results
const data = await $`expensive-operation`.cache({
  ttl: 60000,  // 1 minute
  key: 'operation-result'
});

// Subsequent calls return cached result
const cached = await $`expensive-operation`.cache({
  key: 'operation-result'
});
```

## Contextual Execution {#contextual-execution}

```typescript
// Create context with settings
const context = $.with({
  cwd: '/app',
  env: { NODE_ENV: 'production' },
  timeout: 30000
});

// All commands in context inherit settings
await context`npm install`;
await context`npm build`;
await context`npm test`;

// Nested contexts — within() is a standalone import, not a $ method
import { within } from '@xec-sh/core';

await within(async () => {
  // $.defaults() inside a within() scope writes to the scope instead of
  // the process-wide engine, so this cwd change doesn't leak outside the
  // callback. $.cd('/project') would not do this — it returns a new
  // engine rather than mutating $, so a bare $.cd(...) statement with a
  // discarded return value has no effect.
  $.defaults({ cwd: '/project' });
  await $`npm install`;
  await $`npm test`;
});
```

## Command Templates {#command-templates}

```typescript
// Create a template
const gitClone = $.template('git clone {{repo}} {{dir}}', {
  defaults: { dir: '.' },
  validate: (params) => {
    if (!params.repo?.startsWith('http')) {
      throw new Error('Invalid repo URL');
    }
  }
});

// Use the template
await gitClone.execute($, {
  repo: 'https://github.com/user/repo.git',
  dir: '/projects/repo'
});
```

## Utilities and Helpers {#utilities-and-helpers}

### Temporary Files {#temporary-files}

```typescript
import { $ } from '@xec-sh/core';

await $.withTempFile(async path => {
  await $.writeFile(path, 'temporary data');
  console.log(await $`wc -c ${path}`.text());
});

const repository = 'https://github.com/xec-sh/xec.git';
await $.withTempDir(async directory => {
  await $`git clone --depth 1 ${repository} ${directory}`;
});
```

### Helper Functions {#helper-functions}

Standalone helpers exported from the package:

```typescript
import { echo, glob, sleep, parseDuration } from '@xec-sh/core';

const files = await glob('src/**/*.ts');
echo`Found ${files.length} TypeScript sources`;
await sleep('100ms');
console.log(parseDuration('30s'));
```

### File Transfer {#file-transfer}

```typescript
// Between environments: ssh://user@host/path, docker://container:/path
await $.transfer.copy(
  '/local/file.txt',
  'ssh://deploy@server/app/file.txt'
);

// With progress
await $.transfer.sync('/source', 'docker://app:/dest', {
  onProgress: (progress) => {
    console.log(`${progress.transferredBytes}/${progress.totalBytes} bytes`);
  }
});
```

### Interactive Prompts {#interactive-prompts}

Interactive prompts are not part of `@xec-sh/core` — they live in `@xec-sh/kit`,
the separate TUI/CLI components package:

```typescript
import { text, confirm, select, password } from '@xec-sh/kit';

const name = await text({ message: 'Enter name:' });
const proceed = await confirm({ message: 'Continue?' });
const option = await select({
  message: 'Choose:',
  options: [{ value: 'dev' }, { value: 'staging' }, { value: 'prod' }],
});
const secret = await password({ message: 'Password:' });
```

## Error Handling {#error-handling-1}

```typescript
import { $, CommandError } from '@xec-sh/core';

try {
  await $`exit 1`;
} catch (error) {
  if (!(error instanceof CommandError)) throw error;
  console.error({ exitCode: error.exitCode, stderr: error.stderr });
}

const result = await $`test -f config.json`.nothrow();
if (!result.ok) console.log('Configuration check failed', result.exitCode);
```

## Runtime Support {#runtime-support}

`@xec-sh/core` runs on Node.js 20+, Bun and Deno with the same API. The local adapter uses the runtimes' shared `node:child_process` API, with one implementation of cancellation, streaming, and cleanup. Importing the package pulls in Node builtins only — SSH, Docker and Kubernetes adapters load lazily on first use.

```typescript
import { RuntimeDetector } from '@xec-sh/core';

RuntimeDetector.detect(); // 'node' | 'bun' | 'deno'
```

## Performance and Optimizations {#performance-and-optimizations}

### Connection Pooling {#connection-pooling}

SSH and other adapters automatically manage connection pools:

```typescript
import { $ } from '@xec-sh/core';

const remote = $.ssh({ host: 'server.example.com', username: 'deploy' });
for (const file of ['/srv/app/config.json', '/srv/app/package.json']) {
  await remote`test -r ${file}`;
}
```

### Lazy Initialization {#lazy-initialization}

Adapters are created only on first use:

```typescript
// Docker adapter created only here
await $.docker({ container: 'app' })`ls`;
```

### Stream Processing {#stream-processing}

```typescript
import { $ } from '@xec-sh/core';

await $`generate-report`.stdout(process.stdout);
```

## Security {#security}

### Automatic Escaping {#automatic-escaping}

All template literal values are automatically escaped — each interpolated
value becomes exactly one shell argument:

```typescript
const userInput = "'; DROP TABLE users; --";
const sql = `SELECT * FROM data WHERE name = ${userInput}`; // plain JS string
await $`mysql -e ${sql}`;
// Safe: the whole -e argument is one escaped token
```

Do not wrap an interpolation in your own quotes inside the template
(`` $`mysql -e "... ${userInput} ..."` ``). Xec escapes each value for a
position with no surrounding quotes; splicing that escaped value inside
quotes you wrote yourself is no longer the position it was escaped for, and
a value containing a `"` can close your quotes early and reach the shell —
build the whole argument as one interpolated value instead, as above.

### Sensitive Data Masking {#sensitive-data-masking}

Masking is enabled by default in every adapter: passwords, tokens, and keys
matching the built-in patterns are replaced with `[REDACTED]` in events and
error messages. It is configured per adapter:

Each built-in rule declares what a redaction should leave behind, so the
structure around a credential survives it — `PGPASSWORD=[REDACTED]` and
`postgres://user:[REDACTED]@host/db` rather than a bare `[REDACTED]` or,
as it was, `postgres://user[REDACTED]host` with the `:` and the `@` eaten.
Patterns you supply here have no declared shape, so what they keep is
inferred from the match.

Whether a name reads as a secret is decided by its case. An **uppercase**
identifier containing `PASSWORD`, `TOKEN`, `KEY`, `SECRET`, `PWD` or
`APIKEY` anywhere is redacted — `PGPASSWORD`, `APIKEY`, `DB_PASSWORD`,
`GOOGLE_API_KEY` — because an uppercase identifier is an environment
variable. A **lowercase** name must be composite: `db_password` and
`stripe_api_key` are redacted, `monkey=banana` and `whiskey=irish` are
not, because a lowercase word containing "key" is usually a word.

The cost of the uppercase half is `MONKEY=`, which nobody writes. The
cost of getting either half wrong is real in both directions: too broad
rewrites ordinary output on every command that prints it, too narrow
loses the most common name for a secret there is.

Configuration is read on each use, so changing `sensitiveDataMasking`
through `updateConfig` takes effect from the next masked string.

```typescript
import { ExecutionEngine } from '@xec-sh/core';
const $ = new ExecutionEngine({
  adapters: {
    local: {
      sensitiveDataMasking: {
        enabled: true,
        patterns: [/password=\w+/gi],
        replacement: '[REDACTED]'
      }
    }
  }
});
```

#### Values you already know {#values-you-already-know}

A pattern recognises a credential by its shape. That is the best
available guess when nothing is known about the text, and like any guess
it misses: a password on its own line, with no key beside it, looks
exactly like ordinary output.

When you have the value itself — read from a secret store, prompted for,
decrypted — `registerSecret` records it, and every masker in the process
redacts it by identity from that moment on:

```typescript
import { $, registerSecret } from '@xec-sh/core';
import { SecretManager } from '@xec-sh/ops/secrets/index';

const secrets = new SecretManager();
const password = await secrets.getRequired('pg');
if (!registerSecret(password)) throw new Error('Database credential cannot be safely redacted');
await $`psql -c '\dt'`.env({ PGPASSWORD: password });
```

The registry is process-wide and append-only. The guarantee is that the
string does not appear in anything this process emits — including a
message thrown deep in an adapter that has never heard of secret stores —
and nothing is removed, because a window in which a value stops being
redacted is a window in which it leaks.

Values under four characters are refused, and `registerSecret` returns
`false` so you can say so: redaction is literal replacement, and
registering `"ok"` would rewrite every `ok` in every stream. With no
secret registered, the check costs one property read.

## Integration with async/await {#integration-with-asyncawait}

The engine is fully compatible with async/await and Promise APIs:

```typescript
// Promise chaining
$`npm test`
  .then(result => console.log('Tests passed'))
  .catch(error => console.error('Tests failed'));

// Promise.all
const [test, lint, build] = await Promise.all([
  $`npm test`,
  $`npm run lint`,
  $`npm run build`
]);

// Promise.race
const fastest = await Promise.race([
  $`fetch-from-cache`,
  $`fetch-from-api`
]);
```

## Extensibility {#extensibility}

### Registering Adapters {#registering-adapters}

`$.registerAdapter(name, adapter)` is real, but writing the adapter itself
currently is not: every adapter extends the abstract `BaseAdapter` class,
which is not exported from `@xec-sh/core` and depends on several other
internal-only classes (`StreamHandler`, `ProgressReporter`, the masking
stream filter). There is no supported way to implement a custom adapter
outside the package today — `registerAdapter` exists for the four built-in
adapters to register themselves, not as a public extension point.

### Event Listeners {#event-listeners}

```typescript
import { $ } from '@xec-sh/core';

$.on('command:start', event => console.log({ command: event.command }));
$.on('command:complete', event => console.log({ duration: event.duration, exitCode: event.exitCode }));
await $`node --version`;
```

## Usage Examples {#usage-examples}

### CI/CD Pipeline {#cicd-pipeline}

```typescript
import { ExecutionEngine, createCallableEngine } from '@xec-sh/core';

async function build(projectDirectory: string) {
  const run = createCallableEngine(new ExecutionEngine({ defaultCwd: projectDirectory }));
  try {
    await run`pnpm install --frozen-lockfile`;
    await run`pnpm build`;
    await run`pnpm test`;
  } finally {
    await run.dispose();
  }
}
```

### Data Processing {#data-processing}

```typescript
async function processLogs() {
  // Get logs from different sources
  const [app1, app2, db] = await $.parallel.all([
    $.docker({ container: 'app1' })`tail -n 1000 /logs/app.log`,
    $.docker({ container: 'app2' })`tail -n 1000 /logs/app.log`,
    $.ssh({ host: 'db-server', username: 'deploy' })`tail -n 1000 /var/log/mysql/error.log`
  ]);
  
  // Process and aggregate
  const errors = [app1.stdout, app2.stdout, db.stdout]
    .flatMap(output => output.split('\n'))
    .filter(line => line.includes('ERROR'));
  
  // Save results
  await $`echo ${errors.join('\n')} > errors-report.txt`;
}
```

### System Monitoring {#system-monitoring}

`$.parallel.map()` builds one command per item and runs them with a
concurrency cap — its callback must return a `string`, `Command` or
`ProcessPromise`, not an arbitrary computed value, and the method itself
resolves a `ParallelResult` rather than an array of your callback's return
values. Gathering several distinct metrics per server and combining them
into one object per server is a plain concurrent-map problem instead:

```typescript
async function monitorSystem() {
  const servers = ['web1', 'web2', 'db1'];

  while (true) {
    const metrics = await Promise.all(
      servers.map(async (server) => {
        const ssh = $.ssh({ host: `${server}.local`, username: 'monitor' });

        const cpu = await ssh`top -bn1 | grep "Cpu(s)"`.text();
        const memory = await ssh`free -m | grep "Mem:"`.text();
        const disk = await ssh`df -h | grep "/dev/sda1"`.text();

        return { server, cpu, memory, disk };
      })
    );

    console.table(metrics);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}
```

## Conclusion {#conclusion}

The ExecutionEngine provides a powerful and flexible API for command execution across various environments. Its key advantages:

- **Universality**: Single API for all environments
- **Security**: Automatic escaping and data masking
- **Performance**: Connection pooling and caching
- **Convenience**: Intuitive API with modern JavaScript support
- **Extensibility**: Adapter and event systems

The engine serves as a foundation for building complex automation systems, CI/CD pipelines, and infrastructure management tools.
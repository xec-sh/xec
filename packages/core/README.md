# @xec-sh/core

**One TypeScript API for commands, wherever they run** — local shell, SSH host, Docker container, Kubernetes pod.

```bash
npm install @xec-sh/core
```

## The idea

```typescript
import { $ } from '@xec-sh/core';

await $`pnpm build`;                                    // this machine
await $.ssh('deploy@prod-1')`systemctl restart app`;    // an SSH host
await $.docker('postgres-main')`pg_dump mydb`;          // a container
await $.k8s('production/api')`cat /var/log/app.log`;    // a pod
```

Four environments, one `$`. Every target accepts the same template-literal
syntax, the same chaining methods, and returns the same result shape. zx,
execa, dax and Bun Shell stop at the local machine; this is the same
ergonomics across the seam.

## Safe by default

```typescript
const file = 'my file; rm -rf /';
await $`cat ${file}`;        // runs `cat 'my file; rm -rf /'` — quoted, inert

const flags = ['-l', '-a'];
await $`ls ${flags} src/`;   // arrays expand to escaped arguments

await $.raw`echo $HOME`;     // raw interpolation, when you actually mean it
```

## Results you can use directly

```typescript
const branch = await $`git branch --show-current`;
console.log(`Branch: ${branch}`);            // "Branch: main" — like $(...) in a shell

const result = await $`grep TODO src/ -r`.nothrow();
result.ok          // exit 0 and not signalled
result.stdout      // string
result.exitCode    // 128+signum for signalled processes — a kill is never "success"
result.cause       // why not ok

const pkg   = await $`cat package.json`.json<{ version: string }>();
const files = await $`ls -1`.lines();
const image = await $`cat logo.png`.buffer();

for await (const line of $`journalctl -f`) { /* stream lines */ }
```

Failures explain themselves — the error message carries the exit code *and*
the head of stderr, so `catch (e)` logs are diagnostic without extra work.

## Every environment is a chain

```typescript
const staging = $.ssh('deploy@staging')
  .cd('/srv/app')                 // on the host
  .env({ NODE_ENV: 'staging' })   // on the host
  .timeout(60_000)
  .retry({ maxRetries: 3 });

await staging`pnpm migrate`;

// The identical chain on a pod — .cd()/.env() apply inside the pod,
// never to your local kubectl process:
await $.k8s('staging/api').cd('/srv/app').env({ DEBUG: '1' })`node check.js`;

// And in a container — .cd() maps to `docker exec -w`:
await $.docker('builder').cd('/workspace')`make all`;
```

Environment-specific power stays available where it belongs:

```typescript
const ssh = $.ssh('deploy@prod');
await ssh.uploadFile('./dist.tar.gz', '/srv/app/dist.tar.gz');
const tunnel = await ssh.tunnel({ localPort: 5432, remoteHost: 'db', remotePort: 5432 });

const pod = $.k8s('production/api').pod('api-7f9d');
await pod.portForward(8080, 80);
await pod.follow(line => audit(line));           // streaming logs
await pod.copyFrom('/var/log/app.log', './app.log');
```

## The contract

Enforced by tests, not aspirational:

- An option either takes effect in its environment or fails loudly — nothing
  is accepted and silently dropped. `AbortSignal` cancels on every adapter.
- Output over `maxBuffer` kills the producer and fails with the truncated
  head preserved — never an empty result with exit code 0.
- Secrets are masked in command echoes, events and error messages: tokens,
  API keys, URL credentials, PEM blocks. Masking is pattern-based, so a value
  passed as a bare argument (`mysql -pP4ss`, `redis-cli -a P4ss`) can still slip
  through — pass credentials by environment or stdin, not on the command line.
- SSH connections are pooled, self-heal on drop, and are released by
  `dispose()`. The library installs no global process handlers unless you
  opt in with `installCleanupHandlers()`.
- The same on Linux, macOS and Windows, and the unit suite runs on all three:
  interpolated values are quoted for the shell that will parse them —
  `cmd.exe` gets caret escaping — paths compose through `node:path`, `glob`
  answers `/`-separated results everywhere, a line ends with `\n` or `\r\n`,
  and a timeout takes down the whole process tree. What a command *means* is
  still the shell's: `cmd.exe` has no `&&`, no `$VAR` and no `sleep`.

## Utilities

```typescript
import { parallel, within, sleep, glob } from '@xec-sh/core';

await parallel(['build A', 'build B'].map(t => $`run ${t}`), { maxConcurrent: 2 });

await within(async () => {
  $.defaults({ cwd: '/tmp', env: { NODE_ENV: 'test' } });
  await $`npm test`;                 // scoped configuration
});

await $.withTempDir(async dir => {
  await $`unzip release.zip -d ${dir}`;   // dir is a path; removed afterwards
});

$.verbose = true;                    // echo each command (redacted) to stderr

// A command that owns the terminal — npm login, vim, ssh — runs attached to
// it; output goes to the user, not into result.stdout
await $.interactive()`npm login`.timeout(0);
```

## Dependencies

One runtime dependency: `ssh2`, and it is not loaded until an SSH target is
first used — importing the package pulls in Node builtins only. Docker and
Kubernetes adapters speak the `docker`/`kubectl` CLIs, so behaviour matches
what you would get by hand, and both load lazily. Works on Node.js 20+, Bun and Deno.

## License

MIT

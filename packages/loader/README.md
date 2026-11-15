# @xec-sh/loader

TypeScript and JavaScript execution for Xec, with module resolution, content-integrity checks, file watching, and a REPL.

```sh
npm install @xec-sh/loader
```

The existing script APIs require Node.js 20 or later; native module graphs require the capability described below. Uses `esbuild` for transformation and `@xec-sh/kit` for terminal interaction.

## Run a script

```typescript
import { ScriptExecutor } from '@xec-sh/loader';

const executor = new ScriptExecutor();
await executor.executeScript('./check.ts', {
  customGlobals: { environment: 'development' },
});
```

`CodeEvaluator` evaluates inline code with top-level await. `streamExecute` supplies output callbacks; `streamLines` exposes an async iterator of stdout/stderr events. Script execution runs with the process's permissions; it is not a sandbox.

In developing 0.13.0, inline evaluation and in-memory modules share one native
executor. Inline code needs a writable working directory so relative and bare
imports resolve from the caller's project. Source files are private (0600) and
remain alive until the evaluation callback settles; cleanup removes only the
file owned by that invocation. An unwritable directory fails before execution.

`ModuleExecutor` uses ESM by default; select `cjs` or `umd` explicitly for
CommonJS. A parse or execution error is returned directly, never retried in a
different format. Use `withModule(options, callback)` when exported callbacks
need the source file during execution. Neither cleanup nor disposal unloads the
runtime's module cache or reverses effects; use a fresh process for unbounded
module reloads.

## Watch files

```typescript
import { FileWatcher } from '@xec-sh/loader/watch';

const watcher = new FileWatcher('./src', {
  poll: true,
  pollInterval: 1000,
  debounce: 150,
});
watcher.on('change', event => console.log(event.relativePath));
watcher.on('error', error => console.error(error));
watcher.start();
// The owner calls watcher.close() when its workflow ends.
```

Native notifications are the default. Explicit polling handles filesystems with unreliable native events, including atomic replacements. `ready` confirms watch roots; an observation error is reported and closes the watcher. Empty `extensions` includes assets; ignore entries are path fragments.

## Modules and extension points

| API | Purpose |
| --- | --- |
| `ModuleGraph` | Own native local JS/TS and verified remote ESM graphs |
| `ModuleLoader` | Resolve installed packages and explicit remote modules; prepare or import a verified graph |
| `PluginManager` | Resolution, transformation, and execution hooks |
| `GlobalInjector` | Scoped globals restored after the callback |
| `REPLServer` | Interactive evaluation |
| `ScriptRuntime` | Environment, directory, retry and scope helpers |

The developing 0.13.0 graph API requires native `module.registerHooks`: Node
22.15 or later with that capability, or a compatible runtime. Native graph tests
also cover Deno 2.9.8. Node 20 and Bun reject this path before a network request;
other script APIs keep their declared runtime support.

A local graph preserves authored file paths and native package resolution.
A remote graph fetches and verifies every literal dependency before evaluation,
then uses native ESM cycles, live bindings and top-level await. JavaScript is
not bundled or rewritten. TypeScript/JSX uses the shared transformer.
Remote dependencies must be HTTP(S) ESM or explicit `node:` builtins;
CommonJS, import attributes, assets and bare package imports are rejected.

`ModuleLoader.prepare(url, { signal })` verifies a remote closure without
executing it. Prepare computed import targets before calling code that imports
them. An unprepared target fails without fetching. Repeated imports on one
loader share the native namespace. Keep the owner alive through deferred
callbacks, then call `dispose()`; it refuses active operations. Signals cancel
preparation, not JavaScript or top-level await already executing.

A missing installed package fails locally without sending its name to a CDN.
Remote loading requires an explicit URL or provider prefix such as `npm:`.
A prefix selects a URL; it does not guarantee that a provider returns supported
ESM. Use a reviewed ESM endpoint. JSR package metadata and export-map resolution
are not implemented.

## Remote trust and resource limits

Remote fetches enforce an exact host allowlist on every redirect, bound response
bytes and strip caller headers on cross-origin redirects. Requests with caller
headers bypass the shared response cache. The default integrity mode records
first-use raw UTF-8 digests; use `strict` with reviewed pins for trusted inputs.

The v2 `module-lock.json` descriptor and its `module-lock.json.pins/` directory
form one trust store. Keep both with release inputs. Each URL has one immutable
pin: concurrent writers can add independent pins but cannot overwrite a
different digest. URL identities include queries; stored diagnostic URLs omit
credentials and queries. Older formats require explicit review.

Graph preparation defaults to 30 seconds, 128 URLs, 32 MiB total source and
four concurrent fetches. Configure `graph` limits explicitly when needed.
Each HTTP source also has an 8 MiB limit.

`clearCache()` clears HTTP entries while preserving pins, caller files and live
module identities; it refuses active module operations. `cache: false` disables
response retention, not native module identity. Cache storage defaults to
`$XDG_CACHE_HOME/xec/modules` or `~/.cache/xec/modules`; use `cacheDir` for a
project-specific location. Disposal does not reverse effects or unload the
native ESM cache; use a fresh process for unbounded reloads.

[Script and integrity guide](https://xec.sh/docs/scripting/basics/typescript-setup) · [Watch reference](https://xec.sh/docs/commands/built-in/watch) · [MIT license](../../LICENSE)

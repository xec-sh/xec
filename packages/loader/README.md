# @xec-sh/loader

TypeScript and JavaScript execution for Xec, with module resolution, content-integrity checks, file watching, and a REPL.

```sh
npm install @xec-sh/loader
```

The existing script APIs require Node.js 20 or later. Uses `esbuild` for transformation and `@xec-sh/kit` for terminal interaction.

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
| `LocalModuleGraph` | Native local JS/TS command graphs with explicit ownership (development API; Node synchronous hooks required) |
| `ModuleLoader` | Local, npm, and CDN module resolution with caching |
| `PluginManager` | Resolution, transformation, and execution hooks |
| `GlobalInjector` | Scoped globals restored after the callback |
| `REPLServer` | Interactive evaluation |
| `ScriptRuntime` | Script helpers for environment, directory, retries, and scopes |

The development `LocalModuleGraph` API requires `module.registerHooks` (Node
22.15 or later with that capability). Its `sourceURL` is the entry's authored
URL; `load()` imports a fresh local ESM graph using a private URL query, without
moving source files or rewriting relative imports. Bare packages and CommonJS
keep native caching. Keep the graph alive through deferred callbacks and call
`dispose()` after they settle. Disposal removes hooks, not module effects or the
native ESM cache; use a fresh process for unbounded reloads. This API is not
available in npm 0.12.0 and does not change existing Node/Bun/Deno script paths.

In the developing 0.13.0 source, a missing bare package fails locally: its name is never sent to a CDN as a fallback. Remote loading requires an explicit remote specifier.

Remote fetches keep one deadline across redirects, retries and response bodies,
limit source bytes, enforce the host policy on every hop, and strip caller
headers on cross-origin redirects. Requests with caller headers do not reuse
the shared response cache. Lock v2 pins exact UTF-8 source before transformation;
URL identities are hashed and diagnostic URLs omit credentials and queries.
Old transformed-source locks require explicit review, not automatic repinning.

`clearCache()` removes only cached entries. It preserves trust records and
caller files, and rejects while a module operation is active. The default cache
is under `$XDG_CACHE_HOME/xec/modules` or `~/.cache/xec/modules`; configure
`cacheDir` for project-scoped storage.

CDN loading supports `npm:`, `jsr:`, `esm:`, `unpkg:`, `skypack:`, `jsdelivr:`, and HTTPS URLs. The default integrity policy records content hashes; strict mode requires existing trusted entries. Configure allowed hosts and integrity policy for the intended environment.

[Script guide](https://xec.sh/docs/scripting/basics/typescript-setup) · [Watch reference](https://xec.sh/docs/commands/built-in/watch) · [MIT license](../../LICENSE)

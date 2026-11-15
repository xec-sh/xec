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

CDN loading supports `npm:`, `jsr:`, `esm:`, `unpkg:`, `skypack:`, `jsdelivr:`, and HTTPS URLs. The default integrity policy records content hashes; strict mode requires existing trusted entries. Configure allowed hosts and integrity policy for the intended environment.

[Script guide](https://xec.sh/docs/scripting/basics/typescript-setup) · [Watch reference](https://xec.sh/docs/commands/built-in/watch) · [MIT license](../../LICENSE)

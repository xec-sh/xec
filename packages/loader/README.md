# @xec-sh/loader

TypeScript and JavaScript execution for Xec, with module resolution, content-integrity checks, file watching, and a REPL.

```sh
npm install @xec-sh/loader
```

Requires Node.js 20 or later. Uses `esbuild` for transformation and `@xec-sh/kit` for terminal interaction.

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
| `ModuleLoader` | Local, npm, and CDN module resolution with caching |
| `PluginManager` | Resolution, transformation, and execution hooks |
| `GlobalInjector` | Scoped globals restored after the callback |
| `REPLServer` | Interactive evaluation |
| `ScriptRuntime` | Script helpers for environment, directory, retries, and scopes |

CDN loading supports `npm:`, `jsr:`, `esm:`, `unpkg:`, `skypack:`, `jsdelivr:`, and HTTPS URLs. The default integrity policy records content hashes; strict mode requires existing trusted entries. Configure allowed hosts and integrity policy for the intended environment.

[Script guide](https://xec.sh/docs/scripting/basics/typescript-setup) · [Watch reference](https://xec.sh/docs/commands/built-in/watch) · [MIT license](../../LICENSE)

# @xec-sh/loader

Script loading for Xec: run TypeScript files with esbuild transformation,
evaluate inline code with top-level await, load modules from CDNs with
integrity checking, and host a REPL.

```bash
npm install @xec-sh/loader
```

Status: alpha. The API may change between minor versions until 1.0.

## Executing scripts and code

```typescript
import { ScriptExecutor, CodeEvaluator } from '@xec-sh/loader';

// Execute a TypeScript file
const executor = new ScriptExecutor();
const result = await executor.executeScript('./deploy.ts', {
  customGlobals: { API_KEY: process.env.API_KEY },
});

// Evaluate inline code with top-level await
const evaluator = new CodeEvaluator();
await evaluator.evaluateCode(`
  const res = await fetch('https://api.example.com/data');
  console.log(await res.json());
`);
```

## CDN modules

```typescript
import { ModuleLoader } from '@xec-sh/loader';

const loader = new ModuleLoader({ preferredCDN: 'esm.sh' });
const lodash = await loader.import('npm:lodash@4.17.21');
const std = await loader.import('jsr:@std/path@1.0.0');
```

Specifier prefixes: `npm:`, `jsr:`, `esm:`, `unpkg:`, `skypack:`, `jsdelivr:`,
plus direct `https:` URLs. Fetched modules are cached on disk and verified
against a lockfile of content hashes by default, so a CDN serving different
bytes for the same URL fails loudly instead of executing. The policy is
configurable via the loader's `integrity` option (`lockfile` | `strict` | `off`,
plus an allowed-host list).

## Streaming execution

```typescript
import { streamExecute, streamLines } from '@xec-sh/loader';

// Callback form: resolves with { exitCode, signal, duration }
const { exitCode } = await streamExecute('./long-task.ts', {
  onStdout: (line) => process.stdout.write(line + '\n'),
  onStderr: (line) => process.stderr.write(line + '\n'),
});

// Async-iterator form: events of { type: 'stdout' | 'stderr', line, timestamp }
for await (const event of streamLines('./script.ts')) {
  if (event.type === 'stdout') console.log(event.line);
}
```

## Watching, REPL, globals

```typescript
import { watchFiles, FileWatcher, REPLServer, GlobalInjector } from '@xec-sh/loader';

// One-call watcher; returns a stop function
const stop = watchFiles('./src', (event) => {
  console.log(`${event.type}: ${event.path}`);   // 'add' | 'change' | 'unlink'
}, { debounce: 300, extensions: ['.ts'] });

// Or the class form, an EventEmitter over node:fs watchers
const watcher = new FileWatcher('./src', { debounce: 300 });
watcher.on('change', (event) => console.log(event.relativePath));
watcher.start();

// Interactive REPL
const repl = new REPLServer({ prompt: 'xec> ', includeBuiltins: true });
repl.start();

// Inject globals for a function call, restore them afterwards
const injector = new GlobalInjector({ globals: { VERSION: '1.0.0' } });
await injector.execute(async () => {
  console.log(globalThis.VERSION);   // '1.0.0'
});
// VERSION is removed again here
```

## Plugins

```typescript
import { PluginManager } from '@xec-sh/loader';

const plugins = new PluginManager();
plugins.register({
  name: 'my-plugin',
  setup: async () => { /* initialize */ },
  teardown: async () => { /* cleanup */ },
  resolveSpecifier: (spec) => spec.replace('@my/', 'https://cdn.my.dev/'),
  transformCode: (code, filename) => code,
  beforeExecute: async (scriptPath) => true,          // false skips execution
  afterExecute: async (scriptPath, success) => { },
  onError: async (error, scriptPath) => error,        // may replace the error
});
```

## Exports

| Export | Description |
|--------|-------------|
| `ScriptExecutor` | Execute TypeScript/JavaScript files with context injection |
| `CodeEvaluator` | Evaluate inline code with top-level await |
| `ModuleLoader` | Load modules from CDN, local files, or node_modules; integrity-checked |
| `REPLServer` / `REPLCommands` | REPL with extensible commands |
| `FileWatcher` / `watchFiles` | Debounced watcher over `node:fs` `watch` |
| `PluginManager` | Lifecycle hooks around resolution, transform, and execution |
| `streamExecute` / `streamLines` | Line-streamed script execution |
| `GlobalInjector` / `createInjector` | Scoped global injection with restoration |
| `ScriptRuntime` / `createRuntime` | Runtime helpers for scripts (`cd`, `pwd`, `env`, `retry`, `within`) |
| `TypeScriptTransformer` | esbuild-based TS-to-JS transformation |
| `ImportTransformer` | Import path rewriting for ESM compatibility |
| `CDNModuleResolver` / `NodeModuleResolver` / `LocalModuleResolver` | Resolution strategies (esm.sh, jsr.io, unpkg, skypack, jsdelivr) |
| `MemoryCache` / `FileSystemCache` / `HybridCache` | Module caches: LRU in memory, TTL on disk, or both |
| `ExecutionContext` | Execution context passed to scripts |

## Dependencies

`@xec-sh/kit` and `esbuild`.

## License

MIT
